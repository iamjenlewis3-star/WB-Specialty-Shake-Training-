import { CalendarClock, Play, Trash2 } from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import { REPORTS, scheduledReports } from "@/lib/services/reports";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Pill, Table, TableWrap, Td, Th, Tr } from "@/components/ui/primitives";
import { Field, Select, TextInput, SubmitButton } from "@/components/ui/interactive";
import { createScheduledReport, deleteScheduledReport, runScheduledReportNow, toggleScheduledReport } from "@/lib/actions/reports";
import { formatDate, formatRelative } from "@/lib/utils";

export const metadata = { title: "Scheduled reports" };
export const dynamic = "force-dynamic";

export default async function ScheduledReportsPage() {
  await requirePermission("reports.schedule");
  const schedules = await scheduledReports();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Scheduled reports"
        description="Recurring delivery of the reports leadership relies on. Delivery runs through an integration adapter — in this environment recipients receive the report in their Academy notifications with a download link."
        breadcrumb={[{ label: "Reports", href: "/reports" }, { label: "Scheduled" }]}
      />

      <Card>
        <CardHeader title="New schedule" icon={<CalendarClock size={17} />} />
        <CardBody>
          <form action={createScheduledReport} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Field label="Schedule name" required><TextInput name="name" required placeholder="e.g. Monday Franchise Compliance" /></Field>
            <Field label="Report" required>
              <Select name="report_key" required defaultValue="location_completion">
                {REPORTS.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
              </Select>
            </Field>
            <Field label="Frequency" required>
              <Select name="frequency" required defaultValue="weekly">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </Select>
            </Field>
            <Field label="Hour (24h)"><TextInput name="hour" type="number" min={0} max={23} defaultValue={7} /></Field>
            <Field label="Format">
              <Select name="format" defaultValue="xlsx">
                <option value="csv">CSV</option>
                <option value="xlsx">XLSX</option>
                <option value="pdf">PDF-ready</option>
              </Select>
            </Field>
            <Field label="Recipients" required hint="Comma separated email addresses">
              <TextInput name="recipients" required placeholder="training@wahlburgers.test, ops@wahlburgers.test" />
            </Field>
            <div className="sm:col-span-2 xl:col-span-3">
              <SubmitButton pendingLabel="Creating…">Create schedule</SubmitButton>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Active schedules" subtitle={`${schedules.length} configured`} />
        {schedules.length === 0 ? (
          <EmptyState title="No scheduled reports yet" description="Create one above to have reports delivered automatically." />
        ) : (
          <TableWrap>
            <Table className="min-w-[860px]">
              <thead>
                <tr><Th>Name</Th><Th>Report</Th><Th>Frequency</Th><Th>Recipients</Th><Th>Format</Th><Th>Last run</Th><Th>Next run</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr>
              </thead>
              <tbody>
                {schedules.map((s) => (
                  <Tr key={s.id}>
                    <Td className="font-medium">{s.name}</Td>
                    <Td className="text-[var(--muted)]">{REPORTS.find((r) => r.key === s.report_key)?.name ?? s.report_key}</Td>
                    <Td className="capitalize">{s.frequency} · {String(s.hour).padStart(2, "0")}:00</Td>
                    <Td className="text-[12px] text-[var(--muted)]">{s.recipients.join(", ")}</Td>
                    <Td className="uppercase">{s.format}</Td>
                    <Td className="whitespace-nowrap text-[var(--muted)]">{s.last_run_at ? formatRelative(s.last_run_at) : "—"}</Td>
                    <Td className="whitespace-nowrap text-[var(--muted)]">{s.next_run_at ? formatDate(s.next_run_at) : "—"}</Td>
                    <Td><Pill tone={s.is_active ? "success" : "neutral"}>{s.is_active ? "Active" : "Paused"}</Pill></Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1.5">
                        <form action={runScheduledReportNow}>
                          <input type="hidden" name="id" value={s.id} />
                          <SubmitButton variant="outline" size="sm" pendingLabel="Running…"><Play size={13} /> Run now</SubmitButton>
                        </form>
                        <form action={toggleScheduledReport}>
                          <input type="hidden" name="id" value={s.id} />
                          <SubmitButton variant="ghost" size="sm" pendingLabel="…">{s.is_active ? "Pause" : "Resume"}</SubmitButton>
                        </form>
                        <form action={deleteScheduledReport}>
                          <input type="hidden" name="id" value={s.id} />
                          <SubmitButton variant="ghost" size="sm" pendingLabel="…"><Trash2 size={13} /></SubmitButton>
                        </form>
                      </div>
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
