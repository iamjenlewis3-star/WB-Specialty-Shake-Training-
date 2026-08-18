import Link from "next/link";
import { Building2, Download, Store } from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import { locationPerformance } from "@/lib/services/analytics";
import { filterOptions } from "@/lib/services/people";
import { getSetting } from "@/lib/services/settings";
import { Card, CardBody, CardHeader, EmptyState, KpiTile, PageHeader, Pill, ProgressBar, Table, TableWrap, Td, Th, Tr } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { ClearFilters, FilterSelect, SearchInput } from "@/components/ui/interactive";
import { formatRelative, completionTone, healthBand } from "@/lib/utils";

export const metadata = { title: "Locations" };
export const dynamic = "force-dynamic";

export default async function LocationsPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; group?: string; region?: string }> }) {
  const user = await requirePermission(["locations.manage", "reports.view"]);
  const sp = await searchParams;
  const [locations, options, thresholds] = await Promise.all([
    locationPerformance(user.scope, { franchiseGroupId: sp.group, regionId: sp.region }),
    filterOptions(user.scope),
    getSetting<{ green: number; yellow: number }>("risk_thresholds", { green: 90, yellow: 75 }),
  ]);
  const needle = sp.q?.toLowerCase();
  const rows = locations.filter((l) => !needle || l.name.toLowerCase().includes(needle) || l.store_number.includes(needle));
  const employees = rows.reduce((sum, l) => sum + l.employees, 0);
  const avgCompletion = rows.length ? Math.round(rows.reduce((s, l) => s + l.completion_pct, 0) / rows.length) : 0;
  const atRisk = rows.filter((l) => l.completion_pct < thresholds.green).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Locations"
        description="Every restaurant you have access to, with live training completion, certification risk and a configurable training health score."
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Locations" }]}
        actions={<LinkButton href="/api/export?report=location_completion&format=xlsx" variant="outline" size="sm"><Download size={15} /> Export</LinkButton>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Restaurants" value={rows.length} sublabel="In your access scope" tone="info" icon={<Store size={16} />} />
        <KpiTile label="Employees" value={employees.toLocaleString()} sublabel="Active team members" tone="neutral" />
        <KpiTile label="Average completion" value={`${avgCompletion}%`} sublabel="Required training" tone={completionTone(avgCompletion, thresholds)} />
        <KpiTile label="Below standard" value={atRisk} sublabel={`Under ${thresholds.green}% completion`} tone={atRisk ? "warning" : "success"} />
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-center gap-2">
          <SearchInput placeholder="Search restaurants…" className="w-full sm:w-72" />
          <FilterSelect paramKey="group" label="Franchise group" allLabel="All franchise groups" options={options.groups.map((g) => ({ value: g.id, label: g.name }))} />
          <FilterSelect paramKey="region" label="Region" allLabel="All regions" options={options.regions.map((r) => ({ value: r.id, label: r.name }))} />
          <ClearFilters keys={["q", "group", "region"]} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Restaurants" subtitle={`${rows.length} locations`} icon={<Building2 size={17} />} />
        {rows.length === 0 ? (
          <EmptyState title="No restaurants match those filters" />
        ) : (
          <TableWrap>
            <Table className="min-w-[1040px]">
              <thead>
                <tr>
                  <Th>Store #</Th><Th>Location</Th><Th>Franchise group</Th><Th>Region</Th><Th>General Manager</Th>
                  <Th>FBP</Th><Th>Employees</Th><Th className="w-36">Completion</Th><Th>Overdue</Th>
                  <Th>Certs expiring</Th><Th>Inactive</Th><Th>Last activity</Th><Th>Health</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => {
                  const band = healthBand(l.health_score);
                  return (
                    <Tr key={l.id}>
                      <Td className="font-mono text-[12px] text-[var(--muted)]">{l.store_number}</Td>
                      <Td>
                        <Link href={`/locations/${l.id}`} className="font-medium hover:text-[var(--accent)]">{l.name}</Link>
                        <span className="block text-[11.5px] text-[var(--muted)]">{l.city}, {l.state}</span>
                      </Td>
                      <Td className="text-[var(--muted)]">{l.franchise_group_name ?? "—"}</Td>
                      <Td className="text-[var(--muted)]">{l.region_name ?? "—"}</Td>
                      <Td className="text-[var(--muted)]">{l.gm_name ?? "—"}</Td>
                      <Td className="text-[var(--muted)]">{l.fbp_name ?? "—"}</Td>
                      <Td className="tabular-nums">{l.employees}</Td>
                      <Td><ProgressBar value={l.completion_pct} tone={completionTone(l.completion_pct, thresholds)} showLabel size="sm" /></Td>
                      <Td>{l.overdue > 0 ? <Pill tone="danger">{l.overdue}</Pill> : <span className="text-[var(--muted-2)]">0</span>}</Td>
                      <Td className="tabular-nums">{l.expiring_certs}</Td>
                      <Td className="tabular-nums">{l.inactive_users}</Td>
                      <Td className="whitespace-nowrap text-[var(--muted)]">{formatRelative(l.last_activity)}</Td>
                      <Td><Pill tone={band.tone} dot>{band.label}</Pill></Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
