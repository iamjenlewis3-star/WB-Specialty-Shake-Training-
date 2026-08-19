import "server-only";
import { query, queryOne } from "@/lib/db/client";
import { getSetting, DEFAULT_INACTIVITY, type InactivityRules } from "./settings";
import { notify, notifyMany } from "./notifications";
import { applyAutomationRules, createAssignment } from "./assignments";
import type { AssignmentTarget } from "@/lib/assignments/targeting";

/**
 * Scheduled maintenance.
 *
 * Everything a nightly job would do in production runs here: certification
 * expiry reminders, due-soon and overdue nudges, recurring assignment cycles,
 * scheduled course publishing, automation-rule evaluation and the inactivity
 * sweep. It is exposed as an on-demand action (Admin → Settings) so the
 * behaviour is demonstrable, and it is the single function a cron/worker would
 * call on a schedule.
 */

export interface AutomationResult {
  certificationReminders: number;
  dueSoonReminders: number;
  overdueReminders: number;
  recurringCycles: number;
  recurringEnrollments: number;
  coursesPublished: number;
  ruleEnrollments: number;
  inactivityFlagged: number;
  inactivityDeactivated: number;
}

export async function runDailyAutomations(actorId: string): Promise<AutomationResult> {
  const result: AutomationResult = {
    certificationReminders: 0, dueSoonReminders: 0, overdueReminders: 0, recurringCycles: 0,
    recurringEnrollments: 0, coursesPublished: 0, ruleEnrollments: 0, inactivityFlagged: 0,
    inactivityDeactivated: 0,
  };

  // 1. Certification expiry reminders at the configured intervals.
  const reminders = await getSetting<{ days: number[] }>("certification_reminders", { days: [90, 60, 30, 14, 7] });
  for (const days of reminders.days) {
    const due = await query<{ user_id: string; certification_name: string | null; expires_at: string }>(
      `select uc.user_id, coalesce(uc.certification_name, c.name) as certification_name, uc.expires_at
         from user_certifications uc
         left join certifications c on c.id = uc.certification_id
         join users u on u.id = uc.user_id
        where u.status = 'active'
          and uc.expires_at::date = (current_date + ($1 || ' days')::interval)::date
          and not exists (
            select 1 from notifications n
             where n.user_id = uc.user_id and n.type = 'certification_expiring'
               and n.created_at > now() - interval '20 hours')`,
      [String(days)]);
    for (const row of due) {
      await notify({
        userId: row.user_id, type: "certification_expiring",
        title: `${row.certification_name ?? "Certification"} expires in ${days} days`,
        body: `Expires ${new Date(row.expires_at).toLocaleDateString("en-US")}. Complete the renewal training to stay certified.`,
        link: "/my-learning",
      });
      result.certificationReminders += 1;
    }
  }

  // 2. Due-soon and overdue nudges.
  const channels = await getSetting("notification_channels", { dueSoonDays: 7, overdueCadenceDays: 3 });
  const dueSoon = await query<{ user_id: string }>(
    `select distinct e.user_id from enrollments e join users u on u.id = e.user_id
      where u.status = 'active' and e.status <> 'completed'
        and e.due_at between now() and now() + ($1 || ' days')::interval
        and not exists (select 1 from notifications n where n.user_id = e.user_id and n.type = 'due_soon'
                         and n.created_at > now() - interval '20 hours')`,
    [String(channels.dueSoonDays ?? 7)]);
  result.dueSoonReminders = await notifyMany(dueSoon.map((r) => r.user_id), {
    type: "due_soon", title: "Training due soon", body: "You have training due in the next few days.", link: "/my-learning",
  });

  const overdue = await query<{ user_id: string }>(
    `select distinct e.user_id from enrollments e join users u on u.id = e.user_id
      where u.status = 'active' and e.status <> 'completed' and e.due_at < now()
        and not exists (select 1 from notifications n where n.user_id = e.user_id and n.type = 'overdue'
                         and n.created_at > now() - ($1 || ' days')::interval)`,
    [String(channels.overdueCadenceDays ?? 3)]);
  result.overdueReminders = await notifyMany(overdue.map((r) => r.user_id), {
    type: "overdue", title: "Overdue training", body: "Training on your plan is past its due date.", link: "/my-learning?filter=overdue",
  });

  // 3. Recurring assignments — open the next cycle once the previous one is due.
  const recurring = await query<{
    id: string; organization_id: string; title: string; item_type: string; course_id: string | null;
    learning_path_id: string | null; recurrence: string; due_at: string | null; is_required: boolean;
    priority: string; grace_period_days: number; reminder_cadence_days: number; campaign_id: string | null;
  }>(
    `select id, organization_id, title, item_type, course_id, learning_path_id, recurrence, due_at,
            is_required, priority, grace_period_days, reminder_cadence_days, campaign_id
       from assignments
      where status = 'published' and recurrence <> 'none' and due_at is not null and due_at < now()
        and not exists (select 1 from assignments next where next.rule_id is null
                          and next.title = assignments.title || ' (next cycle)'
                          and next.assigned_at > now() - interval '25 days')`);
  for (const assignment of recurring) {
    const targets = await query<AssignmentTarget>(
      `select target_type, target_id from assignment_targets where assignment_id = $1`, [assignment.id]);
    if (!targets.length) continue;
    const months = assignment.recurrence === "monthly" ? 1 : assignment.recurrence === "quarterly" ? 3 : 12;
    const nextDue = new Date(assignment.due_at!);
    nextDue.setMonth(nextDue.getMonth() + months);
    const created = await createAssignment({
      organizationId: assignment.organization_id,
      title: `${assignment.title} (next cycle)`,
      itemType: assignment.item_type as "course" | "learning_path",
      courseId: assignment.course_id,
      learningPathId: assignment.learning_path_id,
      targets,
      dueAt: nextDue.toISOString(),
      priority: assignment.priority,
      isRequired: assignment.is_required,
      gracePeriodDays: assignment.grace_period_days,
      recurrence: assignment.recurrence,
      reminderCadenceDays: assignment.reminder_cadence_days,
      campaignId: assignment.campaign_id,
      notes: `Recurring cycle generated automatically from "${assignment.title}".`,
      assignedBy: actorId,
      status: "published",
    });
    result.recurringCycles += 1;
    result.recurringEnrollments += created.enrolled;
  }

  // 4. Publish course versions that were scheduled for release.
  const scheduled = await query<{ course_id: string; version_number: number }>(
    `update course_versions set status = 'published', published_at = now()
      where status = 'scheduled' and scheduled_for <= now()
      returning course_id, version_number`);
  for (const version of scheduled) {
    await query(
      `update courses set status = 'published', current_version = greatest(current_version, $2),
              published_at = coalesce(published_at, now()), updated_at = now() where id = $1`,
      [version.course_id, version.version_number]);
    result.coursesPublished += 1;
  }

  // 5. Nightly automation rules.
  result.ruleEnrollments = await applyAutomationRules({ trigger: "nightly", actorId });

  // 6. Inactivity sweep.
  const rules = await getSetting<InactivityRules>("inactivity_rules", DEFAULT_INACTIVITY);
  if (rules.enabled) {
    const flagged = await query<{ user_id: string; full_name: string; manager_user_id: string | null }>(
      `update users u set flagged_inactive_at = now()
        from employees e where e.user_id = u.id
          and u.status = 'active' and u.flagged_inactive_at is null
          and (u.last_login_at is null or u.last_login_at < now() - ($1 || ' days')::interval)
        returning u.id as user_id,
          coalesce(u.preferred_name, u.first_name) || ' ' || u.last_name as full_name, e.manager_user_id`,
      [String(rules.flagAfterDays)]);
    result.inactivityFlagged = flagged.length;
    if (rules.notifyManager) {
      for (const person of flagged) {
        if (!person.manager_user_id) continue;
        await notify({
          userId: person.manager_user_id, type: "inactive_flagged", title: "Team member flagged as inactive",
          body: `${person.full_name} has not signed in for ${rules.flagAfterDays}+ days.`, link: "/team?inactive=1",
        });
      }
    }
    if (rules.autoDeactivate) {
      const deactivated = await query<{ id: string }>(
        `update users set status = 'deactivated', deactivated_at = now(),
                deactivation_reason = $2, deactivation_trigger = 'inactivity_rule'
          where status = 'active'
            and (last_login_at is null or last_login_at < now() - ($1 || ' days')::interval)
          returning id`,
        [String(rules.autoDeactivateAfterDays), `Inactive for ${rules.autoDeactivateAfterDays}+ days`]);
      result.inactivityDeactivated = deactivated.length;
    }
  }

  return result;
}

export async function lastAutomationRun(): Promise<string | null> {
  const row = await queryOne<{ occurred_at: string }>(
    `select occurred_at from audit_logs where action = 'automation.daily_run' order by occurred_at desc limit 1`);
  return row?.occurred_at ?? null;
}
