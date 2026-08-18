import { notFound } from "next/navigation";
import Link from "next/link";
import { Download, FileSpreadsheet } from "lucide-react";
import { requirePermission, can } from "@/lib/auth/guard";
import { reportByKey, type ReportColumn } from "@/lib/services/reports";
import { filterOptions } from "@/lib/services/people";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Pill, ProgressBar, SourcePill, StatusPill, Table, TableWrap, Td, Th, Tr } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { ClearFilters, FilterSelect, SearchInput } from "@/components/ui/interactive";
import { PrintButton } from "@/components/ui/print-button";
import { SaveViewButton } from "@/components/reports/save-view";
import { formatDate, formatDuration, completionTone } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ reportKey: string }> }) {
  const { reportKey } = await params;
  return { title: reportByKey(reportKey)?.name ?? "Report" };
}

function renderCell(value: unknown, column: ReportColumn) {
  if (value === null || value === undefined || value === "") return <span className="text-[var(--muted-2)]">—</span>;
  switch (column.type) {
    case "percent": {
      const pct = Math.round(Number(value));
      return (
        <span className="flex items-center gap-2">
          <ProgressBar value={pct} tone={completionTone(pct)} size="sm" className="w-20" />
          <span className="tabular-nums">{pct}%</span>
        </span>
      );
    }
    case "date": return <span className="whitespace-nowrap">{formatDate(String(value))}</span>;
    case "duration": return <span className="whitespace-nowrap">{formatDuration(Number(value))}</span>;
    case "status": return <StatusPill status={String(value)} />;
    case "source": return <SourcePill source={String(value)} />;
    case "number": return <span className="tabular-nums">{Number(value).toLocaleString()}</span>;
    default: return <span>{String(value)}</span>;
  }
}

export default async function ReportPage({
  params, searchParams,
}: {
  params: Promise<{ reportKey: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("reports.view");
  const { reportKey } = await params;
  const sp = await searchParams;
  const report = reportByKey(reportKey);
  if (!report) notFound();

  const filters = {
    q: sp.q, locationId: sp.location, franchiseGroupId: sp.group, regionId: sp.region, roleId: sp.role,
    departmentId: sp.department, status: sp.status, source: sp.source, from: sp.from, to: sp.to, limit: 1000,
  };
  const [rows, options] = await Promise.all([report.run(user.scope, filters), filterOptions(user.scope)]);

  // The custom report builder passes a `columns` list; honour it when present.
  const selectedKeys = sp.columns?.split(",").filter(Boolean);
  const columns = selectedKeys?.length
    ? report.columns.filter((c) => selectedKeys.includes(c.key))
    : report.columns;

  // Optional grouping/sorting chosen in the builder.
  const sortKey = sp.sort_by;
  const sorted = sortKey
    ? [...rows].sort((a, b) => {
        const av = a[sortKey], bv = b[sortKey];
        const cmp = typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av ?? "").localeCompare(String(bv ?? ""));
        return sp.dir === "desc" ? -cmp : cmp;
      })
    : rows;

  const exportParams = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
  exportParams.set("report", report.key);

  const showFilter = (name: string) => report.filters.includes(name);

  return (
    <div className="space-y-5">
      <PageHeader
        title={report.name}
        description={report.description}
        breadcrumb={[{ label: "Reports", href: "/reports" }, { label: report.name }]}
        actions={
          <>
            <PrintButton />
            {can(user, "reports.export") ? (
              <>
                <LinkButton href={`/api/export?${exportParams.toString()}&format=csv`} variant="outline" size="sm"><Download size={15} /> CSV</LinkButton>
                <LinkButton href={`/api/export?${exportParams.toString()}&format=xlsx`} variant="outline" size="sm"><FileSpreadsheet size={15} /> XLSX</LinkButton>
              </>
            ) : null}
            <SaveViewButton reportKey={report.key} />
          </>
        }
      />

      <Card className="no-print">
        <CardBody className="flex flex-wrap items-center gap-2">
          {showFilter("search") ? <SearchInput placeholder="Search…" className="w-full sm:w-64" /> : null}
          {showFilter("location") ? <FilterSelect paramKey="location" label="Location" allLabel="All locations" options={options.locations.map((l) => ({ value: l.id, label: l.name }))} /> : null}
          {showFilter("group") ? <FilterSelect paramKey="group" label="Franchise group" allLabel="All groups" options={options.groups.map((g) => ({ value: g.id, label: g.name }))} /> : null}
          {showFilter("region") ? <FilterSelect paramKey="region" label="Region" allLabel="All regions" options={options.regions.map((r) => ({ value: r.id, label: r.name }))} /> : null}
          {showFilter("role") ? <FilterSelect paramKey="role" label="Role" allLabel="All roles" options={options.roles.map((r) => ({ value: r.id, label: r.name }))} /> : null}
          {showFilter("department") ? <FilterSelect paramKey="department" label="Department" allLabel="All departments" options={options.departments.map((d) => ({ value: d.id, label: d.name }))} /> : null}
          {showFilter("source") ? <FilterSelect paramKey="source" label="Source" allLabel="All sources" options={[{ value: "Wahlburgers Academy", label: "Wahlburgers Academy" }, { value: "Legacy LMS", label: "Legacy LMS" }]} /> : null}
          {showFilter("dates") ? (
            <>
              <input type="date" name="from" defaultValue={sp.from} aria-label="From date"
                className="h-9 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-[13px]" />
              <input type="date" name="to" defaultValue={sp.to} aria-label="To date"
                className="h-9 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-[13px]" />
            </>
          ) : null}
          <ClearFilters keys={["q", "location", "group", "region", "role", "department", "status", "source", "from", "to"]} />
          <Pill tone="neutral" className="ml-auto">{rows.length.toLocaleString()} rows</Pill>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={report.name} subtitle={`${rows.length.toLocaleString()} rows · generated ${formatDate(new Date(), { hour: "numeric", minute: "2-digit" })}`} />
        {rows.length === 0 ? (
          <EmptyState title="No rows match those filters" description="Try widening the date range or clearing a filter." />
        ) : (
          <TableWrap>
            <Table className="min-w-[900px]">
              <thead>
                <tr>{columns.map((c) => <Th key={c.key} className={c.align === "right" ? "text-right" : ""}>{c.label}</Th>)}</tr>
              </thead>
              <tbody>
                {sorted.slice(0, 500).map((row, i) => (
                  <Tr key={i}>
                    {columns.map((c) => (
                      <Td key={c.key} className={c.align === "right" ? "text-right" : ""}>{renderCell(row[c.key], c)}</Td>
                    ))}
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
        {rows.length > 500 ? (
          <CardBody className="text-[12.5px] text-[var(--muted)]">
            Showing the first 500 rows. <Link href={`/api/export?${exportParams.toString()}&format=xlsx`} className="font-medium text-[var(--accent)] hover:underline">Export the full report</Link> to see all {rows.length.toLocaleString()} rows.
          </CardBody>
        ) : null}
      </Card>
    </div>
  );
}
