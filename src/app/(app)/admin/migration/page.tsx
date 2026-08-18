import Link from "next/link";
import { AlertTriangle, CheckCircle2, Database, FileSpreadsheet, Upload } from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import { listMigrations, migrationStats, DATA_TYPES } from "@/lib/services/migration";
import { Card, CardBody, CardHeader, EmptyState, KpiTile, PageHeader, Pill, Table, TableWrap, Td, Th, Tr } from "@/components/ui/primitives";
import { Field, Select, SubmitButton } from "@/components/ui/interactive";
import { uploadMigrationFile } from "@/lib/actions/migration";
import { formatDate, formatRelative } from "@/lib/utils";

export const metadata = { title: "Data Migration" };
export const dynamic = "force-dynamic";

export default async function MigrationPage() {
  await requirePermission(["migration.run", "users.import"]);
  const [stats, migrations] = await Promise.all([migrationStats(), listMigrations(30)]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Data Migration Center"
        description="Bring employees, courses, completion history, assessments, certifications and learning path progress across from the legacy LMS — with mapping, validation and a full import report."
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Data Migration" }]}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Employees imported" value={Number(stats.employees_imported).toLocaleString()} sublabel="From legacy systems" tone="info" icon={<Database size={16} />} />
        <KpiTile label="Historical completions" value={Number(stats.historical_imported).toLocaleString()} sublabel="Live on learner transcripts" tone="success" icon={<CheckCircle2 size={16} />} />
        <KpiTile label="Certifications imported" value={Number(stats.certifications_imported).toLocaleString()} sublabel="Including expiry dates" tone="accent" />
        <KpiTile label="Courses imported" value={Number(stats.courses_imported).toLocaleString()} sublabel="Legacy catalog preserved" tone="neutral" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Assessment results" value={Number(stats.assessments_imported).toLocaleString()} sublabel="Attempts and scores" tone="info" />
        <KpiTile label="Learning path progress" value={Number(stats.paths_imported).toLocaleString()} sublabel="Progress carried forward" tone="info" />
        <KpiTile label="Failed records" value={Number(stats.failed_records).toLocaleString()} sublabel="Downloadable error reports" tone="danger" icon={<AlertTriangle size={16} />} />
        <KpiTile label="Warnings" value={Number(stats.warning_records).toLocaleString()} sublabel="Imported with notes" tone="warning" />
      </div>

      <Card>
        <CardHeader
          title="Start a migration"
          subtitle="Step 1 of 5 · upload a CSV or XLSX export from the legacy system"
          icon={<Upload size={17} />}
        />
        <CardBody>
          <form action={uploadMigrationFile} className="grid gap-4 sm:grid-cols-2" encType="multipart/form-data">
            <Field label="What are you importing?" required>
              <Select name="data_type" required defaultValue="historical_training">
                {DATA_TYPES.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </Select>
            </Field>
            <Field label="File" required hint="CSV or XLSX up to 60 MB">
              <input
                type="file" name="file" accept=".csv,.xlsx,.xls,.tsv" required
                className="block w-full rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-4 text-[13px] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--primary)] file:px-3 file:py-1.5 file:text-[12.5px] file:font-semibold file:text-[var(--primary-foreground)]"
              />
            </Field>
            <input type="hidden" name="return_to" value="/admin/migration" />
            <div className="sm:col-span-2"><SubmitButton size="lg" pendingLabel="Reading file…">Upload and preview</SubmitButton></div>
          </form>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {DATA_TYPES.map((d) => (
              <div key={d.key} className="rounded-lg border border-[var(--border)] p-3">
                <p className="text-[13px] font-semibold">{d.label}</p>
                <p className="mt-0.5 text-[11.5px] text-[var(--muted)]">{d.description}</p>
                <p className="mt-1.5 text-[11px] text-[var(--muted-2)]">{d.fields.length} supported fields</p>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Migration history"
          subtitle={stats.last_migration ? `Last migration ${formatRelative(stats.last_migration)} · ${stats.batches} batches` : "No migrations yet"}
          icon={<FileSpreadsheet size={17} />}
        />
        {migrations.length === 0 ? (
          <EmptyState title="No migrations run yet" description="Upload a legacy export above to get started." />
        ) : (
          <TableWrap>
            <Table className="min-w-[940px]">
              <thead>
                <tr><Th>Migration</Th><Th>Data type</Th><Th>Source</Th><Th>File</Th><Th>Records</Th><Th>Imported</Th><Th>Skipped</Th><Th>Failed</Th><Th>Warnings</Th><Th>Run</Th><Th>Status</Th></tr>
              </thead>
              <tbody>
                {migrations.map((m) => (
                  <Tr key={m.id}>
                    <Td><Link href={`/admin/migration/report/${m.id}`} className="font-medium hover:text-[var(--accent)]">{m.name}</Link></Td>
                    <Td className="capitalize text-[var(--muted)]">{m.data_type.replace(/_/g, " ")}</Td>
                    <Td>{m.source_system}</Td>
                    <Td className="font-mono text-[11.5px] text-[var(--muted)]">{m.file_name ?? "—"}</Td>
                    <Td className="tabular-nums">{m.total_records.toLocaleString()}</Td>
                    <Td className="tabular-nums text-[var(--success)]">{m.imported.toLocaleString()}</Td>
                    <Td className="tabular-nums">{m.skipped}</Td>
                    <Td className="tabular-nums text-[var(--danger)]">{m.failed}</Td>
                    <Td className="tabular-nums text-[var(--warning)]">{m.warnings}</Td>
                    <Td className="whitespace-nowrap text-[var(--muted)]">{formatDate(m.started_at)}</Td>
                    <Td><Pill tone={m.status === "completed" ? "success" : m.status === "failed" ? "danger" : "info"}>{m.status}</Pill></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Card>
        <CardBody className="text-[13px] text-[var(--muted)]">
          <p className="mb-1.5 font-semibold text-[var(--foreground)]">How migrated records behave</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Every imported record is stamped with its <strong>source system</strong>, <strong>source record ID</strong> and <strong>migration batch ID</strong>.</li>
            <li>Historical completions are written into the same tables as Academy training, so transcripts show one continuous history.</li>
            <li>Records stay on the transcript when an employee becomes inactive, deactivated or terminated.</li>
            <li>Failed and skipped rows are kept with their original values and reasons, and can be downloaded as an error report.</li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
