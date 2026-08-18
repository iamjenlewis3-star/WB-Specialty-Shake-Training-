import { requirePermission } from "@/lib/auth/guard";
import { listCatalog, listLearningPaths } from "@/lib/services/courses";
import { filterOptions, listPeople } from "@/lib/services/people";
import { query } from "@/lib/db/client";
import { PageHeader } from "@/components/ui/primitives";
import { AssignmentBuilder } from "@/components/admin/assignment-builder";

export const metadata = { title: "New assignment" };
export const dynamic = "force-dynamic";

export default async function NewAssignmentPage({
  searchParams,
}: { searchParams: Promise<{ course?: string; user?: string; location?: string }> }) {
  const user = await requirePermission("training.assign");
  const sp = await searchParams;
  const [catalog, paths, options, people, campaigns] = await Promise.all([
    listCatalog(user.id, { pageSize: 60 }),
    listLearningPaths(),
    filterOptions(user.scope),
    listPeople(user.scope, { pageSize: 300 }),
    query<{ id: string; name: string }>(`select id, name from training_campaigns where status = 'active' order by name`),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Assign training"
        description="Choose what to assign and who gets it. The Academy shows you the exact learner population before you publish."
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Assignments", href: "/admin/assignments" }, { label: "New" }]}
      />
      <AssignmentBuilder
        courses={catalog.rows.map((c) => ({ id: c.id, title: c.title, minutes: c.estimated_minutes }))}
        paths={paths.map((p) => ({ id: p.id, name: p.name, courses: Number(p.course_count) }))}
        locations={options.locations.map((l) => ({ value: l.id, label: `${l.name} (#${l.store_number})` }))}
        groups={options.groups.map((g) => ({ value: g.id, label: g.name }))}
        regions={options.regions.map((r) => ({ value: r.id, label: r.name }))}
        roles={options.roles.map((r) => ({ value: r.id, label: r.name }))}
        departments={options.departments.map((d) => ({ value: d.id, label: d.name }))}
        people={people.rows.map((p) => ({ value: p.user_id, label: `${p.full_name} — ${p.position_title ?? ""}` }))}
        campaigns={campaigns.map((c) => ({ value: c.id, label: c.name }))}
        canTargetOrganization={user.scope.level === "organization"}
        defaults={{ courseId: sp.course, userId: sp.user, locationId: sp.location }}
      />
    </div>
  );
}
