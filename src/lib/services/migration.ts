import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import * as XLSX from "xlsx";
import { query, queryOne } from "@/lib/db/client";

/**
 * Data Migration Center engine.
 *
 * Parses CSV/XLSX exports from the legacy LMS, maps columns, validates and
 * matches every row against Academy records, then imports. Imported history is
 * written into the SAME tables the Academy uses (enrollments, certifications,
 * assessment attempts) and stamped with `source_system`, `source_record_id` and
 * `migration_batch_id` so it appears on transcripts alongside new training and
 * remains fully auditable.
 */

const UPLOAD_DIR = process.env.WB_STORAGE_DIR
  ? path.join(process.env.WB_STORAGE_DIR, "imports")
  : path.join(process.cwd(), "storage", "imports");

export type DataType =
  | "employees" | "courses" | "historical_training" | "assessments" | "certifications" | "learning_paths";

export interface FieldDefinition {
  key: string;
  label: string;
  required?: boolean;
  aliases: string[];
  hint?: string;
}

export const DATA_TYPES: Array<{
  key: DataType; label: string; description: string; fields: FieldDefinition[];
}> = [
  {
    key: "employees",
    label: "Employees",
    description: "Employee master records: identity, restaurant, role, hire date and account status.",
    fields: [
      { key: "employee_id", label: "Employee ID", required: true, aliases: ["employee id", "employeeid", "emp id", "empno", "id"] },
      { key: "first_name", label: "First name", required: true, aliases: ["first name", "firstname", "given name"] },
      { key: "last_name", label: "Last name", required: true, aliases: ["last name", "lastname", "surname", "family name"] },
      { key: "preferred_name", label: "Preferred name", aliases: ["preferred name", "nickname", "goes by"] },
      { key: "email", label: "Email", required: true, aliases: ["email", "email address", "e-mail", "work email"] },
      { key: "username", label: "Username", aliases: ["username", "user name", "login", "user id"] },
      { key: "location", label: "Location", aliases: ["location", "store", "restaurant", "site", "store number", "store #"] },
      { key: "franchise_group", label: "Franchise group", aliases: ["franchise group", "franchisee", "owner group", "group"] },
      { key: "role", label: "Role", aliases: ["role", "system role", "access level", "permission"] },
      { key: "position_title", label: "Position", aliases: ["position", "job title", "title", "job"] },
      { key: "department", label: "Department", aliases: ["department", "dept", "area"] },
      { key: "hire_date", label: "Hire date", aliases: ["hire date", "hired", "start date", "date of hire"] },
      { key: "status", label: "Account status", aliases: ["status", "account status", "active", "state"] },
      { key: "last_login", label: "Last login", aliases: ["last login", "last sign in", "last access"] },
      { key: "deactivation_date", label: "Deactivation date", aliases: ["deactivation date", "deactivated", "disabled date"] },
      { key: "termination_date", label: "Termination date", aliases: ["termination date", "terminated", "separation date", "end date"] },
    ],
  },
  {
    key: "courses",
    label: "Courses",
    description: "Course catalog: identifiers, category, duration, requirement and passing score.",
    fields: [
      { key: "course_id", label: "Course ID", required: true, aliases: ["course id", "courseid", "code", "course code"] },
      { key: "course_name", label: "Course name", required: true, aliases: ["course name", "title", "name", "course title"] },
      { key: "description", label: "Description", aliases: ["description", "summary", "details"] },
      { key: "category", label: "Category", aliases: ["category", "topic", "curriculum", "subject"] },
      { key: "version", label: "Version", aliases: ["version", "course version", "rev"] },
      { key: "required", label: "Required", aliases: ["required", "mandatory", "is required"] },
      { key: "publish_date", label: "Original publish date", aliases: ["publish date", "published", "created date", "release date"] },
      { key: "duration_minutes", label: "Training duration (minutes)", aliases: ["duration", "minutes", "length", "training duration"] },
      { key: "passing_score", label: "Passing score", aliases: ["passing score", "pass score", "mastery score", "cutoff"] },
    ],
  },
  {
    key: "historical_training",
    label: "Historical training",
    description: "Completion history: who completed what, when, with what score and certification.",
    fields: [
      { key: "employee_id", label: "Employee", required: true, aliases: ["employee id", "employee", "user id", "email", "username", "learner"] },
      { key: "course_id", label: "Course", required: true, aliases: ["course id", "course", "course code", "course name", "title"] },
      { key: "assignment_date", label: "Assignment date", aliases: ["assignment date", "assigned", "assigned date", "date assigned"] },
      { key: "start_date", label: "Start date", aliases: ["start date", "started", "date started"] },
      { key: "completion_date", label: "Completion date", required: true, aliases: ["completion date", "completed", "date completed", "completed on"] },
      { key: "completion_status", label: "Completion status", required: true, aliases: ["completion status", "status", "result", "outcome"] },
      { key: "score", label: "Final score", aliases: ["score", "final score", "grade", "result score"] },
      { key: "passing_score", label: "Passing score", aliases: ["passing score", "pass score", "mastery"] },
      { key: "attempts", label: "Attempts", aliases: ["attempts", "tries", "attempt count"] },
      { key: "duration_minutes", label: "Duration (minutes)", aliases: ["duration", "time spent", "minutes"] },
      { key: "course_version", label: "Course version", aliases: ["course version", "version"] },
      { key: "certification", label: "Certification", aliases: ["certification", "certificate", "credential"] },
      { key: "expiration_date", label: "Expiration date", aliases: ["expiration date", "expires", "expiry", "valid until"] },
      { key: "source_record_id", label: "Source record ID", aliases: ["record id", "transcript id", "source id", "legacy id"] },
    ],
  },
  {
    key: "assessments",
    label: "Assessment results",
    description: "Assessment attempts with score, result and completion date.",
    fields: [
      { key: "employee_id", label: "Employee", required: true, aliases: ["employee id", "employee", "email", "username"] },
      { key: "assessment", label: "Assessment", required: true, aliases: ["assessment", "quiz", "exam", "test", "assessment name"] },
      { key: "attempt", label: "Attempt", aliases: ["attempt", "attempt number", "try"] },
      { key: "score", label: "Score", required: true, aliases: ["score", "grade", "result"] },
      { key: "passed", label: "Pass/fail", aliases: ["passed", "pass/fail", "result", "outcome", "status"] },
      { key: "completion_date", label: "Completion date", required: true, aliases: ["completion date", "completed", "date"] },
    ],
  },
  {
    key: "certifications",
    label: "Certifications",
    description: "Certifications held with issue date, expiration and status.",
    fields: [
      { key: "employee_id", label: "Employee", required: true, aliases: ["employee id", "employee", "email", "username"] },
      { key: "certification", label: "Certification", required: true, aliases: ["certification", "certificate", "credential", "name"] },
      { key: "issue_date", label: "Issue date", required: true, aliases: ["issue date", "issued", "earned", "date issued"] },
      { key: "expiration_date", label: "Expiration date", aliases: ["expiration date", "expires", "valid until", "expiry"] },
      { key: "status", label: "Status", aliases: ["status", "state", "active"] },
    ],
  },
  {
    key: "learning_paths",
    label: "Learning path progress",
    description: "Learning path assignment and progress per employee.",
    fields: [
      { key: "employee_id", label: "Employee", required: true, aliases: ["employee id", "employee", "email", "username"] },
      { key: "learning_path", label: "Learning path", required: true, aliases: ["learning path", "path", "curriculum", "program"] },
      { key: "assigned_date", label: "Assigned date", aliases: ["assigned date", "assigned", "start date"] },
      { key: "progress", label: "Progress %", aliases: ["progress", "percent complete", "completion", "% complete"] },
      { key: "completion_date", label: "Completion date", aliases: ["completion date", "completed", "date completed"] },
    ],
  },
];

export function dataTypeDefinition(key: string) {
  return DATA_TYPES.find((d) => d.key === key);
}

export interface ParsedUpload {
  uploadId: string;
  fileName: string;
  headers: string[];
  rows: Array<Record<string, string>>;
  totalRows: number;
}

/** Parses an uploaded CSV or XLSX file into headers + row objects. */
export function parseUpload(buffer: Buffer, fileName: string): ParsedUpload {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false, raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("That file has no worksheets.");
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "", raw: false });
  if (!rows.length) throw new Error("That file has no data rows.");
  const headers = Object.keys(rows[0]);

  const uploadId = crypto.randomUUID();
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(UPLOAD_DIR, `${uploadId}.json`),
    JSON.stringify({ fileName, headers, rows }),
  );
  return { uploadId, fileName, headers, rows: rows.slice(0, 20), totalRows: rows.length };
}

export function readUpload(uploadId: string): { fileName: string; headers: string[]; rows: Array<Record<string, string>> } | null {
  if (!/^[0-9a-f-]{36}$/i.test(uploadId)) return null;
  const file = path.join(UPLOAD_DIR, `${uploadId}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** Suggests a column mapping by matching headers against known aliases. */
export function suggestMapping(headers: string[], dataType: DataType): Record<string, string> {
  const definition = dataTypeDefinition(dataType);
  if (!definition) return {};
  const normalized = headers.map((h) => ({ header: h, key: h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() }));
  const mapping: Record<string, string> = {};
  for (const field of definition.fields) {
    const match = normalized.find((h) => h.key === field.label.toLowerCase() || field.aliases.includes(h.key))
      ?? normalized.find((h) => field.aliases.some((alias) => h.key.includes(alias)));
    if (match) mapping[field.key] = match.header;
  }
  return mapping;
}

export type RowStatus = "ok" | "warning" | "error" | "duplicate";

export interface ValidatedRow {
  rowNumber: number;
  status: RowStatus;
  messages: string[];
  values: Record<string, string>;
  matchedUserId?: string | null;
  matchedCourseId?: string | null;
  matchedBy?: string | null;
}

export interface ValidationSummary {
  total: number;
  ok: number;
  warnings: number;
  errors: number;
  duplicates: number;
  rows: ValidatedRow[];
}

const parseDate = (value: string | undefined): string | null => {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const direct = new Date(trimmed);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString().slice(0, 10);
  const us = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (us) {
    const year = us[3].length === 2 ? `20${us[3]}` : us[3];
    const date = new Date(Number(year), Number(us[1]) - 1, Number(us[2]));
    if (!Number.isNaN(date.getTime()) && Number(us[1]) <= 12 && Number(us[2]) <= 31) {
      return date.toISOString().slice(0, 10);
    }
  }
  return null;
};

export interface MatchOptions {
  matchBy: "employee_id" | "email" | "username" | "name_location";
  createMissingEmployees: boolean;
  createMissingCourses: boolean;
  skipDuplicates: boolean;
}

/** Validates every row and resolves matches against existing Academy records. */
export async function validateRows(
  dataType: DataType,
  rows: Array<Record<string, string>>,
  mapping: Record<string, string>,
  options: MatchOptions,
): Promise<ValidationSummary> {
  const definition = dataTypeDefinition(dataType);
  if (!definition) throw new Error("Unknown data type.");

  const people = await query<{ user_id: string; employee_id: string | null; email: string; username: string; full_name: string; location_name: string | null }>(
    `select user_id, employee_id, lower(email) as email, lower(username) as username, lower(full_name) as full_name,
            lower(location_name) as location_name from v_people`);
  const courses = await query<{ id: string; code: string; title: string; source_record_id: string | null }>(
    `select id, lower(code) as code, lower(title) as title, source_record_id from courses`);
  const locations = await query<{ id: string; name: string; store_number: string }>(
    `select id, lower(name) as name, store_number from locations`);
  const roles = await query<{ id: string; name: string; code: string }>(`select id, lower(name) as name, code from roles`);

  const seen = new Set<string>();
  const validated: ValidatedRow[] = [];

  for (const [index, raw] of rows.entries()) {
    const values: Record<string, string> = {};
    for (const field of definition.fields) {
      const header = mapping[field.key];
      values[field.key] = header ? String(raw[header] ?? "").trim() : "";
    }

    const messages: string[] = [];
    let status: RowStatus = "ok";

    for (const field of definition.fields) {
      if (field.required && !values[field.key]) {
        messages.push(`Missing required field: ${field.label}`);
        status = "error";
      }
    }

    // Employee matching
    let matchedUserId: string | null = null;
    let matchedBy: string | null = null;
    if (values.employee_id || values.email || values.username) {
      const needle = (values.employee_id || values.email || values.username).toLowerCase();
      const byId = people.find((p) => p.employee_id?.toLowerCase() === needle);
      const byEmail = people.find((p) => p.email === needle);
      const byUsername = people.find((p) => p.username === needle);
      const byName = values.location
        ? people.find((p) => p.full_name === `${values.first_name} ${values.last_name}`.toLowerCase()
            && p.location_name === values.location.toLowerCase())
        : undefined;

      const preferred = options.matchBy === "email" ? byEmail
        : options.matchBy === "username" ? byUsername
        : options.matchBy === "name_location" ? byName
        : byId;
      const match = preferred ?? byId ?? byEmail ?? byUsername ?? byName;
      if (match) {
        matchedUserId = match.user_id;
        matchedBy = preferred ? options.matchBy : byId ? "employee_id" : byEmail ? "email" : byUsername ? "username" : "name_location";
      } else if (dataType !== "employees") {
        if (options.createMissingEmployees) {
          messages.push("Unknown employee — a placeholder employee record will be created");
          if (status === "ok") status = "warning";
        } else {
          messages.push("Unknown employee — no match on Employee ID, email or username");
          status = "error";
        }
      }
    }

    // Course matching
    let matchedCourseId: string | null = null;
    if (values.course_id || values.course_name) {
      const needle = (values.course_id || values.course_name).toLowerCase();
      const match = courses.find((c) => c.code === needle || c.title === needle || c.source_record_id?.toLowerCase() === needle);
      if (match) matchedCourseId = match.id;
      else if (dataType === "historical_training") {
        messages.push("Course not found in the Academy catalog — the record keeps its original course title");
        if (status === "ok") status = "warning";
      }
    }

    // Dates
    for (const key of ["hire_date", "completion_date", "assignment_date", "start_date", "expiration_date", "issue_date", "publish_date", "assigned_date", "last_login", "deactivation_date", "termination_date"]) {
      if (values[key]) {
        const parsed = parseDate(values[key]);
        if (!parsed) {
          messages.push(`Invalid date in ${key.replace(/_/g, " ")}: "${values[key]}"`);
          status = "error";
        } else {
          values[key] = parsed;
        }
      }
    }

    // Location / role resolution for employee imports
    if (dataType === "employees") {
      if (values.location) {
        const loc = locations.find((l) => l.name === values.location.toLowerCase() || l.store_number === values.location);
        if (!loc) {
          messages.push(`Location "${values.location}" not found — employee will import without a restaurant`);
          if (status === "ok") status = "warning";
        }
      }
      if (values.role) {
        const role = roles.find((r) => r.name === values.role.toLowerCase() || r.code === values.role.toLowerCase());
        if (!role) {
          messages.push(`Role "${values.role}" not recognized — defaulting to Hourly Employee`);
          if (status === "ok") status = "warning";
        }
      }
    }

    // Duplicate detection within the file
    const dupKey = dataType === "historical_training"
      ? `${values.employee_id}|${values.course_id}|${values.completion_date}`
      : dataType === "employees"
      ? `${values.employee_id || values.email}`
      : `${values.employee_id}|${values.certification ?? values.assessment ?? values.learning_path}|${values.completion_date ?? values.issue_date}`;
    if (seen.has(dupKey)) {
      messages.push("Duplicate row — the same record appears earlier in this file");
      status = status === "error" ? "error" : "duplicate";
    }
    seen.add(dupKey);

    validated.push({ rowNumber: index + 2, status, messages, values, matchedUserId, matchedCourseId, matchedBy });
  }

  return {
    total: validated.length,
    ok: validated.filter((r) => r.status === "ok").length,
    warnings: validated.filter((r) => r.status === "warning").length,
    errors: validated.filter((r) => r.status === "error").length,
    duplicates: validated.filter((r) => r.status === "duplicate").length,
    rows: validated,
  };
}

export interface MigrationStats {
  employees_imported: string;
  historical_imported: string;
  courses_imported: string;
  assessments_imported: string;
  certifications_imported: string;
  paths_imported: string;
  failed_records: string;
  warning_records: string;
  last_migration: string | null;
  batches: string;
}

export async function migrationStats(): Promise<MigrationStats> {
  const row = await queryOne<MigrationStats>(`
    select
      (select count(*)::text from users where source_system <> 'Wahlburgers Academy') as employees_imported,
      (select count(*)::text from enrollments where source_system <> 'Wahlburgers Academy') as historical_imported,
      (select count(*)::text from courses where source_system <> 'Wahlburgers Academy') as courses_imported,
      (select count(*)::text from assessment_attempts where source_system <> 'Wahlburgers Academy') as assessments_imported,
      (select count(*)::text from user_certifications where source_system <> 'Wahlburgers Academy') as certifications_imported,
      (select count(*)::text from learning_path_enrollments where source_system <> 'Wahlburgers Academy') as paths_imported,
      (select coalesce(sum(failed), 0)::text from migrations) as failed_records,
      (select coalesce(sum(warnings), 0)::text from migrations) as warning_records,
      (select max(completed_at)::text from migrations) as last_migration,
      (select count(distinct batch_id)::text from migrations) as batches`);
  return row ?? {
    employees_imported: "0", historical_imported: "0", courses_imported: "0", assessments_imported: "0",
    certifications_imported: "0", paths_imported: "0", failed_records: "0", warning_records: "0",
    last_migration: null, batches: "0",
  };
}

export async function listMigrations(limit = 25) {
  return query<{
    id: string; name: string; source_system: string; data_type: string; status: string; file_name: string | null;
    total_records: number; imported: number; skipped: number; failed: number; warnings: number;
    started_at: string; completed_at: string | null; created_by_name: string | null; batch_id: string;
  }>(
    `select m.id, m.name, m.source_system, m.data_type, m.status, m.file_name, m.total_records, m.imported,
            m.skipped, m.failed, m.warnings, m.started_at, m.completed_at, p.full_name as created_by_name, m.batch_id
       from migrations m left join v_people p on p.user_id = m.created_by
      order by m.started_at desc limit $1`, [limit]);
}

export async function migrationDetail(migrationId: string) {
  const migration = await queryOne<{
    id: string; name: string; source_system: string; data_type: string; status: string; file_name: string | null;
    total_records: number; imported: number; skipped: number; failed: number; warnings: number;
    started_at: string; completed_at: string | null; mapping: Record<string, string>; summary: Record<string, unknown>;
    batch_id: string; created_by_name: string | null;
  }>(
    `select m.*, p.full_name as created_by_name from migrations m
       left join v_people p on p.user_id = m.created_by where m.id = $1`, [migrationId]);
  if (!migration) return null;
  const records = await query<{
    id: string; row_number: number; raw: Record<string, string>; status: string; message: string | null; resolution: string | null;
  }>(
    `select id, row_number, raw, status, message, resolution from migration_records
      where migration_id = $1 order by (status = 'failed') desc, row_number limit 500`, [migrationId]);
  return { migration, records };
}
