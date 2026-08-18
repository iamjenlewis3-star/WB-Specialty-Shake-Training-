import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, BadgeCheck, Building2, CalendarClock, MapPin, Users } from "lucide-react";
import { requireUser, can } from "@/lib/auth/guard";
import { queryOne } from "@/lib/db/client";
import { locationPerformance, systemMetrics, completionByDimension, upcomingLiveTraining } from "@/lib/services/analytics";
import { listPeople } from "@/lib/services/people";
import { canAccessLocation } from "@/lib/rbac/scope";
import {
  Avatar, Card, CardBody, CardHeader, DescriptionList, EmptyState, KpiTile, PageHeader, Pill, ProgressBar,
  ProgressRing, Table, TableWrap, Td, Th, Tr,
} from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { BarChartView } from "@/components/charts";
import { formatDate, formatRelative, completionTone, healthBand } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function LocationPage({ params }: { params: Promise<{ locationId: string }> }) {
  const user = await requireUser();
  const { locationId } = await params;
  if (!canAccessLocation(user.scope, locationId)) notFound();

  const location = await queryOne<{
    id: string; name: string; store_number: string; ownership_type: string; city: string | null; state: string | null;
    address_line1: string | null; phone: string | null; status: string; opened_on: string | null;
    brand_name: string | null; franchise_group_name: string | null; region_name: string | null;
    gm_name: string | null; gm_user_id: string | null; fbp_name: string | null; fbp_user_id: string | null;
  }>(
    `select l.id, l.name, l.store_number, l.ownership_type, l.city, l.state, l.address_line1, l.phone, l.status,
            l.opened_on, b.name as brand_name, fg.name as franchise_group_name, r.name as region_name,
            gm.full_name as gm_name, l.gm_user_id, fbp.full_name as fbp_name, l.fbp_user_id
       from locations l
       left join brands b on b.id = l.brand_id
       left join franchise_groups fg on fg.id = l.franchise_group_id
       left join regions r on r.id = l.region_id
       left join v_people gm on gm.user_id = l.gm_user_id
       left join v_people fbp on fbp.user_id = l.fbp_user_id
      where l.id = $1`, [locationId]);
  if (!location) notFound();

  const [metrics, perf, team, byRole, events] = await Promise.all([
    systemMetrics(user.scope, { locationId }),
    locationPerformance(user.scope, { locationId }),
    listPeople(user.scope, { locationId, pageSize: 100, sort: "completion", dir: "asc" }),
    completionByDimension(user.scope, "role", { locationId }),
    upcomingLiveTraining(user.scope, 6),
  ]);
  const stats = perf[0];
  const band = healthBand(stats?.health_score ?? 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title={location.name}
        description={`Store #${location.store_number} · ${location.city}, ${location.state} · ${location.ownership_type}`}
        breadcrumb={[{ label: "Locations", href: "/admin/locations" }, { label: location.name }]}
        actions={
          <>
            <LinkButton href={`/admin/people?location=${locationId}`} variant="outline" size="sm">View roster</LinkButton>
            {can(user, "training.assign") ? (
              <LinkButton href={`/admin/assignments/new?location=${locationId}`} variant="primary" size="sm">Assign training</LinkButton>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardBody className="flex flex-col items-center gap-3 text-center">
              <ProgressRing value={stats?.completion_pct ?? 0} tone={completionTone(stats?.completion_pct ?? 0)} size={124} stroke={11} sublabel="Completion" />
              <Pill tone={band.tone} dot>Training health: {band.label} ({stats?.health_score ?? 0})</Pill>
              <p className="text-[12.5px] text-[var(--muted)]">
                {metrics.required_complete.toLocaleString()} of {metrics.required_total.toLocaleString()} required assignments complete
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Restaurant details" icon={<Building2 size={17} />} />
            <CardBody>
              <DescriptionList
                items={[
                  { label: "Store number", value: location.store_number },
                  { label: "Brand", value: location.brand_name ?? "Wahlburgers" },
                  { label: "Ownership", value: location.ownership_type },
                  { label: "Franchise group", value: location.franchise_group_name ?? "—" },
                  { label: "Region", value: location.region_name ?? "—" },
                  { label: "Address", value: `${location.address_line1 ?? ""}, ${location.city ?? ""} ${location.state ?? ""}` },
                  { label: "Phone", value: location.phone ?? "—" },
                  { label: "Opened", value: formatDate(location.opened_on) },
                  { label: "General Manager", value: location.gm_user_id ? <Link href={`/people/${location.gm_user_id}`} className="hover:text-[var(--accent)]">{location.gm_name}</Link> : "—" },
                  { label: "Franchise Business Partner", value: location.fbp_user_id ? <Link href={`/people/${location.fbp_user_id}`} className="hover:text-[var(--accent)]">{location.fbp_name}</Link> : "—" },
                  { label: "Status", value: <Pill tone="success">{location.status}</Pill> },
                ]}
              />
            </CardBody>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiTile label="Employees" value={stats?.employees ?? 0} sublabel={`${stats?.new_hires ?? 0} new hires`} tone="info" icon={<Users size={16} />} />
            <KpiTile label="Overdue assignments" value={stats?.overdue ?? 0} sublabel={`${metrics.overdue_learners} people affected`} tone="danger" icon={<AlertTriangle size={16} />} />
            <KpiTile label="Certifications expiring" value={stats?.expiring_certs ?? 0} sublabel="Next 60 days" tone="warning" icon={<BadgeCheck size={16} />} />
            <KpiTile label="Inactive users" value={stats?.inactive_users ?? 0} sublabel="No sign-in for 30 days" tone="warning" icon={<MapPin size={16} />} />
          </div>

          <Card>
            <CardHeader title="Team" subtitle="Lowest completion first" icon={<Users size={17} />} />
            <TableWrap>
              <Table className="min-w-[720px]">
                <thead><tr><Th>Employee</Th><Th>Position</Th><Th className="w-36">Completion</Th><Th>Overdue</Th><Th>Certs</Th><Th>Last login</Th><Th>Status</Th></tr></thead>
                <tbody>
                  {team.rows.slice(0, 20).map((p) => (
                    <Tr key={p.user_id}>
                      <Td>
                        <Link href={`/people/${p.user_id}`} className="flex items-center gap-2.5 hover:text-[var(--accent)]">
                          <Avatar name={p.full_name} color={p.avatar_color} size={28} />
                          <span className="truncate font-medium">{p.full_name}</span>
                        </Link>
                      </Td>
                      <Td className="text-[var(--muted)]">{p.position_title}</Td>
                      <Td><ProgressBar value={Number(p.completion_pct)} tone={completionTone(Number(p.completion_pct))} showLabel size="sm" /></Td>
                      <Td>{Number(p.overdue_count) > 0 ? <Pill tone="danger">{p.overdue_count}</Pill> : "0"}</Td>
                      <Td className="tabular-nums">{p.certification_count}</Td>
                      <Td className="whitespace-nowrap text-[var(--muted)]">{formatRelative(p.last_login_at)}</Td>
                      <Td><Pill tone={p.status === "active" ? "success" : "warning"}>{p.status.replace(/_/g, " ")}</Pill></Td>
                    </Tr>
                  ))}
                  {team.rows.length === 0 ? <tr><Td colSpan={7}><EmptyState title="No employees at this restaurant" /></Td></tr> : null}
                </tbody>
              </Table>
            </TableWrap>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Completion by position" />
              <CardBody>
                <BarChartView
                  data={byRole.filter((r) => r.employees > 0).map((r) => ({ name: r.name, completion: r.completion }))}
                  dataKeys={[{ key: "completion", label: "Completion %" }]} layout="vertical" unit="%"
                  height={Math.max(200, byRole.length * 32)}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Upcoming training" icon={<CalendarClock size={17} />} />
              <CardBody className="space-y-3">
                {events.length === 0 ? <EmptyState title="Nothing scheduled" /> : events.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-medium">{e.title}</p>
                      <p className="text-[12px] text-[var(--muted)]">{formatDate(e.starts_at, { hour: "numeric", minute: "2-digit" })}</p>
                    </div>
                    <Pill tone="info">{e.registered} registered</Pill>
                  </div>
                ))}
              </CardBody>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
