import "server-only";
import { query, queryOne } from "@/lib/db/client";
import { notify } from "./notifications";

/**
 * Completion engine.
 *
 * Module progress rolls up into enrollment completion, which in turn issues
 * certifications, awards badges, updates learning-path progress and feeds every
 * dashboard. All of it happens here so SCORM, assessments, documents and manager
 * validation all complete a course the same way.
 */

export interface ModuleProgressRow {
  module_id: string;
  status: string;
  score: string | null;
  seconds_spent: number;
  completed_at: string | null;
  data: Record<string, unknown>;
}

export async function moduleProgressFor(enrollmentId: string): Promise<Record<string, ModuleProgressRow>> {
  const rows = await query<ModuleProgressRow>(
    `select module_id, status, score::text as score, seconds_spent, completed_at, data
       from module_progress where enrollment_id = $1`, [enrollmentId]);
  return Object.fromEntries(rows.map((r) => [r.module_id, r]));
}

export async function ensureStarted(enrollmentId: string, userId: string): Promise<void> {
  await query(
    `update enrollments
        set status = case when status = 'not_started' then 'in_progress' else status end,
            started_at = coalesce(started_at, now()),
            last_activity_at = now()
      where id = $1 and user_id = $2`,
    [enrollmentId, userId]);
}

export async function recordModuleProgress(input: {
  enrollmentId: string;
  moduleId: string;
  status?: "not_started" | "in_progress" | "completed" | "failed";
  score?: number | null;
  secondsDelta?: number;
  data?: Record<string, unknown>;
}): Promise<void> {
  await query(
    `insert into module_progress (enrollment_id, module_id, status, score, seconds_spent, completed_at, data, updated_at)
     values ($1, $2, coalesce($3, 'in_progress'), $4, coalesce($5, 0),
             case when $3 = 'completed' then now() else null end, coalesce($6::jsonb, '{}'::jsonb), now())
     on conflict (enrollment_id, module_id) do update set
       status = case
         when module_progress.status = 'completed' and excluded.status <> 'completed' then 'completed'
         else coalesce(excluded.status, module_progress.status) end,
       score = coalesce(excluded.score, module_progress.score),
       seconds_spent = module_progress.seconds_spent + coalesce($5, 0),
       completed_at = coalesce(module_progress.completed_at, excluded.completed_at),
       data = coalesce(module_progress.data, '{}'::jsonb) || coalesce($6::jsonb, '{}'::jsonb),
       updated_at = now()`,
    [input.enrollmentId, input.moduleId, input.status ?? null, input.score ?? null,
      input.secondsDelta ?? 0, input.data ? JSON.stringify(input.data) : null]);

  await query(
    `update enrollments set last_activity_at = now(),
       duration_seconds = duration_seconds + coalesce($2, 0),
       status = case when status = 'not_started' then 'in_progress' else status end,
       started_at = coalesce(started_at, now())
     where id = $1`,
    [input.enrollmentId, input.secondsDelta ?? 0]);
}

export interface CompletionResult {
  completed: boolean;
  score: number | null;
  certificationIssued: string | null;
  badgesAwarded: string[];
}

/**
 * Re-evaluates an enrollment after any module change. A course completes when
 * every required module is complete; the recorded score is the average of the
 * scored modules (assessments and SCORM).
 */
export async function evaluateEnrollment(enrollmentId: string): Promise<CompletionResult> {
  const enrollment = await queryOne<{
    id: string; user_id: string; course_id: string | null; course_version: number; status: string;
    certification_id: string | null; passing_score: string | null; course_title: string | null;
    learning_path_id: string | null;
  }>(
    `select e.id, e.user_id, e.course_id, e.course_version, e.status, e.certification_id,
            e.passing_score::text as passing_score, coalesce(c.title, e.course_title) as course_title, e.learning_path_id
       from enrollments e left join courses c on c.id = e.course_id where e.id = $1`, [enrollmentId]);
  if (!enrollment) return { completed: false, score: null, certificationIssued: null, badgesAwarded: [] };

  const modules = await query<{ id: string; is_required: boolean; status: string | null; score: string | null }>(
    `select m.id, m.is_required, mp.status, mp.score::text as score
       from course_modules m
       left join module_progress mp on mp.module_id = m.id and mp.enrollment_id = $1
      where m.course_id = $2 and m.course_version = $3`,
    [enrollmentId, enrollment.course_id, enrollment.course_version]);

  const required = modules.filter((m) => m.is_required);
  const allDone = required.length > 0 && required.every((m) => m.status === "completed");
  const scores = modules.map((m) => (m.score === null ? null : Number(m.score))).filter((s): s is number => s !== null);
  const score = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  if (!allDone || enrollment.status === "completed") {
    if (score !== null) await query(`update enrollments set score = $2 where id = $1`, [enrollmentId, score]);
    return { completed: enrollment.status === "completed", score, certificationIssued: null, badgesAwarded: [] };
  }

  await query(
    `update enrollments set status = 'completed', completed_at = now(), score = coalesce($2, score),
            last_activity_at = now(), attempts = greatest(attempts, 1)
      where id = $1`, [enrollmentId, score]);

  if (enrollment.course_id) {
    await query(
      `update courses set completion_count = (select count(*) from enrollments where course_id = $1 and status = 'completed')
        where id = $1`, [enrollment.course_id]);
  }

  let certificationIssued: string | null = null;
  if (enrollment.certification_id) {
    certificationIssued = await issueCertification(enrollment.user_id, enrollment.certification_id, enrollmentId);
  }

  if (enrollment.learning_path_id) await refreshLearningPathProgress(enrollment.user_id, enrollment.learning_path_id);

  const badgesAwarded = await evaluateBadges(enrollment.user_id);

  await notify({
    userId: enrollment.user_id,
    type: "training_completed",
    title: `Completed: ${enrollment.course_title ?? "Training"}`,
    body: score !== null ? `Recorded on your transcript with a score of ${score}%.` : "Recorded on your transcript.",
    link: "/my-learning?filter=completed",
  });

  return { completed: true, score, certificationIssued, badgesAwarded };
}

export async function issueCertification(userId: string, certificationId: string, enrollmentId?: string): Promise<string | null> {
  const cert = await queryOne<{ id: string; name: string; validity_months: number | null; requires_manager_approval: boolean }>(
    `select id, name, validity_months, requires_manager_approval from certifications where id = $1`, [certificationId]);
  if (!cert) return null;

  const existing = await queryOne<{ id: string }>(
    `select id from user_certifications where user_id = $1 and certification_id = $2 and expires_at > now()`,
    [userId, certificationId]);
  const months = cert.validity_months ?? 12;
  const number = `WB-CERT-${Math.floor(100000 + Math.random() * 899999)}`;

  if (existing) {
    await query(
      `update user_certifications set issued_at = now(), expires_at = now() + ($2 || ' months')::interval,
              status = 'active', source_system = 'Wahlburgers Academy' where id = $1`,
      [existing.id, String(months)]);
  } else {
    await query(
      `insert into user_certifications (user_id, certification_id, certification_name, issued_at, expires_at, status, certificate_number, source_system)
       values ($1, $2, $3, now(), now() + ($4 || ' months')::interval, $5, $6, 'Wahlburgers Academy')`,
      [userId, certificationId, cert.name, String(months),
        cert.requires_manager_approval ? "pending_approval" : "active", number]);
  }
  if (enrollmentId) {
    await query(`update enrollments set expires_at = now() + ($2 || ' months')::interval where id = $1`, [enrollmentId, String(months)]);
  }
  await notify({
    userId, type: "certification_issued", title: `Certification earned: ${cert.name}`,
    body: `Valid for ${months} months. You can see it on your achievements and transcript.`, link: "/achievements",
  });
  return cert.name;
}

export async function refreshLearningPathProgress(userId: string, learningPathId: string): Promise<number> {
  const row = await queryOne<{ pct: string }>(
    `select coalesce(round(100.0 * count(*) filter (where e.status = 'completed') / nullif(count(*), 0)), 0)::text as pct
       from enrollments e where e.user_id = $1 and e.learning_path_id = $2`, [userId, learningPathId]);
  const pct = Number(row?.pct ?? 0);
  await query(
    `insert into learning_path_enrollments (user_id, learning_path_id, progress, status, completed_at)
     values ($1, $2, $3, case when $3 >= 100 then 'completed' else 'in_progress' end, case when $3 >= 100 then now() else null end)
     on conflict (user_id, learning_path_id) do update set progress = excluded.progress,
       status = excluded.status, completed_at = coalesce(learning_path_enrollments.completed_at, excluded.completed_at)`,
    [userId, learningPathId, pct]);
  return pct;
}

/** Badge rules evaluated after every completion. Idempotent by design. */
export async function evaluateBadges(userId: string): Promise<string[]> {
  const stats = await queryOne<{ completed: string; required_total: string; required_done: string; overdue: string; streak: string; certs: string }>(
    `select
       (select count(*)::text from enrollments where user_id = $1 and status = 'completed') as completed,
       (select count(*)::text from enrollments where user_id = $1 and is_required and assignment_id is not null) as required_total,
       (select count(*)::text from enrollments where user_id = $1 and is_required and assignment_id is not null and status = 'completed') as required_done,
       (select count(*)::text from enrollments where user_id = $1 and status <> 'completed' and due_at < now()) as overdue,
       (select count(distinct date_trunc('week', completed_at))::text from enrollments
         where user_id = $1 and status = 'completed' and completed_at >= now() - interval '4 weeks') as streak,
       (select count(*)::text from user_certifications where user_id = $1 and expires_at > now()) as certs`,
    [userId]);
  if (!stats) return [];

  const awards: string[] = [];
  const give = async (badgeName: string, reason: string) => {
    const badge = await queryOne<{ id: string }>(`select id from badges where name = $1`, [badgeName]);
    if (!badge) return;
    const res = await query<{ id: string }>(
      `insert into user_badges (user_id, badge_id, reason) values ($1, $2, $3)
       on conflict (user_id, badge_id) do nothing returning id`, [userId, badge.id, reason]);
    if (res.length) {
      awards.push(badgeName);
      await notify({ userId, type: "badge_earned", title: `Badge earned: ${badgeName}`, body: reason, link: "/achievements" });
    }
  };

  if (Number(stats.completed) >= 10) await give("Training All-Star", "Completed 10 or more courses.");
  if (Number(stats.required_total) > 0 && stats.required_total === stats.required_done && Number(stats.overdue) === 0) {
    await give("100% Training Completion", "All required training complete with nothing overdue.");
  }
  if (Number(stats.streak) >= 4) await give("Learning Streak", "Training completed four weeks in a row.");
  if (Number(stats.certs) >= 3) await give("Wahlburgers Academy Graduate", "Holds three or more active certifications.");

  const cookCert = await queryOne<{ id: string }>(
    `select uc.id from user_certifications uc join certifications c on c.id = uc.certification_id
      where uc.user_id = $1 and c.name = 'Cook Certified' and uc.expires_at > now()`, [userId]);
  if (cookCert) await give("Cook Certified", "Earned the Cook Certification.");

  const foodSafety = await queryOne<{ id: string }>(
    `select uc.id from user_certifications uc join certifications c on c.id = uc.certification_id
      where uc.user_id = $1 and c.name = 'Food Safety Certified' and uc.expires_at > now()`, [userId]);
  if (foodSafety) await give("Food Safety Champion", "Food safety certification current.");

  return awards;
}
