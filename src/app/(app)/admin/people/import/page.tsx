import Link from "next/link";
import { Upload, Users } from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import { listMigrations, dataTypeDefinition } from "@/lib/services/migration";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Pill, Table, TableWrap, Td, Th, Tr } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/interactive";
import { uploadMigrationFile } from "@/lib/actions/migration";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Import employees" };
export const dynamic = "force-dynamic";

export default async function ImportEmployeesPage() {
  await requirePermission("users.import");
  const definition = dataTypeDefinition("employees")!;
  const history = (await listMigrations(20)).filter((m) => m.data_type === "employees");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Import employees"
        description="Upload a CSV or XLSX roster. The Academy maps your columns, validates every row, matches existing employees and shows you exactly what will change before anything is imported."
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "People", href: "/admin/people" }, { label: "Import" }]}
      />

      <Card>
        <CardHeader title="Upload a roster" icon={<Upload size={17} />} subtitle="Step 1 of 5" />
        <CardBody>
          <form action={uploadMigrationFile} className="space-y-4" encType="multipart/form-data">
            <input type="hidden" name="data_type" value="employees" />
            <input type="hidden" name="return_to" value="/admin/people/import" />
            <input
              type="file" name="file" accept=".csv,.xlsx,.xls,.tsv" required
              className="block w-full rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-6 text-[13px] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--primary)] file:px-3 file:py-1.5 file:text-[12.5px] file:font-semibold file:text-[var(--primary-foreground)]"
            />
            <SubmitButton size="lg" pendingLabel="Reading file…">Upload and preview</SubmitButton>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Supported columns" subtitle="Headers are matched automatically — anything unmapped can be set by hand" icon={<Users size={17} />} />
        <CardBody className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {definition.fields.map((field) => (
            <div key={field.key} className="rounded-lg border border-[var(--border)] p-2.5">
              <p className="flex items-center gap-1.5 text-[13px] font-medium">
                {field.label}{field.required ? <Pill tone="accent">Required</Pill> : null}
              </p>
              <p className="mt-0.5 text-[11.5px] text-[var(--muted)]">Recognizes: {field.aliases.slice(0, 4).join(", ")}</p>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Recent employee imports" />
        {history.length === 0 ? (
          <EmptyState title="No employee imports yet" />
        ) : (
          <TableWrap>
            <Table className="min-w-[720px]">
              <thead><tr><Th>File</Th><Th>Records</Th><Th>Imported</Th><Th>Skipped</Th><Th>Failed</Th><Th>Run</Th><Th className="text-right">Report</Th></tr></thead>
              <tbody>
                {history.map((m) => (
                  <Tr key={m.id}>
                    <Td className="font-mono text-[12px]">{m.file_name}</Td>
                    <Td className="tabular-nums">{m.total_records}</Td>
                    <Td className="tabular-nums text-[var(--success)]">{m.imported}</Td>
                    <Td className="tabular-nums">{m.skipped}</Td>
                    <Td className="tabular-nums text-[var(--danger)]">{m.failed}</Td>
                    <Td className="whitespace-nowrap text-[var(--muted)]">{formatDate(m.started_at)}</Td>
                    <Td className="text-right">
                      <Link href={`/admin/migration/report/${m.id}`} className="text-[13px] font-medium text-[var(--accent)] hover:underline">Open</Link>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
