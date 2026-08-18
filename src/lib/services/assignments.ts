import "server-only";
import { query, queryOne } from "@/lib/db/client";
import { resolveTargetPopulation, type AssignmentTarget } from "@/lib/assignments/targeting";
import { notifyMany } from "./notifications";
import { isUuid } from "@/lib/rbac/scope";
import type { AccessScope } from "@/lib/rbac/scope";
import { peopleScopeSql } from "@/lib/rbac/scope";

/**
 * Assignment engine.
 *
 * Publishing an assignment materializes an enrollment for every person the
 * targets resolve to. Enrollments are the single unit of "assigned training" —
 * dashboards, reports and transcripts all read from them.
 */

const exec = { query: async <T,>(sql: string, params?: unknown[]) => ({ rows: await query<T>(sql, params) }) };

export interface AssignmentRow {
  id: string;
  title: string;
  item_type: string;
  course_id: string | null;
  course_title: string | null;
  learning_path_id: string | null;
  path_name: string | null;
  priority: string;
  is_required: boolean;
  assigned_at: string;
  due_at: string | null;
  status: string;
  recurrence: string;
  campaign_name: string | null;
  assigned_by_name: string | null;
  estimated_population: number;
  enrolled: string;
  completed: string;
  overdue: string;
}

export async function listAssignments(
  scope: AccessScope,
  filters: { q?: string; status?: string; courseId?: string; campaignId?: string } = {},
): Promise<AssignmentRow[]> {
  const where: string[] = ["1=1"];
  const params: unknown[] = [];
  if (filters.q) { params.push(`%${filters.q}%`); where.push(`a.title ilike $${params.length}`); }
  if (filters.status) { params.push(filters.status); where.push(`a.status = $${params.length}`); }
  if (isUuid(filters.courseId)) { params.push(filters.courseId); where.push(`a.course_id = $${params.length}::uuid`); }
  if (isUuid(filters.campaignId)) { params.push(filters.campaignId); where.push(`a.campaign_id = $${params.length}::uuid`); }

  const peopleGuard = peopleScopeSql(scope, "p.user_id", "p.primary_location_id");
  return query<AssignmentRow>(
    `select a.id, a.title, a.item_type, a.course_id, c.title as course_title, a.learning_path_id,
            lp.name as path_name, a.priority, a.is_required, a.assigned_at, a.due_at, a.status, a.recurrence,
            tc.name as campaign_name, ab.full_name as assigned_by_name, a.estimated_population,
            count(e.id)::text as enrolled,
            count(e.id) filter (where e.status = 'completed')::text as completed,
            count(e.id) filter (where e.status <> 'completed' and e.due_at < now())::text as overdue
       from assignments a
       left join courses c on c.id = a.course_id
       left join learning_paths lp on lp.id = a.learning_path_id
       left join training_campaigns tc on tc.id = a.campaign_id
       left join v_people ab on ab.user_id = a.assigned_by
       left join enrollments e on e.assignment_id = a.id
       left join v_people p on p.user_id = e.user_id and (${peopleGuard})
      where ${where.join(" and ")}
      group by a.id, c.title, lp.name, tc.name, ab.full_name
      order by a.assigned_at desc
      limit 200`, params);
}

export async function getAssignmentDetail(assignmentId: string) {
  if (!isUuid(assignmentId)) return null;
  const assignment = await queryOne<AssignmentRow & { notes: string | null; grace_period_days: number; reminder_cadence_days: number }>(
    `select a.id, a.title, a.item_type, a.course_id, c.title as course_title, a.learning_path_id, lp.name as path_name,
            a.priority, a.is_required, a.assigned_at, a.due_at, a.status, a.recurrence, tc.name as campaign_name,
            ab.full_name as assigned_by_name, a.estimated_population, a.notes, a.grace_period_days, a.reminder_cadence_days,
            (select count(*) from enrollments e where e.assignment_id = a.id)::text as enrolled,
            (select count(*) from enrollments e where e.assignment_id = a.id and e.status = 'completed')::text as completed,
            (select count(*) from enrollments e where e.assignment_id = a.id and e.status <> 'completed' and e.due_at < now())::text as overdue
       from assignments a
       left join courses c on c.id = a.course_id
       left join learning_paths lp on lp.id = a.learning_path_id
       left join training_campaigns tc on tc.id = a.campaign_id
       left join v_people ab on ab.user_id = a.assigned_by
      where a.id = $1`, [assignmentId]);
  if (!assignment) return null;

  const targets = await query<{ target_type: string; target_id: string | null; label: string | null }>(
    `select t.target_type, t.target_id,
            case t.target_type
              when 'location' then (select name from locations where id = t.target_id)
              when 'franchise_group' then (select name from franchise_groups where id = t.target_id)
              when 'region' then (select name from regions where id = t.target_id)
              when 'role' then (select name from roles where id = t.target_id)
              when 'department' then (select name from departments where id = t.target_id)
              when 'user' then (select full_name from v_people where user_id = t.target_id)
              when 'organization' then 'Entire organization'
              when 'new_hire' then 'All new hires'
            end as label
       from assignment_targets t where t.assignment_id = $1`, [assignmentId]);

  const learners = await query<{
    user_id: string; full_name: string; location_name: string | null; status: string; due_at: string | null;
    completed_at: string | null; score: string | null; enrollment_id: string;
  }>(
    `select p.user_id, p.full_name, p.location_name, e.status, e.due_at, e.completed_at, e.score::text as score, e.id as enrollment_id
       from enrollments e join v_people p on p.user_id = e.user_id
      where e.assignment_id = $1 order by (e.status = 'completed'), p.full_name limit 500`, [assignmentId]);

  return { assignment, targets, learners };
}

export async function estimatePopulation(organizationId: string, targets: AssignmentTarget[]): Promise<number> {
  const users = await resolveTargetPopulation(exec, organizationId, targets);
  return users.length;
}

export interface CreateAssignmentInput {
  organizationId: string;
  title: string;
  itemType: "course" | "learning_path";
  courseId?: string | null;
  learningPathId?: string | null;
  targets: AssignmentTarget[];
  dueAt?: string | null;
  priority?: string;
  isRequired?: boolean;
  gracePeriodDays?: number;
  recurrence?: string;
  reminderCadenceDays?: number;
  campaignId?: string | null;
  notes?: string | null;
  status?: "draft" | "published";
  assignedBy: string;
  ruleId?: string | null;
}

export async function createAssignment(input: CreateAssignmentInput): Promise<{ id: string; enrolled: number }> {
  const population = await resolveTargetPopulation(exec, input.organizationId, input.targets);
  const row = await queryOne<{ id: string }>(
    `insert into assignments (organization_id, title, item_type, course_id, learning_path_id, priority, is_required,
        assigned_by, due_at, grace_period_days, recurrence, reminder_cadence_days, status, campaign_id,
        estimated_population, notes, rule_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning id`,
    [input.organizationId, input.title, input.itemType, input.courseId || null, input.learningPathId || null,
      input.priority ?? "normal", input.isRequired ?? true, input.assignedBy, input.dueAt || null,
      input.gracePeriodDays ?? 0, input.recurrence ?? "none", input.reminderCadenceDays ?? 7,
      input.status ?? "published", input.campaignId || null, population.length, input.notes || null,
      input.ruleId || null]);
  if (!row) throw new Error("Could not create the assignment.");

  for (const target of input.targets) {
    await query(`insert into assignment_targets (assignment_id, target_type, target_id) values ($1,$2,$3)`,
      [row.id, target.target_type, target.target_id]);
  }

  let enrolled = 0;
  if ((input.status ?? "published") === "published") {
    enrolled = await materializeAssignment(row.id);
  }
  return { id: row.id, enrolled };
}

/** Creates the learner enrollments an assignment implies (idempotent). */
export async function materializeAssignment(assignmentId: string): Promise<number> {
  const assignment = await queryOne<{
    id: string; organization_id: string; item_type: string; course_id: string | null;
    learning_path_id: string | null; due_at: string | null; is_required: boolean; priority: string; title: string;
  }>(`select id, organization_id, item_type, course_id, learning_path_id, due_at, is_required, priority, title
        from assignments where id = $1`, [assignmentId]);
  if (!assignment) return 0;

  const targets = await query<AssignmentTarget>(
    `select target_type, target_id from assignment_targets where assignment_id = $1`, [assignmentId]);
  const population = await resolveTargetPopulation(exec, assignment.organization_id, targets);
  if (!population.length) return 0;

  const courseIds: string[] = [];
  if (assignment.item_type === "course" && assignment.course_id) courseIds.push(assignment.course_id);
  if (assignment.item_type === "learning_path" && assignment.learning_path_id) {
    const items = await query<{ course_id: string }>(
      `select course_id from learning_path_items where learning_path_id = $1 and course_id is not null order by position`,
      [assignment.learning_path_id]);
    courseIds.push(...items.map((i) => i.course_id));
  }
  if (!courseIds.length) return 0;

  const courses = await query<{ id: string; title: string; current_version: number; passing_score: string; certification_id: string | null }>(
    `select id, title, current_version, passing_score::text as passing_score, certification_id
       from courses where id = any($1::uuid[])`, [courseIds]);

  let created = 0;
  for (const course of courses) {
    const inserted = await query<{ id: string }>(
      `insert into enrollments (user_id, course_id, course_title, course_version, assignment_id, learning_path_id,
          status, is_required, priority, assigned_at, due_at, passing_score, certification_id, source_system)
       select u, $2, $3, $4, $5, $6, 'not_started', $7, $8, now(), $9, $10, $11, 'Wahlburgers Academy'
         from unnest($1::uuid[]) as u
        where not exists (
          select 1 from enrollments e
           where e.user_id = u and e.course_id = $2 and e.status <> 'completed'
             and (e.assignment_id = $5 or e.assignment_id is null))
       on conflict do nothing
       returning id`,
      [population, course.id, course.title, course.current_version, assignmentId,
        assignment.learning_path_id, assignment.is_required, assignment.priority, assignment.due_at,
        Number(course.passing_score), course.certification_id]);
    created += inserted.length;
  }

  if (assignment.learning_path_id) {
    await query(
      `insert into learning_path_enrollments (user_id, learning_path_id, assigned_at, due_at, progress, status)
       select u, $2, now(), $3, 0, 'in_progress' from unnest($1::uuid[]) as u
       on conflict (user_id, learning_path_id) do nothing`,
      [population, assignment.learning_path_id, assignment.due_at]);
  }

  await notifyMany(population, {
    type: "training_assigned",
    title: `New training assigned: ${assignment.title}`,
    body: assignment.due_at ? `Due ${new Date(assignment.due_at).toLocaleDateString("en-US")}.` : "Available now in My Learning.",
    link: "/my-learning",
  });

  await query(`update assignments set estimated_population = $2 where id = $1`, [assignmentId, population.length]);
  return created;
}

export interface AutomationRule {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_event: string;
  conditions: { all?: Array<{ field: string; op: string; value: unknown }> };
  actions: { assign?: { type: "course" | "learning_path"; id: string; dueInDays?: number; required?: boolean } };
  last_run_at: string | null;
  matches_count: number;
  target_label?: string | null;
}

export async function listAutomationRules(): Promise<AutomationRule[]> {
  return query<AutomationRule>(
    `select r.id, r.name, r.description, r.is_active, r.trigger_event, r.conditions, r.actions,
            r.last_run_at, r.matches_count,
            coalesce(c.title, lp.name) as target_label
       from assignment_rules r
       left join courses c on c.id = (r.actions->'assign'->>'id')::uuid
       left join learning_paths lp on lp.id = (r.actions->'assign'->>'id')::uuid
      order by r.created_at`);
}

interface PersonForRules {
  user_id: string;
  role_code: string | null;
  position_title: string | null;
  primary_location_id: string | null;
  department_code: string | null;
  hire_date: string | null;
  is_new_hire: boolean;
}

function matches(person: PersonForRules, rule: AutomationRule, trigger: string): boolean {
  if (rule.trigger_event !== trigger) return false;
  const conditions = rule.conditions?.all ?? [];
  return conditions.every((cond) => {
    const field = cond.field;
    if (field === "event") return true; // trigger already matched
    const actual =
      field === "is_new_hire" ? person.is_new_hire :
      field === "role_code" ? person.role_code :
      field === "position_title" ? person.position_title :
      field === "location_id" ? person.primary_location_id :
      field === "department_code" ? person.department_code : null;
    switch (cond.op) {
      case "eq": return actual === cond.value;
      case "in": return Array.isArray(cond.value) && cond.value.includes(actual as never);
      case "neq": return actual !== cond.value;
      default: return false;
    }
  });
}

/**
 * Evaluates automated assignment rules for a set of people (or everyone).
 * Returns the number of enrollments created.
 */
export async function applyAutomationRules(input: {
  trigger: "on_create" | "on_transfer" | "on_role_change" | "nightly";
  userIds?: string[];
  actorId?: string;
  ruleId?: string;
}): Promise<number> {
  const rules = (await listAutomationRules()).filter((r) => r.is_active && (!input.ruleId || r.id === input.ruleId));
  if (!rules.length) return 0;

  const people = await query<PersonForRules>(
    `select p.user_id, p.role_code, p.position_title, p.primary_location_id, d.code as department_code,
            p.hire_date, (p.hire_date >= current_date - interval '60 days') as is_new_hire
       from v_people p
       left join departments d on d.id = p.department_id
      where p.status in ('active','invited')
        ${input.userIds?.length ? `and p.user_id = any($1::uuid[])` : ""}`,
    input.userIds?.length ? [input.userIds] : []);

  let created = 0;
  for (const rule of rules) {
    const trigger = input.ruleId ? rule.trigger_event : input.trigger;
    const matched = people.filter((p) => matches(p, rule, trigger));
    if (!matched.length) continue;
    const action = rule.actions?.assign;
    if (!action?.id) continue;

    const org = await queryOne<{ organization_id: string }>(`select organization_id from users where id = $1`, [matched[0].user_id]);
    if (!org) continue;

    const dueAt = action.dueInDays
      ? new Date(Date.now() + action.dueInDays * 86400000).toISOString()
      : null;
    const label = action.type === "course"
      ? (await queryOne<{ title: string }>(`select title from courses where id = $1`, [action.id]))?.title
      : (await queryOne<{ name: string }>(`select name from learning_paths where id = $1`, [action.id]))?.name;

    const result = await createAssignment({
      organizationId: org.organization_id,
      title: `${rule.name} — ${label ?? "training"}`,
      itemType: action.type,
      courseId: action.type === "course" ? action.id : null,
      learningPathId: action.type === "learning_path" ? action.id : null,
      targets: matched.map((p) => ({ target_type: "user", target_id: p.user_id })),
      dueAt,
      isRequired: action.required ?? true,
      assignedBy: input.actorId ?? matched[0].user_id,
      notes: `Generated automatically by the rule "${rule.name}".`,
      ruleId: rule.id,
      status: "published",
    });
    created += result.enrolled;
    await query(
      `update assignment_rules set last_run_at = now(), matches_count = matches_count + $2 where id = $1`,
      [rule.id, matched.length]);
  }
  return created;
}
