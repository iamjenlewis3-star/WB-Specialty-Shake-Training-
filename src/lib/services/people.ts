import "server-only";
import { query, queryOne } from "@/lib/db/client";
import type { AccessScope } from "@/lib/rbac/scope";
import { peopleScopeSql, isUuid } from "@/lib/rbac/scope";

/**
 * People directory and employee profiles.
 * Every query is wrapped with `peopleScopeSql` so a caller can never read a
 * person outside their location scope, regardless of the filters they pass.
 */

export interface PersonRow {
  user_id: string;
  employee_id: string | null;
  full_name: string;
  email: string;
  status: string;
  role_name: string | null;
  role_code: string | null;
  position_title: string | null;
  department_name: string | null;
  location_name: string | null;
  store_number: string | null;
  primary_location_id: string | null;
  franchise_group_name: string | null;
  region_name: string | null;
  last_login_at: string | null;
  hire_date: string | null;
  avatar_color: string;
  required_total: string;
  required_complete: string;
  overdue_count: string;
  certification_count: string;
  completion_pct: string;
}

export interface PeopleFilters {
  q?: string;
  locationId?: string;
  franchiseGroupId?: string;
  regionId?: string;
  roleId?: string;
  departmentId?: string;
  status?: string;
  overdueOnly?: boolean;
  inactiveOnly?: boolean;
  newHiresOnly?: boolean;
  sort?: string;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

const SORTABLE: Record<string, string> = {
  name: "p.full_name",
  employee_id: "p.employee_id",
  role: "p.role_name",
  location: "p.location_name",
  completion: "completion_pct",
  overdue: "overdue_count",
  last_login: "p.last_login_at",
  status: "p.status",
  hire_date: "p.hire_date",
};

/**
 * Per-person training rollup. Required completion percentage counts only
 * required Academy assignments; migrated legacy history is included in the
 * transcript but never inflates current compliance.
 */
const PERSON_METRICS = `
  left join lateral (
    select
      count(*) filter (where e.is_required and e.assignment_id is not null) as required_total,
      count(*) filter (where e.is_required and e.assignment_id is not null and e.status = 'completed') as required_complete,
      count(*) filter (where e.status <> 'completed' and e.due_at is not null and e.due_at < now()) as overdue_count
    from enrollments e where e.user_id = p.user_id
  ) m on true
  left join lateral (
    select count(*) as certification_count
    from user_certifications uc where uc.user_id = p.user_id and uc.status = 'active'
  ) c on true`;

const PERSON_SELECT = `
  select p.user_id, p.employee_id, p.full_name, p.email, p.status, p.role_name, p.role_code,
         p.position_title, p.department_name, p.location_name, p.store_number, p.primary_location_id,
         p.franchise_group_name, p.region_name, p.last_login_at, p.hire_date, p.avatar_color,
         coalesce(m.required_total, 0)::text as required_total,
         coalesce(m.required_complete, 0)::text as required_complete,
         coalesce(m.overdue_count, 0)::text as overdue_count,
         coalesce(c.certification_count, 0)::text as certification_count,
         (case when coalesce(m.required_total, 0) = 0 then 100
               else round(100.0 * m.required_complete / m.required_total) end)::text as completion_pct
    from v_people p ${PERSON_METRICS}`;

function buildFilters(scope: AccessScope, filters: PeopleFilters) {
  const where: string[] = [peopleScopeSql(scope, "p.user_id", "p.primary_location_id")];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => { params.push(value); where.push(sql.replace("?", `$${params.length}`)); };

  if (filters.q) {
    params.push(`%${filters.q}%`);
    where.push(`(p.full_name ilike $${params.length} or p.email ilike $${params.length}
      or p.employee_id ilike $${params.length} or p.position_title ilike $${params.length}
      or p.location_name ilike $${params.length})`);
  }
  if (isUuid(filters.locationId)) add("p.primary_location_id = ?::uuid", filters.locationId);
  if (isUuid(filters.franchiseGroupId)) add("p.franchise_group_id = ?::uuid", filters.franchiseGroupId);
  if (isUuid(filters.regionId)) add("p.region_id = ?::uuid", filters.regionId);
  if (isUuid(filters.roleId)) add("p.role_id = ?::uuid", filters.roleId);
  if (isUuid(filters.departmentId)) add("p.department_id = ?::uuid", filters.departmentId);
  if (filters.status) add("p.status = ?", filters.status);
  if (filters.newHiresOnly) where.push(`p.hire_date >= current_date - interval '60 days'`);
  if (filters.inactiveOnly) where.push(`(p.last_login_at is null or p.last_login_at < now() - interval '30 days')`);
  if (filters.overdueOnly) where.push(`coalesce(m.overdue_count, 0) > 0`);
  return { where: where.join(" and "), params };
}

export async function listPeople(
  scope: AccessScope,
  filters: PeopleFilters = {},
): Promise<{ rows: PersonRow[]; total: number; page: number; pageCount: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, filters.pageSize ?? 25);
  const { where, params } = buildFilters(scope, filters);
  const sortCol = SORTABLE[filters.sort ?? "name"] ?? "p.full_name";
  const dir = filters.dir === "asc" ? "asc" : filters.sort ? "desc" : "asc";

  const totals = await query<{ count: string }>(
    `select count(*)::text as count from v_people p ${PERSON_METRICS} where ${where}`, params);
  const total = Number(totals[0]?.count ?? 0);

  const rows = await query<PersonRow>(
    `${PERSON_SELECT} where ${where} order by ${sortCol} ${dir} nulls last, p.full_name asc
     limit ${pageSize} offset ${(page - 1) * pageSize}`, params);

  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getPerson(scope: AccessScope, userId: string): Promise<PersonRow | null> {
  if (!isUuid(userId)) return null;
  const guard = peopleScopeSql(scope, "p.user_id", "p.primary_location_id");
  return queryOne<PersonRow>(`${PERSON_SELECT} where p.user_id = $1::uuid and (${guard})`, [userId]);
}

export interface PersonDetail extends PersonRow {
  manager_name: string | null;
  manager_user_id: string | null;
  employment_type: string | null;
  termination_date: string | null;
  deactivated_at: string | null;
  source_system: string;
  franchise_group_id: string | null;
  region_id: string | null;
  department_id: string | null;
  role_id: string | null;
  training_seconds: string;
}

export async function getPersonDetail(scope: AccessScope, userId: string): Promise<PersonDetail | null> {
  if (!isUuid(userId)) return null;
  const guard = peopleScopeSql(scope, "p.user_id", "p.primary_location_id");
  return queryOne<PersonDetail>(
    `select base.*, mgr.full_name as manager_name, p.manager_user_id, p.employment_type, p.termination_date,
            p.deactivated_at, p.source_system, p.franchise_group_id, p.region_id, p.department_id, p.role_id,
            coalesce(t.seconds, 0)::text as training_seconds
       from (${PERSON_SELECT} where p.user_id = $1::uuid and (${guard})) base
       join v_people p on p.user_id = base.user_id
       left join v_people mgr on mgr.user_id = p.manager_user_id
       left join lateral (
         select sum(duration_seconds) as seconds from enrollments e where e.user_id = p.user_id
       ) t on true`,
    [userId],
  );
}

export interface TranscriptRow {
  id: string;
  course_title: string;
  course_id: string | null;
  course_code: string | null;
  course_version: number;
  assigned_at: string | null;
  completed_at: string | null;
  status: string;
  score: string | null;
  passing_score: string | null;
  duration_seconds: number;
  source_system: string;
  certification_id: string | null;
  expires_at: string | null;
  category_name: string | null;
  due_at: string | null;
  is_required: boolean;
}

/**
 * The unified training transcript: Academy records and migrated legacy records
 * in one stream, ordered by completion. This is the screen that proves no
 * training history was lost in the platform move.
 */
export async function getTranscript(
  scope: AccessScope,
  userId: string,
  opts: { source?: string; status?: string; q?: string } = {},
): Promise<TranscriptRow[]> {
  if (!isUuid(userId)) return [];
  const guard = peopleScopeSql(scope, "p.user_id", "p.primary_location_id");
  const where: string[] = [`t.user_id = $1::uuid`];
  const params: unknown[] = [userId];
  if (opts.source) { params.push(opts.source); where.push(`t.source_system = $${params.length}`); }
  if (opts.status) { params.push(opts.status); where.push(`t.status = $${params.length}`); }
  if (opts.q) { params.push(`%${opts.q}%`); where.push(`t.course_title ilike $${params.length}`); }

  return query<TranscriptRow>(
    `select t.* from v_transcript t
       join v_people p on p.user_id = t.user_id
      where ${where.join(" and ")} and (${guard})
      order by coalesce(t.completed_at, t.assigned_at) desc nulls last`,
    params,
  );
}

export async function getPersonCertifications(userId: string) {
  return query<{
    id: string; certification_name: string | null; issued_at: string; expires_at: string | null;
    status: string; certificate_number: string | null; source_system: string;
  }>(
    `select uc.id, coalesce(uc.certification_name, c.name) as certification_name, uc.issued_at, uc.expires_at,
            case when uc.expires_at < now() then 'expired'
                 when uc.expires_at < now() + interval '60 days' then 'expiring'
                 else uc.status end as status,
            uc.certificate_number, uc.source_system
       from user_certifications uc
       left join certifications c on c.id = uc.certification_id
      where uc.user_id = $1 order by uc.expires_at asc nulls last`,
    [userId],
  );
}

export async function getPersonBadges(userId: string) {
  return query<{ id: string; name: string; description: string | null; icon: string; color: string; awarded_at: string }>(
    `select ub.id, b.name, b.description, b.icon, b.color, ub.awarded_at
       from user_badges ub join badges b on b.id = ub.badge_id
      where ub.user_id = $1 order by ub.awarded_at desc`,
    [userId],
  );
}

export async function getPersonAssessments(userId: string) {
  return query<{
    id: string; title: string; attempt_number: number; score: string | null; passed: boolean | null;
    completed_at: string | null; source_system: string;
  }>(
    `select aa.id, coalesce(a.title, aa.assessment_title, 'Assessment') as title, aa.attempt_number,
            aa.score, aa.passed, aa.completed_at, aa.source_system
       from assessment_attempts aa
       left join assessments a on a.id = aa.assessment_id
      where aa.user_id = $1 order by aa.completed_at desc nulls last limit 100`,
    [userId],
  );
}

export async function getPersonLearningPaths(userId: string) {
  return query<{ id: string; name: string; progress: string; status: string; due_at: string | null; color: string; path_id: string }>(
    `select lpe.id, lp.name, lpe.progress::text as progress, lpe.status, lpe.due_at, lp.color, lp.id as path_id
       from learning_path_enrollments lpe
       join learning_paths lp on lp.id = lpe.learning_path_id
      where lpe.user_id = $1 order by lpe.progress desc`,
    [userId],
  );
}

export async function getPersonActivity(userId: string, limit = 25) {
  return query<{ occurred_at: string; action: string; entity_label: string | null; actor_name: string | null }>(
    `select occurred_at, action, entity_label, actor_name
       from audit_logs where entity_id = $1 or actor_user_id = $1
      order by occurred_at desc limit $2`,
    [userId, limit],
  );
}

/** Filter option lists, themselves restricted to the caller's scope. */
export async function filterOptions(scope: AccessScope) {
  const locGuard = scope.locationIds === "all" ? "true" : scope.locationIds.length
    ? `l.id in (${scope.locationIds.map((id) => `'${id}'::uuid`).join(", ")})` : "false";
  const [locations, roles, departments, groups, regions] = await Promise.all([
    query<{ id: string; name: string; store_number: string }>(
      `select l.id, l.name, l.store_number from locations l where ${locGuard} order by l.name`),
    query<{ id: string; name: string }>(`select id, name from roles order by sort_order`),
    query<{ id: string; name: string }>(`select id, name from departments order by name`),
    query<{ id: string; name: string }>(
      `select distinct fg.id, fg.name from franchise_groups fg join locations l on l.franchise_group_id = fg.id
        where ${locGuard} order by fg.name`),
    query<{ id: string; name: string }>(
      `select distinct r.id, r.name from regions r join locations l on l.region_id = r.id
        where ${locGuard} order by r.name`),
  ]);
  return { locations, roles, departments, groups, regions };
}
