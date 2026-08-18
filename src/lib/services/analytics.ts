import "server-only";
import { query, queryOne } from "@/lib/db/client";
import type { AccessScope } from "@/lib/rbac/scope";
import { peopleScopeSql, locationScopeSql, isUuid } from "@/lib/rbac/scope";
import { getSetting } from "./settings";

/**
 * Reporting and analytics.
 *
 * Every statement starts from a `scoped_people` CTE built from the caller's
 * AccessScope, so a GM's numbers are their restaurant's numbers and an FBP's are
 * their portfolio's — computed in the database, not filtered in the UI.
 */

export interface AnalyticsFilters {
  locationId?: string;
  franchiseGroupId?: string;
  regionId?: string;
  roleId?: string;
  departmentId?: string;
  courseId?: string;
  days?: number;
}

export function scopedPeopleCte(scope: AccessScope, filters: AnalyticsFilters = {}): string {
  const clauses = [peopleScopeSql(scope, "p.user_id", "p.primary_location_id")];
  if (isUuid(filters.locationId)) clauses.push(`p.primary_location_id = '${filters.locationId}'::uuid`);
  if (isUuid(filters.franchiseGroupId)) clauses.push(`p.franchise_group_id = '${filters.franchiseGroupId}'::uuid`);
  if (isUuid(filters.regionId)) clauses.push(`p.region_id = '${filters.regionId}'::uuid`);
  if (isUuid(filters.roleId)) clauses.push(`p.role_id = '${filters.roleId}'::uuid`);
  if (isUuid(filters.departmentId)) clauses.push(`p.department_id = '${filters.departmentId}'::uuid`);
  return `scoped_people as (select p.* from v_people p where ${clauses.join(" and ")})`;
}

function scopedLocationsCte(scope: AccessScope, filters: AnalyticsFilters = {}): string {
  const clauses = [locationScopeSql(scope, "l.id"), "l.status = 'active'"];
  if (isUuid(filters.locationId)) clauses.push(`l.id = '${filters.locationId}'::uuid`);
  if (isUuid(filters.franchiseGroupId)) clauses.push(`l.franchise_group_id = '${filters.franchiseGroupId}'::uuid`);
  if (isUuid(filters.regionId)) clauses.push(`l.region_id = '${filters.regionId}'::uuid`);
  return `scoped_locations as (select l.* from locations l where ${clauses.join(" and ")})`;
}

export interface SystemMetrics {
  completion_pct: number;
  required_total: number;
  required_complete: number;
  active_learners: number;
  total_people: number;
  completions_month: number;
  completions_week: number;
  completions_today: number;
  training_seconds: number;
  overdue_assignments: number;
  overdue_learners: number;
  inactive_learners: number;
  certifications_active: number;
  certifications_expiring: number;
  certifications_expired: number;
  certification_compliance: number;
  active_locations: number;
  locations_below_standard: number;
  avg_rating: number;
  new_hires_in_training: number;
  engagement_pct: number;
}

export async function systemMetrics(scope: AccessScope, filters: AnalyticsFilters = {}): Promise<SystemMetrics> {
  const thresholds = await getSetting<{ green: number; yellow: number }>("risk_thresholds", { green: 90, yellow: 75 });
  const row = await queryOne<Record<string, string>>(`
    with ${scopedPeopleCte(scope, filters)}, ${scopedLocationsCte(scope, filters)},
    enr as (
      select e.* from enrollments e join scoped_people p on p.user_id = e.user_id
      ${isUuid(filters.courseId) ? `where e.course_id = '${filters.courseId}'::uuid` : ""}
    ),
    loc_stats as (
      select p.primary_location_id as location_id,
             count(*) filter (where e.is_required and e.assignment_id is not null) as req,
             count(*) filter (where e.is_required and e.assignment_id is not null and e.status = 'completed') as done
        from scoped_people p left join enrollments e on e.user_id = p.user_id
       where p.status = 'active'
       group by p.primary_location_id
    )
    select
      (select count(*) filter (where is_required and assignment_id is not null) from enr)::text as required_total,
      (select count(*) filter (where is_required and assignment_id is not null and status = 'completed') from enr)::text as required_complete,
      (select count(*) from scoped_people where status = 'active')::text as active_learners,
      (select count(*) from scoped_people)::text as total_people,
      (select count(*) from enr where status = 'completed' and completed_at >= date_trunc('month', now()))::text as completions_month,
      (select count(*) from enr where status = 'completed' and completed_at >= now() - interval '7 days')::text as completions_week,
      (select count(*) from enr where status = 'completed' and completed_at >= current_date)::text as completions_today,
      (select coalesce(sum(duration_seconds), 0) from enr)::text as training_seconds,
      (select count(*) from enr where status <> 'completed' and due_at is not null and due_at < now())::text as overdue_assignments,
      (select count(distinct user_id) from enr where status <> 'completed' and due_at is not null and due_at < now())::text as overdue_learners,
      (select count(*) from scoped_people where status = 'active'
         and (last_login_at is null or last_login_at < now() - interval '30 days'))::text as inactive_learners,
      (select count(*) from user_certifications uc join scoped_people p on p.user_id = uc.user_id
         where uc.expires_at > now())::text as certifications_active,
      (select count(*) from user_certifications uc join scoped_people p on p.user_id = uc.user_id
         where uc.expires_at between now() and now() + interval '60 days')::text as certifications_expiring,
      (select count(*) from user_certifications uc join scoped_people p on p.user_id = uc.user_id
         where uc.expires_at < now())::text as certifications_expired,
      (select count(*) from scoped_locations)::text as active_locations,
      (select count(*) from loc_stats where req > 0 and (100.0 * done / req) < ${thresholds.yellow})::text as locations_below_standard,
      (select coalesce(round(avg(cr.rating)::numeric, 2), 0) from course_reviews cr
         join scoped_people p on p.user_id = cr.user_id)::text as avg_rating,
      (select count(*) from scoped_people where hire_date >= current_date - interval '60 days' and status = 'active')::text as new_hires_in_training,
      (select count(distinct user_id) from enr where last_activity_at >= now() - interval '30 days')::text as engaged_learners
  `);

  const requiredTotal = Number(row?.required_total ?? 0);
  const requiredComplete = Number(row?.required_complete ?? 0);
  const activeLearners = Number(row?.active_learners ?? 0);
  const certActive = Number(row?.certifications_active ?? 0);
  const certExpired = Number(row?.certifications_expired ?? 0);

  return {
    completion_pct: requiredTotal ? Math.round((requiredComplete / requiredTotal) * 100) : 100,
    required_total: requiredTotal,
    required_complete: requiredComplete,
    active_learners: activeLearners,
    total_people: Number(row?.total_people ?? 0),
    completions_month: Number(row?.completions_month ?? 0),
    completions_week: Number(row?.completions_week ?? 0),
    completions_today: Number(row?.completions_today ?? 0),
    training_seconds: Number(row?.training_seconds ?? 0),
    overdue_assignments: Number(row?.overdue_assignments ?? 0),
    overdue_learners: Number(row?.overdue_learners ?? 0),
    inactive_learners: Number(row?.inactive_learners ?? 0),
    certifications_active: certActive,
    certifications_expiring: Number(row?.certifications_expiring ?? 0),
    certifications_expired: certExpired,
    certification_compliance: certActive + certExpired ? Math.round((certActive / (certActive + certExpired)) * 100) : 100,
    active_locations: Number(row?.active_locations ?? 0),
    locations_below_standard: Number(row?.locations_below_standard ?? 0),
    avg_rating: Number(row?.avg_rating ?? 0),
    new_hires_in_training: Number(row?.new_hires_in_training ?? 0),
    engagement_pct: activeLearners ? Math.round((Number(row?.engaged_learners ?? 0) / activeLearners) * 100) : 0,
  };
}

export interface LocationPerformance {
  id: string;
  name: string;
  store_number: string;
  city: string | null;
  state: string | null;
  franchise_group_name: string | null;
  region_name: string | null;
  gm_name: string | null;
  fbp_name: string | null;
  employees: number;
  completion_pct: number;
  overdue: number;
  expiring_certs: number;
  inactive_users: number;
  new_hires: number;
  last_activity: string | null;
  health_score: number;
}

export async function locationPerformance(
  scope: AccessScope,
  filters: AnalyticsFilters = {},
): Promise<LocationPerformance[]> {
  const weights = await getSetting<{ requiredCompletion: number; overdue: number; certification: number; activity: number; newHire: number }>(
    "health_score_weights",
    { requiredCompletion: 40, overdue: 25, certification: 20, activity: 10, newHire: 5 },
  );
  const rows = await query<Record<string, string | null>>(`
    with ${scopedLocationsCte(scope, filters)}, ${scopedPeopleCte(scope, filters)}
    select l.id, l.name, l.store_number, l.city, l.state,
           fg.name as franchise_group_name, r.name as region_name,
           gm.full_name as gm_name, fbp.full_name as fbp_name,
           count(distinct p.user_id) filter (where p.status = 'active')::text as employees,
           coalesce(count(e.id) filter (where e.is_required and e.assignment_id is not null), 0)::text as required_total,
           coalesce(count(e.id) filter (where e.is_required and e.assignment_id is not null and e.status = 'completed'), 0)::text as required_complete,
           coalesce(count(e.id) filter (where e.status <> 'completed' and e.due_at < now()), 0)::text as overdue,
           (select count(*) from user_certifications uc join v_people vp on vp.user_id = uc.user_id
             where vp.primary_location_id = l.id and uc.expires_at between now() and now() + interval '60 days')::text as expiring_certs,
           count(distinct p.user_id) filter (where p.status = 'active'
             and (p.last_login_at is null or p.last_login_at < now() - interval '30 days'))::text as inactive_users,
           count(distinct p.user_id) filter (where p.hire_date >= current_date - interval '60 days')::text as new_hires,
           max(e.last_activity_at)::text as last_activity
      from scoped_locations l
      left join franchise_groups fg on fg.id = l.franchise_group_id
      left join regions r on r.id = l.region_id
      left join v_people gm on gm.user_id = l.gm_user_id
      left join v_people fbp on fbp.user_id = l.fbp_user_id
      left join scoped_people p on p.primary_location_id = l.id
      left join enrollments e on e.user_id = p.user_id
     group by l.id, l.name, l.store_number, l.city, l.state, fg.name, r.name, gm.full_name, fbp.full_name
     order by l.name`);

  return rows.map((row) => {
    const requiredTotal = Number(row.required_total ?? 0);
    const requiredComplete = Number(row.required_complete ?? 0);
    const employees = Number(row.employees ?? 0);
    const overdue = Number(row.overdue ?? 0);
    const inactive = Number(row.inactive_users ?? 0);
    const expiring = Number(row.expiring_certs ?? 0);
    const completion = requiredTotal ? Math.round((requiredComplete / requiredTotal) * 100) : 100;

    // Weighted, configurable training health score (Admin → Settings).
    const overduePenalty = employees ? Math.min(1, overdue / Math.max(1, employees * 2)) : 0;
    const activityPenalty = employees ? inactive / employees : 0;
    const certPenalty = employees ? Math.min(1, expiring / Math.max(1, employees)) : 0;
    const health =
      (completion / 100) * weights.requiredCompletion +
      (1 - overduePenalty) * weights.overdue +
      (1 - certPenalty) * weights.certification +
      (1 - activityPenalty) * weights.activity +
      weights.newHire;

    return {
      id: String(row.id),
      name: String(row.name),
      store_number: String(row.store_number),
      city: row.city,
      state: row.state,
      franchise_group_name: row.franchise_group_name,
      region_name: row.region_name,
      gm_name: row.gm_name,
      fbp_name: row.fbp_name,
      employees,
      completion_pct: completion,
      overdue,
      expiring_certs: expiring,
      inactive_users: inactive,
      new_hires: Number(row.new_hires ?? 0),
      last_activity: row.last_activity,
      health_score: Math.round(Math.max(0, Math.min(100, health))),
    };
  });
}

export type BreakdownDimension = "location" | "franchise_group" | "region" | "role" | "department";

const DIMENSION_COLUMNS: Record<BreakdownDimension, { label: string; group: string }> = {
  location: { label: "coalesce(p.location_name, 'Unassigned')", group: "p.location_name" },
  franchise_group: { label: "coalesce(p.franchise_group_name, 'Unassigned')", group: "p.franchise_group_name" },
  region: { label: "coalesce(p.region_name, 'Unassigned')", group: "p.region_name" },
  role: { label: "coalesce(p.role_name, 'Unassigned')", group: "p.role_name" },
  department: { label: "coalesce(p.department_name, 'Unassigned')", group: "p.department_name" },
};

export async function completionByDimension(
  scope: AccessScope,
  dimension: BreakdownDimension,
  filters: AnalyticsFilters = {},
  limit = 100,
): Promise<Array<{ name: string; completion: number; employees: number; overdue: number }>> {
  const dim = DIMENSION_COLUMNS[dimension];
  const rows = await query<Record<string, string>>(`
    with ${scopedPeopleCte(scope, filters)}
    select ${dim.label} as name,
           count(distinct p.user_id)::text as employees,
           count(e.id) filter (where e.is_required and e.assignment_id is not null)::text as required_total,
           count(e.id) filter (where e.is_required and e.assignment_id is not null and e.status = 'completed')::text as required_complete,
           count(e.id) filter (where e.status <> 'completed' and e.due_at < now())::text as overdue
      from scoped_people p
      left join enrollments e on e.user_id = p.user_id
     where p.status = 'active'
     group by ${dim.group}
     order by name
     limit ${limit}`);
  return rows.map((r) => ({
    name: r.name,
    employees: Number(r.employees),
    overdue: Number(r.overdue),
    completion: Number(r.required_total) ? Math.round((Number(r.required_complete) / Number(r.required_total)) * 100) : 100,
  }));
}

export async function completionOverTime(
  scope: AccessScope,
  filters: AnalyticsFilters = {},
  weeks = 16,
): Promise<Array<{ name: string; completions: number; hours: number }>> {
  const rows = await query<{ bucket: string; completions: string; seconds: string }>(`
    with ${scopedPeopleCte(scope, filters)}
    select to_char(date_trunc('week', e.completed_at), 'Mon DD') as bucket,
           count(*)::text as completions,
           coalesce(sum(e.duration_seconds), 0)::text as seconds
      from enrollments e
      join scoped_people p on p.user_id = e.user_id
     where e.status = 'completed' and e.completed_at >= now() - interval '${weeks} weeks'
     group by date_trunc('week', e.completed_at)
     order by date_trunc('week', e.completed_at)`);
  return rows.map((r) => ({
    name: r.bucket,
    completions: Number(r.completions),
    hours: Math.round(Number(r.seconds) / 3600),
  }));
}

export async function courseLeaderboard(
  scope: AccessScope,
  filters: AnalyticsFilters = {},
  order: "most" | "least" = "most",
  limit = 8,
): Promise<Array<{ id: string; title: string; completions: number; assigned: number; completion: number; rating: number }>> {
  const rows = await query<Record<string, string>>(`
    with ${scopedPeopleCte(scope, filters)}
    select c.id, c.title, c.rating_avg::text as rating,
           count(e.id)::text as assigned,
           count(e.id) filter (where e.status = 'completed')::text as completions
      from courses c
      join enrollments e on e.course_id = c.id
      join scoped_people p on p.user_id = e.user_id
     where c.status = 'published' and e.assignment_id is not null
     group by c.id, c.title, c.rating_avg
     having count(e.id) > 0
     order by (count(e.id) filter (where e.status = 'completed'))::numeric / nullif(count(e.id), 0) ${order === "most" ? "desc" : "asc"}
     limit ${limit}`);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    completions: Number(r.completions),
    assigned: Number(r.assigned),
    completion: Number(r.assigned) ? Math.round((Number(r.completions) / Number(r.assigned)) * 100) : 0,
    rating: Number(r.rating ?? 0),
  }));
}

export async function certificationRisk(scope: AccessScope, days = 60, limit = 25) {
  return query<{
    user_id: string; full_name: string; location_name: string | null; certification_name: string | null;
    expires_at: string; days_left: string;
  }>(`
    with ${scopedPeopleCte(scope)}
    select p.user_id, p.full_name, p.location_name,
           coalesce(uc.certification_name, c.name) as certification_name,
           uc.expires_at, extract(day from uc.expires_at - now())::int::text as days_left
      from user_certifications uc
      join scoped_people p on p.user_id = uc.user_id
      left join certifications c on c.id = uc.certification_id
     where uc.expires_at between now() - interval '30 days' and now() + interval '${days} days'
       and p.status = 'active'
     order by uc.expires_at asc
     limit ${limit}`);
}

export async function recentSystemActivity(scope: AccessScope, limit = 12) {
  return query<{ full_name: string; course_title: string; completed_at: string; location_name: string | null; source_system: string }>(`
    with ${scopedPeopleCte(scope)}
    select p.full_name, coalesce(c.title, e.course_title) as course_title, e.completed_at, p.location_name, e.source_system
      from enrollments e
      join scoped_people p on p.user_id = e.user_id
      left join courses c on c.id = e.course_id
     where e.status = 'completed' and e.completed_at is not null
     order by e.completed_at desc
     limit ${limit}`);
}

export async function campaignPerformance(scope: AccessScope) {
  return query<{
    id: string; name: string; banner_color: string; due_at: string | null; status: string;
    assigned: string; completed: string; courses: string;
  }>(`
    with ${scopedPeopleCte(scope)}
    select tc.id, tc.name, tc.banner_color, tc.due_at, tc.status,
           count(e.id)::text as assigned,
           count(e.id) filter (where e.status = 'completed')::text as completed,
           (select count(*) from campaign_courses cc where cc.campaign_id = tc.id)::text as courses
      from training_campaigns tc
      left join assignments a on a.campaign_id = tc.id
      left join enrollments e on e.assignment_id = a.id
      left join scoped_people p on p.user_id = e.user_id
     where p.user_id is not null or e.id is null
     group by tc.id, tc.name, tc.banner_color, tc.due_at, tc.status
     order by tc.launch_at desc nulls last`);
}

export async function courseFeedbackSummary(scope: AccessScope, limit = 6) {
  return query<{ id: string; title: string; rating: string; reviews: string; latest_comment: string | null }>(`
    with ${scopedPeopleCte(scope)}
    select c.id, c.title, round(avg(cr.rating)::numeric, 2)::text as rating, count(cr.id)::text as reviews,
           (array_agg(cr.comments order by cr.created_at desc) filter (where cr.comments is not null))[1] as latest_comment
      from course_reviews cr
      join courses c on c.id = cr.course_id
      join scoped_people p on p.user_id = cr.user_id
     group by c.id, c.title
     order by count(cr.id) desc
     limit ${limit}`);
}

export async function upcomingLiveTraining(scope: AccessScope, limit = 8) {
  const guard = locationScopeSql(scope, "te.location_id");
  return query<{
    id: string; title: string; starts_at: string; event_type: string; location_name: string | null;
    instructor_name: string | null; registered: string; capacity: number | null;
  }>(`
    select te.id, te.title, te.starts_at, te.event_type, l.name as location_name,
           i.full_name as instructor_name,
           (select count(*) from training_attendees ta where ta.training_event_id = te.id and ta.status <> 'canceled')::text as registered,
           te.capacity
      from training_events te
      left join locations l on l.id = te.location_id
      left join v_people i on i.user_id = te.instructor_user_id
     where te.starts_at >= now() and te.status = 'scheduled'
       and te.event_type <> 'training_block'
       and (te.location_id is null or ${guard})
     order by te.starts_at asc
     limit ${limit}`);
}

export async function recentlyReleasedTraining(limit = 5) {
  return query<{ id: string; title: string; published_at: string | null; category_name: string | null; completions: number }>(`
    select c.id, c.title, c.published_at, cat.name as category_name, c.completion_count as completions
      from courses c left join course_categories cat on cat.id = c.category_id
     where c.status = 'published'
     order by c.published_at desc nulls last
     limit ${limit}`);
}
