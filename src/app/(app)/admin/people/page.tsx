import { UserPlus, Upload } from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import { filterOptions, listPeople } from "@/lib/services/people";
import { Card, CardBody, PageHeader } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { ClearFilters, FilterSelect, SearchInput } from "@/components/ui/interactive";
import { PeopleTable } from "@/components/people/people-table";
import { can } from "@/lib/auth/guard";

export const metadata = { title: "People" };
export const dynamic = "force-dynamic";

export default async function PeoplePage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("users.view");
  const sp = await searchParams;
  const [people, options] = await Promise.all([
    listPeople(user.scope, {
      q: sp.q, locationId: sp.location, franchiseGroupId: sp.group, regionId: sp.region, roleId: sp.role,
      departmentId: sp.department, status: sp.status, overdueOnly: sp.overdue === "1",
      inactiveOnly: sp.inactive === "1", newHiresOnly: sp.new_hires === "1",
      sort: sp.sort, dir: sp.dir === "asc" ? "asc" : "desc", page: Number(sp.page ?? 1), pageSize: 25,
    }),
    filterOptions(user.scope),
  ]);

  const exportParams = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
  exportParams.set("report", "employees");

  return (
    <div className="space-y-5">
      <PageHeader
        title="People"
        description="Every employee you have access to, with live training completion, overdue counts and certifications."
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "People" }]}
        actions={
          <>
            {can(user, "users.import") ? (
              <LinkButton href="/admin/people/import" variant="outline" size="sm"><Upload size={15} /> Import employees</LinkButton>
            ) : null}
            {can(user, ["users.create", "users.edit"]) ? (
              <LinkButton href="/admin/people/new" variant="primary" size="sm"><UserPlus size={15} /> Add employee</LinkButton>
            ) : null}
          </>
        }
      />

      <Card>
        <CardBody className="flex flex-wrap items-center gap-2">
          <SearchInput placeholder="Search name, email, employee ID…" className="w-full sm:w-80" />
          <FilterSelect paramKey="location" label="Location" allLabel="All locations" options={options.locations.map((l) => ({ value: l.id, label: `${l.name} (#${l.store_number})` }))} />
          <FilterSelect paramKey="group" label="Franchise group" allLabel="All groups" options={options.groups.map((g) => ({ value: g.id, label: g.name }))} />
          <FilterSelect paramKey="region" label="Region" allLabel="All regions" options={options.regions.map((r) => ({ value: r.id, label: r.name }))} />
          <FilterSelect paramKey="role" label="Role" allLabel="All roles" options={options.roles.map((r) => ({ value: r.id, label: r.name }))} />
          <FilterSelect paramKey="department" label="Department" allLabel="All departments" options={options.departments.map((d) => ({ value: d.id, label: d.name }))} />
          <FilterSelect paramKey="status" label="Status" allLabel="All statuses" options={[
            { value: "active", label: "Active" }, { value: "invited", label: "Invited" },
            { value: "leave_of_absence", label: "Leave of absence" }, { value: "deactivated", label: "Deactivated" },
            { value: "terminated", label: "Terminated" },
          ]} />
          <FilterSelect paramKey="overdue" label="Overdue" allLabel="Any training state" options={[{ value: "1", label: "Has overdue training" }]} />
          <FilterSelect paramKey="inactive" label="Inactivity" allLabel="Any activity" options={[{ value: "1", label: "No login in 30 days" }]} />
          <FilterSelect paramKey="new_hires" label="New hires" allLabel="All tenure" options={[{ value: "1", label: "Hired in last 60 days" }]} />
          <ClearFilters keys={["q", "location", "group", "region", "role", "department", "status", "overdue", "inactive", "new_hires"]} />
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        <PeopleTable
          rows={people.rows}
          page={people.page}
          pageCount={people.pageCount}
          total={people.total}
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
