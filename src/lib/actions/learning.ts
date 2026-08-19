"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query, queryOne } from "@/lib/db/client";
import { assertUser } from "@/lib/auth/guard";
import { ensureStarted, evaluateEnrollment, recordModuleProgress } from "@/lib/services/progress";
import { gradeAssessment } from "@/lib/services/assessments";
import { logAudit } from "@/lib/services/audit";
import { isUuid } from "@/lib/rbac/scope";

/** Learner actions: module completion, acknowledgments and assessment grading. */

async function loadOwnedModule(enrollmentId: string, moduleId: string, userId: string) {
  return queryOne<{
    enrollment_id: string; module_id: string; module_type: string; min_seconds: number;
    completion_rule: string; assessment_id: string | null; asset_id: string | null;
    passing_score: string | null; attempt_limit: number | null; course_id: string | null; title: string;
  }>(
    `select e.id as enrollment_id, m.id as module_id, m.module_type, m.min_seconds, m.completion_rule,
            m.assessment_id, m.asset_id, coalesce(m.passing_score, a.passing_score, c.passing_score)::text as passing_score,
            coalesce(m.attempt_limit, a.attempt_limit) as attempt_limit, e.course_id, m.title
       from enrollments e
       join course_modules m on m.id = $2 and m.course_id = e.course_id and m.course_version = e.course_version
       left join assessments a on a.id = m.assessment_id
       left join courses c on c.id = e.course_id
      where e.id = $1 and e.user_id = $3`,
    [enrollmentId, moduleId, userId]);
}

export async function startModule(enrollmentId: string, moduleId: string): Promise<void> {
  const user = await assertUser();
  const mod = await loadOwnedModule(enrollmentId, moduleId, user.id);
  if (!mod) throw new Error("Module not found for this enrollment.");
  await ensureStarted(enrollmentId, user.id);
  await recordModuleProgress({ enrollmentId, moduleId, status: "in_progress" });
  revalidatePath(`/learn/${enrollmentId}`);
}

/** Completes a viewing-style module (text, video, document, checklist, link). */
export async function completeModule(formData: FormData): Promise<void> {
  const user = await assertUser();
  const enrollmentId = String(formData.get("enrollmentId") ?? "");
  const moduleId = String(formData.get("moduleId") ?? "");
  const seconds = Math.max(0, Math.min(7200, Number(formData.get("seconds") ?? 0)));
  if (!isUuid(enrollmentId) || !isUuid(moduleId)) throw new Error("Invalid module.");

  const mod = await loadOwnedModule(enrollmentId, moduleId, user.id);
  if (!mod) throw new Error("Module not found for this enrollment.");
  if (mod.completion_rule === "score") throw new Error("This module is completed by passing its assessment.");

  await recordModuleProgress({
    enrollmentId, moduleId, status: "completed", secondsDelta: seconds,
    data: { completedBy: "learner", at: new Date().toISOString() },
  });
  const result = await evaluateEnrollment(enrollmentId);
  revalidatePath(`/learn/${enrollmentId}`);
  revalidatePath("/my-learning");
  if (result.completed) {
    redirect(`/learn/${enrollmentId}?completed=1`);
  }
}

/** Policy / document acknowledgment with a captured statement and timestamp. */
export async function acknowledgeDocument(formData: FormData): Promise<void> {
  const user = await assertUser();
  const enrollmentId = String(formData.get("enrollmentId") ?? "");
  const moduleId = String(formData.get("moduleId") ?? "");
  const entityId = String(formData.get("entityId") ?? "");
  const entityType = String(formData.get("entityType") ?? "asset");
  const statement = String(formData.get("statement") ?? "I have reviewed and understand this policy.");

  if (isUuid(entityId)) {
    await query(
      `insert into acknowledgments (user_id, entity_type, entity_id, entity_version, statement)
       values ($1, $2, $3, 1, $4)
       on conflict (user_id, entity_type, entity_id, entity_version) do update set acknowledged_at = now()`,
      [user.id, entityType, entityId, statement]);
    await logAudit(user, { action: "document.acknowledged", entityType, entityId, entityLabel: statement });
  }

  if (isUuid(enrollmentId) && isUuid(moduleId)) {
    const mod = await loadOwnedModule(enrollmentId, moduleId, user.id);
    if (mod) {
      await recordModuleProgress({ enrollmentId, moduleId, status: "completed", data: { acknowledgedAt: new Date().toISOString(), statement } });
      await evaluateEnrollment(enrollmentId);
      revalidatePath(`/learn/${enrollmentId}`);
    }
  }
  revalidatePath("/resources");
}

/**
 * Assessment submission. Answers are graded on the server by
 * `gradeAssessment` — the client never sees the answer key.
 */
export async function submitAssessment(formData: FormData): Promise<void> {
  const user = await assertUser();
  const enrollmentId = String(formData.get("enrollmentId") ?? "");
  const moduleId = String(formData.get("moduleId") ?? "");
  const assessmentId = String(formData.get("assessmentId") ?? "");
  const startedAt = String(formData.get("startedAt") ?? "");
  if (!isUuid(assessmentId)) throw new Error("Invalid assessment.");

  const questionIds = [...formData.keys()]
    .filter((key) => key.startsWith("q_") && !key.includes("_", 2))
    .map((key) => key.slice(2));
  const answers = Array.from(new Set(questionIds)).map((questionId) => ({
    questionId,
    optionIds: formData.getAll(`q_${questionId}`).map(String).filter(Boolean),
    matches: Object.fromEntries(
      [...formData.entries()]
        .filter(([key]) => key.startsWith(`q_${questionId}_`))
        .map(([key, value]) => [key.replace(`q_${questionId}_`, ""), String(value)]),
    ),
  }));

  const result = await gradeAssessment({
    assessmentId,
    userId: user.id,
    answers,
    enrollmentId: isUuid(enrollmentId) ? enrollmentId : null,
    moduleId: isUuid(moduleId) ? moduleId : null,
    startedAt: startedAt || null,
  });

  if (result.outOfAttempts) {
    redirect(`/learn/${enrollmentId}?toast=${encodeURIComponent("You have used all attempts for this assessment. Ask your manager to reset it.")}&tone=error`);
  }

  await logAudit(user, {
    action: result.passed ? "assessment.passed" : "assessment.failed",
    entityType: "assessment", entityId: assessmentId,
    newValue: { score: result.score, attemptNumber: result.attemptNumber },
  });

  revalidatePath(`/learn/${enrollmentId}`);
  redirect(`/learn/${enrollmentId}?attempt=${result.attemptId ?? ""}`);
}

/** Enroll yourself in an optional catalog course. */
export async function selfEnroll(courseId: string): Promise<void> {
  const user = await assertUser();
  if (!isUuid(courseId)) throw new Error("Invalid course.");
  const course = await queryOne<{ id: string; title: string; current_version: number; passing_score: string; certification_id: string | null }>(
    `select id, title, current_version, passing_score::text as passing_score, certification_id
       from courses where id = $1 and status = 'published'`, [courseId]);
  if (!course) throw new Error("Course not available.");

  const existing = await queryOne<{ id: string }>(
    `select id from enrollments where user_id = $1 and course_id = $2 and status <> 'completed'`, [user.id, courseId]);
  if (existing) redirect(`/learn/${existing.id}`);

  const row = await queryOne<{ id: string }>(
    `insert into enrollments (user_id, course_id, course_title, course_version, status, is_required, assigned_at,
       passing_score, certification_id, source_system)
     values ($1,$2,$3,$4,'not_started',false, now(), $5, $6, 'Wahlburgers Academy') returning id`,
    [user.id, courseId, course.title, course.current_version, Number(course.passing_score), course.certification_id]);
  await logAudit(user, { action: "training.self_enrolled", entityType: "course", entityId: courseId, entityLabel: course.title });
  revalidatePath("/my-learning");
  redirect(`/learn/${row?.id}`);
}
