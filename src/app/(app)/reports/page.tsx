import Link from "next/link";
import { CalendarClock, FileBarChart, Star, Trash2, Wrench } from "lucide-react";
import { requirePermission, can } from "@/lib/auth/guard";
import { REPORTS, savedReports, scheduledReports } from "@/lib/services/reports";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Pill } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/interactive";
import { deleteSavedReport } from "@/lib/actions/reports";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const user = await requirePermission("reports.view");
  const [saved, scheduled] = await Promise.all([savedReports(user.id), scheduledReports()]);
  const categories = Array.from(new Set(REPORTS.map((r) => r.category)));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        description="Standard reports, saved views and scheduled delivery — all built on your access scope."
        actions={
          <>
            <LinkButton href="/reports/builder" variant="outline" size="sm"><Wrench size={15} /> Custom report</LinkButton>
            {can(user, "reports.schedule") ? (
              <LinkButton href="/reports/scheduled" variant="primary" size="sm"><CalendarClock size={15} /> Scheduled reports</LinkButton>
            ) : null}
          </>
        }
      />

      {saved.length > 0 ? (
        <Card>
          <CardHeader title="Saved views" subtitle="Your team's frequently used reports" icon={<Star size={17} />} />
          <CardBody className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {saved.map((view) => (
              <div key={view.id} className="rounded-xl border border-[var(--border)] p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/reports/${view.report_key}?${new URLSearchParams(
                      Object.entries((view.config ?? {}) as Record<string, string>)
                        .filter(([, v]) => typeof v === "string") as [string, string][]).toString()}`}
                    className="text-[13.5px] font-semibold hover:text-[var(--accent)]"
                  >
                    {view.name}
                  </Link>
                  {view.is_shared ? <Pill tone="info">Shared</Pill> : null}
                </div>
                <p className="mt-1 line-clamp-2 text-[12px] text-[var(--muted)]">{view.description}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[11.5px] text-[var(--muted-2)]">{view.owner_name} · {formatDate(view.created_at)}</span>
                  <form action={deleteSavedReport}>
                    <input type="hidden" name="id" value={view.id} />
                    <SubmitButton variant="ghost" size="sm" pendingLabel="…"><Trash2 size={14} /></SubmitButton>
                  </form>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}

      {categories.map((category) => (
        <Card key={category}>
          <CardHeader title={category} subtitle={`${REPORTS.filter((r) => r.category === category).length} reports`} icon={<FileBarChart size={17} />} />
          <CardBody className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {REPORTS.filter((r) => r.category === category).map((report) => (
              <Link key={report.key} href={`/reports/${report.key}`} className="rounded-xl border border-[var(--border)] p-3.5 transition-colors hover:border-[var(--accent)]">
                <p className="text-[13.5px] font-semibold">{report.name}</p>
                <p className="mt-1 line-clamp-2 text-[12px] text-[var(--muted)]">{report.description}</p>
                <p className="mt-2 text-[11px] text-[var(--muted-2)]">{report.columns.length} columns</p>
              </Link>
            ))}
          </CardBody>
        </Card>
      ))}

      {can(user, "reports.schedule") ? (
        <Card>
          <CardHeader title="Scheduled delivery" subtitle="Reports that run on a schedule" icon={<CalendarClock size={17} />} action={<LinkButton href="/reports/scheduled" variant="outline" size="sm">Manage</LinkButton>} />
          <CardBody className="space-y-2.5">
            {scheduled.length === 0 ? <EmptyState title="No scheduled reports yet" /> : scheduled.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-2.5 last:border-b-0 last:pb-0">
                <div>
                  <p className="text-[13.5px] font-medium">{s.name}</p>
                  <p className="text-[12px] text-[var(--muted)]">
                    {s.frequency} at {String(s.hour).padStart(2, "0")}:00 · {s.format.toUpperCase()} · {s.recipients.length} recipients
                  </p>
                </div>
                <Pill tone={s.is_active ? "success" : "neutral"}>{s.is_active ? "Active" : "Paused"}</Pill>
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
