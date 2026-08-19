import "server-only";
import { query, queryOne } from "@/lib/db/client";
import { evaluateEnrollment, recordModuleProgress } from "./progress";

/**
 * Assessment grading.
 *
 * Kept in the service layer (not the action) so grading is testable in isolation
 * and so any surface — web, future mobile, API — grades identically.
 */

export interface SubmittedAnswer {
  questionId: string;
  optionIds: string[];
  matches?: Record<string, string>;
}

export interface GradeResult {
  attemptId: string | null;
  score: number;
  passed: boolean;
  attemptNumber: number;
  totalPoints: number;
  earnedPoints: number;
  outOfAttempts: boolean;
  graded: Array<{ questionId: string; correct: boolean; points: number; earned: number; selected: string[] }>;
}

export async function gradeAssessment(input: {
  assessmentId: string;
  userId: string;
  answers: SubmittedAnswer[];
  enrollmentId?: string | null;
  moduleId?: string | null;
  startedAt?: string | null;
  sourceSystem?: string;
}): Promise<GradeResult> {
  const assessment = await queryOne<{ id: string; title: string; passing_score: string; attempt_limit: number | null }>(
    `select id, title, passing_score::text as passing_score, attempt_limit from assessments where id = $1`,
    [input.assessmentId]);
  if (!assessment) throw new Error("Assessment not found.");

  const prior = await queryOne<{ count: string }>(
    `select count(*)::text as count from assessment_attempts where assessment_id = $1 and user_id = $2`,
    [input.assessmentId, input.userId]);
  const attemptNumber = Number(prior?.count ?? 0) + 1;
  if (assessment.attempt_limit && attemptNumber > assessment.attempt_limit) {
    return {
      attemptId: null, score: 0, passed: false, attemptNumber, totalPoints: 0, earnedPoints: 0,
      outOfAttempts: true, graded: [],
    };
  }

  const questions = await query<{ id: string; question_type: string; points: string }>(
    `select id, question_type, points::text as points from questions where assessment_id = $1 order by position`,
    [input.assessmentId]);
  const options = await query<{ id: string; question_id: string; is_correct: boolean; position: number; match_key: string | null }>(
    `select o.id, o.question_id, o.is_correct, o.position, o.match_key
       from question_options o join questions q on q.id = o.question_id where q.assessment_id = $1`,
    [input.assessmentId]);

  const graded = questions.map((question) => {
    const opts = options.filter((o) => o.question_id === question.id);
    const submitted = input.answers.find((a) => a.questionId === question.id);
    const selected = submitted?.optionIds ?? [];
    const points = Number(question.points) || 1;
    let correct = false;

    switch (question.question_type) {
      case "multiple": {
        const correctIds = opts.filter((o) => o.is_correct).map((o) => o.id).sort();
        correct = selected.length === correctIds.length && [...selected].sort().every((id, i) => id === correctIds[i]);
        break;
      }
      case "ordering": {
        const expected = [...opts].sort((a, b) => a.position - b.position).map((o) => o.id);
        correct = selected.length === expected.length && selected.every((id, i) => id === expected[i]);
        break;
      }
      case "matching": {
        correct = opts.every((o) => submitted?.matches?.[o.id] === (o.match_key ?? ""));
        break;
      }
      default:
        correct = selected.length === 1 && opts.some((o) => o.id === selected[0] && o.is_correct);
    }
    return { questionId: question.id, correct, points, earned: correct ? points : 0, selected };
  });

  const totalPoints = graded.reduce((sum, g) => sum + g.points, 0) || 1;
  const earnedPoints = graded.reduce((sum, g) => sum + g.earned, 0);
  const score = Math.round((earnedPoints / totalPoints) * 100);
  const passed = score >= Number(assessment.passing_score ?? 80);
  const startedAt = input.startedAt ? new Date(input.startedAt) : new Date();
  const duration = Math.max(0, Math.round((Date.now() - startedAt.getTime()) / 1000));

  const attempt = await queryOne<{ id: string }>(
    `insert into assessment_attempts (assessment_id, assessment_title, user_id, enrollment_id, module_id,
        attempt_number, score, passed, started_at, completed_at, duration_seconds, answers, source_system)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10,$11::jsonb,$12) returning id`,
    [input.assessmentId, assessment.title, input.userId, input.enrollmentId ?? null, input.moduleId ?? null,
      attemptNumber, score, passed, startedAt.toISOString(), duration,
      JSON.stringify({ graded, score, passing: Number(assessment.passing_score) }),
      input.sourceSystem ?? "Wahlburgers Academy"]);

  if (input.enrollmentId && input.moduleId) {
    await recordModuleProgress({
      enrollmentId: input.enrollmentId, moduleId: input.moduleId,
      status: passed ? "completed" : "failed", score, secondsDelta: duration,
      data: { lastAttemptId: attempt?.id, attemptNumber, passed },
    });
    await query(`update enrollments set attempts = attempts + 1 where id = $1`, [input.enrollmentId]);
    await evaluateEnrollment(input.enrollmentId);
  }

  return {
    attemptId: attempt?.id ?? null, score, passed, attemptNumber, totalPoints, earnedPoints,
    outOfAttempts: false, graded,
  };
}
