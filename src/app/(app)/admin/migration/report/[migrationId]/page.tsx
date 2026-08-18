import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet } from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import { migrationDetail } from "@/lib/services/migration";
import { Card, CardBody, CardHeader, DescriptionList, KpiTile, PageHeader, Pill, Table, TableWrap, Td, Th, Tr } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Migration report" };
export const dynamic = "force-dynamic";

export default async function MigrationReportPage({ params }: { params: Promise<{ migrationId: string }> }) {
  await requirePermission(["migration.run", "users.import"]);
  const { migrationId } = await params;
  const data = await migrationDetail(migrationId);
  if (!data) notFound();
  const { migration, records } = data;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Migration report"
        description={`${migration.name} · ${migration.file_name ?? "uploaded file"}`}
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Data Migration", href: "/admin/migration" }, { label: "Report" }]}
        actions={
          <LinkButton href={`/api/migration/${migration.id}/errors`} variant="outline" size="sm">
            <Download size={15} /> Download error report
          </LinkButton>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiTile label="Total records" value={migration.total_records.toLocaleString()} tone="neutral" />
        <KpiTile label="Imported" value={migration.imported.toLocaleString()} tone="success" icon={<CheckCircle2 size={16} />} />
        <KpiTile label="Warnings" value={migration.warnings.toLocaleString()} tone="warning" icon={<AlertTriangle size={16} />} />
        <KpiTile label="Skipped" value={migration.skipped.toLocaleString()} tone="info" />
        <KpiTile label="Failed" value={migration.failed.toLocaleString()} tone="danger" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader title="Record detail" subtitle="Failed rows first, with their original values" icon={<FileSpreadsheet size={17} />} />
          <TableWrap>
            <Table className="min-w-[900px]">
              <thead><tr><Th>Row</Th><Th>Status</Th><Th>Message</Th><Th>Resolution</Th><Th>Original values</Th></tr></thead>
              <tbody>
                {records.map((record) => (
                  <Tr key={record.id}>
                    <Td className="tabular-nums text-[var(--muted)]">{record.row_number}</Td>
                    <Td>
                      <Pill tone={record.status === "imported" ? "success" : record.status === "warning" ? "warning" : record.status === "skipped" ? "neutral" : "danger"}>
                        {record.status}
                      </Pill>
                    </Td>
                    <Td className="max-w-[280px] text-[12.5px]">{record.message ?? "—"}</Td>
                    <Td className="text-[12.5px] text-[var(--muted)]">{record.resolution ?? "—"}</Td>
                    <Td className="max-w-[320px] truncate font-mono text-[11.5px] text-[var(--muted)]">
                      {Object.entries(record.raw).filter(([, v]) => v).slice(0, 5).map(([k, v]) => `${k}=${v}`).join(" ")}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Migration details" />
            <CardBody>
              <DescriptionList
                items={[
                  { label: "Source system", value: migration.source_system },
                  { label: "Data type", value: <span className="capitalize">{migration.data_type.replace(/_/g, " ")}</span> },
                  { label: "Status", value: <Pill tone={migration.status === "completed" ? "success" : "info"}>{migration.status}</Pill> },
                  { label: "Started", value: formatDate(migration.started_at, { hour: "numeric", minute: "2-digit" }) },
                  { label: "Completed", value: migration.completed_at ? formatDate(migration.completed_at, { hour: "numeric", minute: "2-digit" }) : "—" },
                  { label: "Run by", value: migration.created_by_name ?? "—" },
                  { label: "Batch ID", value: <span className="font-mono text-[11.5px]">{migration.batch_id}</span> },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Column mapping" subtitle="What was mapped from the source file" />
            <CardBody className="space-y-1 text-[12.5px]">
              {Object.entries(migration.mapping ?? {}).map(([field, header]) => (
                <p key={field} className="flex items-center justify-between gap-2">
                  <span className="text-[var(--muted)]">{field.replace(/_/g, " ")}</span>
                  <span className="font-mono">{String(header)}</span>
                </p>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardBody className="text-[12.5px] text-[var(--muted)]">
              Imported records are live immediately: they appear on learner transcripts, in reports and in exports,
              tagged with source system <strong>{migration.source_system}</strong>.
              <div className="mt-3">
                <Link href="/reports/employee_transcript?source=Legacy%20LMS" className="font-medium text-[var(--accent)] hover:underline">
                  View migrated records in the transcript report →
                </Link>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
