"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import { query, queryOne } from "@/lib/db/client";
import { assertPermission } from "@/lib/auth/guard";
import { logAudit } from "@/lib/services/audit";
import { hashPassword } from "@/lib/auth/password";
import {
  dataTypeDefinition, parseUpload, readUpload, suggestMapping, validateRows,
  type DataType, type MatchOptions, type ValidatedRow,
} from "@/lib/services/migration";

/** Migration wizard: upload → map → validate → import → report. */

export async function uploadMigrationFile(formData: FormData): Promise<void> {
  const actor = await assertPermission(["migration.run", "users.import"]);
  const file = formData.get("file");
  const dataType = String(formData.get("data_type") ?? "employees") as DataType;
  const returnTo = String(formData.get("return_to") ?? "/admin/migration");
  if (!dataTypeDefinition(dataType)) redirect(`${returnTo}?toast=${encodeURIComponent("Choose what kind of data you're importing.")}&tone=error`);
  if (!(file instanceof File) || file.size === 0) {
    redirect(`${returnTo}?toast=${encodeURIComponent("Choose a CSV or XLSX file.")}&tone=error`);
  }
  if (file.size > 60 * 1024 * 1024) {
    redirect(`${returnTo}?toast=${encodeURIComponent("Files must be 60 MB or smaller.")}&tone=error`);
  }
  const name = file.name.toLowerCase();
  if (!/\.(csv|xlsx|xls|tsv)$/.test(name)) {
    redirect(`${returnTo}?toast=${encodeURIComponent("Only CSV and XLSX files are supported.")}&tone=error`);
  }

  let parsed;
  try {
    parsed = parseUpload(Buffer.from(await file.arrayBuffer()), file.name);
  } catch (error) {
    redirect(`${returnTo}?toast=${encodeURIComponent((error as Error).message)}&tone=error`);
  }

  await logAudit(actor, {
    action: "migration.file_uploaded", entityType: "migration",
    entityLabel: `${file.name} (${parsed.totalRows} rows, ${dataType})`,
  });
  redirect(`/admin/migration/${parsed.uploadId}?type=${dataType}&return=${encodeURIComponent(returnTo)}`);
}

function optionsFrom(formData: FormData): MatchOptions {
  return {
    matchBy: (String(formData.get("match_by") ?? "employee_id") as MatchOptions["matchBy"]),
    createMissingEmployees: formData.get("create_missing_employees") === "on",
    createMissingCourses: formData.get("create_missing_courses") === "on",
    skipDuplicates: formData.get("skip_duplicates") !== "off",
  };
}

function mappingFrom(formData: FormData, dataType: DataType): Record<string, string> {
  const definition = dataTypeDefinition(dataType)!;
  const mapping: Record<string, string> = {};
  for (const field of definition.fields) {
    const value = String(formData.get(`map_${field.key}`) ?? "");
    if (value) mapping[field.key] = value;
  }
  return mapping;
}

/** Runs validation only, so the administrator can resolve conflicts before importing. */
export async function validateMigration(formData: FormData): Promise<void> {
  await assertPermission(["migration.run", "users.import"]);
  const uploadId = String(formData.get("upload_id") ?? "");
  const dataType = String(formData.get("data_type") ?? "employees") as DataType;
  const upload = readUpload(uploadId);
  if (!upload) redirect(`/admin/migration?toast=${encodeURIComponent("That upload has expired. Please upload the file again.")}&tone=error`);

  const mapping = mappingFrom(formData, dataType);
  const options = optionsFrom(formData);
  const params = new URLSearchParams({
    type: dataType, step: "validate", match_by: options.matchBy,
    create_employees: String(options.createMissingEmployees),
    create_courses: String(options.createMissingCourses),
    skip_duplicates: String(options.skipDuplicates),
    mapping: JSON.stringify(mapping),
  });
  redirect(`/admin/migration/${uploadId}?${params.toString()}`);
}

export async function runMigration(formData: FormData): Promise<void> {
  const actor = await assertPermission(["migration.run", "users.import"]);
  const uploadId = String(formData.get("upload_id") ?? "");
  const dataType = String(formData.get("data_type") ?? "employees") as DataType;
  const sourceSystem = String(formData.get("source_system") ?? "Legacy LMS");
  const upload = readUpload(uploadId);
  if (!upload) redirect(`/admin/migration?toast=${encodeURIComponent("That upload has expired. Please upload the file again.")}&tone=error`);

  const mapping = JSON.parse(String(formData.get("mapping") ?? "{}")) as Record<string, string>;
  const options = optionsFrom(formData);
  const validation = await validateRows(dataType, upload.rows, mapping, options);
  const batchId = crypto.randomUUID();

  const migration = await queryOne<{ id: string }>(
    `insert into migrations (name, source_system, data_type, status, file_name, total_records, mapping, batch_id, created_by)
     values ($1,$2,$3,'running',$4,$5,$6::jsonb,$7,$8) returning id`,
    [`${sourceSystem} — ${dataTypeDefinition(dataType)?.label}`, sourceSystem, dataType, upload.fileName,
      validation.total, JSON.stringify(mapping), batchId, actor.id]);
  if (!migration) throw new Error("Could not start the migration.");

  let imported = 0, skipped = 0, failed = 0, warnings = 0;
  const recordRows: Array<[number, Record<string, string>, string, string | null, string | null]> = [];

  for (const row of validation.rows) {
    if (row.status === "error") {
      failed += 1;
      recordRows.push([row.rowNumber, row.values, "failed", row.messages.join(" · "), "Fix the source data and re-run"]);
      continue;
    }
    if (row.status === "duplicate" && options.skipDuplicates) {
      skipped += 1;
      recordRows.push([row.rowNumber, row.values, "skipped", row.messages.join(" · "), "Duplicate skipped"]);
      continue;
    }
    try {
      const result = await importRow(dataType, row, options, sourceSystem, batchId, actor.organizationId);
      imported += 1;
      if (row.status === "warning") warnings += 1;
      recordRows.push([row.rowNumber, row.values, row.status === "warning" ? "warning" : "imported",
        row.messages.join(" · ") || null, result]);
    } catch (error) {
      failed += 1;
      recordRows.push([row.rowNumber, row.values, "failed", (error as Error).message, "Import error"]);
    }
  }

  for (const [rowNumber, raw, status, message, resolution] of recordRows) {
    await query(
      `insert into migration_records (migration_id, row_number, raw, status, message, entity_type, resolution)
       values ($1,$2,$3::jsonb,$4,$5,$6,$7)`,
      [migration.id, rowNumber, JSON.stringify(raw), status, message, dataType, resolution]);
  }

  await query(
    `update migrations set status = 'completed', imported = $2, skipped = $3, failed = $4, warnings = $5,
            completed_at = now(), summary = $6::jsonb where id = $1`,
    [migration.id, imported, skipped, failed, warnings,
      JSON.stringify({ matchedOn: options.matchBy, createdEmployees: options.createMissingEmployees, createdCourses: options.createMissingCourses })]);

  await logAudit(actor, {
    action: "migration.run", entityType: "migration", entityId: migration.id,
    entityLabel: `${dataTypeDefinition(dataType)?.label} — ${imported} imported, ${failed} failed`,
    newValue: { imported, skipped, failed, warnings, batchId, sourceSystem },
  });

  revalidatePath("/admin/migration");
  redirect(`/admin/migration/report/${migration.id}`);
}

async function importRow(
  dataType: DataType,
  row: ValidatedRow,
  options: MatchOptions,
  sourceSystem: string,
  batchId: string,
  organizationId: string,
): Promise<string> {
  const v = row.values;

  const resolveUser = async (): Promise<string | null> => {
    if (row.matchedUserId) return row.matchedUserId;
    if (!options.createMissingEmployees) return null;
    const email = v.email || `${(v.employee_id || crypto.randomUUID()).toLowerCase()}@imported.wahlburgers.test`;
    const created = await queryOne<{ id: string }>(
      `insert into users (organization_id, email, username, password_hash, first_name, last_name, status,
          source_system, source_record_id, migration_batch_id)
       values ($1,$2,$3,$4,$5,$6,'invited',$7,$8,$9) returning id`,
      [organizationId, email, email.split("@")[0], hashPassword(crypto.randomUUID()),
        v.first_name || "Imported", v.last_name || "Employee", sourceSystem, v.employee_id || null, batchId]);
    if (created) {
      await query(
        `insert into employees (user_id, employee_id, position_title) values ($1,$2,$3)`,
        [created.id, v.employee_id || `IMP-${created.id.slice(0, 8)}`, v.position_title || "Team Member"]);
    }
    return created?.id ?? null;
  };

  switch (dataType) {
    case "employees": {
      const location = v.location
        ? await queryOne<{ id: string; franchise_group_id: string | null }>(
            `select id, franchise_group_id from locations where lower(name) = lower($1) or store_number = $1`, [v.location])
        : null;
      const role = v.role
        ? await queryOne<{ id: string }>(`select id from roles where lower(name) = lower($1) or code = lower($1)`, [v.role])
        : null;
      const department = v.department
        ? await queryOne<{ id: string }>(`select id from departments where lower(name) = lower($1) or code = upper($1)`, [v.department])
        : null;
      const fallbackRole = role ?? await queryOne<{ id: string }>(`select id from roles where code = 'hourly'`);
      const status = (v.status || "active").toLowerCase().replace(/\s+/g, "_");
      const normalizedStatus = ["active", "inactive", "deactivated", "leave_of_absence", "terminated", "invited"].includes(status)
        ? status : status === "true" ? "active" : status === "false" ? "deactivated" : "active";

      if (row.matchedUserId) {
        await query(
          `update users set first_name = $2, last_name = $3, preferred_name = coalesce(nullif($4,''), preferred_name),
                  email = coalesce(nullif($5,''), email), status = $6, updated_at = now(),
                  last_login_at = coalesce($7::timestamptz, last_login_at),
                  deactivated_at = coalesce($8::timestamptz, deactivated_at)
            where id = $1`,
          [row.matchedUserId, v.first_name, v.last_name, v.preferred_name, v.email, normalizedStatus,
            v.last_login || null, v.deactivation_date || null]);
        await query(
          `update employees set primary_location_id = coalesce($2, primary_location_id),
                  franchise_group_id = coalesce($3, franchise_group_id),
                  department_id = coalesce($4, department_id), role_id = coalesce($5, role_id),
                  position_title = coalesce(nullif($6,''), position_title),
                  hire_date = coalesce($7::date, hire_date), termination_date = coalesce($8::date, termination_date),
                  updated_at = now()
            where user_id = $1`,
          [row.matchedUserId, location?.id ?? null, location?.franchise_group_id ?? null, department?.id ?? null,
            role?.id ?? null, v.position_title, v.hire_date || null, v.termination_date || null]);
        return "Updated existing employee";
      }

      const user = await queryOne<{ id: string }>(
        `insert into users (organization_id, email, username, password_hash, first_name, last_name, preferred_name,
            status, last_login_at, deactivated_at, source_system, source_record_id, migration_batch_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10::timestamptz,$11,$12,$13) returning id`,
        [organizationId, v.email, v.username || v.email.split("@")[0], hashPassword(crypto.randomUUID()),
          v.first_name, v.last_name, v.preferred_name || null, normalizedStatus, v.last_login || null,
          v.deactivation_date || null, sourceSystem, v.employee_id, batchId]);
      if (!user) throw new Error("Could not create the employee.");
      await query(
        `insert into employees (user_id, employee_id, primary_location_id, franchise_group_id, department_id, role_id,
            position_title, hire_date, termination_date)
         values ($1,$2,$3,$4,$5,$6,$7,$8::date,$9::date)`,
        [user.id, v.employee_id, location?.id ?? null, location?.franchise_group_id ?? null, department?.id ?? null,
          fallbackRole?.id ?? null, v.position_title || "Team Member", v.hire_date || null, v.termination_date || null]);
      if (fallbackRole) await query(`insert into user_roles (user_id, role_id, is_primary) values ($1,$2,true) on conflict do nothing`, [user.id, fallbackRole.id]);
      await query(`insert into user_scopes (user_id, scope_type, scope_id, is_read_only) values ($1,'self',null,true)`, [user.id]);
      if (location) {
        await query(`insert into user_locations (user_id, location_id, access_type) values ($1,$2,'primary') on conflict do nothing`, [user.id, location.id]);
      }
      return "Created employee";
    }

    case "courses": {
      const existing = await queryOne<{ id: string }>(
        `select id from courses where lower(code) = lower($1) or source_record_id = $1 or lower(title) = lower($2)`,
        [v.course_id, v.course_name]);
      if (existing) return "Course already in the catalog";
      const category = v.category
        ? await queryOne<{ id: string }>(`select id from course_categories where lower(name) = lower($1)`, [v.category])
        : null;
      const course = await queryOne<{ id: string }>(
        `insert into courses (organization_id, code, title, description, category_id, course_type, estimated_minutes,
            is_required_default, passing_score, status, current_version, source_system, source_record_id,
            migration_batch_id, published_at)
         values ($1,$2,$3,$4,$5,'blended',$6,$7,$8,'published',$9,$10,$11,$12,$13::timestamptz) returning id`,
        [organizationId, v.course_id, v.course_name, v.description || null, category?.id ?? null,
          Number(v.duration_minutes) || 30, /^(y|yes|true|required|1)$/i.test(v.required ?? ""),
          Number(v.passing_score) || 80, Number(v.version) || 1, sourceSystem, v.course_id, batchId,
          v.publish_date || null]);
      if (course) {
        await query(
          `insert into course_versions (course_id, version_number, status, change_notes, published_at)
           values ($1,$2,'published','Imported from the legacy LMS', now())`, [course.id, Number(v.version) || 1]);
      }
      return "Created course";
    }

    case "historical_training": {
      const userId = await resolveUser();
      if (!userId) throw new Error("Unknown employee — no match on Employee ID, email or username");

      let courseId = row.matchedCourseId;
      if (!courseId && options.createMissingCourses && (v.course_id || v.course_name)) {
        const created = await queryOne<{ id: string }>(
          `insert into courses (organization_id, code, title, status, current_version, source_system, source_record_id, migration_batch_id)
           values ($1,$2,$3,'archived',1,$4,$5,$6)
           on conflict (organization_id, code) do update set title = excluded.title returning id`,
          [organizationId, v.course_id || v.course_name.slice(0, 40), v.course_name || v.course_id, sourceSystem, v.course_id, batchId]);
        courseId = created?.id ?? null;
      }

      const status = (v.completion_status || "").toLowerCase();
      const normalized = /complete|pass|finish/.test(status) ? "completed"
        : /progress|started/.test(status) ? "in_progress"
        : /fail/.test(status) ? "failed" : "completed";

      const certification = v.certification
        ? await queryOne<{ id: string }>(`select id from certifications where lower(name) = lower($1)`, [v.certification])
        : null;

      const enrollment = await queryOne<{ id: string }>(
        `insert into enrollments (user_id, course_id, course_title, course_version, status, is_required, assigned_at,
            started_at, completed_at, score, passing_score, attempts, duration_seconds, certification_id, expires_at,
            last_activity_at, source_system, source_record_id, migration_batch_id)
         values ($1,$2,$3,$4,$5,true,
                 coalesce($6::timestamptz, $8::timestamptz), $7::timestamptz, $8::timestamptz,
                 $9,$10,$11,$12,$13,$14::timestamptz,$8::timestamptz,$15,$16,$17)
         returning id`,
        [userId, courseId, v.course_name || v.course_id, Number(v.course_version) || 1, normalized,
          v.assignment_date || null, v.start_date || null, v.completion_date || null,
          v.score ? Number(v.score) : null, v.passing_score ? Number(v.passing_score) : 80,
          v.attempts ? Number(v.attempts) : 1, v.duration_minutes ? Math.round(Number(v.duration_minutes) * 60) : 0,
          certification?.id ?? null, v.expiration_date || null, sourceSystem, v.source_record_id || null, batchId]);

      await query(
        `insert into historical_completions (user_id, employee_ref, course_id, course_ref, course_version,
            assigned_date, start_date, completion_date, completion_status, score, passing_score, attempts,
            duration_minutes, certification_name, expiration_date, source_system, source_record_id,
            migration_batch_id, enrollment_id)
         values ($1,$2,$3,$4,$5,$6::date,$7::date,$8::date,$9,$10,$11,$12,$13,$14,$15::date,$16,$17,$18,$19)`,
        [userId, v.employee_id, courseId, v.course_id || v.course_name, v.course_version || "1",
          v.assignment_date || null, v.start_date || null, v.completion_date || null, v.completion_status,
          v.score ? Number(v.score) : null, v.passing_score ? Number(v.passing_score) : null,
          v.attempts ? Number(v.attempts) : null, v.duration_minutes ? Number(v.duration_minutes) : null,
          v.certification || null, v.expiration_date || null, sourceSystem, v.source_record_id || null,
          batchId, enrollment?.id ?? null]);

      if (certification && v.completion_date) {
        await query(
          `insert into user_certifications (user_id, certification_id, certification_name, issued_at, expires_at,
              status, source_system, migration_batch_id)
           values ($1,$2,$3,$4::timestamptz,$5::timestamptz,'active',$6,$7)`,
          [userId, certification.id, v.certification, v.completion_date, v.expiration_date || null, sourceSystem, batchId]);
      }
      return courseId ? "Imported completion" : "Imported completion (course kept as legacy title)";
    }

    case "assessments": {
      const userId = await resolveUser();
      if (!userId) throw new Error("Unknown employee");
      const assessment = await queryOne<{ id: string }>(
        `select id from assessments where lower(title) = lower($1)`, [v.assessment]);
      const passed = /^(y|yes|true|pass|passed|1)$/i.test(v.passed ?? "") || (Number(v.score) >= 80);
      await query(
        `insert into assessment_attempts (assessment_id, assessment_title, user_id, attempt_number, score, passed,
            started_at, completed_at, source_system, migration_batch_id)
         values ($1,$2,$3,$4,$5,$6,$7::timestamptz,$7::timestamptz,$8,$9)`,
        [assessment?.id ?? null, v.assessment, userId, Number(v.attempt) || 1,
          v.score ? Number(v.score) : null, passed, v.completion_date || null, sourceSystem, batchId]);
      return "Imported assessment attempt";
    }

    case "certifications": {
      const userId = await resolveUser();
      if (!userId) throw new Error("Unknown employee");
      const certification = await queryOne<{ id: string }>(
        `select id from certifications where lower(name) = lower($1)`, [v.certification]);
      const status = (v.status || "").toLowerCase();
      const normalized = /expired/.test(status) ? "expired" : /revoked/.test(status) ? "revoked" : "active";
      await query(
        `insert into user_certifications (user_id, certification_id, certification_name, issued_at, expires_at,
            status, source_system, migration_batch_id)
         values ($1,$2,$3,$4::timestamptz,$5::timestamptz,$6,$7,$8)`,
        [userId, certification?.id ?? null, v.certification, v.issue_date || null, v.expiration_date || null,
          normalized, sourceSystem, batchId]);
      return "Imported certification";
    }

    case "learning_paths": {
      const userId = await resolveUser();
      if (!userId) throw new Error("Unknown employee");
      const path = await queryOne<{ id: string }>(
        `select id from learning_paths where lower(name) = lower($1)`, [v.learning_path]);
      if (!path) throw new Error(`Learning path "${v.learning_path}" not found in the Academy`);
      const progress = Math.max(0, Math.min(100, Number(v.progress) || 0));
      await query(
        `insert into learning_path_enrollments (user_id, learning_path_id, assigned_at, progress, completed_at,
            status, source_system, migration_batch_id)
         values ($1,$2,coalesce($3::timestamptz, now()),$4,$5::timestamptz,$6,$7,$8)
         on conflict (user_id, learning_path_id) do update set progress = excluded.progress,
            completed_at = excluded.completed_at, status = excluded.status`,
        [userId, path.id, v.assigned_date || null, progress, v.completion_date || null,
          progress >= 100 || v.completion_date ? "completed" : "in_progress", sourceSystem, batchId]);
      return "Imported learning path progress";
    }
  }
}

/** Re-suggests a mapping (used by the "auto-map" button in the wizard). */
export async function autoMapColumns(uploadId: string, dataType: DataType): Promise<Record<string, string>> {
  await assertPermission(["migration.run", "users.import"]);
  const upload = readUpload(uploadId);
  if (!upload) return {};
  return suggestMapping(upload.headers, dataType);
}

