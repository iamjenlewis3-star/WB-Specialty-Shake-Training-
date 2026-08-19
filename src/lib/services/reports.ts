import "server-only";
import { query } from "@/lib/db/client";
import type { AccessScope } from "@/lib/rbac/scope";
import { isUuid } from "@/lib/rbac/scope";
import { scopedPeopleCte } from "./analytics";

/**
 * Report registry.
 *
 * One definition per report drives the Reports Center UI, the custom report
 * builder and every export (CSV / XLSX / print) — so what you see on screen and
 * what you download are produced by the same scoped SQL.
 */

export interface ReportColumn {
  key: string;
  label: string;
  type?: "text" | "number" | "percent" | "date" | "status" | "source" | "duration";
  align?: "left" | "right";
}

export interface ReportFilters {
  q?: string;
  locationId?: string;
  franchiseGroupId?: string;
  regionId?: string;
  roleId?: string;
  departmentId?: string;
  courseId?: string;
  status?: string;
  source?: string;
  from?: string;
  to?: string;
  userId?: string;
  days?: number;
  limit?: number;
  groupBy?: string;
  sort?: string;
  dir?: "asc" | "desc";
}

export interface ReportDefinition {
  key: string;
  name: string;
  description: string;
  category: "Training" | "People" | "Compliance" | "Content" | "Operations";
  columns: ReportColumn[];
  filters: string[];
  run: (scope: AccessScope, filters: ReportFilters) => Promise<Array<Record<string, unknown>>>;
}

const dateWindow = (filters: ReportFilters, column: string) => {
  const clauses: string[] = [];
  if (filters.from) clauses.push(`${column} >= '${filters.from.replace(/'/g, "")}'::date`);
  if (filters.to) clauses.push(`${column} <= '${filters.to.replace(/'/g, "")}'::date + interval '1 day'`);
  return clauses.length ? ` and ${clauses.join(" and ")}` : "";
};

const courseFilter = (filters: ReportFilters, column = "e.course_id") =>
  isUuid(filters.courseId) ? ` and ${column} = '${filters.courseId}'::uuid` : "";

const searchFilter = (filters: ReportFilters, columns: string[]) => {
  if (!filters.q) return "";
  const needle = filters.q.replace(/'/g, "''");
  return ` and (${columns.map((c) => `${c} ilike '%${needle}%'`).join(" or ")})`;
};

export const REPORTS: ReportDefinition[] = [
  {
    key: "training_completion",
    name: "Training Completion",
    description: "Required training completion for every employee in scope.",
    category: "Training",
    filters: ["location", "group", "region", "role", "department", "search"],
    columns: [
      { key: "full_name", label: "Employee" },
      { key: "employee_id", label: "Employee ID" },
      { key: "position_title", label: "Position" },
      { key: "location_name", label: "Location" },
      { key: "franchise_group_name", label: "Franchise group" },
      { key: "required_total", label: "Required", type: "number" },
      { key: "required_complete", label: "Complete", type: "number" },
      { key: "completion_pct", label: "Completion", type: "percent" },
      { key: "overdue", label: "Overdue", type: "number" },
      { key: "last_login_at", label: "Last login", type: "date" },
    ],
    run: (scope, filters) => query(`
      with ${scopedPeopleCte(scope, filters)}
      select p.full_name, p.employee_id, p.position_title, p.location_name, p.franchise_group_name,
             count(e.id) filter (where e.is_required and e.assignment_id is not null) as required_total,
             count(e.id) filter (where e.is_required and e.assignment_id is not null and e.status = 'completed') as required_complete,
             coalesce(round(100.0 * count(e.id) filter (where e.is_required and e.assignment_id is not null and e.status = 'completed')
               / nullif(count(e.id) filter (where e.is_required and e.assignment_id is not null), 0)), 100) as completion_pct,
             count(e.id) filter (where e.status <> 'completed' and e.due_at < now()) as overdue,
             p.last_login_at
        from scoped_people p
        left join enrollments e on e.user_id = p.user_id
       where p.status = 'active' ${searchFilter(filters, ["p.full_name", "p.employee_id", "p.location_name"])}
       group by p.user_id, p.full_name, p.employee_id, p.position_title, p.location_name, p.franchise_group_name, p.last_login_at
       order by completion_pct asc, p.full_name
       limit ${filters.limit ?? 1000}`),
  },
  {
    key: "course_completion",
    name: "Course Completion",
    description: "Assignment volume and completion rate for every course.",
    category: "Content",
    filters: ["location", "group", "region", "search"],
    columns: [
      { key: "code", label: "Code" },
      { key: "title", label: "Course" },
      { key: "category_name", label: "Category" },
      { key: "assigned", label: "Assigned", type: "number" },
      { key: "completed", label: "Completed", type: "number" },
      { key: "completion_pct", label: "Completion", type: "percent" },
      { key: "overdue", label: "Overdue", type: "number" },
      { key: "avg_score", label: "Average score", type: "number" },
      { key: "rating_avg", label: "Rating", type: "number" },
    ],
    run: (scope, filters) => query(`
      with ${scopedPeopleCte(scope, filters)}
      select c.code, c.title, cat.name as category_name,
             count(e.id) as assigned,
             count(e.id) filter (where e.status = 'completed') as completed,
             coalesce(round(100.0 * count(e.id) filter (where e.status = 'completed') / nullif(count(e.id), 0)), 0) as completion_pct,
             count(e.id) filter (where e.status <> 'completed' and e.due_at < now()) as overdue,
             coalesce(round(avg(e.score)), 0) as avg_score,
             c.rating_avg
        from courses c
        left join course_categories cat on cat.id = c.category_id
        left join enrollments e on e.course_id = c.id
        left join scoped_people p on p.user_id = e.user_id
       where c.status = 'published' and (e.id is null or p.user_id is not null)
         ${searchFilter(filters, ["c.title", "c.code"])}
       group by c.id, c.code, c.title, cat.name, c.rating_avg
       order by completion_pct asc
       limit ${filters.limit ?? 500}`),
  },
  {
    key: "employee_transcript",
    name: "Employee Transcript",
    description: "Every training record — Academy and migrated legacy history together.",
    category: "Training",
    filters: ["location", "group", "region", "role", "source", "dates", "search"],
    columns: [
      { key: "full_name", label: "Employee" },
      { key: "employee_id", label: "Employee ID" },
      { key: "location_name", label: "Location" },
      { key: "course_title", label: "Course" },
      { key: "course_version", label: "Version", type: "number" },
      { key: "assigned_at", label: "Assigned", type: "date" },
      { key: "completed_at", label: "Completed", type: "date" },
      { key: "score", label: "Score", type: "number" },
      { key: "status", label: "Status", type: "status" },
      { key: "duration_seconds", label: "Duration", type: "duration" },
      { key: "source_system", label: "Source", type: "source" },
    ],
    run: (scope, filters) => query(`
      with ${scopedPeopleCte(scope, filters)}
      select p.full_name, p.employee_id, p.location_name, t.course_title, t.course_version, t.assigned_at,
             t.completed_at, t.score, t.status, t.duration_seconds, t.source_system
        from v_transcript t
        join scoped_people p on p.user_id = t.user_id
       where 1=1
         ${filters.source ? ` and t.source_system = '${filters.source.replace(/'/g, "''")}'` : ""}
         ${filters.status ? ` and t.status = '${filters.status.replace(/'/g, "''")}'` : ""}
         ${isUuid(filters.userId) ? ` and t.user_id = '${filters.userId}'::uuid` : ""}
         ${dateWindow(filters, "t.completed_at")}
         ${searchFilter(filters, ["t.course_title", "p.full_name"])}
       order by t.completed_at desc nulls last
       limit ${filters.limit ?? 5000}`),
  },
  {
    key: "overdue_training",
    name: "Overdue Training",
    description: "Every assignment past its due date, by employee and restaurant.",
    category: "Compliance",
    filters: ["location", "group", "region", "role", "search"],
    columns: [
      { key: "full_name", label: "Employee" },
      { key: "position_title", label: "Position" },
      { key: "location_name", label: "Location" },
      { key: "course_title", label: "Course" },
      { key: "due_at", label: "Due", type: "date" },
      { key: "days_overdue", label: "Days overdue", type: "number" },
      { key: "priority", label: "Priority" },
      { key: "manager_name", label: "Manager" },
    ],
    run: (scope, filters) => query(`
      with ${scopedPeopleCte(scope, filters)}
      select p.full_name, p.position_title, p.location_name,
             coalesce(c.title, e.course_title) as course_title, e.due_at,
             extract(day from now() - e.due_at)::int as days_overdue, e.priority,
             mgr.full_name as manager_name
        from enrollments e
        join scoped_people p on p.user_id = e.user_id
        left join courses c on c.id = e.course_id
        left join v_people mgr on mgr.user_id = p.manager_user_id
       where e.status <> 'completed' and e.due_at < now() and p.status = 'active'
         ${courseFilter(filters)}
         ${searchFilter(filters, ["p.full_name", "c.title", "p.location_name"])}
       order by days_overdue desc
       limit ${filters.limit ?? 2000}`),
  },
  {
    key: "location_completion",
    name: "Location Completion",
    description: "Required completion, overdue counts and health by restaurant.",
    category: "Operations",
    filters: ["group", "region", "search"],
    columns: [
      { key: "store_number", label: "Store #" },
      { key: "name", label: "Location" },
      { key: "franchise_group_name", label: "Franchise group" },
      { key: "region_name", label: "Region" },
      { key: "gm_name", label: "General Manager" },
      { key: "employees", label: "Employees", type: "number" },
      { key: "completion_pct", label: "Completion", type: "percent" },
      { key: "overdue", label: "Overdue", type: "number" },
      { key: "expiring_certs", label: "Certs expiring", type: "number" },
      { key: "inactive_users", label: "Inactive", type: "number" },
    ],
    run: async (scope, filters) => {
      const { locationPerformance } = await import("./analytics");
      const rows = await locationPerformance(scope, filters);
      const needle = filters.q?.toLowerCase();
      return rows
        .filter((r) => !needle || r.name.toLowerCase().includes(needle) || r.store_number.includes(needle))
        .map((r) => ({ ...r })) as Array<Record<string, unknown>>;
    },
  },
  {
    key: "franchise_completion",
    name: "Franchise Group Completion",
    description: "Rollup of completion and overdue training by franchise group.",
    category: "Operations",
    filters: ["region"],
    columns: [
      { key: "name", label: "Franchise group" },
      { key: "employees", label: "Employees", type: "number" },
      { key: "completion", label: "Completion", type: "percent" },
      { key: "overdue", label: "Overdue", type: "number" },
    ],
    run: async (scope, filters) => {
      const { completionByDimension } = await import("./analytics");
      const rows = await completionByDimension(scope, "franchise_group", filters);
      return rows.map((r) => ({ ...r })) as Array<Record<string, unknown>>;
    },
  },
  {
    key: "role_completion",
    name: "Role Completion",
    description: "Completion by position across the organization.",
    category: "Operations",
    filters: ["location", "group", "region"],
    columns: [
      { key: "name", label: "Role" },
      { key: "employees", label: "Employees", type: "number" },
      { key: "completion", label: "Completion", type: "percent" },
      { key: "overdue", label: "Overdue", type: "number" },
    ],
    run: async (scope, filters) => {
      const { completionByDimension } = await import("./analytics");
      const rows = await completionByDimension(scope, "role", filters);
      return rows.map((r) => ({ ...r })) as Array<Record<string, unknown>>;
    },
  },
  {
    key: "certification_compliance",
    name: "Certification Compliance",
    description: "Active, expiring and expired certifications by employee.",
    category: "Compliance",
    filters: ["location", "group", "region", "search"],
    columns: [
      { key: "full_name", label: "Employee" },
      { key: "location_name", label: "Location" },
      { key: "certification_name", label: "Certification" },
      { key: "issued_at", label: "Issued", type: "date" },
      { key: "expires_at", label: "Expires", type: "date" },
      { key: "days_left", label: "Days left", type: "number" },
      { key: "status", label: "Status", type: "status" },
      { key: "source_system", label: "Source", type: "source" },
    ],
    run: (scope, filters) => query(`
      with ${scopedPeopleCte(scope, filters)}
      select p.full_name, p.location_name, coalesce(uc.certification_name, c.name) as certification_name,
             uc.issued_at, uc.expires_at,
             extract(day from uc.expires_at - now())::int as days_left,
             case when uc.expires_at < now() then 'expired'
                  when uc.expires_at < now() + interval '60 days' then 'expiring'
                  else 'active' end as status,
             uc.source_system
        from user_certifications uc
        join scoped_people p on p.user_id = uc.user_id
        left join certifications c on c.id = uc.certification_id
       where p.status = 'active'
         ${searchFilter(filters, ["p.full_name", "c.name", "uc.certification_name"])}
       order by uc.expires_at asc nulls last
       limit ${filters.limit ?? 3000}`),
  },
  {
    key: "assessment_scores",
    name: "Assessment Scores",
    description: "Every assessment attempt with score, result and attempt number.",
    category: "Training",
    filters: ["location", "group", "region", "dates", "search"],
    columns: [
      { key: "full_name", label: "Employee" },
      { key: "location_name", label: "Location" },
      { key: "assessment_title", label: "Assessment" },
      { key: "attempt_number", label: "Attempt", type: "number" },
      { key: "score", label: "Score", type: "number" },
      { key: "passed", label: "Result", type: "status" },
      { key: "completed_at", label: "Completed", type: "date" },
      { key: "source_system", label: "Source", type: "source" },
    ],
    run: (scope, filters) => query(`
      with ${scopedPeopleCte(scope, filters)}
      select p.full_name, p.location_name,
             coalesce(a.title, aa.assessment_title, 'Assessment') as assessment_title,
             aa.attempt_number, aa.score,
             case when aa.passed then 'passed' else 'failed' end as passed,
             aa.completed_at, aa.source_system
        from assessment_attempts aa
        join scoped_people p on p.user_id = aa.user_id
        left join assessments a on a.id = aa.assessment_id
       where 1=1 ${dateWindow(filters, "aa.completed_at")}
         ${searchFilter(filters, ["p.full_name", "a.title", "aa.assessment_title"])}
       order by aa.completed_at desc nulls last
       limit ${filters.limit ?? 3000}`),
  },
  {
    key: "training_hours",
    name: "Training Hours",
    description: "Recorded learning time by employee and restaurant.",
    category: "Training",
    filters: ["location", "group", "region", "dates"],
    columns: [
      { key: "full_name", label: "Employee" },
      { key: "location_name", label: "Location" },
      { key: "courses_completed", label: "Courses completed", type: "number" },
      { key: "training_seconds", label: "Training time", type: "duration" },
      { key: "last_activity", label: "Last activity", type: "date" },
    ],
    run: (scope, filters) => query(`
      with ${scopedPeopleCte(scope, filters)}
      select p.full_name, p.location_name,
             count(e.id) filter (where e.status = 'completed') as courses_completed,
             coalesce(sum(e.duration_seconds), 0) as training_seconds,
             max(e.last_activity_at) as last_activity
        from scoped_people p
        left join enrollments e on e.user_id = p.user_id
       where p.status = 'active' ${dateWindow(filters, "e.completed_at")}
       group by p.user_id, p.full_name, p.location_name
       order by training_seconds desc
       limit ${filters.limit ?? 2000}`),
  },
  {
    key: "inactive_users",
    name: "Inactive Users",
    description: "Employees with no recent sign-in, plus deactivated accounts.",
    category: "People",
    filters: ["location", "group", "region", "search"],
    columns: [
      { key: "full_name", label: "Employee" },
      { key: "employee_id", label: "Employee ID" },
      { key: "location_name", label: "Location" },
      { key: "status", label: "Status", type: "status" },
      { key: "last_login_at", label: "Last login", type: "date" },
      { key: "days_inactive", label: "Days inactive", type: "number" },
      { key: "deactivated_at", label: "Deactivated", type: "date" },
      { key: "outstanding", label: "Outstanding training", type: "number" },
    ],
    run: (scope, filters) => query(`
      with ${scopedPeopleCte(scope, filters)}
      select p.full_name, p.employee_id, p.location_name, p.status, p.last_login_at,
             coalesce(extract(day from now() - p.last_login_at)::int, 999) as days_inactive,
             p.deactivated_at,
             (select count(*) from enrollments e where e.user_id = p.user_id and e.status <> 'completed') as outstanding
        from scoped_people p
       where (p.last_login_at is null or p.last_login_at < now() - interval '30 days'
              or p.status in ('deactivated','inactive','terminated'))
         ${searchFilter(filters, ["p.full_name", "p.employee_id", "p.location_name"])}
       order by days_inactive desc
       limit ${filters.limit ?? 2000}`),
  },
  {
    key: "login_activity",
    name: "Login Activity",
    description: "Sign-in recency across the organization.",
    category: "People",
    filters: ["location", "group", "region"],
    columns: [
      { key: "full_name", label: "Employee" },
      { key: "location_name", label: "Location" },
      { key: "role_name", label: "Role" },
      { key: "last_login_at", label: "Last login", type: "date" },
      { key: "sessions_30d", label: "Sessions (30d)", type: "number" },
    ],
    run: (scope, filters) => query(`
      with ${scopedPeopleCte(scope, filters)}
      select p.full_name, p.location_name, p.role_name, p.last_login_at,
             (select count(*) from sessions s where s.user_id = p.user_id and s.created_at > now() - interval '30 days') as sessions_30d
        from scoped_people p
       where p.status = 'active'
       order by p.last_login_at desc nulls last
       limit ${filters.limit ?? 2000}`),
  },
  {
    key: "course_ratings",
    name: "Course Ratings",
    description: "Learner feedback scores and review volume by course.",
    category: "Content",
    filters: ["search"],
    columns: [
      { key: "title", label: "Course" },
      { key: "rating_avg", label: "Rating", type: "number" },
      { key: "reviews", label: "Reviews", type: "number" },
      { key: "useful", label: "Useful", type: "number" },
      { key: "easy", label: "Easy to understand", type: "number" },
      { key: "relevant", label: "Relevant", type: "number" },
      { key: "confident", label: "More confident", type: "number" },
    ],
    run: (_scope, filters) => query(`
      select c.title, round(coalesce(avg(cr.rating), 0)::numeric, 2) as rating_avg, count(cr.id) as reviews,
             round(coalesce(avg(cr.useful), 0)::numeric, 1) as useful,
             round(coalesce(avg(cr.easy_to_understand), 0)::numeric, 1) as easy,
             round(coalesce(avg(cr.relevant), 0)::numeric, 1) as relevant,
             round(coalesce(avg(cr.more_confident), 0)::numeric, 1) as confident
        from courses c left join course_reviews cr on cr.course_id = c.id
       where c.status = 'published' ${searchFilter(filters, ["c.title"])}
       group by c.id, c.title
       order by rating_avg desc
       limit ${filters.limit ?? 200}`),
  },
  {
    key: "learning_path_progress",
    name: "Learning Path Progress",
    description: "Progress through every assigned certification path.",
    category: "Training",
    filters: ["location", "group", "region", "search"],
    columns: [
      { key: "full_name", label: "Employee" },
      { key: "location_name", label: "Location" },
      { key: "path_name", label: "Learning path" },
      { key: "progress", label: "Progress", type: "percent" },
      { key: "status", label: "Status", type: "status" },
      { key: "assigned_at", label: "Assigned", type: "date" },
      { key: "completed_at", label: "Completed", type: "date" },
    ],
    run: (scope, filters) => query(`
      with ${scopedPeopleCte(scope, filters)}
      select p.full_name, p.location_name, lp.name as path_name, lpe.progress, lpe.status,
             lpe.assigned_at, lpe.completed_at
        from learning_path_enrollments lpe
        join scoped_people p on p.user_id = lpe.user_id
        join learning_paths lp on lp.id = lpe.learning_path_id
       where 1=1 ${searchFilter(filters, ["p.full_name", "lp.name"])}
       order by lpe.progress asc
       limit ${filters.limit ?? 3000}`),
  },
  {
    key: "scorm_activity",
    name: "SCORM Activity",
    description: "SCORM runtime tracking: status, score and session time.",
    category: "Content",
    filters: ["location", "group", "region"],
    columns: [
      { key: "full_name", label: "Employee" },
      { key: "location_name", label: "Location" },
      { key: "course_title", label: "Course" },
      { key: "lesson_status", label: "Lesson status" },
      { key: "score", label: "Score", type: "number" },
      { key: "seconds_spent", label: "Session time", type: "duration" },
      { key: "updated_at", label: "Last activity", type: "date" },
    ],
    run: (scope, filters) => query(`
      with ${scopedPeopleCte(scope, filters)}
      select p.full_name, p.location_name, coalesce(c.title, e.course_title) as course_title,
             coalesce(mp.data->'scorm'->>'lessonStatus', 'not attempted') as lesson_status,
             mp.score, mp.seconds_spent, mp.updated_at
        from module_progress mp
        join enrollments e on e.id = mp.enrollment_id
        join scoped_people p on p.user_id = e.user_id
        join course_modules m on m.id = mp.module_id and m.module_type = 'scorm'
        left join courses c on c.id = e.course_id
       order by mp.updated_at desc
       limit ${filters.limit ?? 1000}`),
  },
  {
    key: "live_training_attendance",
    name: "Live Training Attendance",
    description: "Instructor-led and virtual session attendance.",
    category: "Operations",
    filters: ["location", "dates", "search"],
    columns: [
      { key: "title", label: "Session" },
      { key: "starts_at", label: "Date", type: "date" },
      { key: "location_name", label: "Location" },
      { key: "instructor_name", label: "Instructor" },
      { key: "registered", label: "Registered", type: "number" },
      { key: "attended", label: "Attended", type: "number" },
      { key: "no_show", label: "No-shows", type: "number" },
      { key: "attendance_pct", label: "Attendance", type: "percent" },
    ],
    run: (scope, filters) => query(`
      with ${scopedPeopleCte(scope, filters)}
      select te.title, te.starts_at, l.name as location_name, i.full_name as instructor_name,
             count(ta.id) as registered,
             count(ta.id) filter (where ta.status in ('attended','completed')) as attended,
             count(ta.id) filter (where ta.status = 'no_show') as no_show,
             coalesce(round(100.0 * count(ta.id) filter (where ta.status in ('attended','completed')) / nullif(count(ta.id), 0)), 0) as attendance_pct
        from training_events te
        left join locations l on l.id = te.location_id
        left join v_people i on i.user_id = te.instructor_user_id
        left join training_attendees ta on ta.training_event_id = te.id
        left join scoped_people p on p.user_id = ta.user_id
       where te.event_type <> 'training_block'
         and (te.location_id is null or exists (select 1 from scoped_people sp where sp.primary_location_id = te.location_id))
         ${dateWindow(filters, "te.starts_at")}
         ${searchFilter(filters, ["te.title", "l.name"])}
       group by te.id, te.title, te.starts_at, l.name, i.full_name
       order by te.starts_at desc
       limit ${filters.limit ?? 500}`),
  },
  {
    key: "new_hire_progress",
    name: "New Hire Progress",
    description: "Onboarding progress for employees hired recently.",
    category: "People",
    filters: ["location", "group", "region"],
    columns: [
      { key: "full_name", label: "Employee" },
      { key: "location_name", label: "Location" },
      { key: "position_title", label: "Position" },
      { key: "hire_date", label: "Hire date", type: "date" },
      { key: "days_employed", label: "Days employed", type: "number" },
      { key: "required_total", label: "Required", type: "number" },
      { key: "required_complete", label: "Complete", type: "number" },
      { key: "completion_pct", label: "Completion", type: "percent" },
    ],
    run: (scope, filters) => query(`
      with ${scopedPeopleCte(scope, filters)}
      select p.full_name, p.location_name, p.position_title, p.hire_date,
             extract(day from now() - p.hire_date)::int as days_employed,
             count(e.id) filter (where e.is_required and e.assignment_id is not null) as required_total,
             count(e.id) filter (where e.is_required and e.assignment_id is not null and e.status = 'completed') as required_complete,
             coalesce(round(100.0 * count(e.id) filter (where e.is_required and e.assignment_id is not null and e.status = 'completed')
               / nullif(count(e.id) filter (where e.is_required and e.assignment_id is not null), 0)), 0) as completion_pct
        from scoped_people p
        left join enrollments e on e.user_id = p.user_id
       where p.hire_date >= current_date - (${Number(filters.days ?? 60)} || ' days')::interval and p.status = 'active'
       group by p.user_id, p.full_name, p.location_name, p.position_title, p.hire_date
       order by p.hire_date desc
       limit ${filters.limit ?? 1000}`),
  },
  {
    key: "employees",
    name: "Employee Directory",
    description: "Full employee export with completion, certifications and account status.",
    category: "People",
    filters: ["location", "group", "region", "role", "department", "search"],
    columns: [
      { key: "employee_id", label: "Employee ID" },
      { key: "full_name", label: "Employee" },
      { key: "email", label: "Email" },
      { key: "position_title", label: "Position" },
      { key: "role_name", label: "Role" },
      { key: "department_name", label: "Department" },
      { key: "location_name", label: "Location" },
      { key: "store_number", label: "Store #" },
      { key: "franchise_group_name", label: "Franchise group" },
      { key: "region_name", label: "Region" },
      { key: "hire_date", label: "Hire date", type: "date" },
      { key: "status", label: "Status", type: "status" },
      { key: "last_login_at", label: "Last login", type: "date" },
      { key: "completion_pct", label: "Completion", type: "percent" },
      { key: "overdue", label: "Overdue", type: "number" },
      { key: "certifications", label: "Certifications", type: "number" },
      { key: "source_system", label: "Source", type: "source" },
    ],
    run: (scope, filters) => query(`
      with ${scopedPeopleCte(scope, filters)}
      select p.employee_id, p.full_name, p.email, p.position_title, p.role_name, p.department_name,
             p.location_name, p.store_number, p.franchise_group_name, p.region_name, p.hire_date, p.status,
             p.last_login_at, p.source_system,
             coalesce(round(100.0 * count(e.id) filter (where e.is_required and e.assignment_id is not null and e.status = 'completed')
               / nullif(count(e.id) filter (where e.is_required and e.assignment_id is not null), 0)), 100) as completion_pct,
             count(e.id) filter (where e.status <> 'completed' and e.due_at < now()) as overdue,
             (select count(*) from user_certifications uc where uc.user_id = p.user_id and uc.expires_at > now()) as certifications
        from scoped_people p
        left join enrollments e on e.user_id = p.user_id
       where 1=1
         ${filters.status ? ` and p.status = '${filters.status.replace(/'/g, "''")}'` : ""}
         ${searchFilter(filters, ["p.full_name", "p.email", "p.employee_id", "p.location_name"])}
       group by p.user_id, p.employee_id, p.full_name, p.email, p.position_title, p.role_name, p.department_name,
                p.location_name, p.store_number, p.franchise_group_name, p.region_name, p.hire_date, p.status,
                p.last_login_at, p.source_system
       order by p.full_name
       limit ${filters.limit ?? 5000}`),
  },
];

export function reportByKey(key: string): ReportDefinition | undefined {
  return REPORTS.find((r) => r.key === key);
}

/** Single-employee transcript export (used by the transcript page). */
export async function transcriptExport(scope: AccessScope, userId: string) {
  const report = reportByKey("employee_transcript")!;
  return report.run(scope, { userId, limit: 5000 });
}

export async function savedReports(userId: string) {
  return query<{ id: string; name: string; description: string | null; report_key: string; config: Record<string, unknown>; is_shared: boolean; owner_name: string | null; created_at: string }>(
    `select sr.id, sr.name, sr.description, sr.report_key, sr.config, sr.is_shared, p.full_name as owner_name, sr.created_at
       from saved_reports sr left join v_people p on p.user_id = sr.owner_user_id
      where sr.is_shared or sr.owner_user_id = $1
      order by sr.created_at desc`, [userId]);
}

export async function scheduledReports() {
  return query<{
    id: string; name: string; report_key: string; frequency: string; hour: number; recipients: string[];
    format: string; is_active: boolean; last_run_at: string | null; next_run_at: string | null; created_by_name: string | null;
  }>(
    `select s.id, s.name, s.report_key, s.frequency, s.hour, s.recipients, s.format, s.is_active,
            s.last_run_at, s.next_run_at, p.full_name as created_by_name
       from scheduled_reports s left join v_people p on p.user_id = s.created_by
      order by s.created_at desc`);
}
