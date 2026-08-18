import Link from "next/link";
import {
  AlertTriangle, BadgeCheck, Building2, Clock, Database, GraduationCap, Radar, Star, TrendingUp, Users,
} from "lucide-react";
import { Card, CardBody, CardHeader, KpiTile, PageHeader, Pill, ProgressBar, EmptyState } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { AreaChartView, BarChartView } from "@/components/charts";
import {
  campaignPerformance, completionByDimension, completionOverTime, locationPerformance, recentSystemActivity,
  systemMetrics,
} from "@/lib/services/analytics";
import { formatDuration, formatRelative, completionTone } from "@/lib/utils";
import { queryOne } from "@/lib/db/client";
import type { CurrentUser } from "@/lib/auth/session";

export async function CorporateDashboard({ user }: { user: CurrentUser }) {
  const [metrics, byGroup, trend, locations, campaigns, activity, migration] = await Promise.all([
    systemMetrics(user.scope),
    completionByDimension(user.scope, "franchise_group"),
    completionOverTime(user.scope, {}, 14),
    locationPerformance(user.scope),
    campaignPerformance(user.scope),
    recentSystemActivity(user.scope, 8),
    queryOne<{ records: string; employees: string }>(`
      select (select count(*)::text from enrollments where source_system = 'Legacy LMS') as records,
             (select count(*)::text from users where source_system = 'Legacy LMS') as employees`),
  ]);

  const needsAttention = [...locations].sort((a, b) => a.completion_pct - b.completion_pct).slice(0, 5);
  const topPerformers = [...locations].sort((a, b) => b.completion_pct - a.completion_pct).slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Good to see you, ${user.displayName}`}
        description="Systemwide training performance across every Wahlburgers restaurant, franchise group and region."
        actions={
          <>
            <LinkButton href="/command-center" variant="primary" size="sm"><Radar size={15} /> Command Center</LinkButton>
            <LinkButton href="/analytics" variant="outline" size="sm">Executive analytics</LinkButton>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Systemwide completion" value={`${metrics.completion_pct}%`} sublabel={`${metrics.required_complete.toLocaleString()} of ${metrics.required_total.toLocaleString()} required assignments`} tone={completionTone(metrics.completion_pct)} icon={<TrendingUp size={16} />} />
        <KpiTile label="Active learners" value={metrics.active_learners.toLocaleString()} sublabel={`${metrics.new_hires_in_training} new hires in training`} tone="info" icon={<Users size={16} />} href="/admin/people" />
        <KpiTile label="Overdue assignments" value={metrics.overdue_assignments.toLocaleString()} sublabel={`${metrics.locations_below_standard} restaurants below standard`} tone="danger" icon={<AlertTriangle size={16} />} href="/reports/overdue_training" />
        <KpiTile label="Certification compliance" value={`${metrics.certification_compliance}%`} sublabel={`${metrics.certifications_expiring} expiring in 60 days`} tone={completionTone(metrics.certification_compliance)} icon={<BadgeCheck size={16} />} href="/reports/certification_compliance" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Completions this month" value={metrics.completions_month.toLocaleString()} sublabel={`${metrics.completions_today} today`} tone="success" icon={<GraduationCap size={16} />} />
        <KpiTile label="Training hours" value={formatDuration(metrics.training_seconds)} sublabel="All recorded learning time" tone="neutral" icon={<Clock size={16} />} />
        <KpiTile label="Average course rating" value={metrics.avg_rating ? metrics.avg_rating.toFixed(1) : "—"} sublabel="Learner feedback" tone="warning" icon={<Star size={16} />} href="/reports/course_ratings" />
        <KpiTile label="Active restaurants" value={metrics.active_locations} sublabel={`${metrics.engagement_pct}% learner engagement`} tone="info" icon={<Building2 size={16} />} href="/admin/locations" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Completions over time" subtitle="Training completed per week across the system" icon={<TrendingUp size={17} />} />
          <CardBody><AreaChartView data={trend} dataKey="completions" label="Completions" height={250} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Completion by franchise group" icon={<Building2 size={17} />} />
          <CardBody>
            <BarChartView
              data={byGroup.map((g) => ({ name: g.name, completion: g.completion }))}
              dataKeys={[{ key: "completion", label: "Completion %" }]} layout="vertical" unit="%"
              height={Math.max(220, byGroup.length * 34)}
            />
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Restaurants requiring attention" subtitle="Lowest required completion" action={<Link href="/command-center" className="text-[13px] font-medium text-[var(--accent)] hover:underline">Command Center</Link>} />
          <CardBody className="space-y-3">
            {needsAttention.map((loc) => (
              <div key={loc.id}>
                <div className="mb-1 flex items-center justify-between gap-3">
                  <Link href={`/locations/${loc.id}`} className="truncate text-[13.5px] font-medium hover:text-[var(--accent)]">
                    {loc.name} <span className="text-[var(--muted-2)]">#{loc.store_number}</span>
                  </Link>
                  <span className="shrink-0 text-[12px] text-[var(--muted)]">{loc.overdue} overdue</span>
                </div>
                <ProgressBar value={loc.completion_pct} tone={completionTone(loc.completion_pct)} showLabel size="sm" />
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Top performing restaurants" subtitle="Highest required completion" />
          <CardBody className="space-y-3">
            {topPerformers.map((loc, i) => (
              <div key={loc.id} className="flex items-center gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-3)] text-[12px] font-semibold">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <Link href={`/locations/${loc.id}`} className="block truncate text-[13.5px] font-medium hover:text-[var(--accent)]">{loc.name}</Link>
                  <ProgressBar value={loc.completion_pct} tone="success" size="sm" />
                </div>
                <span className="shrink-0 text-[13px] font-semibold tabular-nums">{loc.completion_pct}%</span>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Campaign performance" subtitle="Active training campaigns" icon={<GraduationCap size={17} />} action={<Link href="/admin/campaigns" className="text-[13px] font-medium text-[var(--accent)] hover:underline">Manage</Link>} />
          <CardBody className="space-y-3.5">
            {campaigns.length === 0 ? <EmptyState title="No campaigns yet" /> : campaigns.slice(0, 5).map((c) => {
              const pct = Number(c.assigned) ? Math.round((Number(c.completed) / Number(c.assigned)) * 100) : 0;
              return (
                <div key={c.id}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 truncate text-[13.5px] font-medium">
                      <span className="size-2.5 rounded-full" style={{ background: c.banner_color }} aria-hidden />
                      {c.name}
                    </span>
                    <Pill tone={c.status === "active" ? "info" : "neutral"}>{c.status}</Pill>
                  </div>
                  <ProgressBar value={pct} tone={completionTone(pct)} showLabel size="sm" />
                  <p className="mt-1 text-[11.5px] text-[var(--muted)]">{Number(c.completed).toLocaleString()} of {Number(c.assigned).toLocaleString()} assignments complete · {c.courses} courses</p>
                </div>
              );
            })}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="System activity" subtitle="Latest completions across the system" />
          <CardBody className="space-y-2.5">
            {activity.map((a, i) => (
              <div key={i} className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-2.5 last:border-b-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-[13px]"><span className="font-medium">{a.full_name}</span> completed <span className="font-medium">{a.course_title}</span></p>
                  <p className="text-[11.5px] text-[var(--muted)]">{a.location_name ?? "Corporate"} · {formatRelative(a.completed_at)}</p>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-[var(--info-bg)] text-[var(--info)]"><Database size={17} /></span>
            <div>
              <p className="text-[13.5px] font-semibold">
                {Number(migration?.records ?? 0).toLocaleString()} legacy training records and {Number(migration?.employees ?? 0).toLocaleString()} employee records are live in the Academy
              </p>
              <p className="text-[12.5px] text-[var(--muted)]">
                Migrated history sits on the same transcripts as new Academy training — nothing was left behind in the old system.
              </p>
            </div>
          </div>
          <LinkButton href="/admin/migration" variant="outline" size="sm">Open Data Migration Center</LinkButton>
        </CardBody>
      </Card>
    </div>
  );
}
