"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Play, Star } from "lucide-react";
import { Card, CardBody, CardHeader, Pill } from "@/components/ui/primitives";
import { Field, Select, TextInput, Checkbox, SubmitButton, Modal, TextArea } from "@/components/ui/interactive";
import { buttonClass } from "@/components/ui/button";
import { saveReportView } from "@/lib/actions/reports";

interface ReportOption {
  key: string; name: string; description: string; category: string;
  columns: Array<{ key: string; label: string }>; filters: string[];
}
type Option = { value: string; label: string };

export function ReportBuilder({
  reports, locations, groups, regions, roles, departments,
}: {
  reports: ReportOption[]; locations: Option[]; groups: Option[]; regions: Option[]; roles: Option[]; departments: Option[];
}) {
  const router = useRouter();
  const [reportKey, setReportKey] = React.useState(reports[0]?.key ?? "");
  const report = reports.find((r) => r.key === reportKey)!;
  const [columns, setColumns] = React.useState<string[]>(report.columns.map((c) => c.key));
  const [filters, setFilters] = React.useState<Record<string, string>>({});
  const [sortBy, setSortBy] = React.useState("");
  const [dir, setDir] = React.useState("asc");
  const [saveOpen, setSaveOpen] = React.useState(false);

  React.useEffect(() => {
    setColumns(report.columns.map((c) => c.key));
    setSortBy("");
  }, [reportKey, report.columns]);

  const params = React.useMemo(() => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) p.set(k, v); });
    if (columns.length && columns.length !== report.columns.length) p.set("columns", columns.join(","));
    if (sortBy) { p.set("sort_by", sortBy); p.set("dir", dir); }
    return p;
  }, [filters, columns, report.columns.length, sortBy, dir]);

  const setFilter = (key: string, value: string) => setFilters((f) => ({ ...f, [key]: value }));
  const has = (name: string) => report.filters.includes(name);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <Card>
          <CardHeader title="1 · Choose a data set" subtitle="Each data set is scoped to the locations you can access" />
          <CardBody className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {reports.map((r) => (
              <button
                key={r.key} onClick={() => setReportKey(r.key)}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  r.key === reportKey ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-[var(--border)] hover:border-[var(--border-strong)]"}`}
              >
                <span className="block text-[13px] font-semibold">{r.name}</span>
                <span className="mt-0.5 block line-clamp-2 text-[11.5px] text-[var(--muted)]">{r.description}</span>
                <Pill tone="neutral" className="mt-2">{r.category}</Pill>
              </button>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="2 · Choose columns"
            subtitle={`${columns.length} of ${report.columns.length} selected`}
            action={
              <div className="flex gap-2">
                <button onClick={() => setColumns(report.columns.map((c) => c.key))} className={buttonClass("ghost", "sm")}>Select all</button>
                <button onClick={() => setColumns([])} className={buttonClass("ghost", "sm")}>Clear</button>
              </div>
            }
          />
          <CardBody className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
            {report.columns.map((c) => (
              <Checkbox
                key={c.key} label={c.label} checked={columns.includes(c.key)}
                onChange={(e) => setColumns((prev) => e.target.checked ? [...prev, c.key] : prev.filter((k) => k !== c.key))}
              />
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="3 · Filters, grouping and sorting" />
          <CardBody className="grid gap-3 sm:grid-cols-2">
            {has("search") ? (
              <Field label="Search"><TextInput value={filters.q ?? ""} onChange={(e) => setFilter("q", e.target.value)} placeholder="Name, course, location…" /></Field>
            ) : null}
            {has("location") ? (
              <Field label="Location">
                <Select value={filters.location ?? ""} onChange={(e) => setFilter("location", e.target.value)}>
                  <option value="">All locations</option>
                  {locations.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </Select>
              </Field>
            ) : null}
            {has("group") ? (
              <Field label="Franchise group">
                <Select value={filters.group ?? ""} onChange={(e) => setFilter("group", e.target.value)}>
                  <option value="">All franchise groups</option>
                  {groups.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                </Select>
              </Field>
            ) : null}
            {has("region") ? (
              <Field label="Region">
                <Select value={filters.region ?? ""} onChange={(e) => setFilter("region", e.target.value)}>
                  <option value="">All regions</option>
                  {regions.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </Select>
              </Field>
            ) : null}
            {has("role") ? (
              <Field label="Role">
                <Select value={filters.role ?? ""} onChange={(e) => setFilter("role", e.target.value)}>
                  <option value="">All roles</option>
                  {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </Select>
              </Field>
            ) : null}
            {has("department") ? (
              <Field label="Department">
                <Select value={filters.department ?? ""} onChange={(e) => setFilter("department", e.target.value)}>
                  <option value="">All departments</option>
                  {departments.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </Select>
              </Field>
            ) : null}
            {has("source") ? (
              <Field label="Source system">
                <Select value={filters.source ?? ""} onChange={(e) => setFilter("source", e.target.value)}>
                  <option value="">All sources</option>
                  <option value="Wahlburgers Academy">Wahlburgers Academy</option>
                  <option value="Legacy LMS">Legacy LMS</option>
                </Select>
              </Field>
            ) : null}
            {has("dates") ? (
              <>
                <Field label="From date"><TextInput type="date" value={filters.from ?? ""} onChange={(e) => setFilter("from", e.target.value)} /></Field>
                <Field label="To date"><TextInput type="date" value={filters.to ?? ""} onChange={(e) => setFilter("to", e.target.value)} /></Field>
              </>
            ) : null}
            <Field label="Sort by">
              <Select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="">Report default</option>
                {report.columns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </Select>
            </Field>
            <Field label="Sort direction">
              <Select value={dir} onChange={(e) => setDir(e.target.value)}>
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </Select>
            </Field>
          </CardBody>
        </Card>
      </div>

      <div className="space-y-4 lg:sticky lg:top-[72px] lg:h-fit">
        <Card>
          <CardHeader title="Report summary" />
          <CardBody className="space-y-2 text-[13px]">
            <p><span className="text-[var(--muted)]">Data set:</span> <strong>{report.name}</strong></p>
            <p><span className="text-[var(--muted)]">Columns:</span> {columns.length}</p>
            <p><span className="text-[var(--muted)]">Filters:</span> {Object.values(filters).filter(Boolean).length || "none"}</p>
            <p><span className="text-[var(--muted)]">Sort:</span> {sortBy ? `${report.columns.find((c) => c.key === sortBy)?.label} (${dir})` : "report default"}</p>
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => router.push(`/reports/${reportKey}${params.size ? `?${params}` : ""}`)}
                className={buttonClass("primary", "md", "w-full")}
              >
                <Play size={15} /> Run report
              </button>
              <button onClick={() => setSaveOpen(true)} className={buttonClass("outline", "md", "w-full")}>
                <Star size={15} /> Save as view
              </button>
              <a href={`/api/export?report=${reportKey}&${params.toString()}&format=xlsx`} className={buttonClass("ghost", "md", "w-full")}>
                Export XLSX
              </a>
            </div>
          </CardBody>
        </Card>
      </div>

      <Modal open={saveOpen} onClose={() => setSaveOpen(false)} title="Save custom report" description="Saved views appear on the Reports page for you and, if shared, for your team.">
        <form action={saveReportView} className="space-y-4">
          <input type="hidden" name="report_key" value={reportKey} />
          <input type="hidden" name="config" value={JSON.stringify(Object.fromEntries(params.entries()))} />
          <Field label="Name" required><TextInput name="name" required placeholder="e.g. Weekly Franchise Training Compliance" /></Field>
          <Field label="Description"><TextArea name="description" rows={2} /></Field>
          <Checkbox name="is_shared" label="Share with everyone who can run reports" defaultChecked />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setSaveOpen(false)} className={buttonClass("ghost", "sm")}>Cancel</button>
            <SubmitButton pendingLabel="Saving…">Save view</SubmitButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
