"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { query, queryOne } from "@/lib/db/client";
import { assertPermission, assertUser } from "@/lib/auth/guard";
import { canAccessLocation, isUuid } from "@/lib/rbac/scope";
import { notify, notifyMany } from "@/lib/services/notifications";
import { logAudit } from "@/lib/services/audit";
import { evaluateEnrollment, recordModuleProgress } from "@/lib/services/progress";

/** Instructor-led training: scheduling, registration and attendance. */

const sessionSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  event_type: z.string().min(2),
  date: z.string().min(1),
  start_time: z.string().min(1),
  end_time: z.string().min(1),
  location_id: z.string().optional(),
  virtual_link: z.string().optional(),
  capacity: z.coerce.number().min(1).max(500).optional(),
  course_id: z.string().optional(),
  materials: z.string().optional(),
  instructor_user_id: z.string().optional(),
});

export async function createTrainingSession(formData: FormData): Promise<void> {
  const actor = await assertPermission(["live_training.manage", "training.schedule"]);
  const parsed = sessionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/calendar/new?toast=${encodeURIComponent("Please complete every required field.")}&tone=error`);
  }
  const data = parsed.data;
  if (data.location_id && !canAccessLocation(actor.scope, data.location_id)) {
    redirect(`/calendar/new?toast=${encodeURIComponent("That restaurant is outside your access.")}&tone=error`);
  }

  const startsAt = new Date(`${data.date}T${data.start_time}`);
  const endsAt = new Date(`${data.date}T${data.end_time}`);
  const row = await queryOne<{ id: string }>(
    `insert into training_events (organization_id, title, description, event_type, instructor_user_id, location_id,
        virtual_link, starts_at, ends_at, capacity, materials, course_id, status, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'scheduled',$13) returning id`,
    [actor.organizationId, data.title, data.description || null, data.event_type,
      data.instructor_user_id || actor.id, data.location_id || null, data.virtual_link || null,
      startsAt.toISOString(), endsAt.toISOString(), data.capacity ?? null, data.materials || null,
      data.course_id || null, actor.id]);

  // Auto-invite the restaurant team for location-based sessions.
  if (row && data.location_id) {
    const team = await query<{ user_id: string }>(
      `select user_id from v_people where primary_location_id = $1 and status = 'active' limit 40`, [data.location_id]);
    for (const member of team) {
      await query(`insert into training_attendees (training_event_id, user_id, status) values ($1,$2,'registered')
                   on conflict do nothing`, [row.id, member.user_id]);
    }
    await notifyMany(team.map((t) => t.user_id), {
      type: "training_scheduled", title: `Training session scheduled: ${data.title}`,
      body: `${startsAt.toLocaleString("en-US", { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`,
      link: `/calendar/${row.id}`,
    });
  }

  await logAudit(actor, { action: "training.session_created", entityType: "training_event", entityId: row?.id, entityLabel: data.title, locationId: data.location_id || null });
  revalidatePath("/calendar");
  redirect(`/calendar/${row?.id}?toast=${encodeURIComponent("Training session scheduled")}`);
}

export async function registerForSession(formData: FormData): Promise<void> {
  const user = await assertUser();
  const eventId = String(formData.get("event_id") ?? "");
  if (!isUuid(eventId)) return;
  await query(
    `insert into training_attendees (training_event_id, user_id, status) values ($1,$2,'registered')
     on conflict (training_event_id, user_id) do update set status = 'registered'`, [eventId, user.id]);
  await logAudit(user, { action: "training.session_registered", entityType: "training_event", entityId: eventId });
  revalidatePath(`/calendar/${eventId}`);
}

export async function cancelRegistration(formData: FormData): Promise<void> {
  const user = await assertUser();
  const eventId = String(formData.get("event_id") ?? "");
  if (!isUuid(eventId)) return;
  await query(`update training_attendees set status = 'canceled' where training_event_id = $1 and user_id = $2`, [eventId, user.id]);
  revalidatePath(`/calendar/${eventId}`);
}

/**
 * Records attendance. Marking someone "attended" or "completed" also completes
 * the instructor-led module on their enrollment for the linked course, so live
 * training lands on the transcript exactly like online training.
 */
export async function recordAttendance(formData: FormData): Promise<void> {
  const actor = await assertPermission(["live_training.manage", "training.schedule"]);
  const eventId = String(formData.get("event_id") ?? "");
  if (!isUuid(eventId)) return;

  const event = await queryOne<{ id: string; title: string; course_id: string | null; location_id: string | null }>(
    `select id, title, course_id, location_id from training_events where id = $1`, [eventId]);
  if (!event) return;
  if (event.location_id && !canAccessLocation(actor.scope, event.location_id)) {
    throw new Error("That session is outside your access.");
  }

  const attendees = await query<{ id: string; user_id: string }>(
    `select id, user_id from training_attendees where training_event_id = $1`, [eventId]);

  let completions = 0;
  for (const attendee of attendees) {
    const status = String(formData.get(`status_${attendee.id}`) ?? "");
    if (!["registered", "attended", "no_show", "canceled", "completed"].includes(status)) continue;
    await query(
      `update training_attendees set status = $2, checked_in_at = case when $2 in ('attended','completed') then now() else null end
        where id = $1`, [attendee.id, status]);

    if (["attended", "completed"].includes(status) && event.course_id) {
      const enrollment = await queryOne<{ id: string; course_version: number }>(
        `select id, course_version from enrollments
          where user_id = $1 and course_id = $2 and status <> 'completed' order by assigned_at desc limit 1`,
        [attendee.user_id, event.course_id]);
      if (enrollment) {
        const modules = await query<{ id: string }>(
          `select id from course_modules where course_id = $1 and course_version = $2 and module_type in ('ilt','virtual','manager_validation','checklist')`,
          [event.course_id, enrollment.course_version]);
        for (const mod of modules) {
          await recordModuleProgress({ enrollmentId: enrollment.id, moduleId: mod.id, status: "completed", data: { attendedEvent: eventId } });
        }
        const result = await evaluateEnrollment(enrollment.id);
        if (result.completed) completions += 1;
      }
      await notify({
        userId: attendee.user_id, type: "training_completed", title: `Attendance recorded: ${event.title}`,
        body: "Your attendance has been added to your training record.", link: "/my-learning",
      });
    }
  }

  await query(`update training_events set status = 'completed' where id = $1 and ends_at < now()`, [eventId]);
  await logAudit(actor, {
    action: "training.attendance_recorded", entityType: "training_event", entityId: eventId,
    entityLabel: `${event.title} — ${attendees.length} attendees, ${completions} course completions`,
  });
  revalidatePath(`/calendar/${eventId}`);
  redirect(`/calendar/${eventId}?toast=${encodeURIComponent(`Attendance recorded${completions ? ` · ${completions} course completions` : ""}`)}`);
}

export async function cancelSession(formData: FormData): Promise<void> {
  const actor = await assertPermission("live_training.manage");
  const eventId = String(formData.get("event_id") ?? "");
  if (!isUuid(eventId)) return;
  const event = await queryOne<{ title: string }>(`select title from training_events where id = $1`, [eventId]);
  await query(`update training_events set status = 'canceled' where id = $1`, [eventId]);
  const attendees = await query<{ user_id: string }>(`select user_id from training_attendees where training_event_id = $1`, [eventId]);
  await notifyMany(attendees.map((a) => a.user_id), {
    type: "training_changed", title: `Session canceled: ${event?.title ?? "Training"}`,
    body: "This training session has been canceled.", link: "/calendar",
  });
  await logAudit(actor, { action: "training.session_canceled", entityType: "training_event", entityId: eventId, entityLabel: event?.title });
  revalidatePath("/calendar");
  redirect(`/calendar?toast=${encodeURIComponent("Session canceled and attendees notified")}`);
}
