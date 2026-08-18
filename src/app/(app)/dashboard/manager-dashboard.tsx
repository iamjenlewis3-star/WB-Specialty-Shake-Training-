import Link from "next/link";
import {
  AlarmClock, BadgeCheck, CalendarClock, CheckCircle2, ClipboardList, Clock, UserMinus, Users, UserPlus,
} from "lucide-react";
import { Card, CardBody, CardHeader, KpiTile, PageHeader, Pill, ProgressBar, ProgressRing, Table, TableWrap, Td, Th, Tr, EmptyState, Avatar } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { BarChartView } from "@/components/charts";
import { completionByDimension, systemMetrics, upcomingLiveTraining, certificationRisk } from "@/lib/services/analytics";
import { listPeople } from "@/lib/services/people";
import { formatDate, formatDuration, formatRelative, completionTone } from "@/lib/utils";
import type { CurrentUser } from "@/lib/auth/session";
import { TeamQuickActions } from "@/components/team/quick-actions";

export async function ManagerDashboard({ user }: { user: CurrentUser }) {
  const [metrics, team, byRole, events, certRisk] = await Promise.all([
    systemMetrics(user.scope),
    listPeople(user.scope, { pageSize: 100, sort: "completion", dir: "asc" }),
    completionByDimension(user.scope, "role"),
    upcomingLiveTraining(user.scope, 5),
    certificationRisk(user.scope, 60, 6),
  ]);

  const fullyTrained = team.rows.filter((p) => Number(p.completion_pct) >= 100 && p.status === "active").length;
  const overdueEmployees = team.rows.filter((p) => Number(p.overdue_count) > 0).length;
  const neverLoggedIn = team.rows.filter((p) => !p.last_login_at).length;
  const newHires = team.rows.filter((p) => p.hire_date && new Date(p.hire_date) > new Date(Date.now() - 60 * 86400000)).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${user.locationName ?? "My team"} training`}
        description={`Team overview for ${user.displayName}. Every number below is limited to the restaurants you have access to.`}
        actions={
          <>
            <LinkButton href="/team" variant="outline" size="sm">Full team roster</LinkButton>
            <LinkButton href="/admin/assignments/new" variant="primary" size="sm">Assign training</LinkButton>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Card>
          <CardBody className="flex flex-col items-center gap-3 text-center">
            <ProgressRing
              value={metrics.completion_pct} size={128} stroke={11}
              tone={completionTone(metrics.completion_pct)} sublabel="Team completion"
            />
            <p className="text-[13px] text-[var(--muted)]">
              {metrics.required_complete.toLocaleString()} of {metrics.required_total.toLocaleString()} required assignments complete
            </p>
            <div className="grid w-full grid-cols-2 gap-2 pt-2">
              <div className="rounded-lg bg-[var(--surface-2)] p-2">
                <p className="text-[19px] font-semibold tabular-nums">{fullyTrained}</p>
                <p className="text-[11px] text-[var(--muted)]">Fully trained</p>
              </div>
              <div className="rounded-lg bg-[var(--surface-2)] p-2">
                <p className="text-[19px] font-semibold tabular-nums text-[var(--danger)]">{overdueEmployees}</p>
                <p className="text-[11px] text-[var(--muted)]">With overdue</p>
              </div>
            </div>
          </CardBody>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <KpiTile label="Overdue assignments" value={metrics.overdue_assignments} sublabel={`${metrics.overdue_learners} team members affected`} tone="danger" icon={<AlarmClock size={16} />} href="/team?overdue=1" />
          <KpiTile label="Due this week" value={metrics.completions_week} sublabel="Completed in last 7 days" tone="info" icon={<CheckCircle2 size={16} />} />
          <KpiTile label="Certifications expiring" value={metrics.certifications_expiring} sublabel="Next 60 days" tone="warning" icon={<BadgeCheck size={16} />} href="/reports/certification_compliance" />
          <KpiTile label="Not logged in 30+ days" value={metrics.inactive_learners} sublabel={`${neverLoggedIn} have never signed in`} tone="warning" icon={<UserMinus size={16} />} href="/team?inactive=1" />
          <KpiTile label="Training hours" value={formatDuration(metrics.training_seconds)} sublabel="All recorded time" tone="neutral" icon={<Clock size={16} />} />
          <KpiTile label="New hires in training" value={newHires} sublabel="Hired in the last 60 days" tone="success" icon={<UserPlus size={16} />} href="/team?new_hires=1" />
        </div>
      </div>

      <Card>
        <CardHeader
          title="My team"
          subtitle="Sorted by lowest completion first — the people who need attention"
          icon={<Users size={17} />}
          action={<LinkButton href="/team" variant="outline" size="sm">Open roster</LinkButton>}
        />
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Employee</Th><Th>Role</Th><Th className="w-40">Completion</Th><Th>Overdue</Th>
                <Th>Certifications</Th><Th>Last activity</Th><Th>Status</Th><Th className="text-right">Quick actions</Th>
              </tr>
            </thead>
            <tbody>
              {team.rows.slice(0, 12).map((p) => (
                <Tr key={p.user_id}>
                  <Td>
                    <Link href={`/people/${p.user_id}`} className="flex items-center gap-2.5 hover:text-[var(--accent)]">
                      <Avatar name={p.full_name} color={p.avatar_color} size={30} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{p.full_name}</span>
                        <span className="block text-[11.5px] text-[var(--muted)]">{p.employee_id}</span>
                      </span>
                    </Link>
                  </Td>
                  <Td className="text-[var(--muted)]">{p.position_title ?? p.role_name}</Td>
                  <Td><ProgressBar value={Number(p.completion_pct)} tone={completionTone(Number(p.completion_pct))} showLabel size="sm" /></Td>
                  <Td>{Number(p.overdue_count) > 0 ? <Pill tone="danger">{p.overdue_count}</Pill> : <span className="text-[var(--muted-2)]">0</span>}</Td>
                  <Td className="tabular-nums">{p.certification_count}</Td>
                  <Td className="whitespace-nowrap text-[var(--muted)]">{formatRelative(p.last_login_at)}</Td>
                  <Td><Pill tone={p.status === "active" ? "success" : p.status === "deactivated" ? "danger" : "warning"}>{p.status.replace(/_/g, " ")}</Pill></Td>
                  <Td className="text-right"><TeamQuickActions userId={p.user_id} name={p.full_name} /></Td>
                </Tr>
              ))}
              {team.rows.length === 0 ? (
                <tr><Td colSpan={8}><EmptyState title="No team members in scope" description="Your access does not include any employees yet." /></Td></tr>
              ) : null}
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Completion by position" subtitle="Where training is landing and where it is not" icon={<ClipboardList size={17} />} />
          <CardBody>
            <BarChartView
              data={byRole.filter((r) => r.employees > 0).map((r) => ({ name: r.name, completion: r.completion }))}
              dataKeys={[{ key: "completion", label: "Required completion %" }]}
              layout="vertical" unit="%" height={Math.max(200, byRole.length * 34)}
            />
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Upcoming live training" icon={<CalendarClock size={17} />} action={<Link href="/calendar" className="text-[13px] font-medium text-[var(--accent)] hover:underline">Calendar</Link>} />
            <CardBody className="space-y-3">
              {events.length === 0 ? <EmptyState title="No sessions scheduled" description="Schedule instructor-led training from the calendar." /> : events.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium">{e.title}</p>
                    <p className="text-[12px] text-[var(--muted)]">{formatDate(e.starts_at, { hour: "numeric", minute: "2-digit" })}{e.location_name ? ` · ${e.location_name}` : ""}</p>
                  </div>
                  <Pill tone="info">{e.registered}{e.capacity ? `/${e.capacity}` : ""}</Pill>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Certification risks" subtitle="Expiring in the next 60 days" icon={<BadgeCheck size={17} />} />
            <CardBody className="space-y-2.5">
              {certRisk.length === 0 ? <EmptyState title="No certifications at risk" /> : certRisk.map((c, i) => (
                <div key={`${c.user_id}-${i}`} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/people/${c.user_id}`} className="block truncate text-[13.5px] font-medium hover:text-[var(--accent)]">{c.full_name}</Link>
                    <p className="truncate text-[12px] text-[var(--muted)]">{c.certification_name}</p>
                  </div>
                  <Pill tone={Number(c.days_left) < 0 ? "danger" : Number(c.days_left) < 30 ? "warning" : "neutral"}>
                    {Number(c.days_left) < 0 ? "Expired" : `${c.days_left}d`}
                  </Pill>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
