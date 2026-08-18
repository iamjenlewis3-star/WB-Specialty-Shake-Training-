"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { query, queryOne } from "@/lib/db/client";
import { assertPermission, assertUser } from "@/lib/auth/guard";
import { canAccessLocation, isUuid } from "@/lib/rbac/scope";
import { notify, notifyMany } from "@/lib/services/notifications";
import { logAudit } from "@/lib/services/audit";

/** Manager-facing training operations: reminders, sign-off, training blocks. */

async function assertPersonInScope(userId: string) {
  const actor = await assertPermission(["users.view", "training.assign"]);
  const person = await queryOne<{ user_id: string; full_name: string; primary_location_id: string | null }>(
    `select user_id, full_name, primary_location_id from v_people where user_id = $1`, [userId]);
  if (!person) throw new Error("Employee not found.");
  if (!canAccessLocation(actor.scope, person.primary_location_id) && actor.id !== person.user_id) {
    throw new Error("That employee is outside your access.");
  }
  return { actor, person };
}

export async function sendReminder(userId: string): Promise<void> {
  const { actor, person } = await assertPersonInScope(userId);
  const overdue = await query<{ course_title: string }>(
    `select coalesce(c.title, e.course_title) as course_title
       from enrollments e left join courses c on c.id = e.course_id
      where e.user_id = $1 and e.status <> 'completed' and e.due_at < now() limit 5`, [userId]);
  const body = overdue.length
    ? `${overdue.length} item${overdue.length === 1 ? "" : "s"} past due, starting with ${overdue[0].course_title}.`
    : "Please check My Learning for your current assignments.";
  await notify({ userId, type: "manager_reminder", title: `Training reminder from ${actor.displayName}`, body, link: "/my-learning" });
  await logAudit(actor, { action: "training.reminder_sent", entityType: "user", entityId: userId, entityLabel: person.full_name });
  revalidatePath("/team");
}

export async function sendBulkReminders(formData: FormData): Promise<void> {
  const actor = await assertPermission("notifications.send");
  const ids = formData.getAll("userIds").map(String).filter(isUuid);
  const inScope = await query<{ user_id: string }>(
    `select user_id from v_people where user_id = any($1::uuid[])
      and (${actor.scope.locationIds === "all" ? "true" : `primary_location_id = any($2::uuid[])`})`,
    actor.scope.locationIds === "all" ? [ids] : [ids, actor.scope.locationIds]);
  const count = await notifyMany(inScope.map((r) => r.user_id), {
    type: "manager_reminder",
    title: `Training reminder from ${actor.displayName}`,
    body: "You have training assignments that need your attention.",
    link: "/my-learning",
  });
  await logAudit(actor, { action: "training.bulk_reminder_sent", entityType: "user", entityLabel: `${count} employees` });
  redirect(`/team?toast=${encodeURIComponent(`Reminder sent to ${count} team members`)}`);
}

const validationSchema = z.object({
  enrollmentId: z.string().uuid(),
  status: z.enum(["meets_standard", "needs_coaching", "reassessment_required"]),
  notes: z.string().max(2000).optional(),
});

/** Practical manager sign-off recorded against the learner's enrollment. */
export async function recordManagerValidation(formData: FormData): Promise<void> {
  const actor = await assertPermission("training.validate");
  const parsed = validationSchema.safeParse({
    enrollmentId: formData.get("enrollmentId"),
    status: formData.get("status"),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) throw new Error("Invalid manager validation submission.");

  const enrollment = await queryOne<{ id: string; user_id: string; course_title: string; primary_location_id: string | null; full_name: string }>(
    `select e.id, e.user_id, coalesce(c.title, e.course_title) as course_title, p.primary_location_id, p.full_name
       from enrollments e
       join v_people p on p.user_id = e.user_id
       left join courses c on c.id = e.course_id
      where e.id = $1`, [parsed.data.enrollmentId]);
  if (!enrollment) throw new Error("Training record not found.");
  if (!canAccessLocation(actor.scope, enrollment.primary_location_id)) throw new Error("That record is outside your access.");

  await query(
    `update enrollments set manager_validation_status = $1, manager_validated_by = $2,
            manager_validated_at = now(), manager_notes = $3,
            status = case when $1 = 'meets_standard' and status <> 'completed' then 'completed' else status end,
            completed_at = case when $1 = 'meets_standard' and completed_at is null then now() else completed_at end
      where id = $4`,
    [parsed.data.status, actor.id, parsed.data.notes ?? null, parsed.data.enrollmentId]);

  await notify({
    userId: enrollment.user_id,
    type: "manager_validation",
    title: `Manager validation recorded: ${enrollment.course_title}`,
    body: parsed.data.status === "meets_standard"
      ? `${actor.displayName} confirmed you meet the standard.`
      : `${actor.displayName} recorded "${parsed.data.status.replace(/_/g, " ")}". Check the notes and follow up.`,
    link: "/my-learning",
  });
  await logAudit(actor, {
    action: "training.manager_validated",
    entityType: "enrollment",
    entityId: parsed.data.enrollmentId,
    entityLabel: `${enrollment.full_name} — ${enrollment.course_title}`,
    newValue: { status: parsed.data.status },
  });
  revalidatePath(`/people/${enrollment.user_id}`);
  revalidatePath("/team");
}

const blockSchema = z.object({
  learnerId: z.string().uuid(),
  courseId: z.string().uuid().optional().or(z.literal("")),
  date: z.string().min(1),
  time: z.string().min(1),
  minutes: z.coerce.number().min(15).max(480),
  title: z.string().max(160).optional(),
});

/** Protected store training block: appears on the learner's Academy calendar. */
export async function scheduleTrainingBlock(formData: FormData): Promise<void> {
  const actor = await assertPermission("training.schedule");
  const parsed = blockSchema.safeParse({
    learnerId: formData.get("learnerId"),
    courseId: formData.get("courseId") ?? "",
    date: formData.get("date"),
    time: formData.get("time"),
    minutes: formData.get("minutes") ?? 30,
    title: String(formData.get("title") ?? ""),
  });
  if (!parsed.success) throw new Error("Please complete every field on the training block form.");

  const learner = await queryOne<{ full_name: string; primary_location_id: string | null }>(
    `select full_name, primary_location_id from v_people where user_id = $1`, [parsed.data.learnerId]);
  if (!learner) throw new Error("Employee not found.");
  if (!canAccessLocation(actor.scope, learner.primary_location_id)) throw new Error("That employee is outside your access.");

  const course = parsed.data.courseId
    ? await queryOne<{ title: string }>(`select title from courses where id = $1`, [parsed.data.courseId])
    : null;
  const startsAt = new Date(`${parsed.data.date}T${parsed.data.time}`);
  const endsAt = new Date(startsAt.getTime() + parsed.data.minutes * 60000);
  const title = parsed.data.title || `Training block — ${course?.title ?? "Academy learning"}`;

  const row = await queryOne<{ id: string }>(
    `insert into training_events (organization_id, title, description, event_type, location_id, starts_at, ends_at,
       capacity, course_id, learner_user_id, status, created_by)
     values ((select organization_id from users where id = $1), $2, $3, 'training_block', $4, $5, $6, 1, $7, $8, 'scheduled', $1)
     returning id`,
    [actor.id, title, "Protected learning time scheduled by the restaurant manager.",
      learner.primary_location_id, startsAt.toISOString(), endsAt.toISOString(),
      parsed.data.courseId || null, parsed.data.learnerId]);

  if (row) {
    await query(`insert into training_attendees (training_event_id, user_id, status) values ($1, $2, 'registered')
                 on conflict do nothing`, [row.id, parsed.data.learnerId]);
  }
  await notify({
    userId: parsed.data.learnerId, type: "training_scheduled", title: "Training time scheduled",
    body: `${actor.displayName} scheduled ${title} on ${startsAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`,
    link: "/calendar",
  });
  await logAudit(actor, {
    action: "training.block_scheduled", entityType: "training_event", entityId: row?.id,
    entityLabel: `${learner.full_name} — ${title}`,
  });
  revalidatePath("/calendar");
  redirect(`/calendar?toast=${encodeURIComponent("Training block scheduled")}`);
}

/** Course feedback captured after completion. */
export async function submitCourseReview(formData: FormData): Promise<void> {
  const user = await assertUser();
  const courseId = String(formData.get("courseId") ?? "");
  const enrollmentId = String(formData.get("enrollmentId") ?? "");
  if (!isUuid(courseId)) throw new Error("Invalid course.");
  const num = (key: string) => {
    const value = Number(formData.get(key));
    return Number.isFinite(value) && value >= 1 && value <= 5 ? value : null;
  };
  await query(
    `insert into course_reviews (course_id, user_id, enrollment_id, rating, useful, easy_to_understand, relevant, more_confident, comments)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [courseId, user.id, isUuid(enrollmentId) ? enrollmentId : null, num("rating") ?? 5, num("useful"),
      num("easy") , num("relevant"), num("confident"), String(formData.get("comments") ?? "").slice(0, 2000) || null]);
  await query(
    `update courses c set rating_avg = sub.avg_rating, rating_count = sub.cnt
       from (select round(avg(rating)::numeric, 2) as avg_rating, count(*) as cnt from course_reviews where course_id = $1) sub
      where c.id = $1`, [courseId]);
  await logAudit(user, { action: "course.reviewed", entityType: "course", entityId: courseId });
  revalidatePath(`/library/${courseId}`);
  redirect(`/library/${courseId}?toast=${encodeURIComponent("Thanks for the feedback")}`);
}
