import { CalendarPlus, ClipboardList } from "lucide-react";
import { requirePermission, can } from "@/lib/auth/guard";
import { filterOptions, listPeople } from "@/lib/services/people";
import { systemMetrics } from "@/lib/services/analytics";
import { Card, CardBody, KpiTile, PageHeader } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { ClearFilters, FilterSelect, SearchInput } from "@/components/ui/interactive";
import { PeopleTable } from "@/components/people/people-table";
import { scopeLabel } from "@/lib/rbac/scope";

export const metadata = { title: "My Team" };
export const dynamic = "force-dynamic";

export default async function TeamPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("users.view");
  const sp = await searchParams;
  const [people, options, metrics] = await Promise.all([
    listPeople(user.scope, {
      q: sp.q, locationId: sp.location, roleId: sp.role, departmentId: sp.department, status: sp.status,
      overdueOnly: sp.overdue === "1", inactiveOnly: sp.inactive === "1", newHiresOnly: sp.new_hires === "1",
      sort: sp.sort ?? "completion", dir: sp.dir === "asc" ? "asc" : sp.sort ? "desc" : "asc",
      page: Number(sp.page ?? 1), pageSize: 25,
    }),
    filterOptions(user.scope),
    systemMetrics(user.scope),
  ]);

  const exportParams = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
  exportParams.set("report", "employees");

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Team"
        description={`${scopeLabel(user.scope)} · training status for everyone you are responsible for.`}
        actions={
          <>
            <LinkButton href="/calendar/schedule" variant="outline" size="sm"><CalendarPlus size={15} /> Schedule training</LinkButton>
            {can(user, "training.assign") ? (
              <LinkButton href="/admin/assignments/new" variant="primary" size="sm"><ClipboardList size={15} /> Assign training</LinkButton>
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Team completion" value={`${metrics.completion_pct}%`} sublabel={`${metrics.required_complete} of ${metrics.required_total} required`} tone={metrics.completion_pct >= 90 ? "success" : metrics.completion_pct >= 75 ? "warning" : "danger"} />
        <KpiTile label="Overdue assignments" value={metrics.overdue_assignments} sublabel={`${metrics.overdue_learners} people`} tone="danger" href="/team?overdue=1" />
        <KpiTile label="Certifications expiring" value={metrics.certifications_expiring} sublabel="Next 60 days" tone="warning" />
        <KpiTile label="Inactive 30+ days" value={metrics.inactive_learners} sublabel="No recent sign-in" tone="warning" href="/team?inactive=1" />
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-center gap-2">
          <SearchInput placeholder="Search your team…" className="w-full sm:w-72" />
          <FilterSelect paramKey="location" label="Location" allLabel="All my locations" options={options.locations.map((l) => ({ value: l.id, label: l.name }))} />
          <FilterSelect paramKey="role" label="Role" allLabel="All roles" options={options.roles.map((r) => ({ value: r.id, label: r.name }))} />
          <FilterSelect paramKey="department" label="Department" allLabel="All departments" options={options.departments.map((d) => ({ value: d.id, label: d.name }))} />
          <FilterSelect paramKey="overdue" label="Overdue" allLabel="Any training state" options={[{ value: "1", label: "Has overdue training" }]} />
          <FilterSelect paramKey="inactive" label="Inactivity" allLabel="Any activity" options={[{ value: "1", label: "No login in 30 days" }]} />
          <FilterSelect paramKey="new_hires" label="Tenure" allLabel="All tenure" options={[{ value: "1", label: "New hires" }]} />
          <ClearFilters keys={["q", "location", "role", "department", "overdue", "inactive", "new_hires"]} />
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        <PeopleTable
          rows={people.rows} page={people.page} pageCount={people.pageCount} total={people.total}
          canBulk={can(user, "users.edit")}
          locations={options.locations.map((l) => ({ value: l.id, label: l.name }))}
          roles={options.roles.map((r) => ({ value: r.id, label: r.name }))}
          departments={options.departments.map((d) => ({ value: d.id, label: d.name }))}
          exportHref={`/api/export?${exportParams.toString()}`}
        />
      </Card>
    </div>
  );
}
