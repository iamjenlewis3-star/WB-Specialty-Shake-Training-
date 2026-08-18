import "server-only";
import { query, queryOne } from "@/lib/db/client";

/** Learner-facing reads: dashboard, My Learning, learning paths, achievements. */

export interface LearnerSummary {
  required_total: number;
  required_complete: number;
  completion_pct: number;
  overdue: number;
  due_soon: number;
  in_progress: number;
  not_started: number;
  completed_total: number;
  training_seconds: number;
  certifications: number;
  expiring_certifications: number;
  badges: number;
  legacy_records: number;
}

export async function learnerSummary(userId: string): Promise<LearnerSummary> {
  const row = await queryOne<Record<string, string>>(`
    select
      count(*) filter (where is_required and assignment_id is not null)::text as required_total,
      count(*) filter (where is_required and assignment_id is not null and status = 'completed')::text as required_complete,
      count(*) filter (where status <> 'completed' and due_at < now())::text as overdue,
      count(*) filter (where status <> 'completed' and due_at between now() and now() + interval '7 days')::text as due_soon,
      count(*) filter (where status = 'in_progress')::text as in_progress,
      count(*) filter (where status = 'not_started' and assignment_id is not null)::text as not_started,
      count(*) filter (where status = 'completed')::text as completed_total,
      coalesce(sum(duration_seconds), 0)::text as training_seconds,
      count(*) filter (where source_system = 'Legacy LMS')::text as legacy_records
    from enrollments where user_id = $1`, [userId]);

  const certs = await queryOne<{ active: string; expiring: string }>(`
    select count(*) filter (where expires_at > now() or expires_at is null)::text as active,
           count(*) filter (where expires_at between now() and now() + interval '60 days')::text as expiring
      from user_certifications where user_id = $1`, [userId]);

  const badges = await queryOne<{ count: string }>(
    `select count(*)::text as count from user_badges where user_id = $1`, [userId]);

  const requiredTotal = Number(row?.required_total ?? 0);
  const requiredComplete = Number(row?.required_complete ?? 0);
  return {
    required_total: requiredTotal,
    required_complete: requiredComplete,
    completion_pct: requiredTotal ? Math.round((requiredComplete / requiredTotal) * 100) : 100,
    overdue: Number(row?.overdue ?? 0),
    due_soon: Number(row?.due_soon ?? 0),
    in_progress: Number(row?.in_progress ?? 0),
    not_started: Number(row?.not_started ?? 0),
    completed_total: Number(row?.completed_total ?? 0),
    training_seconds: Number(row?.training_seconds ?? 0),
    certifications: Number(certs?.active ?? 0),
    expiring_certifications: Number(certs?.expiring ?? 0),
    badges: Number(badges?.count ?? 0),
    legacy_records: Number(row?.legacy_records ?? 0),
  };
}

export interface LearnerEnrollment {
  id: string;
  course_id: string | null;
  course_title: string;
  course_code: string | null;
  category_name: string | null;
  thumbnail_color: string | null;
  estimated_minutes: number | null;
  status: string;
  is_required: boolean;
  priority: string;
  due_at: string | null;
  completed_at: string | null;
  score: string | null;
  progress_pct: string;
  modules_total: string;
  modules_done: string;
  source_system: string;
  certification_name: string | null;
  learning_path_name: string | null;
  course_type: string | null;
}

const ENROLLMENT_SELECT = `
  select e.id, e.course_id, coalesce(c.title, e.course_title) as course_title, c.code as course_code,
         cat.name as category_name, c.thumbnail_color, c.estimated_minutes, e.status, e.is_required,
         e.priority, e.due_at, e.completed_at, e.score, e.source_system, c.course_type,
         cert.name as certification_name, lp.name as learning_path_name,
         coalesce(mp.total, 0)::text as modules_total,
         coalesce(mp.done, 0)::text as modules_done,
         (case when e.status = 'completed' then 100
               when coalesce(mp.total, 0) = 0 then (case when e.status = 'in_progress' then 25 else 0 end)
               else round(100.0 * coalesce(mp.done, 0) / mp.total) end)::text as progress_pct
    from enrollments e
    left join courses c on c.id = e.course_id
    left join course_categories cat on cat.id = c.category_id
    left join certifications cert on cert.id = e.certification_id
    left join learning_paths lp on lp.id = e.learning_path_id
    left join lateral (
      select count(*) as total, count(*) filter (where mpr.status = 'completed') as done
        from course_modules cm
        left join module_progress mpr on mpr.module_id = cm.id and mpr.enrollment_id = e.id
       where cm.course_id = e.course_id and cm.course_version = e.course_version
    ) mp on true`;

export type LearningFilter = "all" | "required" | "overdue" | "due_soon" | "in_progress" | "completed" | "not_started" | "optional";

export async function listMyLearning(
  userId: string,
  filter: LearningFilter = "all",
  q?: string,
): Promise<LearnerEnrollment[]> {
  const where: string[] = ["e.user_id = $1"];
  const params: unknown[] = [userId];
  switch (filter) {
    case "required": where.push("e.is_required and e.assignment_id is not null"); break;
    case "optional": where.push("not e.is_required"); break;
    case "overdue": where.push("e.status <> 'completed' and e.due_at < now()"); break;
    case "due_soon": where.push("e.status <> 'completed' and e.due_at between now() and now() + interval '14 days'"); break;
    case "in_progress": where.push("e.status = 'in_progress'"); break;
    case "not_started": where.push("e.status = 'not_started'"); break;
    case "completed": where.push("e.status = 'completed'"); break;
    default: where.push("(e.assignment_id is not null or e.status <> 'completed' or e.completed_at > now() - interval '180 days')");
  }
  if (q) { params.push(`%${q}%`); where.push(`coalesce(c.title, e.course_title) ilike $${params.length}`); }

  return query<LearnerEnrollment>(
    `${ENROLLMENT_SELECT} where ${where.join(" and ")}
      order by (e.status = 'completed'), (e.due_at is null), e.due_at asc, e.assigned_at desc
      limit 300`, params);
}

export async function continueLearning(userId: string, limit = 4): Promise<LearnerEnrollment[]> {
  return query<LearnerEnrollment>(
    `${ENROLLMENT_SELECT} where e.user_id = $1 and e.status = 'in_progress'
      order by e.last_activity_at desc nulls last limit $2`, [userId, limit]);
}

export async function requiredTraining(userId: string, limit = 6): Promise<LearnerEnrollment[]> {
  return query<LearnerEnrollment>(
    `${ENROLLMENT_SELECT} where e.user_id = $1 and e.status <> 'completed' and e.is_required
      order by (e.due_at is null), e.due_at asc limit $2`, [userId, limit]);
}

export async function getEnrollment(userId: string, enrollmentId: string): Promise<LearnerEnrollment | null> {
  return queryOne<LearnerEnrollment>(`${ENROLLMENT_SELECT} where e.id = $1 and e.user_id = $2`, [enrollmentId, userId]);
}

export async function myLearningPaths(userId: string) {
  return query<{
    id: string; path_id: string; name: string; description: string | null; color: string; progress: string;
    status: string; due_at: string | null; total_courses: string; completed_courses: string;
  }>(`
    select lpe.id, lp.id as path_id, lp.name, lp.description, lp.color, lpe.progress::text as progress,
           lpe.status, lpe.due_at,
           (select count(*) from learning_path_items i where i.learning_path_id = lp.id and i.item_type = 'course')::text as total_courses,
           (select count(*) from enrollments e where e.user_id = lpe.user_id and e.learning_path_id = lp.id and e.status = 'completed')::text as completed_courses
      from learning_path_enrollments lpe
      join learning_paths lp on lp.id = lpe.learning_path_id
     where lpe.user_id = $1
     order by lpe.status, lpe.progress desc`, [userId]);
}

export async function myUpcomingEvents(userId: string, limit = 6) {
  return query<{
    id: string; title: string; starts_at: string; ends_at: string; event_type: string;
    location_name: string | null; virtual_link: string | null; attendee_status: string | null;
  }>(`
    select te.id, te.title, te.starts_at, te.ends_at, te.event_type, l.name as location_name,
           te.virtual_link, ta.status as attendee_status
      from training_events te
      left join locations l on l.id = te.location_id
      left join training_attendees ta on ta.training_event_id = te.id and ta.user_id = $1
     where te.starts_at >= now() and te.status = 'scheduled'
       and (ta.user_id is not null or te.learner_user_id = $1)
     order by te.starts_at asc limit $2`, [userId, limit]);
}

export async function recommendedCourses(userId: string, limit = 4) {
  return query<{
    id: string; title: string; description: string | null; estimated_minutes: number; thumbnail_color: string;
    category_name: string | null; rating_avg: string; reason: string;
  }>(`
    select c.id, c.title, c.description, c.estimated_minutes, c.thumbnail_color, cat.name as category_name,
           c.rating_avg::text as rating_avg,
           case when c.category_id = (
                  select c2.category_id from enrollments e2 join courses c2 on c2.id = e2.course_id
                   where e2.user_id = $1 and e2.status = 'completed' and c2.category_id is not null
                   group by c2.category_id order by count(*) desc limit 1)
                then 'Popular in a category you train in'
                else 'Highly rated across the system' end as reason
      from courses c
      left join course_categories cat on cat.id = c.category_id
     where c.status = 'published'
       and not exists (select 1 from enrollments e where e.user_id = $1 and e.course_id = c.id)
     order by c.rating_avg desc nulls last, c.completion_count desc
     limit $2`, [userId, limit]);
}

export async function myAchievements(userId: string) {
  const [badges, certifications, streak] = await Promise.all([
    query<{ id: string; name: string; description: string | null; icon: string; color: string; awarded_at: string }>(
      `select ub.id, b.name, b.description, b.icon, b.color, ub.awarded_at
         from user_badges ub join badges b on b.id = ub.badge_id
        where ub.user_id = $1 order by ub.awarded_at desc`, [userId]),
    query<{ id: string; certification_name: string | null; issued_at: string; expires_at: string | null; status: string }>(
      `select uc.id, coalesce(uc.certification_name, c.name) as certification_name, uc.issued_at, uc.expires_at,
              case when uc.expires_at < now() then 'expired'
                   when uc.expires_at < now() + interval '60 days' then 'expiring' else 'active' end as status
         from user_certifications uc left join certifications c on c.id = uc.certification_id
        where uc.user_id = $1 order by uc.expires_at asc nulls last`, [userId]),
    queryOne<{ weeks: string }>(
      `select count(distinct date_trunc('week', completed_at))::text as weeks
         from enrollments where user_id = $1 and status = 'completed'
           and completed_at >= now() - interval '8 weeks'`, [userId]),
  ]);
  return { badges, certifications, streakWeeks: Number(streak?.weeks ?? 0) };
}

export async function availableBadges() {
  return query<{ id: string; name: string; description: string | null; criteria: string | null; icon: string; color: string }>(
    `select id, name, description, criteria, icon, color from badges order by name`);
}
