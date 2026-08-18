import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, MapPin, Users, Video, X } from "lucide-react";
import { requireUser, can } from "@/lib/auth/guard";
import { getEvent, EVENT_TYPE_LABELS } from "@/lib/services/calendar";
import { Avatar, Card, CardBody, CardHeader, DescriptionList, EmptyState, PageHeader, Pill, Table, TableWrap, Td, Th, Tr } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { Select, SubmitButton } from "@/components/ui/interactive";
import { cancelRegistration, cancelSession, recordAttendance, registerForSession } from "@/lib/actions/calendar";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function EventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const user = await requireUser();
  const { eventId } = await params;
  const data = await getEvent(eventId, user.id);
  if (!data) notFound();
  const { event, attendees } = data;
  const canManage = can(user, ["live_training.manage", "training.schedule"]);
  const isPast = new Date(event.starts_at) < new Date();

  return (
    <div className="mx-auto max-w-[1000px] space-y-5">
      <PageHeader
        title={event.title}
        description={event.description}
        breadcrumb={[{ label: "Calendar", href: "/calendar" }, { label: event.title }]}
        actions={
          <>
            {event.my_status && event.my_status !== "canceled" ? (
              <form action={cancelRegistration}>
                <input type="hidden" name="event_id" value={event.id} />
                <SubmitButton variant="outline" size="sm" pendingLabel="Updating…">Cancel my spot</SubmitButton>
              </form>
            ) : (
              <form action={registerForSession}>
                <input type="hidden" name="event_id" value={event.id} />
                <SubmitButton variant="primary" size="sm" pendingLabel="Registering…">Register</SubmitButton>
              </form>
            )}
            {canManage && event.status === "scheduled" ? (
              <form action={cancelSession}>
                <input type="hidden" name="event_id" value={event.id} />
                <SubmitButton variant="ghost" size="sm" pendingLabel="Canceling…"><X size={14} /> Cancel session</SubmitButton>
              </form>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Attendance" subtitle={`${event.registered} registered · ${event.attended} attended`} icon={<Users size={17} />} />
            {attendees.length === 0 ? (
              <EmptyState title="Nobody registered yet" description="Team members can register from the calendar." />
            ) : canManage ? (
              <form action={recordAttendance}>
                <input type="hidden" name="event_id" value={event.id} />
                <TableWrap>
                  <Table className="min-w-[560px]">
                    <thead><tr><Th>Attendee</Th><Th>Position</Th><Th>Location</Th><Th className="w-44">Attendance</Th></tr></thead>
                    <tbody>
                      {attendees.map((a) => (
                        <Tr key={a.id}>
                          <Td>
                            <Link href={`/people/${a.user_id}`} className="flex items-center gap-2.5 hover:text-[var(--accent)]">
                              <Avatar name={a.full_name} color={a.avatar_color} size={28} />
                              <span className="font-medium">{a.full_name}</span>
                            </Link>
                          </Td>
                          <Td className="text-[var(--muted)]">{a.position_title ?? "—"}</Td>
                          <Td className="text-[var(--muted)]">{a.location_name ?? "—"}</Td>
                          <Td>
                            <Select name={`status_${a.id}`} defaultValue={a.status}>
                              <option value="registered">Registered</option>
                              <option value="attended">Attended</option>
                              <option value="completed">Completed</option>
                              <option value="no_show">No-show</option>
                              <option value="canceled">Canceled</option>
                            </Select>
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
                <CardBody className="flex items-center gap-3">
                  <SubmitButton pendingLabel="Saving attendance…">Save attendance</SubmitButton>
                  <span className="text-[12.5px] text-[var(--muted)]">
                    Marking someone attended completes the linked course module on their training record.
                  </span>
                </CardBody>
              </form>
            ) : (
              <TableWrap>
                <Table className="min-w-[420px]">
                  <thead><tr><Th>Attendee</Th><Th>Position</Th><Th>Status</Th></tr></thead>
                  <tbody>
                    {attendees.map((a) => (
                      <Tr key={a.id}>
                        <Td className="font-medium">{a.full_name}</Td>
                        <Td className="text-[var(--muted)]">{a.position_title ?? "—"}</Td>
                        <Td><Pill tone={a.status === "attended" || a.status === "completed" ? "success" : a.status === "no_show" ? "danger" : "info"}>{a.status.replace("_", " ")}</Pill></Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Session details" icon={<CalendarClock size={17} />} />
            <CardBody>
              <DescriptionList
                items={[
                  { label: "Type", value: EVENT_TYPE_LABELS[event.event_type] ?? event.event_type },
                  { label: "Date", value: formatDate(event.starts_at, { weekday: "long" }) },
                  { label: "Time", value: `${new Date(event.starts_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – ${new Date(event.ends_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` },
                  { label: "Location", value: event.location_name ? <span className="flex items-center gap-1"><MapPin size={13} /> {event.location_name}</span> : "—" },
                  { label: "Virtual link", value: event.virtual_link ? <a href={event.virtual_link} className="flex items-center gap-1 text-[var(--accent)] hover:underline"><Video size={13} /> Join</a> : "—" },
                  { label: "Instructor", value: event.instructor_name ?? "—" },
                  { label: "Capacity", value: event.capacity ? `${event.registered} / ${event.capacity}` : `${event.registered} registered` },
                  { label: "Linked course", value: event.course_id ? <Link href={`/library/${event.course_id}`} className="hover:text-[var(--accent)]">{event.course_title}</Link> : "—" },
                  { label: "Status", value: <Pill tone={event.status === "canceled" ? "danger" : isPast ? "neutral" : "success"}>{event.status}</Pill> },
                  { label: "Created by", value: event.created_by_name ?? "—" },
                ]}
              />
              {event.materials ? (
                <div className="mt-4 rounded-lg bg-[var(--surface-2)] p-3">
                  <p className="text-[11.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">Materials</p>
                  <p className="mt-1 text-[13px]">{event.materials}</p>
                </div>
              ) : null}
            </CardBody>
          </Card>
          {event.course_id ? (
            <Card>
              <CardBody>
                <p className="text-[13px] text-[var(--muted)]">
                  Attendance recorded here completes the instructor-led module of{" "}
                  <Link href={`/library/${event.course_id}`} className="font-medium text-[var(--accent)] hover:underline">{event.course_title}</Link>{" "}
                  for each attendee, exactly as if they finished it online.
                </p>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
