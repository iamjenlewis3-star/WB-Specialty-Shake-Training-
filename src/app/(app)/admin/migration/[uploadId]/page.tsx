import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowRight, CheckCircle2, Columns3, ShieldCheck } from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import { dataTypeDefinition, readUpload, suggestMapping, validateRows, type DataType, type MatchOptions } from "@/lib/services/migration";
import { Card, CardBody, CardHeader, KpiTile, PageHeader, Pill, Table, TableWrap, Td, Th, Tr } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { Field, Select, Checkbox, SubmitButton } from "@/components/ui/interactive";
import { runMigration, validateMigration } from "@/lib/actions/migration";
import { cn } from "@/lib/utils";

export const metadata = { title: "Migration wizard" };
export const dynamic = "force-dynamic";

const STEPS = ["Upload", "Map columns", "Validate", "Resolve", "Import"];

export default async function MigrationWizardPage({
  params, searchParams,
}: {
  params: Promise<{ uploadId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission(["migration.run", "users.import"]);
  const { uploadId } = await params;
  const sp = await searchParams;
  const dataType = (sp.type ?? "employees") as DataType;
  const definition = dataTypeDefinition(dataType);
  const upload = readUpload(uploadId);
  if (!upload || !definition) notFound();

  const isValidateStep = sp.step === "validate";
  const mapping: Record<string, string> = isValidateStep && sp.mapping
    ? JSON.parse(sp.mapping)
    : suggestMapping(upload.headers, dataType);
  const options: MatchOptions = {
    matchBy: (sp.match_by as MatchOptions["matchBy"]) ?? "employee_id",
    createMissingEmployees: sp.create_employees === "true",
    createMissingCourses: sp.create_courses === "true",
    skipDuplicates: sp.skip_duplicates !== "false",
  };

  const validation = isValidateStep ? await validateRows(dataType, upload.rows, mapping, options) : null;
  const stepIndex = isValidateStep ? 2 : 1;
  const preview = upload.rows.slice(0, 8);

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Migrate ${definition.label.toLowerCase()}`}
        description={`${upload.fileName} · ${upload.rows.length.toLocaleString()} rows`}
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Data Migration", href: "/admin/migration" }, { label: definition.label }]}
      />

      <Card>
        <CardBody className="flex flex-wrap items-center gap-2">
          {STEPS.map((step, i) => (
            <span key={step} className="flex items-center gap-2">
              <span className={cn("flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-medium",
                i <= stepIndex ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "bg-[var(--surface-3)] text-[var(--muted)]")}>
                <span className="tabular-nums">{i + 1}</span> {step}
              </span>
              {i < STEPS.length - 1 ? <ArrowRight size={14} className="text-[var(--muted-2)]" /> : null}
            </span>
          ))}
        </CardBody>
      </Card>

      {!isValidateStep ? (
        <form action={validateMigration} className="space-y-5">
          <input type="hidden" name="upload_id" value={uploadId} />
          <input type="hidden" name="data_type" value={dataType} />

          <Card>
            <CardHeader title="Preview" subtitle="The first rows exactly as they appear in your file" />
            <TableWrap>
              <Table className="min-w-[900px]">
                <thead><tr>{upload.headers.map((h) => <Th key={h}>{h}</Th>)}</tr></thead>
                <tbody>
                  {preview.map((row, i) => (
                    <Tr key={i}>{upload.headers.map((h) => <Td key={h} className="max-w-[220px] truncate">{String(row[h] ?? "")}</Td>)}</Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </Card>

          <Card>
            <CardHeader
              title="Map columns"
              subtitle="We matched your headers automatically — adjust anything that looks wrong"
              icon={<Columns3 size={17} />}
              action={
                <LinkButton href={`/admin/migration/${uploadId}?type=${dataType}`} variant="ghost" size="sm">
                  Reset to suggested mapping
                </LinkButton>
              }
            />
            <CardBody className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {definition.fields.map((field) => (
                <Field key={field.key} label={field.label} required={field.required} hint={field.hint}>
                  <Select name={`map_${field.key}`} defaultValue={mapping[field.key] ?? ""}>
                    <option value="">— not mapped —</option>
                    {upload.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </Select>
                </Field>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Matching rules" subtitle="How rows are matched to existing Academy records" icon={<ShieldCheck size={17} />} />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Match employees by" required>
                <Select name="match_by" defaultValue="employee_id">
                  <option value="employee_id">Employee ID</option>
                  <option value="email">Email address</option>
                  <option value="username">Username</option>
                  <option value="name_location">Name + location</option>
                </Select>
              </Field>
              <div className="space-y-1">
                <Checkbox name="create_missing_employees" label="Create employees that don't exist" description="Otherwise unmatched rows are reported as errors" />
                <Checkbox name="create_missing_courses" label="Create courses that don't exist" description="Legacy courses are added as archived catalog entries" />
                <Checkbox name="skip_duplicates" label="Skip duplicate rows" defaultChecked description="Same employee, course and completion date" />
              </div>
              <div className="sm:col-span-2">
                <SubmitButton size="lg" pendingLabel="Validating…">Validate {upload.rows.length.toLocaleString()} rows</SubmitButton>
              </div>
            </CardBody>
          </Card>
        </form>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiTile label="Ready to import" value={validation!.ok.toLocaleString()} sublabel="Clean rows" tone="success" icon={<CheckCircle2 size={16} />} />
            <KpiTile label="Warnings" value={validation!.warnings.toLocaleString()} sublabel="Import with notes" tone="warning" icon={<AlertTriangle size={16} />} />
            <KpiTile label="Errors" value={validation!.errors.toLocaleString()} sublabel="Will not be imported" tone="danger" />
            <KpiTile label="Duplicates" value={validation!.duplicates.toLocaleString()} sublabel={options.skipDuplicates ? "Will be skipped" : "Will be imported"} tone="neutral" />
          </div>

          <Card>
            <CardHeader title="Validation results" subtitle="Every row, matched against existing Academy records" />
            <TableWrap>
              <Table className="min-w-[960px]">
                <thead>
                  <tr><Th>Row</Th><Th>Status</Th><Th>Matched</Th><Th>Key values</Th><Th>Messages</Th></tr>
                </thead>
                <tbody>
                  {validation!.rows.slice(0, 100).map((row) => (
                    <Tr key={row.rowNumber}>
                      <Td className="tabular-nums text-[var(--muted)]">{row.rowNumber}</Td>
                      <Td>
                        <Pill tone={row.status === "ok" ? "success" : row.status === "warning" ? "warning" : row.status === "duplicate" ? "neutral" : "danger"}>
                          {row.status}
                        </Pill>
                      </Td>
                      <Td className="text-[12px] text-[var(--muted)]">
                        {row.matchedUserId ? `employee · ${row.matchedBy}` : "—"}
                        {row.matchedCourseId ? " · course" : ""}
                      </Td>
                      <Td className="max-w-[280px] truncate text-[12px]">
                        {Object.entries(row.values).filter(([, v]) => v).slice(0, 4).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                      </Td>
                      <Td className="text-[12px] text-[var(--muted)]">{row.messages.join(" · ") || "—"}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
            {validation!.rows.length > 100 ? (
              <CardBody className="text-[12.5px] text-[var(--muted)]">
                Showing the first 100 of {validation!.rows.length.toLocaleString()} rows. The full result is recorded in the migration report.
              </CardBody>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Import" subtitle="Resolve, then import. Failed rows are kept with their reasons for download." />
            <CardBody>
              <form action={runMigration} className="grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="upload_id" value={uploadId} />
                <input type="hidden" name="data_type" value={dataType} />
                <input type="hidden" name="mapping" value={JSON.stringify(mapping)} />
                <input type="hidden" name="match_by" value={options.matchBy} />
                <Field label="Source system label" hint="Stamped on every imported record">
                  <Select name="source_system" defaultValue="Legacy LMS">
                    <option value="Legacy LMS">Legacy LMS</option>
                    <option value="Manual Entry">Manual Entry</option>
                    <option value="API Import">API Import</option>
                    <option value="Migration Import">Migration Import</option>
                  </Select>
                </Field>
                <div className="space-y-1">
                  <Checkbox name="create_missing_employees" label="Create employees that don't exist" defaultChecked={options.createMissingEmployees} />
                  <Checkbox name="create_missing_courses" label="Create courses that don't exist" defaultChecked={options.createMissingCourses} />
                  <Checkbox name="skip_duplicates" label="Skip duplicate rows" defaultChecked={options.skipDuplicates} />
                </div>
                <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
                  <SubmitButton size="lg" pendingLabel="Importing…">
                    Import {(validation!.ok + validation!.warnings + (options.skipDuplicates ? 0 : validation!.duplicates)).toLocaleString()} records
                  </SubmitButton>
                  <Link href={`/admin/migration/${uploadId}?type=${dataType}`} className="text-[13px] font-medium text-[var(--muted)] hover:text-[var(--foreground)]">
                    Back to mapping
                  </Link>
                </div>
              </form>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
