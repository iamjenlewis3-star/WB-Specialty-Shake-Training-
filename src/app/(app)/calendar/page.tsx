import Link from "next/link";
import { CalendarPlus, ChevronLeft, ChevronRight, Clock, MapPin, Plus, Video } from "lucide-react";
import { requireUser, can } from "@/lib/auth/guard";
import { listEvents, EVENT_TYPE_LABELS } from "@/lib/services/calendar";
import { filterOptions } from "@/lib/services/people";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Pill } from "@/components/ui/primitives";
import { LinkButton, buttonClass } from "@/components/ui/button";
import { FilterSelect } from "@/components/ui/interactive";
import { cn, formatDate } from "@/lib/utils";

export const metadata = { title: "Training Calendar" };
export const dynamic = "force-dynamic";

type View = "month" | "week" | "day" | "agenda";

const TYPE_TONES: Record<string, string> = {
  ilt: "bg-[var(--info-bg)] text-[var(--info)]",
  virtual: "bg-[var(--info-bg)] text-[var(--info)]",
  orientation: "bg-[var(--success-bg)] text-[var(--success)]",
  certification: "bg-[var(--warning-bg)] text-[var(--warning)]",
  training_block: "bg-[var(--neutral-bg)] text-[var(--muted)]",
  workshop: "bg-[var(--danger-bg)] text-[var(--danger)]",
  corporate: "bg-[var(--info-bg)] text-[var(--info)]",
  deadline: "bg-[var(--danger-bg)] text-[var(--danger)]",
};

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function isoDay(d: Date) { return d.toISOString().slice(0, 10); }

function rangeFor(view: View, anchor: Date) {
  if (view === "day") return { from: startOfDay(anchor), to: addDays(startOfDay(anchor), 1) };
  if (view === "week") {
    const start = addDays(startOfDay(anchor), -anchor.getDay());
    return { from: start, to: addDays(start, 7) };
  }
  if (view === "agenda") return { from: startOfDay(anchor), to: addDays(startOfDay(anchor), 30) };
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = addDays(startOfDay(first), -first.getDay());
  return { from: gridStart, to: addDays(gridStart, 42) };
}

export default async function CalendarPage({
  searchParams,
}: { searchParams: Promise<{ view?: string; date?: string; type?: string; location?: string; mine?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const view = (["month", "week", "day", "agenda"].includes(sp.view ?? "") ? sp.view : "month") as View;
  const anchor = sp.date ? new Date(`${sp.date}T12:00:00`) : new Date();
  const { from, to } = rangeFor(view, anchor);

  const [events, options] = await Promise.all([
    listEvents(user.scope, user.id, {
      from: from.toISOString(), to: to.toISOString(), type: sp.type, locationId: sp.location, mineOnly: sp.mine === "1",
    }),
    filterOptions(user.scope),
  ]);

  const byDay = new Map<string, typeof events>();
  for (const event of events) {
    const key = isoDay(new Date(event.starts_at));
    byDay.set(key, [...(byDay.get(key) ?? []), event]);
  }

  const shift = (delta: number) => {
    const next = new Date(anchor);
    if (view === "month") next.setMonth(next.getMonth() + delta);
    else if (view === "week") next.setDate(next.getDate() + delta * 7);
    else next.setDate(next.getDate() + delta * (view === "agenda" ? 30 : 1));
    return isoDay(next);
  };
  const linkFor = (params: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    Object.entries({ view, date: isoDay(anchor), type: sp.type, location: sp.location, mine: sp.mine, ...params })
      .forEach(([k, v]) => { if (v) p.set(k, v); });
    return `/calendar?${p.toString()}`;
  };

  const title = view === "month"
    ? anchor.toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : view === "week"
    ? `Week of ${formatDate(rangeFor("week", anchor).from)}`
    : view === "day"
    ? anchor.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : `Next 30 days from ${formatDate(anchor)}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Training Calendar"
        description="Instructor-led sessions, virtual training, orientations and protected store training blocks."
        actions={
          <>
            {can(user, "training.schedule") ? (
              <LinkButton href="/calendar/schedule" variant="outline" size="sm"><CalendarPlus size={15} /> Training block</LinkButton>
            ) : null}
            {can(user, ["live_training.manage", "training.schedule"]) ? (
              <LinkButton href="/calendar/new" variant="primary" size="sm"><Plus size={15} /> New session</LinkButton>
            ) : null}
          </>
        }
      />

      <Card>
        <CardBody className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Link href={linkFor({ date: shift(-1) })} className={buttonClass("outline", "icon")} aria-label="Previous"><ChevronLeft size={16} /></Link>
            <Link href={linkFor({ date: isoDay(new Date()) })} className={buttonClass("outline", "sm")}>Today</Link>
            <Link href={linkFor({ date: shift(1) })} className={buttonClass("outline", "icon")} aria-label="Next"><ChevronRight size={16} /></Link>
          </div>
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-[var(--border)] p-0.5">
              {(["month", "week", "day", "agenda"] as View[]).map((v) => (
                <Link
                  key={v} href={linkFor({ view: v })}
                  className={cn("rounded-md px-2.5 py-1 text-[12.5px] font-medium capitalize",
                    view === v ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "text-[var(--muted)] hover:text-[var(--foreground)]")}
                >
                  {v}
                </Link>
              ))}
            </div>
            <FilterSelect paramKey="type" label="Event type" allLabel="All event types"
              options={Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
            {user.scope.level !== "self" ? (
              <FilterSelect paramKey="location" label="Location" allLabel="All locations"
                options={options.locations.map((l) => ({ value: l.id, label: l.name }))} />
            ) : null}
            <FilterSelect paramKey="mine" label="Scope" allLabel="Everything I can see" options={[{ value: "1", label: "Only my training" }]} />
          </div>
        </CardBody>
      </Card>

      {view === "month" ? (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-7 border-b border-[var(--border)] bg-[var(--surface-2)] sm:grid">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="px-2 py-2 text-center text-[11.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-7">
            {Array.from({ length: 42 }).map((_, i) => {
              const day = addDays(from, i);
              const key = isoDay(day);
              const dayEvents = byDay.get(key) ?? [];
              const isCurrentMonth = day.getMonth() === anchor.getMonth();
              const isToday = key === isoDay(new Date());
              if (!isCurrentMonth && dayEvents.length === 0) {
                return <div key={key} className="hidden min-h-[104px] border-b border-r border-[var(--border)] bg-[var(--surface-2)]/40 sm:block" />;
              }
              return (
                <div
                  key={key}
                  className={cn(
                    "min-h-[104px] border-b border-r border-[var(--border)] p-1.5",
                    !isCurrentMonth && "bg-[var(--surface-2)]/40",
                    dayEvents.length === 0 && "hidden sm:block",
                  )}
                >
                  <div className="mb-1 flex items-center gap-1.5">
                    <span className={cn("flex size-6 items-center justify-center rounded-full text-[12px] font-semibold",
                      isToday ? "bg-[var(--accent)] text-white" : "text-[var(--muted)]")}>
                      {day.getDate()}
                    </span>
                    <span className="text-[11px] text-[var(--muted-2)] sm:hidden">
                      {day.toLocaleDateString("en-US", { weekday: "short", month: "short" })}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {dayEvents.slice(0, 3).map((e) => (
                      <Link
                        key={e.id} href={`/calendar/${e.id}`}
                        className={cn("block truncate rounded px-1.5 py-1 text-[11.5px] font-medium", TYPE_TONES[e.event_type] ?? "bg-[var(--surface-3)]")}
                        title={`${e.title} · ${new Date(e.starts_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`}
                      >
                        {new Date(e.starts_at).toLocaleTimeString("en-US", { hour: "numeric" })} {e.title}
                      </Link>
                    ))}
                    {dayEvents.length > 3 ? (
                      <Link href={linkFor({ view: "day", date: key })} className="block px-1.5 text-[11px] font-medium text-[var(--accent)]">
                        +{dayEvents.length - 3} more
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      {view === "week" ? (
        <div className="grid gap-3 lg:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => {
            const day = addDays(from, i);
            const dayEvents = byDay.get(isoDay(day)) ?? [];
            return (
              <Card key={i}>
                <CardHeader title={day.toLocaleDateString("en-US", { weekday: "short", day: "numeric" })} subtitle={`${dayEvents.length} events`} />
                <CardBody className="space-y-2">
                  {dayEvents.length === 0 ? <p className="text-[12px] text-[var(--muted-2)]">No training</p> : dayEvents.map((e) => (
                    <Link key={e.id} href={`/calendar/${e.id}`} className="block rounded-lg border border-[var(--border)] p-2 hover:border-[var(--accent)]">
                      <p className="truncate text-[12.5px] font-medium">{e.title}</p>
                      <p className="text-[11px] text-[var(--muted)]">
                        {new Date(e.starts_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                        {e.location_name ? ` · ${e.location_name}` : ""}
                      </p>
                    </Link>
                  ))}
                </CardBody>
              </Card>
            );
          })}
        </div>
      ) : null}

      {view === "day" || view === "agenda" ? (
        <Card>
          <CardHeader title={view === "day" ? "Day schedule" : "Agenda"} subtitle={`${events.length} sessions`} />
          <CardBody className="space-y-3">
            {events.length === 0 ? (
              <EmptyState title="Nothing scheduled" description="Schedule a session or a protected training block to fill this calendar." />
            ) : events.map((e) => (
              <Link key={e.id} href={`/calendar/${e.id}`} className="flex flex-wrap items-center gap-4 rounded-xl border border-[var(--border)] p-3 hover:border-[var(--accent)]">
                <div className="flex w-16 shrink-0 flex-col items-center rounded-lg bg-[var(--surface-2)] py-2">
                  <span className="text-[10.5px] uppercase text-[var(--muted)]">{new Date(e.starts_at).toLocaleDateString("en-US", { month: "short" })}</span>
                  <span className="text-[19px] font-semibold leading-none">{new Date(e.starts_at).getDate()}</span>
                  <span className="mt-0.5 text-[10.5px] text-[var(--muted)]">{new Date(e.starts_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[14px] font-semibold">{e.title}</p>
                    <Pill tone="neutral">{EVENT_TYPE_LABELS[e.event_type] ?? e.event_type}</Pill>
                    {e.my_status ? <Pill tone={e.my_status === "attended" ? "success" : "info"}>{e.my_status.replace("_", " ")}</Pill> : null}
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-3 text-[12.5px] text-[var(--muted)]">
                    <span className="flex items-center gap-1"><Clock size={13} />
                      {new Date(e.starts_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}–
                      {new Date(e.ends_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </span>
                    {e.location_name ? <span className="flex items-center gap-1"><MapPin size={13} /> {e.location_name}</span> : null}
                    {e.virtual_link ? <span className="flex items-center gap-1"><Video size={13} /> Virtual</span> : null}
                    {e.instructor_name ? <span>Instructor: {e.instructor_name}</span> : null}
                    {e.learner_name ? <span>Learner: {e.learner_name}</span> : null}
                  </p>
                </div>
                <Pill tone="info">{e.registered} registered</Pill>
              </Link>
            ))}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
