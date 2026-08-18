import { requirePermission } from "@/lib/auth/guard";
import { REPORTS } from "@/lib/services/reports";
import { filterOptions } from "@/lib/services/people";
import { PageHeader } from "@/components/ui/primitives";
import { ReportBuilder } from "@/components/reports/builder";

export const metadata = { title: "Custom report builder" };
export const dynamic = "force-dynamic";

export default async function ReportBuilderPage() {
  const user = await requirePermission("reports.view");
  const options = await filterOptions(user.scope);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Custom report builder"
        description="Pick a data set, choose your columns and filters, then run it or save it as a view your team can reuse."
        breadcrumb={[{ label: "Reports", href: "/reports" }, { label: "Custom report" }]}
      />
      <ReportBuilder
        reports={REPORTS.map((r) => ({
          key: r.key, name: r.name, description: r.description, category: r.category,
          columns: r.columns.map((c) => ({ key: c.key, label: c.label })),
          filters: r.filters,
        }))}
        locations={options.locations.map((l) => ({ value: l.id, label: l.name }))}
        groups={options.groups.map((g) => ({ value: g.id, label: g.name }))}
        regions={options.regions.map((r) => ({ value: r.id, label: r.name }))}
        roles={options.roles.map((r) => ({ value: r.id, label: r.name }))}
        departments={options.departments.map((d) => ({ value: d.id, label: d.name }))}
      />
    </div>
  );
}
