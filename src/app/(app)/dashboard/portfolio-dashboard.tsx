import Link from "next/link";
import { AlertTriangle, BadgeCheck, Building2, TrendingUp, UserMinus, Users } from "lucide-react";
import { Card, CardBody, CardHeader, KpiTile, PageHeader, Pill, ProgressBar, Table, TableWrap, Td, Th, Tr, EmptyState } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { BarChartView, LineChartView } from "@/components/charts";
import { completionByDimension, completionOverTime, locationPerformance, systemMetrics, certificationRisk } from "@/lib/services/analytics";
import { getSetting } from "@/lib/services/settings";
import { formatRelative, completionTone, healthBand } from "@/lib/utils";
import type { CurrentUser } from "@/lib/auth/session";

/**
 * Portfolio view used by Franchise Business Partners, Franchise Owners and
 * Multi-Unit Operators — the same component, different scope. Risk banding is
 * configurable in Admin → Settings.
 */
export async function PortfolioDashboard({ user }: { user: CurrentUser }) {
  const thresholds = await getSetting<{ green: number; yellow: number }>("risk_thresholds", { green: 90, yellow: 75 });
  const [metrics, locations, trend, byRole, certRisk] = await Promise.all([
    systemMetrics(user.scope),
    locationPerformance(user.scope),
    completionOverTime(user.scope, {}, 12),
    completionByDimension(user.scope, "role"),
    certificationRisk(user.scope, 60, 8),
  ]);

  const isOwner = user.roleCode === "franchise_owner";
  const ranked = [...locations].sort((a, b) => b.completion_pct - a.completion_pct);
  const atRisk = ranked.filter((l) => l.completion_pct < thresholds.green);

  return (
    <div className="space-y-6">
      <PageHeader
        title={isOwner ? `${user.franchiseGroupName ?? "Franchise"} training performance` : "My restaurant portfolio"}
        description={
          isOwner
            ? "Every restaurant owned by your franchise group, with completion, certification and engagement health."
            : `${locations.length} restaurants in your portfolio. Risk banding: green ≥ ${thresholds.green}%, yellow ≥ ${thresholds.yellow}%.`
        }
        actions={<LinkButton href="/reports/location_completion" variant="outline" size="sm">Open location report</LinkButton>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Portfolio completion" value={`${metrics.completion_pct}%`} sublabel={`${metrics.required_complete.toLocaleString()} of ${metrics.required_total.toLocaleString()} required`} tone={completionTone(metrics.completion_pct, thresholds)} icon={<TrendingUp size={16} />} />
        <KpiTile label="Restaurants" value={locations.length} sublabel={`${atRisk.length} below ${thresholds.green}%`} tone={atRisk.length ? "warning" : "success"} icon={<Building2 size={16} />} href="/admin/locations" />
        <KpiTile label="Overdue assignments" value={metrics.overdue_assignments} sublabel={`${metrics.overdue_learners} employees affected`} tone="danger" icon={<AlertTriangle size={16} />} href="/reports/overdue_training" />
        <KpiTile label="Certifications expiring" value={metrics.certifications_expiring} sublabel="Next 60 days" tone="warning" icon={<BadgeCheck size={16} />} href="/reports/certification_compliance" />
      </div>

      <Card>
        <CardHeader
          title="Location performance"
          subtitle="Sorted by completion. Red restaurants need a conversation this week."
          icon={<Building2 size={17} />}
          action={<LinkButton href="/reports/location_completion" variant="outline" size="sm">Export</LinkButton>}
        />
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Location</Th><Th>General Manager</Th><Th>Employees</Th><Th className="w-40">Completion</Th>
                <Th>Overdue</Th><Th>Certs expiring</Th><Th>Inactive</Th><Th>Last activity</Th><Th>Risk</Th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((loc) => {
                const tone = completionTone(loc.completion_pct, thresholds);
                const band = healthBand(loc.health_score);
                return (
                  <Tr key={loc.id}>
                    <Td>
                      <Link href={`/locations/${loc.id}`} className="font-medium hover:text-[var(--accent)]">{loc.name}</Link>
                      <span className="block text-[11.5px] text-[var(--muted)]">#{loc.store_number} · {loc.city}, {loc.state}</span>
                    </Td>
                    <Td className="text-[var(--muted)]">{loc.gm_name ?? "—"}</Td>
                    <Td className="tabular-nums">{loc.employees}</Td>
                    <Td><ProgressBar value={loc.completion_pct} tone={tone} showLabel size="sm" /></Td>
                    <Td>{loc.overdue > 0 ? <Pill tone="danger">{loc.overdue}</Pill> : <span className="text-[var(--muted-2)]">0</span>}</Td>
                    <Td className="tabular-nums">{loc.expiring_certs}</Td>
                    <Td className="tabular-nums">{loc.inactive_users}</Td>
                    <Td className="whitespace-nowrap text-[var(--muted)]">{formatRelative(loc.last_activity)}</Td>
                    <Td><Pill tone={band.tone} dot>{band.label}</Pill></Td>
                  </Tr>
                );
              })}
              {ranked.length === 0 ? (
                <tr><Td colSpan={9}><EmptyState title="No restaurants in your portfolio yet" description="Ask an administrator to assign restaurants to your account." /></Td></tr>
              ) : null}
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Completion trend" subtitle="Training completed per week" icon={<TrendingUp size={17} />} />
          <CardBody>
            <LineChartView data={trend} dataKeys={[{ key: "completions", label: "Completions" }]} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Completion by position" icon={<Users size={17} />} />
          <CardBody>
            <BarChartView
              data={byRole.filter((r) => r.employees > 0).map((r) => ({ name: r.name, completion: r.completion }))}
              dataKeys={[{ key: "completion", label: "Completion %" }]} layout="vertical" unit="%"
              height={Math.max(200, byRole.length * 32)}
            />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Certification risks across the portfolio" icon={<BadgeCheck size={17} />} subtitle="Expiring or recently expired" />
        <TableWrap>
          <Table className="min-w-[520px]">
            <thead><tr><Th>Employee</Th><Th>Restaurant</Th><Th>Certification</Th><Th>Status</Th></tr></thead>
            <tbody>
              {certRisk.map((c, i) => (
                <Tr key={`${c.user_id}-${i}`}>
                  <Td><Link href={`/people/${c.user_id}`} className="font-medium hover:text-[var(--accent)]">{c.full_name}</Link></Td>
                  <Td className="text-[var(--muted)]">{c.location_name ?? "—"}</Td>
                  <Td>{c.certification_name}</Td>
                  <Td>
                    <Pill tone={Number(c.days_left) < 0 ? "danger" : Number(c.days_left) < 30 ? "warning" : "neutral"}>
                      {Number(c.days_left) < 0 ? "Expired" : `${c.days_left} days left`}
                    </Pill>
                  </Td>
                </Tr>
              ))}
              {certRisk.length === 0 ? <tr><Td colSpan={4}><EmptyState title="No certifications at risk" /></Td></tr> : null}
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-[var(--warning-bg)] text-[var(--warning)]"><UserMinus size={17} /></span>
            <div>
              <p className="text-[13.5px] font-semibold">{metrics.inactive_learners} employees have not signed in for 30+ days</p>
              <p className="text-[12.5px] text-[var(--muted)]">Inactivity rules flag these accounts automatically. Managers can reactivate at any time.</p>
            </div>
          </div>
          <LinkButton href="/reports/inactive_users" variant="outline" size="sm">Review inactive users</LinkButton>
        </CardBody>
      </Card>
    </div>
  );
}
