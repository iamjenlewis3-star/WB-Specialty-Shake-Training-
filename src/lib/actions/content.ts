"use server";

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { query, queryOne } from "@/lib/db/client";
import { assertPermission } from "@/lib/auth/guard";
import { isUuid } from "@/lib/rbac/scope";
import { logAudit } from "@/lib/services/audit";
import { extractScormPackage, ScormValidationError } from "@/lib/scorm/package";
import { notifyMany } from "@/lib/services/notifications";

/** Course authoring, SCORM ingestion, asset library and learning paths. */

const ASSET_STORAGE = process.env.WB_STORAGE_DIR
  ? path.join(process.env.WB_STORAGE_DIR, "assets")
  : path.join(process.cwd(), "storage", "assets");

const MAX_ASSET_BYTES = 250 * 1024 * 1024;
const ALLOWED_ASSET_MIME = new Set([
  "application/pdf", "video/mp4", "video/quicktime", "video/webm", "image/png", "image/jpeg", "image/gif",
  "image/webp", "text/html", "text/plain", "text/csv",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const BLOCKED_ASSET_EXT = new Set([".exe", ".sh", ".bat", ".cmd", ".php", ".js", ".jsp", ".asp", ".dll", ".msi", ".ps1"]);

const courseSchema = z.object({
  title: z.string().min(3),
  code: z.string().min(2),
  description: z.string().optional(),
  category_id: z.string().optional(),
  course_type: z.string().default("blended"),
  estimated_minutes: z.coerce.number().min(1).max(1200).default(30),
  passing_score: z.coerce.number().min(0).max(100).default(80),
  certification_id: z.string().optional(),
  objectives: z.string().optional(),
  is_required_default: z.coerce.boolean().optional(),
});

export async function createCourse(formData: FormData): Promise<void> {
  const actor = await assertPermission("courses.create");
  const parsed = courseSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/admin/courses/new?toast=${encodeURIComponent(parsed.error.issues[0].message)}&tone=error`);
  }
  const data = parsed.data;
  const objectives = (data.objectives ?? "").split("\n").map((o) => o.trim()).filter(Boolean);

  const existing = await queryOne<{ id: string }>(`select id from courses where code = $1`, [data.code]);
  if (existing) redirect(`/admin/courses/new?toast=${encodeURIComponent("That course code is already in use.")}&tone=error`);

  const row = await queryOne<{ id: string }>(
    `insert into courses (organization_id, code, title, description, objectives, category_id, course_type,
        thumbnail_color, estimated_minutes, is_required_default, passing_score, status, owner_user_id,
        certification_id, current_version, tags)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft',$12,$13,1,$14) returning id`,
    [actor.organizationId, data.code, data.title, data.description ?? null, objectives,
      data.category_id || null, data.course_type,
      ["#0e1f38", "#c8102e", "#14866d", "#1e5fbf", "#7c53c3"][Math.floor(Math.random() * 5)],
      data.estimated_minutes, formData.get("is_required_default") === "on", data.passing_score, actor.id,
      data.certification_id || null, [data.course_type]]);
  if (!row) throw new Error("Could not create the course.");

  await query(
    `insert into course_versions (course_id, version_number, status, change_notes, author_user_id)
     values ($1, 1, 'draft', 'Initial draft', $2)`, [row.id, actor.id]);
  await logAudit(actor, { action: "course.created", entityType: "course", entityId: row.id, entityLabel: data.title });
  revalidatePath("/admin/courses");
  redirect(`/admin/courses/${row.id}?toast=${encodeURIComponent("Course created — add your modules")}`);
}

export async function updateCourse(formData: FormData): Promise<void> {
  const actor = await assertPermission("courses.edit");
  const courseId = String(formData.get("course_id") ?? "");
  if (!isUuid(courseId)) throw new Error("Invalid course.");
  const before = await queryOne<Record<string, unknown>>(
    `select title, description, category_id, estimated_minutes, passing_score, certification_id from courses where id = $1`, [courseId]);
  const objectives = String(formData.get("objectives") ?? "").split("\n").map((o) => o.trim()).filter(Boolean);

  await query(
    `update courses set title = $2, description = $3, category_id = $4, estimated_minutes = $5,
            passing_score = $6, certification_id = $7, objectives = $8, course_type = $9,
            is_required_default = $10, updated_at = now()
      where id = $1`,
    [courseId, formData.get("title"), formData.get("description") || null, formData.get("category_id") || null,
      Number(formData.get("estimated_minutes") ?? 30), Number(formData.get("passing_score") ?? 80),
      formData.get("certification_id") || null, objectives, formData.get("course_type") || "blended",
      formData.get("is_required_default") === "on"]);

  await logAudit(actor, {
    action: "course.updated", entityType: "course", entityId: courseId,
    entityLabel: String(formData.get("title")), previousValue: before,
  });
  revalidatePath(`/admin/courses/${courseId}`);
  redirect(`/admin/courses/${courseId}?toast=${encodeURIComponent("Course updated")}`);
}

/**
 * Publishes a course version.
 *
 * `retraining` decides whether existing completions stand or learners must retake:
 * keeping completions preserves history; requiring retraining re-opens the
 * enrollment against the new version while the old record stays on the transcript.
 */
export async function publishCourse(formData: FormData): Promise<void> {
  const actor = await assertPermission("courses.publish");
  const courseId = String(formData.get("course_id") ?? "");
  const retraining = String(formData.get("retraining") ?? "keep") === "retrain";
  const changeNotes = String(formData.get("change_notes") ?? "").trim() || "Published";
  if (!isUuid(courseId)) throw new Error("Invalid course.");

  const course = await queryOne<{ id: string; title: string; status: string; current_version: number }>(
    `select id, title, status, current_version from courses where id = $1`, [courseId]);
  if (!course) throw new Error("Course not found.");

  // Scheduling defers the release: the version is stored as "scheduled" and the
  // daily automation job publishes it when the date arrives.
  const scheduledFor = String(formData.get("scheduled_for") ?? "").trim();
  if (scheduledFor) {
    const version = course.status === "published" ? course.current_version + 1 : course.current_version;
    await query(
      `insert into course_versions (course_id, version_number, status, change_notes, author_user_id,
          requires_retraining, scheduled_for)
       values ($1,$2,'scheduled',$3,$4,$5,$6::timestamptz)
       on conflict (course_id, version_number) do update set status = 'scheduled',
          scheduled_for = excluded.scheduled_for, change_notes = excluded.change_notes`,
      [courseId, version, changeNotes, actor.id, retraining, new Date(scheduledFor).toISOString()]);
    await query(`update courses set status = case when status = 'published' then 'published' else 'scheduled' end,
                   updated_at = now() where id = $1`, [courseId]);
    await logAudit(actor, {
      action: "course.scheduled", entityType: "course", entityId: courseId, entityLabel: course.title,
      newValue: { version, scheduledFor, retraining },
    });
    revalidatePath(`/admin/courses/${courseId}`);
    redirect(`/admin/courses/${courseId}?toast=${encodeURIComponent(
      `Version ${version} scheduled for ${new Date(scheduledFor).toLocaleDateString("en-US")}`)}`);
  }

  const isFirstPublish = course.status !== "published";
  const nextVersion = isFirstPublish ? course.current_version : course.current_version + 1;

  if (!isFirstPublish) {
    // New version: clone the module set so historical versions stay intact.
    await query(`update course_versions set status = 'archived' where course_id = $1 and status = 'published'`, [courseId]);
    await query(
      `insert into course_versions (course_id, version_number, status, change_notes, author_user_id, requires_retraining, published_at)
       values ($1,$2,'published',$3,$4,$5, now())`,
      [courseId, nextVersion, changeNotes, actor.id, retraining]);
    await query(
      `insert into course_modules (course_id, course_version, title, description, module_type, position, asset_id,
          scorm_package_id, assessment_id, content_text, external_url, is_required, min_seconds, passing_score,
          attempt_limit, requires_manager_validation, sequence_required, completion_rule)
       select course_id, $2, title, description, module_type, position, asset_id, scorm_package_id, assessment_id,
              content_text, external_url, is_required, min_seconds, passing_score, attempt_limit,
              requires_manager_validation, sequence_required, completion_rule
         from course_modules where course_id = $1 and course_version = $3`,
      [courseId, nextVersion, course.current_version]);
  } else {
    await query(
      `update course_versions set status = 'published', published_at = now(), change_notes = $3
        where course_id = $1 and version_number = $2`, [courseId, nextVersion, changeNotes]);
  }

  await query(
    `update courses set status = 'published', current_version = $2, published_at = coalesce(published_at, now()), updated_at = now()
      where id = $1`, [courseId, nextVersion]);

  let reopened = 0;
  if (retraining && !isFirstPublish) {
    const rows = await query<{ user_id: string }>(
      `insert into enrollments (user_id, course_id, course_title, course_version, assignment_id, status, is_required,
          assigned_at, due_at, passing_score, certification_id, source_system)
       select e.user_id, e.course_id, e.course_title, $2, e.assignment_id, 'not_started', e.is_required,
              now(), now() + interval '30 days', e.passing_score, e.certification_id, 'Wahlburgers Academy'
         from enrollments e
        where e.course_id = $1 and e.status = 'completed' and e.course_version < $2
          and not exists (select 1 from enrollments x where x.user_id = e.user_id and x.course_id = e.course_id and x.course_version = $2)
       returning user_id`, [courseId, nextVersion]);
    reopened = rows.length;
    await notifyMany(rows.map((r) => r.user_id), {
      type: "training_assigned",
      title: `Retraining required: ${course.title}`,
      body: `Version ${nextVersion} was published. Your previous completion stays on your transcript.`,
      link: "/my-learning",
    });
  }

  await logAudit(actor, {
    action: "course.published", entityType: "course", entityId: courseId, entityLabel: course.title,
    newValue: { version: nextVersion, retraining, reopened, changeNotes },
  });
  revalidatePath(`/admin/courses/${courseId}`);
  redirect(`/admin/courses/${courseId}?toast=${encodeURIComponent(
    `Version ${nextVersion} published${retraining ? ` · ${reopened} learners assigned retraining` : " · existing completions kept"}`)}`);
}

export async function archiveCourse(formData: FormData): Promise<void> {
  const actor = await assertPermission("courses.archive");
  const courseId = String(formData.get("course_id") ?? "");
  if (!isUuid(courseId)) return;
  const course = await queryOne<{ title: string; status: string }>(`select title, status from courses where id = $1`, [courseId]);
  const nextStatus = course?.status === "archived" ? "published" : "archived";
  await query(`update courses set status = $2, updated_at = now() where id = $1`, [courseId, nextStatus]);
  await logAudit(actor, { action: `course.${nextStatus === "archived" ? "archived" : "restored"}`, entityType: "course", entityId: courseId, entityLabel: course?.title });
  revalidatePath("/admin/courses");
  redirect(`/admin/courses/${courseId}?toast=${encodeURIComponent(nextStatus === "archived" ? "Course archived — training history is untouched" : "Course restored")}`);
}

export async function saveModule(formData: FormData): Promise<void> {
  const actor = await assertPermission("courses.edit");
  const courseId = String(formData.get("course_id") ?? "");
  const moduleId = String(formData.get("module_id") ?? "");
  if (!isUuid(courseId)) throw new Error("Invalid course.");
  const course = await queryOne<{ current_version: number; title: string }>(
    `select current_version, title from courses where id = $1`, [courseId]);
  if (!course) throw new Error("Course not found.");

  const values = {
    title: String(formData.get("title") ?? "Untitled module"),
    description: String(formData.get("description") ?? "") || null,
    module_type: String(formData.get("module_type") ?? "text"),
    asset_id: String(formData.get("asset_id") ?? "") || null,
    scorm_package_id: String(formData.get("scorm_package_id") ?? "") || null,
    assessment_id: String(formData.get("assessment_id") ?? "") || null,
    content_text: String(formData.get("content_text") ?? "") || null,
    external_url: String(formData.get("external_url") ?? "") || null,
    is_required: formData.get("is_required") === "on",
    min_seconds: Number(formData.get("min_seconds") ?? 0),
    passing_score: formData.get("passing_score") ? Number(formData.get("passing_score")) : null,
    attempt_limit: formData.get("attempt_limit") ? Number(formData.get("attempt_limit")) : null,
    requires_manager_validation: formData.get("requires_manager_validation") === "on",
    sequence_required: formData.get("sequence_required") === "on",
    completion_rule: String(formData.get("completion_rule") ?? "view"),
  };

  if (isUuid(moduleId)) {
    await query(
      `update course_modules set title=$2, description=$3, module_type=$4, asset_id=$5, scorm_package_id=$6,
              assessment_id=$7, content_text=$8, external_url=$9, is_required=$10, min_seconds=$11,
              passing_score=$12, attempt_limit=$13, requires_manager_validation=$14, sequence_required=$15,
              completion_rule=$16
        where id = $1`,
      [moduleId, values.title, values.description, values.module_type, values.asset_id, values.scorm_package_id,
        values.assessment_id, values.content_text, values.external_url, values.is_required, values.min_seconds,
        values.passing_score, values.attempt_limit, values.requires_manager_validation, values.sequence_required,
        values.completion_rule]);
    await logAudit(actor, { action: "course.module_updated", entityType: "course", entityId: courseId, entityLabel: `${course.title} — ${values.title}` });
  } else {
    const next = await queryOne<{ position: number }>(
      `select coalesce(max(position), 0) + 1 as position from course_modules where course_id = $1 and course_version = $2`,
      [courseId, course.current_version]);
    await query(
      `insert into course_modules (course_id, course_version, title, description, module_type, position, asset_id,
          scorm_package_id, assessment_id, content_text, external_url, is_required, min_seconds, passing_score,
          attempt_limit, requires_manager_validation, sequence_required, completion_rule)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [courseId, course.current_version, values.title, values.description, values.module_type, next?.position ?? 1,
        values.asset_id, values.scorm_package_id, values.assessment_id, values.content_text, values.external_url,
        values.is_required, values.min_seconds, values.passing_score, values.attempt_limit,
        values.requires_manager_validation, values.sequence_required, values.completion_rule]);
    await logAudit(actor, { action: "course.module_added", entityType: "course", entityId: courseId, entityLabel: `${course.title} — ${values.title}` });
  }
  revalidatePath(`/admin/courses/${courseId}`);
  redirect(`/admin/courses/${courseId}?toast=${encodeURIComponent("Module saved")}`);
}

export async function deleteModule(formData: FormData): Promise<void> {
  const actor = await assertPermission("courses.edit");
  const moduleId = String(formData.get("module_id") ?? "");
  const courseId = String(formData.get("course_id") ?? "");
  if (!isUuid(moduleId)) return;
  await query(`delete from course_modules where id = $1`, [moduleId]);
  await logAudit(actor, { action: "course.module_deleted", entityType: "course", entityId: courseId });
  revalidatePath(`/admin/courses/${courseId}`);
}

export async function reorderModule(formData: FormData): Promise<void> {
  await assertPermission("courses.edit");
  const moduleId = String(formData.get("module_id") ?? "");
  const courseId = String(formData.get("course_id") ?? "");
  const direction = String(formData.get("direction") ?? "up");
  if (!isUuid(moduleId) || !isUuid(courseId)) return;

  const current = await queryOne<{ position: number; course_version: number }>(
    `select position, course_version from course_modules where id = $1`, [moduleId]);
  if (!current) return;
  const neighbour = await queryOne<{ id: string; position: number }>(
    `select id, position from course_modules
      where course_id = $1 and course_version = $2 and position ${direction === "up" ? "<" : ">"} $3
      order by position ${direction === "up" ? "desc" : "asc"} limit 1`,
    [courseId, current.course_version, current.position]);
  if (!neighbour) return;
  await query(`update course_modules set position = $2 where id = $1`, [moduleId, neighbour.position]);
  await query(`update course_modules set position = $2 where id = $1`, [neighbour.id, current.position]);
  revalidatePath(`/admin/courses/${courseId}`);
}

/** SCORM package upload — validated and safely extracted before anything is stored. */
export async function uploadScormPackage(formData: FormData): Promise<void> {
  const actor = await assertPermission("scorm.upload");
  const file = formData.get("file");
  const courseId = String(formData.get("course_id") ?? "");
  const attachAsModule = formData.get("attach_module") === "on";
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/admin/scorm?toast=${encodeURIComponent("Choose a SCORM .zip file to upload.")}&tone=error`);
  }

  let meta;
  try {
    meta = extractScormPackage(Buffer.from(await file.arrayBuffer()), file.name);
  } catch (error) {
    const message = error instanceof ScormValidationError ? error.message : "That file could not be processed as a SCORM package.";
    redirect(`/admin/scorm?toast=${encodeURIComponent(message)}&tone=error`);
  }

  await query(
    `insert into scorm_packages (id, organization_id, title, identifier, scorm_version, launch_file, extract_path,
        manifest_xml, mastery_score, file_size, file_name, status, version, uploaded_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active',1,$12)`,
    [meta.id, actor.organizationId, meta.title, meta.identifier, meta.scormVersion, meta.launchFile,
      meta.extractPath, meta.manifestXml, meta.masteryScore, meta.fileSize, file.name, actor.id]);
  await query(
    `insert into scorm_versions (scorm_package_id, version, launch_file, extract_path, file_size, notes, uploaded_by)
     values ($1,1,$2,$3,$4,'Initial upload',$5)`,
    [meta.id, meta.launchFile, meta.extractPath, meta.fileSize, actor.id]);

  if (attachAsModule && isUuid(courseId)) {
    const course = await queryOne<{ current_version: number }>(`select current_version from courses where id = $1`, [courseId]);
    const next = await queryOne<{ position: number }>(
      `select coalesce(max(position), 0) + 1 as position from course_modules where course_id = $1 and course_version = $2`,
      [courseId, course?.current_version ?? 1]);
    await query(
      `insert into course_modules (course_id, course_version, title, module_type, position, scorm_package_id,
          is_required, completion_rule, passing_score)
       values ($1,$2,$3,'scorm',$4,$5,true,'score',$6)`,
      [courseId, course?.current_version ?? 1, meta.title, next?.position ?? 1, meta.id, meta.masteryScore ?? 80]);
  }

  await logAudit(actor, {
    action: "scorm.uploaded", entityType: "scorm_package", entityId: meta.id, entityLabel: meta.title,
    newValue: { scormVersion: meta.scormVersion, launchFile: meta.launchFile, files: meta.fileCount, bytes: meta.fileSize },
  });
  revalidatePath("/admin/scorm");
  redirect(`/admin/scorm/${meta.id}?toast=${encodeURIComponent(`SCORM ${meta.scormVersion} package validated and imported`)}`);
}

/** Asset upload with MIME/extension/size validation into private storage. */
export async function uploadAsset(formData: FormData): Promise<void> {
  const actor = await assertPermission("assets.manage");
  const file = formData.get("file");
  const name = String(formData.get("name") ?? "").trim();
  const assetType = String(formData.get("asset_type") ?? "document");
  const category = String(formData.get("category") ?? "") || null;
  const description = String(formData.get("description") ?? "") || null;
  const tags = String(formData.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const isResource = formData.get("is_resource") === "on";
  const requiresAck = formData.get("requires_acknowledgment") === "on";
  const externalUrl = String(formData.get("external_url") ?? "").trim() || null;

  if (!name) redirect(`/admin/assets?toast=${encodeURIComponent("Give the asset a name.")}&tone=error`);

  let filePath: string | null = null;
  let fileName: string | null = null;
  let fileSize = 0;
  let mimeType: string | null = null;

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_ASSET_BYTES) redirect(`/admin/assets?toast=${encodeURIComponent("Files must be 250 MB or smaller.")}&tone=error`);
    const ext = path.extname(file.name).toLowerCase();
    if (BLOCKED_ASSET_EXT.has(ext)) redirect(`/admin/assets?toast=${encodeURIComponent(`${ext} files are not allowed.`)}&tone=error`);
    if (file.type && !ALLOWED_ASSET_MIME.has(file.type)) {
      redirect(`/admin/assets?toast=${encodeURIComponent(`Unsupported file type: ${file.type}`)}&tone=error`);
    }
    fs.mkdirSync(ASSET_STORAGE, { recursive: true });
    const safeName = `${crypto.randomUUID()}${ext}`;
    const target = path.join(ASSET_STORAGE, safeName);
    fs.writeFileSync(target, Buffer.from(await file.arrayBuffer()));
    filePath = path.relative(process.cwd(), target);
    fileName = file.name;
    fileSize = file.size;
    mimeType = file.type || null;
  }

  const row = await queryOne<{ id: string }>(
    `insert into assets (organization_id, name, description, asset_type, category, tags, version, file_name,
        file_path, external_url, mime_type, file_size, uploaded_by, status, is_resource, requires_acknowledgment)
     values ($1,$2,$3,$4,$5,$6,1,$7,$8,$9,$10,$11,$12,'active',$13,$14) returning id`,
    [actor.organizationId, name, description, assetType, category, tags, fileName, filePath, externalUrl,
      mimeType, fileSize, actor.id, isResource, requiresAck]);
  if (row) {
    await query(
      `insert into asset_versions (asset_id, version, file_name, file_path, file_size, notes, uploaded_by)
       values ($1,1,$2,$3,$4,'Initial upload',$5)`, [row.id, fileName, filePath, fileSize, actor.id]);
  }

  await logAudit(actor, { action: "asset.uploaded", entityType: "asset", entityId: row?.id, entityLabel: name });
  revalidatePath("/admin/assets");
  redirect(`/admin/assets?toast=${encodeURIComponent("Asset added to the library")}`);
}

export async function archiveAsset(formData: FormData): Promise<void> {
  const actor = await assertPermission("assets.manage");
  const assetId = String(formData.get("asset_id") ?? "");
  if (!isUuid(assetId)) return;
  const asset = await queryOne<{ name: string; is_archived: boolean }>(`select name, is_archived from assets where id = $1`, [assetId]);
  await query(`update assets set is_archived = not is_archived, status = case when is_archived then 'active' else 'archived' end,
                 updated_at = now() where id = $1`, [assetId]);
  await logAudit(actor, {
    action: asset?.is_archived ? "asset.restored" : "asset.archived",
    entityType: "asset", entityId: assetId, entityLabel: asset?.name,
  });
  revalidatePath("/admin/assets");
  redirect(`/admin/assets?toast=${encodeURIComponent(asset?.is_archived ? "Asset restored" : "Asset archived — courses that used it keep their history")}`);
}

export async function createLearningPath(formData: FormData): Promise<void> {
  const actor = await assertPermission("learning_paths.manage");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const category = String(formData.get("category") ?? "") || null;
  const certificationId = String(formData.get("certification_id") ?? "") || null;
  const courseIds = formData.getAll("course_ids").map(String).filter(isUuid);
  if (!name || courseIds.length === 0) {
    redirect(`/admin/learning-paths?toast=${encodeURIComponent("Name the path and choose at least one course.")}&tone=error`);
  }

  const row = await queryOne<{ id: string }>(
    `insert into learning_paths (organization_id, name, description, category, status, certification_id, created_by)
     values ($1,$2,$3,$4,'published',$5,$6) returning id`,
    [actor.organizationId, name, description, category, certificationId, actor.id]);
  if (!row) throw new Error("Could not create the learning path.");

  for (const [index, courseId] of courseIds.entries()) {
    const course = await queryOne<{ title: string }>(`select title from courses where id = $1`, [courseId]);
    await query(
      `insert into learning_path_items (learning_path_id, position, item_type, course_id, title, is_required)
       values ($1,$2,'course',$3,$4,true)`, [row.id, index + 1, courseId, course?.title ?? null]);
  }
  if (certificationId) {
    const cert = await queryOne<{ name: string }>(`select name from certifications where id = $1`, [certificationId]);
    await query(
      `insert into learning_path_items (learning_path_id, position, item_type, certification_id, title, is_required)
       values ($1,$2,'certification',$3,$4,true)`, [row.id, courseIds.length + 1, certificationId, cert?.name ?? null]);
  }

  await logAudit(actor, { action: "learning_path.created", entityType: "learning_path", entityId: row.id, entityLabel: name });
  revalidatePath("/admin/learning-paths");
  redirect(`/admin/learning-paths?toast=${encodeURIComponent("Learning path created")}`);
}

export async function createCertification(formData: FormData): Promise<void> {
  const actor = await assertPermission("certifications.manage");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect(`/admin/certifications?toast=${encodeURIComponent("Name the certification.")}&tone=error`);
  const row = await queryOne<{ id: string }>(
    `insert into certifications (organization_id, name, description, validity_months, passing_score,
        requires_manager_approval, renewal_requirements)
     values ($1,$2,$3,$4,$5,$6,$7) returning id`,
    [actor.organizationId, name, String(formData.get("description") ?? "") || null,
      Number(formData.get("validity_months") ?? 12), Number(formData.get("passing_score") ?? 80),
      formData.get("requires_manager_approval") === "on", String(formData.get("renewal_requirements") ?? "") || null]);
  await logAudit(actor, { action: "certification.created", entityType: "certification", entityId: row?.id, entityLabel: name });
  revalidatePath("/admin/certifications");
  redirect(`/admin/certifications?toast=${encodeURIComponent("Certification created")}`);
}

export async function createBadge(formData: FormData): Promise<void> {
  const actor = await assertPermission("badges.manage");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect(`/admin/badges?toast=${encodeURIComponent("Name the badge.")}&tone=error`);
  const row = await queryOne<{ id: string }>(
    `insert into badges (organization_id, name, description, criteria, icon, color, expires_months)
     values ($1,$2,$3,$4,$5,$6,$7) returning id`,
    [actor.organizationId, name, String(formData.get("description") ?? "") || null,
      String(formData.get("criteria") ?? "") || null, String(formData.get("icon") ?? "award"),
      String(formData.get("color") ?? "#e0a33c"),
      formData.get("expires_months") ? Number(formData.get("expires_months")) : null]);
  await logAudit(actor, { action: "badge.created", entityType: "badge", entityId: row?.id, entityLabel: name });
  revalidatePath("/admin/badges");
  redirect(`/admin/badges?toast=${encodeURIComponent("Badge created")}`);
}

export async function createAssessment(formData: FormData): Promise<void> {
  const actor = await assertPermission("assessments.manage");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) redirect(`/admin/assessments?toast=${encodeURIComponent("Give the assessment a title.")}&tone=error`);
  const row = await queryOne<{ id: string }>(
    `insert into assessments (organization_id, title, description, passing_score, attempt_limit, time_limit_minutes,
        randomize_questions, questions_per_attempt, show_correct_answers, retake_delay_hours, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
    [actor.organizationId, title, String(formData.get("description") ?? "") || null,
      Number(formData.get("passing_score") ?? 80),
      formData.get("attempt_limit") ? Number(formData.get("attempt_limit")) : null,
      formData.get("time_limit_minutes") ? Number(formData.get("time_limit_minutes")) : null,
      formData.get("randomize_questions") === "on",
      formData.get("questions_per_attempt") ? Number(formData.get("questions_per_attempt")) : null,
      formData.get("show_correct_answers") === "on",
      Number(formData.get("retake_delay_hours") ?? 0), actor.id]);
  await logAudit(actor, { action: "assessment.created", entityType: "assessment", entityId: row?.id, entityLabel: title });
  revalidatePath("/admin/assessments");
  redirect(`/admin/assessments/${row?.id}?toast=${encodeURIComponent("Assessment created — add your questions")}`);
}

export async function addQuestion(formData: FormData): Promise<void> {
  const actor = await assertPermission("assessments.manage");
  const assessmentId = String(formData.get("assessment_id") ?? "");
  const prompt = String(formData.get("prompt") ?? "").trim();
  const questionType = String(formData.get("question_type") ?? "single");
  if (!isUuid(assessmentId) || !prompt) return;

  const next = await queryOne<{ position: number }>(
    `select coalesce(max(position), 0) + 1 as position from questions where assessment_id = $1`, [assessmentId]);
  const question = await queryOne<{ id: string }>(
    `insert into questions (assessment_id, position, question_type, prompt, scenario_text, points, feedback_correct, feedback_incorrect)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
    [assessmentId, next?.position ?? 1, questionType, prompt, String(formData.get("scenario_text") ?? "") || null,
      Number(formData.get("points") ?? 1), String(formData.get("feedback_correct") ?? "") || null,
      String(formData.get("feedback_incorrect") ?? "") || null]);
  if (!question) return;

  if (questionType === "true_false") {
    const correct = String(formData.get("correct_tf") ?? "true");
    await query(`insert into question_options (question_id, position, label, is_correct) values ($1,1,'True',$2),($1,2,'False',$3)`,
      [question.id, correct === "true", correct === "false"]);
  } else {
    const labels = formData.getAll("option_label").map(String);
    const correctIndexes = new Set(formData.getAll("option_correct").map(String));
    for (const [index, label] of labels.entries()) {
      if (!label.trim()) continue;
      await query(`insert into question_options (question_id, position, label, is_correct) values ($1,$2,$3,$4)`,
        [question.id, index + 1, label.trim(), correctIndexes.has(String(index))]);
    }
  }
  await logAudit(actor, { action: "assessment.question_added", entityType: "assessment", entityId: assessmentId, entityLabel: prompt.slice(0, 80) });
  revalidatePath(`/admin/assessments/${assessmentId}`);
  redirect(`/admin/assessments/${assessmentId}?toast=${encodeURIComponent("Question added")}`);
}

export async function deleteQuestion(formData: FormData): Promise<void> {
  await assertPermission("assessments.manage");
  const questionId = String(formData.get("question_id") ?? "");
  const assessmentId = String(formData.get("assessment_id") ?? "");
  if (!isUuid(questionId)) return;
  await query(`delete from questions where id = $1`, [questionId]);
  revalidatePath(`/admin/assessments/${assessmentId}`);
}

/** Persists a new module order (used by the drag-and-drop course builder). */
export async function reorderModules(courseId: string, orderedIds: string[]): Promise<void> {
  await assertPermission("courses.edit");
  if (!isUuid(courseId)) return;
  for (const [index, moduleId] of orderedIds.entries()) {
    if (!isUuid(moduleId)) continue;
    await query(`update course_modules set position = $2 where id = $1 and course_id = $3`, [moduleId, index + 1, courseId]);
  }
  revalidatePath(`/admin/courses/${courseId}`);
}
