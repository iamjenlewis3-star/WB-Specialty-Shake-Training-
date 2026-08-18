import Link from "next/link";
import { Building2, Map as MapIcon } from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import { completionByDimension } from "@/lib/services/analytics";
import { query } from "@/lib/db/client";
import { Card, CardBody, CardHeader, PageHeader, Pill, ProgressBar, Table, TableWrap, Td, Th, Tr } from "@/components/ui/primitives";
import { BarChartView } from "@/components/charts";
import { completionTone } from "@/lib/utils";

export const metadata = { title: "Franchise groups & regions" };
export const dynamic = "force-dynamic";

export default async function FranchiseGroupsPage() {
  const user = await requirePermission(["franchise.manage", "reports.view"]);
  const [groups, regions, byGroup, byRegion] = await Promise.all([
    query<{ id: string; name: string; code: string; ownership_type: string; principal_name: string | null; contact_email: string | null; locations: string; employees: string }>(`
      select fg.id, fg.name, fg.code, fg.ownership_type, fg.principal_name, fg.contact_email,
             (select count(*) from locations l where l.franchise_group_id = fg.id)::text as locations,
             (select count(*) from v_people p where p.franchise_group_id = fg.id and p.status = 'active')::text as employees
        from franchise_groups fg order by fg.name`),
    query<{ id: string; name: string; code: string; locations: string; employees: string }>(`
      select r.id, r.name, r.code,
             (select count(*) from locations l where l.region_id = r.id)::text as locations,
             (select count(*) from v_people p where p.region_id = r.id and p.status = 'active')::text as employees
        from regions r order by r.name`),
    completionByDimension(user.scope, "franchise_group"),
    completionByDimension(user.scope, "region"),
  ]);

  const groupCompletion = new Map(byGroup.map((g) => [g.name, g]));
  const regionCompletion = new Map(byRegion.map((r) => [r.name, r]));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Franchise groups & regions"
        description="The ownership and geographic structure the Academy reports on. Nothing about the hierarchy is hard-coded."
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Franchise groups & regions" }]}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Completion by franchise group" icon={<Building2 size={17} />} />
          <CardBody>
            <BarChartView data={byGroup.map((g) => ({ name: g.name, completion: g.completion }))}
              dataKeys={[{ key: "completion", label: "Completion %" }]} layout="vertical" unit="%" height={Math.max(200, byGroup.length * 34)} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Completion by region" icon={<MapIcon size={17} />} />
          <CardBody>
            <BarChartView data={byRegion.map((r) => ({ name: r.name, completion: r.completion }))}
              dataKeys={[{ key: "completion", label: "Completion %" }]} layout="vertical" unit="%" height={Math.max(200, byRegion.length * 34)} />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Franchise groups" subtitle={`${groups.length} groups`} />
        <TableWrap>
          <Table className="min-w-[820px]">
            <thead><tr><Th>Group</Th><Th>Code</Th><Th>Ownership</Th><Th>Principal</Th><Th>Contact</Th><Th>Restaurants</Th><Th>Employees</Th><Th className="w-36">Completion</Th></tr></thead>
            <tbody>
              {groups.map((g) => {
                const stats = groupCompletion.get(g.name);
                return (
                  <Tr key={g.id}>
                    <Td className="font-medium">{g.name}</Td>
                    <Td className="font-mono text-[12px] text-[var(--muted)]">{g.code}</Td>
                    <Td><Pill tone={g.ownership_type === "Corporate" ? "info" : g.ownership_type === "Joint Venture" ? "warning" : "neutral"}>{g.ownership_type}</Pill></Td>
                    <Td className="text-[var(--muted)]">{g.principal_name ?? "—"}</Td>
                    <Td className="text-[var(--muted)]">{g.contact_email ?? "—"}</Td>
                    <Td className="tabular-nums">{g.locations}</Td>
                    <Td className="tabular-nums">{g.employees}</Td>
                    <Td>{stats ? <ProgressBar value={stats.completion} tone={completionTone(stats.completion)} showLabel size="sm" /> : "—"}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      <Card>
        <CardHeader title="Regions" subtitle={`${regions.length} regions`} />
        <TableWrap>
          <Table className="min-w-[620px]">
            <thead><tr><Th>Region</Th><Th>Code</Th><Th>Restaurants</Th><Th>Employees</Th><Th className="w-36">Completion</Th><Th>Overdue</Th></tr></thead>
            <tbody>
              {regions.map((r) => {
                const stats = regionCompletion.get(r.name);
                return (
                  <Tr key={r.id}>
                    <Td className="font-medium">{r.name}</Td>
                    <Td className="font-mono text-[12px] text-[var(--muted)]">{r.code}</Td>
                    <Td className="tabular-nums">{r.locations}</Td>
                    <Td className="tabular-nums">{r.employees}</Td>
                    <Td>{stats ? <ProgressBar value={stats.completion} tone={completionTone(stats.completion)} showLabel size="sm" /> : "—"}</Td>
                    <Td className="tabular-nums">{stats?.overdue ?? 0}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      </Card>
    </div>
  );
}
