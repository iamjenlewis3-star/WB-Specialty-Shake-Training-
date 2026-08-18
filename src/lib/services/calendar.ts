import "server-only";
import { query, queryOne } from "@/lib/db/client";
import type { AccessScope } from "@/lib/rbac/scope";
import { locationScopeSql, isUuid } from "@/lib/rbac/scope";

/** Training calendar: instructor-led sessions, virtual training and store blocks. */

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  event_type: string;
  starts_at: string;
  ends_at: string;
  location_id: string | null;
  location_name: string | null;
  virtual_link: string | null;
  capacity: number | null;
  instructor_name: string | null;
  course_id: string | null;
  course_title: string | null;
  learner_user_id: string | null;
  learner_name: string | null;
  status: string;
  registered: string;
  attended: string;
  my_status: string | null;
}

export const EVENT_TYPE_LABELS: Record<string, string> = {
  ilt: "Instructor-led",
  virtual: "Virtual training",
  orientation: "Orientation",
  certification: "Certification",
  manager_training: "Manager training",
  corporate: "Corporate training",
  workshop: "Workshop",
  deadline: "Training deadline",
  training_block: "Store training block",
};

export async function listEvents(
  scope: AccessScope,
  userId: string,
  opts: { from: string; to: string; type?: string; locationId?: string; mineOnly?: boolean },
): Promise<CalendarEvent[]> {
  const where: string[] = ["te.starts_at >= $2::timestamptz", "te.starts_at < $3::timestamptz"];
  const params: unknown[] = [userId, opts.from, opts.to];
  if (opts.type) { params.push(opts.type); where.push(`te.event_type = $${params.length}`); }
  if (isUuid(opts.locationId)) { params.push(opts.locationId); where.push(`te.location_id = $${params.length}::uuid`); }

  // Learners see their own sessions and blocks; leaders see everything in scope.
  const visibility = scope.selfOnly
    ? `(te.learner_user_id = $1 or exists (select 1 from training_attendees ta where ta.training_event_id = te.id and ta.user_id = $1))`
    : `(te.location_id is null or ${locationScopeSql(scope, "te.location_id")}
        or te.learner_user_id = $1
        or exists (select 1 from training_attendees ta where ta.training_event_id = te.id and ta.user_id = $1))`;
  where.push(visibility);
  if (opts.mineOnly) {
    where.push(`(te.learner_user_id = $1 or exists (select 1 from training_attendees ta where ta.training_event_id = te.id and ta.user_id = $1))`);
  }

  return query<CalendarEvent>(
    `select te.id, te.title, te.description, te.event_type, te.starts_at, te.ends_at, te.location_id,
            l.name as location_name, te.virtual_link, te.capacity, i.full_name as instructor_name,
            te.course_id, c.title as course_title, te.learner_user_id, lp.full_name as learner_name, te.status,
            (select count(*) from training_attendees ta where ta.training_event_id = te.id and ta.status <> 'canceled')::text as registered,
            (select count(*) from training_attendees ta where ta.training_event_id = te.id and ta.status in ('attended','completed'))::text as attended,
            (select ta.status from training_attendees ta where ta.training_event_id = te.id and ta.user_id = $1) as my_status
       from training_events te
       left join locations l on l.id = te.location_id
       left join v_people i on i.user_id = te.instructor_user_id
       left join v_people lp on lp.user_id = te.learner_user_id
       left join courses c on c.id = te.course_id
      where ${where.join(" and ")}
      order by te.starts_at asc
      limit 500`, params);
}

export async function getEvent(eventId: string, userId: string) {
  if (!isUuid(eventId)) return null;
  const event = await queryOne<CalendarEvent & { materials: string | null; created_by_name: string | null }>(
    `select te.id, te.title, te.description, te.event_type, te.starts_at, te.ends_at, te.location_id,
            l.name as location_name, te.virtual_link, te.capacity, i.full_name as instructor_name,
            te.course_id, c.title as course_title, te.learner_user_id, lp.full_name as learner_name, te.status,
            te.materials, cb.full_name as created_by_name,
            (select count(*) from training_attendees ta where ta.training_event_id = te.id and ta.status <> 'canceled')::text as registered,
            (select count(*) from training_attendees ta where ta.training_event_id = te.id and ta.status in ('attended','completed'))::text as attended,
            (select ta.status from training_attendees ta where ta.training_event_id = te.id and ta.user_id = $2) as my_status
       from training_events te
       left join locations l on l.id = te.location_id
       left join v_people i on i.user_id = te.instructor_user_id
       left join v_people lp on lp.user_id = te.learner_user_id
       left join v_people cb on cb.user_id = te.created_by
       left join courses c on c.id = te.course_id
      where te.id = $1`, [eventId, userId]);
  if (!event) return null;

  const attendees = await query<{
    id: string; user_id: string; full_name: string; position_title: string | null; location_name: string | null;
    status: string; checked_in_at: string | null; avatar_color: string;
  }>(
    `select ta.id, ta.user_id, p.full_name, p.position_title, p.location_name, ta.status, ta.checked_in_at, p.avatar_color
       from training_attendees ta join v_people p on p.user_id = ta.user_id
      where ta.training_event_id = $1 order by p.full_name`, [eventId]);

  return { event, attendees };
}

export async function upcomingForUser(userId: string, limit = 10) {
  return query<CalendarEvent>(
    `select te.id, te.title, te.event_type, te.starts_at, te.ends_at, l.name as location_name, te.virtual_link,
            te.status, ta.status as my_status, te.course_id, c.title as course_title,
            te.location_id, te.capacity, te.description, te.learner_user_id,
            null as instructor_name, null as learner_name, '0' as registered, '0' as attended
       from training_events te
       left join locations l on l.id = te.location_id
       left join courses c on c.id = te.course_id
       left join training_attendees ta on ta.training_event_id = te.id and ta.user_id = $1
      where te.starts_at >= now()
        and (ta.user_id is not null or te.learner_user_id = $1)
      order by te.starts_at limit $2`, [userId, limit]);
}
