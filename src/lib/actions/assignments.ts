"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query, queryOne } from "@/lib/db/client";
import { assertPermission } from "@/lib/auth/guard";
import { isUuid, canAccessLocation } from "@/lib/rbac/scope";
import { logAudit } from "@/lib/services/audit";
import { notifyMany } from "@/lib/services/notifications";
import { applyAutomationRules, createAssignment, estimatePopulation, materializeAssignment } from "@/lib/services/assignments";
import type { AssignmentTarget, TargetType } from "@/lib/assignments/targeting";

/** Assignment engine actions: publish, remind, automate. */

function parseTargets(formData: FormData, organizationId: string): AssignmentTarget[] {
  const targets: AssignmentTarget[] = [];
  const push = (type: TargetType, ids: string[]) => {
    for (const id of ids) if (isUuid(id)) targets.push({ target_type: type, target_id: id });
  };
  if (formData.get("target_organization") === "on") targets.push({ target_type: "organization", target_id: organizationId });
  if (formData.get("target_new_hire") === "on") targets.push({ target_type: "new_hire", target_id: null });
  push("location", formData.getAll("target_locations").map(String));
  push("franchise_group", formData.getAll("target_groups").map(String));
  push("region", formData.getAll("target_regions").map(String));
  push("role", formData.getAll("target_roles").map(String));
  push("department", formData.getAll("target_departments").map(String));
  push("user", formData.getAll("target_users").map(String));
  return targets;
}

/** Live audience estimate used by the assignment builder before publishing. */
export async function estimateAssignmentAudience(formDataLike: Record<string, string[]>): Promise<number> {
  const actor = await assertPermission("training.assign");
  const formData = new FormData();
  Object.entries(formDataLike).forEach(([key, values]) => values.forEach((v) => formData.append(key, v)));
  const targets = parseTargets(formData, actor.organizationId);
  if (!targets.length) return 0;
  return estimatePopulation(actor.organizationId, targets);
}

export async function createAssignmentAction(formData: FormData): Promise<void> {
  const actor = await assertPermission("training.assign");
  const itemType = String(formData.get("item_type") ?? "course") as "course" | "learning_path";
  const courseId = String(formData.get("course_id") ?? "");
  const learningPathId = String(formData.get("learning_path_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const dueAt = String(formData.get("due_at") ?? "") || null;
  const status = String(formData.get("status") ?? "published") as "draft" | "published";

  const targets = parseTargets(formData, actor.organizationId);
  if (!targets.length) redirect(`/admin/assignments/new?toast=${encodeURIComponent("Choose at least one audience.")}&tone=error`);
  if (itemType === "course" && !isUuid(courseId)) redirect(`/admin/assignments/new?toast=${encodeURIComponent("Select a course.")}&tone=error`);
  if (itemType === "learning_path" && !isUuid(learningPathId)) redirect(`/admin/assignments/new?toast=${encodeURIComponent("Select a learning path.")}&tone=error`);

  // Managers may only target restaurants they have access to.
  for (const target of targets) {
    if (target.target_type === "location" && !canAccessLocation(actor.scope, target.target_id)) {
      redirect(`/admin/assignments/new?toast=${encodeURIComponent("One of those restaurants is outside your access.")}&tone=error`);
    }
    if (target.target_type === "organization" && actor.scope.level !== "organization") {
      redirect(`/admin/assignments/new?toast=${encodeURIComponent("Only corporate roles can assign to the entire organization.")}&tone=error`);
    }
  }

  const label = itemType === "course"
    ? (await queryOne<{ title: string }>(`select title from courses where id = $1`, [courseId]))?.title
    : (await queryOne<{ name: string }>(`select name from learning_paths where id = $1`, [learningPathId]))?.name;

  const result = await createAssignment({
    organizationId: actor.organizationId,
    title: title || `${label ?? "Training"} assignment`,
    itemType,
    courseId: itemType === "course" ? courseId : null,
    learningPathId: itemType === "learning_path" ? learningPathId : null,
    targets,
    dueAt: dueAt ? new Date(dueAt).toISOString() : null,
    priority: String(formData.get("priority") ?? "normal"),
    isRequired: formData.get("is_required") === "on",
    gracePeriodDays: Number(formData.get("grace_period_days") ?? 0),
    recurrence: String(formData.get("recurrence") ?? "none"),
    reminderCadenceDays: Number(formData.get("reminder_cadence_days") ?? 7),
    campaignId: String(formData.get("campaign_id") ?? "") || null,
    notes: String(formData.get("notes") ?? "") || null,
    status,
    assignedBy: actor.id,
  });

  await logAudit(actor, {
    action: "training.assigned", entityType: "assignment", entityId: result.id,
    entityLabel: title || label || "Training assignment",
    newValue: { targets, enrolled: result.enrolled, dueAt, status },
  });
  revalidatePath("/admin/assignments");
  redirect(`/admin/assignments/${result.id}?toast=${encodeURIComponent(
    status === "published" ? `Assignment published — ${result.enrolled} learner records created` : "Assignment saved as a draft")}`);
}

export async function publishAssignment(formData: FormData): Promise<void> {
  const actor = await assertPermission("training.assign");
  const assignmentId = String(formData.get("assignment_id") ?? "");
  if (!isUuid(assignmentId)) return;
  await query(`update assignments set status = 'published' where id = $1`, [assignmentId]);
  const enrolled = await materializeAssignment(assignmentId);
  await logAudit(actor, { action: "training.assignment_published", entityType: "assignment", entityId: assignmentId, newValue: { enrolled } });
  revalidatePath(`/admin/assignments/${assignmentId}`);
  redirect(`/admin/assignments/${assignmentId}?toast=${encodeURIComponent(`Published — ${enrolled} learner records created`)}`);
}

export async function archiveAssignment(formData: FormData): Promise<void> {
  const actor = await assertPermission("training.assign");
  const assignmentId = String(formData.get("assignment_id") ?? "");
  if (!isUuid(assignmentId)) return;
  await query(`update assignments set status = 'archived' where id = $1`, [assignmentId]);
  await logAudit(actor, { action: "training.assignment_archived", entityType: "assignment", entityId: assignmentId });
  revalidatePath("/admin/assignments");
  redirect(`/admin/assignments?toast=${encodeURIComponent("Assignment archived — learner records are preserved")}`);
}

export async function remindAssignmentLearners(formData: FormData): Promise<void> {
  const actor = await assertPermission("notifications.send");
  const assignmentId = String(formData.get("assignment_id") ?? "");
  if (!isUuid(assignmentId)) return;
  const assignment = await queryOne<{ title: string; due_at: string | null }>(
    `select title, due_at from assignments where id = $1`, [assignmentId]);
  const learners = await query<{ user_id: string }>(
    `select e.user_id from enrollments e where e.assignment_id = $1 and e.status <> 'completed'`, [assignmentId]);
  const count = await notifyMany(learners.map((l) => l.user_id), {
    type: "manager_reminder",
    title: `Reminder: ${assignment?.title ?? "assigned training"}`,
    body: assignment?.due_at ? `Due ${new Date(assignment.due_at).toLocaleDateString("en-US")}.` : "Please complete this training.",
    link: "/my-learning",
  });
  await logAudit(actor, {
    action: "training.assignment_reminder", entityType: "assignment", entityId: assignmentId,
    entityLabel: `${assignment?.title} — ${count} learners`,
  });
  revalidatePath(`/admin/assignments/${assignmentId}`);
  redirect(`/admin/assignments/${assignmentId}?toast=${encodeURIComponent(`Reminder sent to ${count} learners`)}`);
}

export async function createAutomationRule(formData: FormData): Promise<void> {
  const actor = await assertPermission("rules.manage");
  const name = String(formData.get("name") ?? "").trim();
  const trigger = String(formData.get("trigger_event") ?? "on_create");
  const field = String(formData.get("condition_field") ?? "role_code");
  const op = String(formData.get("condition_op") ?? "eq");
  const value = String(formData.get("condition_value") ?? "");
  const actionType = String(formData.get("action_type") ?? "course") as "course" | "learning_path";
  const actionId = String(formData.get("action_id") ?? "");
  const dueInDays = Number(formData.get("due_in_days") ?? 30);
  if (!name || !isUuid(actionId)) {
    redirect(`/admin/rules?toast=${encodeURIComponent("Name the rule and pick what it assigns.")}&tone=error`);
  }

  const row = await queryOne<{ id: string }>(
    `insert into assignment_rules (organization_id, name, description, is_active, trigger_event, conditions, actions, created_by)
     values ($1,$2,$3,true,$4,$5::jsonb,$6::jsonb,$7) returning id`,
    [actor.organizationId, name, String(formData.get("description") ?? "") || null, trigger,
      JSON.stringify({ all: [{ field, op, value: op === "in" ? value.split(",").map((v) => v.trim()) : value }] }),
      JSON.stringify({ assign: { type: actionType, id: actionId, dueInDays, required: true } }), actor.id]);

  await logAudit(actor, { action: "rule.created", entityType: "assignment_rule", entityId: row?.id, entityLabel: name });
  revalidatePath("/admin/rules");
  redirect(`/admin/rules?toast=${encodeURIComponent("Automation rule created")}`);
}

export async function toggleRule(formData: FormData): Promise<void> {
  const actor = await assertPermission("rules.manage");
  const ruleId = String(formData.get("rule_id") ?? "");
  if (!isUuid(ruleId)) return;
  await query(`update assignment_rules set is_active = not is_active where id = $1`, [ruleId]);
  await logAudit(actor, { action: "rule.toggled", entityType: "assignment_rule", entityId: ruleId });
  revalidatePath("/admin/rules");
}

export async function runRuleNow(formData: FormData): Promise<void> {
  const actor = await assertPermission("rules.manage");
  const ruleId = String(formData.get("rule_id") ?? "");
  if (!isUuid(ruleId)) return;
  const created = await applyAutomationRules({ trigger: "nightly", ruleId, actorId: actor.id });
  await logAudit(actor, { action: "rule.run", entityType: "assignment_rule", entityId: ruleId, newValue: { created } });
  revalidatePath("/admin/rules");
  redirect(`/admin/rules?toast=${encodeURIComponent(`Rule evaluated — ${created} new learner records created`)}`);
}

export async function createCampaign(formData: FormData): Promise<void> {
  const actor = await assertPermission("campaigns.manage");
  const name = String(formData.get("name") ?? "").trim();
  const courseIds = formData.getAll("course_ids").map(String).filter(isUuid);
  if (!name) redirect(`/admin/campaigns?toast=${encodeURIComponent("Name the campaign.")}&tone=error`);

  const row = await queryOne<{ id: string }>(
    `insert into training_campaigns (organization_id, name, description, banner_color, launch_at, due_at, status, created_by)
     values ($1,$2,$3,$4,$5,$6,'active',$7) returning id`,
    [actor.organizationId, name, String(formData.get("description") ?? "") || null,
      String(formData.get("banner_color") ?? "#c8102e"),
      String(formData.get("launch_at") ?? "") || new Date().toISOString(),
      String(formData.get("due_at") ?? "") || null, actor.id]);
  if (row) {
    for (const courseId of courseIds) {
      await query(`insert into campaign_courses (campaign_id, course_id) values ($1,$2) on conflict do nothing`, [row.id, courseId]);
    }
  }
  await logAudit(actor, { action: "campaign.created", entityType: "training_campaign", entityId: row?.id, entityLabel: name });
  revalidatePath("/admin/campaigns");
  redirect(`/admin/campaigns?toast=${encodeURIComponent("Campaign created")}`);
}
