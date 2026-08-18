import Link from "next/link";
import { BadgeCheck, Building2, Clock, Download, GraduationCap, Star, TrendingUp, UserMinus, Users } from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import {
  completionByDimension, completionOverTime, courseLeaderboard, locationPerformance, systemMetrics,
} from "@/lib/services/analytics";
import { filterOptions } from "@/lib/services/people";
import { listCategories } from "@/lib/services/courses";
import { query } from "@/lib/db/client";
import { Card, CardBody, CardHeader, KpiTile, PageHeader, Pill, ProgressBar } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { AreaChartView, BarChartView, DonutChartView, LineChartView } from "@/components/charts";
import { ClearFilters, FilterSelect } from "@/components/ui/interactive";
import { formatDuration, completionTone } from "@/lib/utils";

export const metadata = { title: "Executive Analytics" };
export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("analytics.executive");
  const sp = await searchParams;
  const filters = {
    locationId: sp.location, franchiseGroupId: sp.group, regionId: sp.region,
    roleId: sp.role, departmentId: sp.department, courseId: sp.course,
  };

  const [metrics, byLocation, byGroup, byRegion, byRole, byDept, trend, options, categories, topCourses, lowCourses, locations, ratings] =
    await Promise.all([
      systemMetrics(user.scope, filters),
      completionByDimension(user.scope, "location", filters),
      completionByDimension(user.scope, "franchise_group", filters),
      completionByDimension(user.scope, "region", filters),
      completionByDimension(user.scope, "role", filters),
      completionByDimension(user.scope, "department", filters),
      completionOverTime(user.scope, filters, 16),
      filterOptions(user.scope),
      listCategories(),
      courseLeaderboard(user.scope, filters, "most", 8),
      courseLeaderboard(user.scope, filters, "least", 8),
      locationPerformance(user.scope, filters),
      query<{ name: string; value: string }>(`
        select case when rating >= 5 then '5 stars' when rating = 4 then '4 stars'
                    when rating = 3 then '3 stars' else '1–2 stars' end as name,
               count(*)::text as value
          from course_reviews group by 1 order by 1 desc`),
    ]);

  const ranked = [...locations].sort((a, b) => b.completion_pct - a.completion_pct);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Executive Analytics"
        description="Systemwide training performance with the filters leadership actually asks for."
        actions={
          <>
            <LinkButton href="/api/export?report=location_completion&format=xlsx" variant="outline" size="sm"><Download size={15} /> Export XLSX</LinkButton>
            <LinkButton href="/command-center" variant="primary" size="sm">Command Center</LinkButton>
          </>
        }
      />

      <Card>
        <CardBody className="flex flex-wrap items-center gap-2">
          <FilterSelect paramKey="location" label="Location" allLabel="All locations" options={options.locations.map((l) => ({ value: l.id, label: l.name }))} />
          <FilterSelect paramKey="group" label="Franchise group" allLabel="All franchise groups" options={options.groups.map((g) => ({ value: g.id, label: g.name }))} />
          <FilterSelect paramKey="region" label="Region" allLabel="All regions" options={options.regions.map((r) => ({ value: r.id, label: r.name }))} />
          <FilterSelect paramKey="role" label="Role" allLabel="All roles" options={options.roles.map((r) => ({ value: r.id, label: r.name }))} />
          <FilterSelect paramKey="department" label="Department" allLabel="All departments" options={options.departments.map((d) => ({ value: d.id, label: d.name }))} />
          <FilterSelect paramKey="category" label="Category" allLabel="All categories" options={categories.map((c) => ({ value: c.id, label: c.name }))} />
          <ClearFilters keys={["location", "group", "region", "role", "department", "category", "course"]} />
        </CardBody>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Systemwide completion" value={`${metrics.completion_pct}%`} sublabel={`${metrics.required_complete.toLocaleString()} of ${metrics.required_total.toLocaleString()}`} tone={completionTone(metrics.completion_pct)} icon={<TrendingUp size={16} />} />
        <KpiTile label="Active learners" value={metrics.active_learners.toLocaleString()} sublabel={`${metrics.engagement_pct}% active in last 30 days`} tone="info" icon={<Users size={16} />} />
        <KpiTile label="Completions this month" value={metrics.completions_month.toLocaleString()} sublabel={`${metrics.completions_week} in the last week`} tone="success" icon={<GraduationCap size={16} />} />
        <KpiTile label="Training hours" value={formatDuration(metrics.training_seconds)} sublabel="All recorded learning time" tone="neutral" icon={<Clock size={16} />} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Overdue assignments" value={metrics.overdue_assignments.toLocaleString()} sublabel={`${metrics.overdue_learners} learners`} tone="danger" href="/reports/overdue_training" />
        <KpiTile label="Certification compliance" value={`${metrics.certification_compliance}%`} sublabel={`${metrics.certifications_expiring} expiring soon`} tone={completionTone(metrics.certification_compliance)} icon={<BadgeCheck size={16} />} />
        <KpiTile label="Active restaurants" value={metrics.active_locations} sublabel={`${metrics.locations_below_standard} below standard`} tone="info" icon={<Building2 size={16} />} />
        <KpiTile label="Average rating" value={metrics.avg_rating ? metrics.avg_rating.toFixed(1) : "—"} sublabel="Course feedback" tone="warning" icon={<Star size={16} />} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Completion over time" subtitle="Weekly completions and training hours" />
          <CardBody><LineChartView data={trend} dataKeys={[{ key: "completions", label: "Completions" }, { key: "hours", label: "Training hours" }]} height={260} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Completion by franchise group" />
          <CardBody>
            <BarChartView data={byGroup.map((g) => ({ name: g.name, completion: g.completion }))}
              dataKeys={[{ key: "completion", label: "Completion %" }]} layout="vertical" unit="%" height={Math.max(220, byGroup.length * 34)} />
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Completion by region" />
          <CardBody>
            <BarChartView data={byRegion.map((r) => ({ name: r.name, completion: r.completion }))}
              dataKeys={[{ key: "completion", label: "Completion %" }]} layout="vertical" unit="%" height={Math.max(200, byRegion.length * 34)} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Completion by role" />
          <CardBody>
            <BarChartView data={byRole.filter((r) => r.employees > 0).map((r) => ({ name: r.name, completion: r.completion }))}
              dataKeys={[{ key: "completion", label: "Completion %" }]} layout="vertical" unit="%" height={Math.max(200, byRole.length * 30)} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Completion by department" />
          <CardBody>
            <BarChartView data={byDept.filter((d) => d.employees > 0).map((d) => ({ name: d.name, completion: d.completion }))}
              dataKeys={[{ key: "completion", label: "Completion %" }]} layout="vertical" unit="%" height={Math.max(200, byDept.length * 34)} />
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Highest performing locations" action={<Link href="/reports/location_completion" className="text-[13px] font-medium text-[var(--accent)] hover:underline">Full report</Link>} />
          <CardBody className="space-y-2.5">
            {ranked.slice(0, 8).map((l, i) => (
              <div key={l.id} className="flex items-center gap-3">
                <span className="w-5 text-[12px] font-semibold text-[var(--muted)]">{i + 1}</span>
                <Link href={`/locations/${l.id}`} className="min-w-0 flex-1 truncate text-[13.5px] font-medium hover:text-[var(--accent)]">{l.name}</Link>
                <div className="w-28"><ProgressBar value={l.completion_pct} tone="success" size="sm" /></div>
                <span className="w-10 text-right text-[12.5px] font-semibold tabular-nums">{l.completion_pct}%</span>
              </div>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Lowest performing locations" />
          <CardBody className="space-y-2.5">
            {[...ranked].reverse().slice(0, 8).map((l, i) => (
              <div key={l.id} className="flex items-center gap-3">
                <span className="w-5 text-[12px] font-semibold text-[var(--muted)]">{i + 1}</span>
                <Link href={`/locations/${l.id}`} className="min-w-0 flex-1 truncate text-[13.5px] font-medium hover:text-[var(--accent)]">{l.name}</Link>
                <div className="w-28"><ProgressBar value={l.completion_pct} tone={completionTone(l.completion_pct)} size="sm" /></div>
                <span className="w-10 text-right text-[12.5px] font-semibold tabular-nums">{l.completion_pct}%</span>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Most completed training" />
          <CardBody className="space-y-2.5">
            {topCourses.map((c) => (
              <div key={c.id} className="flex items-center gap-3">
                <Link href={`/library/${c.id}`} className="min-w-0 flex-1 truncate text-[13.5px] font-medium hover:text-[var(--accent)]">{c.title}</Link>
                <div className="w-24"><ProgressBar value={c.completion} tone="success" size="sm" /></div>
                <span className="w-16 text-right text-[12px] tabular-nums text-[var(--muted)]">{c.completions.toLocaleString()}</span>
              </div>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Lowest completion courses" subtitle="Where learners are getting stuck" />
          <CardBody className="space-y-2.5">
            {lowCourses.map((c) => (
              <div key={c.id} className="flex items-center gap-3">
                <Link href={`/library/${c.id}`} className="min-w-0 flex-1 truncate text-[13.5px] font-medium hover:text-[var(--accent)]">{c.title}</Link>
                <div className="w-24"><ProgressBar value={c.completion} tone={completionTone(c.completion)} size="sm" /></div>
                <span className="w-16 text-right text-[12px] tabular-nums text-[var(--muted)]">{c.completion}%</span>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Certification compliance" />
          <CardBody>
            <DonutChartView
              data={[
                { name: "Active", value: metrics.certifications_active - metrics.certifications_expiring, color: "var(--chart-3)" },
                { name: "Expiring (60d)", value: metrics.certifications_expiring, color: "var(--chart-4)" },
                { name: "Expired", value: metrics.certifications_expired, color: "var(--chart-2)" },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Course rating distribution" />
          <CardBody>
            <DonutChartView data={ratings.map((r) => ({ name: r.name, value: Number(r.value) }))} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Inactive learners" icon={<UserMinus size={17} />} action={<Link href="/reports/inactive_users" className="text-[13px] font-medium text-[var(--accent)] hover:underline">Report</Link>} />
          <CardBody className="space-y-3">
            <p className="text-[30px] font-semibold tabular-nums">{metrics.inactive_learners.toLocaleString()}</p>
            <p className="text-[13px] text-[var(--muted)]">
              Active accounts with no sign-in for 30+ days out of {metrics.active_learners.toLocaleString()} active learners.
            </p>
            <ProgressBar value={metrics.active_learners ? 100 - (metrics.inactive_learners / metrics.active_learners) * 100 : 100} tone="info" showLabel />
            <Pill tone="info">{metrics.engagement_pct}% engaged in the last 30 days</Pill>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Completion by location" subtitle="Every restaurant in your scope" />
        <CardBody>
          <BarChartView
            data={byLocation.map((l) => ({ name: l.name, completion: l.completion }))}
            dataKeys={[{ key: "completion", label: "Completion %" }]}
            layout="vertical" unit="%" height={Math.max(280, byLocation.length * 24)}
          />
        </CardBody>
      </Card>
    </div>
  );
}
