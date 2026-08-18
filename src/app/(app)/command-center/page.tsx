import Link from "next/link";
import {
  Activity, AlertTriangle, Award, BadgeCheck, Building2, CalendarClock, CheckCircle2, Clock, Flame,
  MessageSquare, Radar, Sparkles, Star, TrendingUp, UserMinus, Users,
} from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import {
  campaignPerformance, certificationRisk, courseFeedbackSummary, courseLeaderboard, completionOverTime,
  locationPerformance, recentSystemActivity, recentlyReleasedTraining, systemMetrics, upcomingLiveTraining,
} from "@/lib/services/analytics";
import { getSetting } from "@/lib/services/settings";
import {
  Card, CardBody, CardHeader, EmptyState, PageHeader, Pill, ProgressBar, ProgressRing, SourcePill,
} from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { AreaChartView } from "@/components/charts";
import { formatDate, formatDuration, formatRelative, completionTone, healthBand } from "@/lib/utils";

export const metadata = { title: "Academy Command Center" };
export const dynamic = "force-dynamic";

function MetricTile({
  label, value, sublabel, tone = "neutral", icon,
}: { label: string; value: React.ReactNode; sublabel?: string; tone?: "success" | "warning" | "danger" | "info" | "neutral"; icon: React.ReactNode }) {
  const toneClass = {
    success: "text-[var(--success)]", warning: "text-[var(--warning)]", danger: "text-[var(--danger)]",
    info: "text-[var(--info)]", neutral: "text-white/80",
  }[tone];
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur">
      <div className="flex items-center justify-between">
        <span className="text-[11.5px] font-medium uppercase tracking-wide text-white/55">{label}</span>
        <span className={toneClass}>{icon}</span>
      </div>
      <p className="mt-1.5 text-[28px] font-semibold leading-none tracking-tight tabular-nums text-white">{value}</p>
      {sublabel ? <p className="mt-1.5 text-[12px] text-white/55">{sublabel}</p> : null}
    </div>
  );
}

export default async function CommandCenterPage() {
  const user = await requirePermission("analytics.executive");
  const thresholds = await getSetting<{ green: number; yellow: number }>("risk_thresholds", { green: 90, yellow: 75 });

  const [metrics, locations, trend, campaigns, certRisk, released, events, feedback, activity, topCourses] =
    await Promise.all([
      systemMetrics(user.scope),
      locationPerformance(user.scope),
      completionOverTime(user.scope, {}, 12),
      campaignPerformance(user.scope),
      certificationRisk(user.scope, 60, 8),
      recentlyReleasedTraining(5),
      upcomingLiveTraining(user.scope, 6),
      courseFeedbackSummary(user.scope, 5),
      recentSystemActivity(user.scope, 10),
      courseLeaderboard(user.scope, {}, "most", 5),
    ]);

  const needsAttention = [...locations].sort((a, b) => a.health_score - b.health_score).slice(0, 6);
  const topPerforming = [...locations].sort((a, b) => b.health_score - a.health_score).slice(0, 6);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Academy Command Center"
        description="The live state of training across every Wahlburgers restaurant."
        actions={
          <>
            <LinkButton href="/analytics" variant="outline" size="sm">Executive analytics</LinkButton>
            <LinkButton href="/reports" variant="primary" size="sm">Reports</LinkButton>
          </>
        }
      />

      {/* Hero metrics band */}
      <Card className="overflow-hidden border-0">
        <div className="relative bg-[var(--wb-navy)] p-5 sm:p-6">
          <div className="absolute -right-20 -top-24 size-[380px] rounded-full bg-[var(--wb-red)]/20 blur-3xl" aria-hidden />
          <div className="relative flex flex-wrap items-center justify-between gap-5">
            <div className="flex items-center gap-5">
              <ProgressRing
                value={metrics.completion_pct} size={132} stroke={12}
                tone={completionTone(metrics.completion_pct, thresholds)} sublabel="System"
              />
              <div>
                <p className="flex items-center gap-2 text-[12px] uppercase tracking-wide text-white/55">
                  <Radar size={14} /> Systemwide required completion
                </p>
                <p className="mt-1 text-[34px] font-semibold leading-none tracking-tight text-white">{metrics.completion_pct}%</p>
                <p className="mt-2 text-[13px] text-white/65">
                  {metrics.required_complete.toLocaleString()} of {metrics.required_total.toLocaleString()} required assignments ·
                  {" "}{metrics.active_learners.toLocaleString()} active learners · {metrics.active_locations} restaurants
                </p>
              </div>
            </div>
            <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricTile label="Completed today" value={metrics.completions_today} sublabel={`${metrics.completions_week} in the last 7 days`} tone="success" icon={<CheckCircle2 size={16} />} />
              <MetricTile label="Overdue learners" value={metrics.overdue_learners} sublabel={`${metrics.overdue_assignments} assignments past due`} tone="danger" icon={<AlertTriangle size={16} />} />
              <MetricTile label="Inactive learners" value={metrics.inactive_learners} sublabel="No sign-in for 30+ days" tone="warning" icon={<UserMinus size={16} />} />
              <MetricTile label="Below standard" value={metrics.locations_below_standard} sublabel={`Restaurants under ${thresholds.yellow}%`} tone="danger" icon={<Building2 size={16} />} />
              <MetricTile label="Certs expiring" value={metrics.certifications_expiring} sublabel="Next 60 days" tone="warning" icon={<BadgeCheck size={16} />} />
              <MetricTile label="New hires in training" value={metrics.new_hires_in_training} sublabel="Hired in last 60 days" tone="info" icon={<Sparkles size={16} />} />
              <MetricTile label="Average rating" value={metrics.avg_rating ? metrics.avg_rating.toFixed(1) : "—"} sublabel="Learner course feedback" tone="info" icon={<Star size={16} />} />
              <MetricTile label="Training hours" value={formatDuration(metrics.training_seconds)} sublabel="All recorded learning time" icon={<Clock size={16} />} />
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Locations requiring attention"
            subtitle="Ranked by training health score"
            icon={<AlertTriangle size={17} className="text-[var(--danger)]" />}
            action={<Link href="/reports/location_completion" className="text-[13px] font-medium text-[var(--accent)] hover:underline">Full report</Link>}
          />
          <CardBody className="space-y-3">
            {needsAttention.map((loc) => {
              const band = healthBand(loc.health_score);
              return (
                <div key={loc.id} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/locations/${loc.id}`} className="truncate text-[13.5px] font-medium hover:text-[var(--accent)]">
                        {loc.name} <span className="text-[var(--muted-2)]">#{loc.store_number}</span>
                      </Link>
                      <Pill tone={band.tone}>{band.label}</Pill>
                    </div>
                    <ProgressBar value={loc.completion_pct} tone={completionTone(loc.completion_pct, thresholds)} size="sm" />
                    <p className="mt-1 text-[11.5px] text-[var(--muted)]">
                      {loc.completion_pct}% complete · {loc.overdue} overdue · {loc.inactive_users} inactive · GM {loc.gm_name ?? "—"}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Top performing locations" subtitle="Highest training health" icon={<Award size={17} className="text-[var(--success)]" />} />
          <CardBody className="space-y-3">
            {topPerforming.map((loc, i) => (
              <div key={loc.id} className="flex items-center gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--success-bg)] text-[12px] font-semibold text-[var(--success)]">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/locations/${loc.id}`} className="truncate text-[13.5px] font-medium hover:text-[var(--accent)]">{loc.name}</Link>
                    <span className="text-[13px] font-semibold tabular-nums">{loc.completion_pct}%</span>
                  </div>
                  <ProgressBar value={loc.completion_pct} tone="success" size="sm" />
                  <p className="mt-1 text-[11.5px] text-[var(--muted)]">{loc.employees} employees · health {loc.health_score}</p>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Training completed per week" subtitle="Systemwide momentum" icon={<TrendingUp size={17} />} />
          <CardBody><AreaChartView data={trend} dataKey="completions" label="Completions" height={230} /></CardBody>
        </Card>

        <Card>
          <CardHeader title="Campaign performance" icon={<Flame size={17} />} action={<Link href="/admin/campaigns" className="text-[13px] font-medium text-[var(--accent)] hover:underline">Manage</Link>} />
          <CardBody className="space-y-3">
            {campaigns.slice(0, 4).map((c) => {
              const pct = Number(c.assigned) ? Math.round((Number(c.completed) / Number(c.assigned)) * 100) : 0;
              return (
                <div key={c.id}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-medium">{c.name}</span>
                    <span className="text-[12px] tabular-nums text-[var(--muted)]">{pct}%</span>
                  </div>
                  <ProgressBar value={pct} tone={completionTone(pct)} size="sm" />
                  <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                    {Number(c.completed).toLocaleString()}/{Number(c.assigned).toLocaleString()} · due {c.due_at ? formatDate(c.due_at) : "—"}
                  </p>
                </div>
              );
            })}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Recently released training" icon={<Sparkles size={17} />} />
          <CardBody className="space-y-2.5">
            {released.map((c) => (
              <div key={c.id} className="border-b border-[var(--border)] pb-2.5 last:border-b-0 last:pb-0">
                <Link href={`/library/${c.id}`} className="block truncate text-[13.5px] font-medium hover:text-[var(--accent)]">{c.title}</Link>
                <p className="text-[11.5px] text-[var(--muted)]">
                  {c.category_name} · published {formatDate(c.published_at)} · {c.completions.toLocaleString()} completions
                </p>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Certification risks" icon={<BadgeCheck size={17} />} action={<Link href="/reports/certification_compliance" className="text-[13px] font-medium text-[var(--accent)] hover:underline">Report</Link>} />
          <CardBody className="space-y-2.5">
            {certRisk.length === 0 ? <EmptyState title="No certifications at risk" /> : certRisk.map((c, i) => (
              <div key={`${c.user_id}-${i}`} className="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-2.5 last:border-b-0 last:pb-0">
                <div className="min-w-0">
                  <Link href={`/people/${c.user_id}`} className="block truncate text-[13px] font-medium hover:text-[var(--accent)]">{c.full_name}</Link>
                  <p className="truncate text-[11.5px] text-[var(--muted)]">{c.certification_name} · {c.location_name}</p>
                </div>
                <Pill tone={Number(c.days_left) < 0 ? "danger" : Number(c.days_left) < 30 ? "warning" : "neutral"}>
                  {Number(c.days_left) < 0 ? "Expired" : `${c.days_left}d`}
                </Pill>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Upcoming live training" icon={<CalendarClock size={17} />} action={<Link href="/calendar" className="text-[13px] font-medium text-[var(--accent)] hover:underline">Calendar</Link>} />
          <CardBody className="space-y-2.5">
            {events.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-2.5 last:border-b-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">{e.title}</p>
                  <p className="truncate text-[11.5px] text-[var(--muted)]">
                    {formatDate(e.starts_at, { hour: "numeric", minute: "2-digit" })}{e.location_name ? ` · ${e.location_name}` : " · Virtual"}
                  </p>
                </div>
                <Pill tone="info">{e.registered}{e.capacity ? `/${e.capacity}` : ""}</Pill>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Course feedback" subtitle="What learners are saying" icon={<MessageSquare size={17} />} />
          <CardBody className="space-y-3">
            {feedback.map((f) => (
              <div key={f.id} className="border-b border-[var(--border)] pb-3 last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/library/${f.id}`} className="truncate text-[13.5px] font-medium hover:text-[var(--accent)]">{f.title}</Link>
                  <span className="flex shrink-0 items-center gap-1 text-[12.5px] font-semibold">
                    <Star size={13} className="text-[var(--wb-gold)]" fill="currentColor" /> {Number(f.rating).toFixed(1)}
                    <span className="font-normal text-[var(--muted)]">({f.reviews})</span>
                  </span>
                </div>
                {f.latest_comment ? <p className="mt-1 line-clamp-2 text-[12.5px] italic text-[var(--muted)]">"{f.latest_comment}"</p> : null}
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="System activity" subtitle="Latest completions across the system" icon={<Activity size={17} />} />
          <CardBody className="space-y-2">
            {activity.map((a, i) => (
              <div key={i} className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-2 last:border-b-0 last:pb-0">
                <p className="min-w-0 truncate text-[13px]">
                  <span className="font-medium">{a.full_name}</span> completed <span className="font-medium">{a.course_title}</span>
                  <span className="text-[var(--muted)]"> · {a.location_name ?? "Corporate"}</span>
                </p>
                <span className="flex shrink-0 items-center gap-2">
                  <SourcePill source={a.source_system} />
                  <span className="text-[11.5px] text-[var(--muted)]">{formatRelative(a.completed_at)}</span>
                </span>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Highest completing training" subtitle="Courses landing best across the system" icon={<Users size={17} />} />
        <CardBody className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {topCourses.map((c) => (
            <Link key={c.id} href={`/library/${c.id}`} className="rounded-lg border border-[var(--border)] p-3 hover:border-[var(--accent)]">
              <p className="line-clamp-2 text-[13px] font-medium">{c.title}</p>
              <div className="mt-2"><ProgressBar value={c.completion} tone="success" size="sm" showLabel /></div>
              <p className="mt-1 text-[11px] text-[var(--muted)]">{c.completions.toLocaleString()} of {c.assigned.toLocaleString()} assigned</p>
            </Link>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
