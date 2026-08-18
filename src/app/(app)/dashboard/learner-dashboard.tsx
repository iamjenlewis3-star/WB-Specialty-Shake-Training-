import Link from "next/link";
import {
  AlarmClock, ArrowRight, Award, BookOpen, CalendarDays, CheckCircle2, Clock, Flame, GraduationCap,
  ShieldCheck, Sparkles, TrendingUp,
} from "lucide-react";
import { Card, CardBody, CardHeader, EmptyState, KpiTile, Pill, ProgressBar, ProgressRing, SourcePill, StatusPill } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { formatDate, formatDuration, formatRelative, cn } from "@/lib/utils";
import type { CurrentUser } from "@/lib/auth/session";
import {
  continueLearning, learnerSummary, myLearningPaths, myUpcomingEvents, recommendedCourses, requiredTraining,
} from "@/lib/services/learning";
import { listFeed } from "@/lib/services/feed";

function CourseCard({
  href, title, category, color, due, status, progress, minutes, required, source,
}: {
  href: string; title: string; category?: string | null; color?: string | null; due?: string | null;
  status: string; progress: number; minutes?: number | null; required?: boolean; source?: string;
}) {
  const overdue = due ? new Date(due) < new Date() && status !== "completed" : false;
  return (
    <Link href={href} className="group block">
      <Card className="h-full overflow-hidden transition-shadow hover:shadow-[0_6px_20px_rgba(13,21,38,0.10)]">
        <div className="h-1.5" style={{ background: color ?? "var(--wb-navy)" }} />
        <div className="p-4">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {category ? <Pill tone="neutral">{category}</Pill> : null}
            {required ? <Pill tone="accent">Required</Pill> : null}
            {overdue ? <Pill tone="danger">Overdue</Pill> : null}
            {source && source !== "Wahlburgers Academy" ? <SourcePill source={source} /> : null}
          </div>
          <h3 className="line-clamp-2 text-[14.5px] font-semibold group-hover:text-[var(--accent)]">{title}</h3>
          <div className="mt-3">
            <ProgressBar value={progress} tone={status === "completed" ? "success" : overdue ? "danger" : "info"} showLabel size="sm" />
          </div>
          <div className="mt-3 flex items-center justify-between text-[12px] text-[var(--muted)]">
            <span className="flex items-center gap-1"><Clock size={13} />{minutes ? `${minutes} min` : "Self-paced"}</span>
            {due ? <span className={cn(overdue && "font-semibold text-[var(--danger)]")}>Due {formatDate(due)}</span> : <StatusPill status={status} />}
          </div>
        </div>
      </Card>
    </Link>
  );
}

export async function LearnerDashboard({ user }: { user: CurrentUser }) {
  const [summary, inProgress, required, paths, events, recommended, feed] = await Promise.all([
    learnerSummary(user.id),
    continueLearning(user.id, 4),
    requiredTraining(user.id, 6),
    myLearningPaths(user.id),
    myUpcomingEvents(user.id, 4),
    recommendedCourses(user.id, 4),
    listFeed(user, { limit: 4 }),
  ]);

  return (
    <div className="space-y-6">
      {/* Welcome + completion */}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-5 bg-gradient-to-r from-[var(--wb-navy)] to-[var(--wb-navy-600)] p-5 text-white sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="min-w-0">
            <p className="text-[12.5px] uppercase tracking-wide text-white/60">
              {user.positionTitle ?? "Team Member"}{user.locationName ? ` · ${user.locationName}` : ""}
            </p>
            <h1 className="mt-1 text-[26px] font-semibold tracking-tight sm:text-[30px]">
              Welcome back, {user.displayName}
            </h1>
            <p className="mt-1.5 max-w-xl text-[14px] text-white/75">
              {summary.overdue > 0
                ? `You have ${summary.overdue} overdue item${summary.overdue === 1 ? "" : "s"}. Let's clear them today.`
                : summary.in_progress > 0
                ? "Pick up where you left off — you're mid-course."
                : "You're on track. Nice work keeping your training current."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <LinkButton href="/my-learning" variant="accent" size="sm">Go to My Learning</LinkButton>
              <LinkButton href="/library" variant="outline" size="sm" className="border-white/30 bg-transparent text-white hover:bg-white/10">
                Browse the Academy Library
              </LinkButton>
            </div>
          </div>
          <div className="flex items-center gap-5 self-start sm:self-auto">
            <ProgressRing
              value={summary.completion_pct}
              tone={summary.completion_pct >= 90 ? "success" : summary.completion_pct >= 75 ? "warning" : "danger"}
              size={104}
              sublabel="Required"
            />
            <dl className="space-y-1.5 text-[13px]">
              <div className="flex items-center gap-2"><CheckCircle2 size={15} className="text-[#5fdca4]" /><span>{summary.required_complete} of {summary.required_total} required complete</span></div>
              <div className="flex items-center gap-2"><AlarmClock size={15} className="text-[#ff8494]" /><span>{summary.overdue} overdue</span></div>
              <div className="flex items-center gap-2"><Clock size={15} className="text-white/70" /><span>{formatDuration(summary.training_seconds)} training time</span></div>
            </dl>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Due soon" value={summary.due_soon} sublabel="Next 7 days" tone="warning" icon={<AlarmClock size={16} />} href="/my-learning?filter=due_soon" />
        <KpiTile label="In progress" value={summary.in_progress} sublabel="Keep going" tone="info" icon={<BookOpen size={16} />} href="/my-learning?filter=in_progress" />
        <KpiTile label="Certifications" value={summary.certifications} sublabel={`${summary.expiring_certifications} expiring in 60 days`} tone="success" icon={<ShieldCheck size={16} />} href="/achievements" />
        <KpiTile label="Badges earned" value={summary.badges} sublabel={`${summary.completed_total} courses completed`} tone="accent" icon={<Award size={16} />} href="/achievements" />
      </div>

      {inProgress.length > 0 ? (
        <section>
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-[16px] font-semibold tracking-tight">Continue learning</h2>
            <Link href="/my-learning?filter=in_progress" className="flex items-center gap-1 text-[13px] font-medium text-[var(--accent)] hover:underline">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {inProgress.map((e) => (
              <CourseCard
                key={e.id} href={`/learn/${e.id}`} title={e.course_title} category={e.category_name}
                color={e.thumbnail_color} due={e.due_at} status={e.status} progress={Number(e.progress_pct)}
                minutes={e.estimated_minutes} required={e.is_required} source={e.source_system}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-[16px] font-semibold tracking-tight">Required training</h2>
          <Link href="/my-learning?filter=required" className="flex items-center gap-1 text-[13px] font-medium text-[var(--accent)] hover:underline">
            View all <ArrowRight size={14} />
          </Link>
        </div>
        {required.length === 0 ? (
          <Card><EmptyState icon={<CheckCircle2 size={28} />} title="All required training is complete" description="You're fully trained and current. Explore the Academy Library to keep building." /></Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {required.map((e) => (
              <CourseCard
                key={e.id} href={`/learn/${e.id}`} title={e.course_title} category={e.category_name}
                color={e.thumbnail_color} due={e.due_at} status={e.status} progress={Number(e.progress_pct)}
                minutes={e.estimated_minutes} required source={e.source_system}
              />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="My learning paths" subtitle="Structured curriculum for your position" icon={<GraduationCap size={17} />} action={<Link href="/my-learning#paths" className="text-[13px] font-medium text-[var(--accent)] hover:underline">Details</Link>} />
          <CardBody className="space-y-4">
            {paths.length === 0 ? (
              <EmptyState title="No learning paths assigned yet" description="Your manager or Corporate Training will assign a certification path when you're ready." />
            ) : (
              paths.slice(0, 4).map((p) => (
                <div key={p.id}>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <Link href={`/library?path=${p.path_id}`} className="truncate text-[13.5px] font-semibold hover:text-[var(--accent)]">{p.name}</Link>
                    <span className="shrink-0 text-[12px] text-[var(--muted)]">{p.completed_courses}/{p.total_courses} courses</span>
                  </div>
                  <ProgressBar value={Number(p.progress)} tone={Number(p.progress) >= 100 ? "success" : "info"} showLabel />
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Upcoming training" subtitle="Scheduled sessions and blocks" icon={<CalendarDays size={17} />} action={<Link href="/calendar" className="text-[13px] font-medium text-[var(--accent)] hover:underline">Calendar</Link>} />
          <CardBody className="space-y-3">
            {events.length === 0 ? (
              <EmptyState title="Nothing scheduled" description="When your manager schedules training time, it shows up here." />
            ) : (
              events.map((e) => (
                <div key={e.id} className="flex gap-3">
                  <div className="flex size-11 shrink-0 flex-col items-center justify-center rounded-lg bg-[var(--surface-3)] text-center">
                    <span className="text-[10px] uppercase text-[var(--muted)]">{formatDate(e.starts_at, { month: "short", day: undefined, year: undefined })}</span>
                    <span className="text-[15px] font-semibold leading-none">{new Date(e.starts_at).getDate()}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium">{e.title}</p>
                    <p className="text-[12px] text-[var(--muted)]">
                      {formatDate(e.starts_at, { hour: "numeric", minute: "2-digit", month: undefined, day: undefined, year: undefined })}
                      {e.location_name ? ` · ${e.location_name}` : e.virtual_link ? " · Virtual" : ""}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Recommended for you" subtitle="Based on your role and what your restaurant is completing" icon={<Sparkles size={17} />} />
          <CardBody>
            <div className="grid gap-3 sm:grid-cols-2">
              {recommended.map((c) => (
                <Link key={c.id} href={`/library/${c.id}`} className="group flex gap-3 rounded-lg border border-[var(--border)] p-3 hover:border-[var(--accent)]">
                  <span className="mt-0.5 size-9 shrink-0 rounded-lg" style={{ background: c.thumbnail_color }} aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-semibold group-hover:text-[var(--accent)]">{c.title}</span>
                    <span className="mt-0.5 block text-[12px] text-[var(--muted)]">{c.reason}</span>
                    <span className="mt-1 flex items-center gap-2 text-[11.5px] text-[var(--muted-2)]">
                      <Clock size={12} />{c.estimated_minutes} min
                      {Number(c.rating_avg) > 0 ? <span>★ {Number(c.rating_avg).toFixed(1)}</span> : null}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Academy Feed" subtitle="What's happening across the system" icon={<TrendingUp size={17} />} action={<Link href="/feed" className="text-[13px] font-medium text-[var(--accent)] hover:underline">Open</Link>} />
          <CardBody className="space-y-3.5">
            {feed.map((post) => (
              <div key={post.id} className="border-b border-[var(--border)] pb-3 last:border-b-0 last:pb-0">
                <div className="mb-1 flex items-center gap-2">
                  <Pill tone={post.post_type === "recognition" ? "success" : post.post_type === "announcement" ? "accent" : "info"}>
                    {post.post_type.replace("_", " ")}
                  </Pill>
                  <span className="text-[11.5px] text-[var(--muted-2)]">{formatRelative(post.created_at)}</span>
                </div>
                {post.title ? <p className="text-[13px] font-semibold">{post.title}</p> : null}
                <p className="line-clamp-2 text-[12.5px] text-[var(--muted)]">{post.body}</p>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      {summary.legacy_records > 0 ? (
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-[var(--info-bg)] text-[var(--info)]"><Flame size={17} /></span>
              <div>
                <p className="text-[13.5px] font-semibold">Your full training history came with you</p>
                <p className="text-[12.5px] text-[var(--muted)]">
                  {summary.legacy_records} record{summary.legacy_records === 1 ? "" : "s"} from the previous LMS are on your transcript alongside your Academy training.
                </p>
              </div>
            </div>
            <LinkButton href={`/people/${user.id}/transcript`} variant="outline" size="sm">View my transcript</LinkButton>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
