"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query, queryOne } from "@/lib/db/client";
import { assertUser } from "@/lib/auth/guard";
import { ensureStarted, evaluateEnrollment, recordModuleProgress } from "@/lib/services/progress";
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

interface GradedAnswer {
  questionId: string;
  correct: boolean;
  points: number;
  earned: number;
  selected: string[];
}

/**
 * Assessment grading. Answers are graded on the server against the stored
 * answer key — the client never sees which options are correct until the
 * attempt is submitted and the assessment allows it.
 */
export async function submitAssessment(formData: FormData): Promise<void> {
  const user = await assertUser();
  const enrollmentId = String(formData.get("enrollmentId") ?? "");
  const moduleId = String(formData.get("moduleId") ?? "");
  const assessmentId = String(formData.get("assessmentId") ?? "");
  const startedAt = String(formData.get("startedAt") ?? "");
  if (!isUuid(assessmentId)) throw new Error("Invalid assessment.");

  const assessment = await queryOne<{ id: string; title: string; passing_score: string; attempt_limit: number | null; show_correct_answers: boolean }>(
    `select id, title, passing_score::text as passing_score, attempt_limit, show_correct_answers from assessments where id = $1`,
    [assessmentId]);
  if (!assessment) throw new Error("Assessment not found.");

  const priorAttempts = await queryOne<{ count: string }>(
    `select count(*)::text as count from assessment_attempts where assessment_id = $1 and user_id = $2`,
    [assessmentId, user.id]);
  const attemptNumber = Number(priorAttempts?.count ?? 0) + 1;
  if (assessment.attempt_limit && attemptNumber > assessment.attempt_limit) {
    redirect(`/learn/${enrollmentId}?toast=${encodeURIComponent("You have used all attempts for this assessment. Ask your manager to reset it.")}&tone=error`);
  }

  const questions = await query<{ id: string; question_type: string; points: string; prompt: string }>(
    `select id, question_type, points::text as points, prompt from questions where assessment_id = $1 order by position`,
    [assessmentId]);
  const options = await query<{ id: string; question_id: string; is_correct: boolean; position: number; match_key: string | null }>(
    `select o.id, o.question_id, o.is_correct, o.position, o.match_key
       from question_options o join questions q on q.id = o.question_id where q.assessment_id = $1`,
    [assessmentId]);

  const graded: GradedAnswer[] = [];
  for (const question of questions) {
    const opts = options.filter((o) => o.question_id === question.id);
    const submitted = formData.getAll(`q_${question.id}`).map(String).filter(Boolean);
    const points = Number(question.points) || 1;
    let correct = false;

    switch (question.question_type) {
      case "multiple": {
        const correctIds = opts.filter((o) => o.is_correct).map((o) => o.id).sort();
        correct = submitted.length === correctIds.length && [...submitted].sort().every((id, i) => id === correctIds[i]);
        break;
      }
      case "ordering": {
        const expected = [...opts].sort((a, b) => a.position - b.position).map((o) => o.id);
        correct = submitted.length === expected.length && submitted.every((id, i) => id === expected[i]);
        break;
      }
      case "matching": {
        correct = opts.every((o) => {
          const answer = formData.get(`q_${question.id}_${o.id}`);
          return answer !== null && String(answer) === (o.match_key ?? "");
        });
        break;
      }
      default: {
        const answer = submitted[0];
        correct = Boolean(answer) && opts.some((o) => o.id === answer && o.is_correct);
      }
    }
    graded.push({ questionId: question.id, correct, points, earned: correct ? points : 0, selected: submitted });
  }

  const totalPoints = graded.reduce((sum, g) => sum + g.points, 0) || 1;
  const earned = graded.reduce((sum, g) => sum + g.earned, 0);
  const score = Math.round((earned / totalPoints) * 100);
  const passing = Number(assessment.passing_score ?? 80);
  const passed = score >= passing;
  const startTime = startedAt ? new Date(startedAt) : null;
  const duration = startTime ? Math.max(0, Math.round((Date.now() - startTime.getTime()) / 1000)) : 0;

  const attempt = await queryOne<{ id: string }>(
    `insert into assessment_attempts (assessment_id, assessment_title, user_id, enrollment_id, module_id,
       attempt_number, score, passed, started_at, completed_at, duration_seconds, answers, source_system)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10,$11::jsonb,'Wahlburgers Academy') returning id`,
    [assessmentId, assessment.title, user.id, isUuid(enrollmentId) ? enrollmentId : null,
      isUuid(moduleId) ? moduleId : null, attemptNumber, score, passed,
      startTime ? startTime.toISOString() : new Date().toISOString(), duration,
      JSON.stringify({ graded, score, passing })]);

  if (isUuid(enrollmentId) && isUuid(moduleId)) {
    await recordModuleProgress({
      enrollmentId, moduleId, status: passed ? "completed" : "failed", score, secondsDelta: duration,
      data: { lastAttemptId: attempt?.id, attemptNumber, passed },
    });
    await query(`update enrollments set attempts = attempts + 1 where id = $1`, [enrollmentId]);
    await evaluateEnrollment(enrollmentId);
  }
  await logAudit(user, {
    action: passed ? "assessment.passed" : "assessment.failed",
    entityType: "assessment", entityId: assessmentId, entityLabel: assessment.title, newValue: { score, attemptNumber },
  });

  revalidatePath(`/learn/${enrollmentId}`);
  redirect(`/learn/${enrollmentId}?attempt=${attempt?.id ?? ""}`);
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
