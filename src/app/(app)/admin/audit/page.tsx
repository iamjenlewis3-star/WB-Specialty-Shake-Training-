import { ScrollText } from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import { distinctAuditActions, listAuditLogs } from "@/lib/services/audit";
import { Card, CardBody, EmptyState, PageHeader, Pill, Table, TableWrap, Td, Th, Tr } from "@/components/ui/primitives";
import { ClearFilters, FilterSelect, Pagination, SearchInput } from "@/components/ui/interactive";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Audit logs" };
export const dynamic = "force-dynamic";

export default async function AuditPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; action?: string; entity?: string; page?: string }> }) {
  await requirePermission("audit.view");
  const sp = await searchParams;
  const page = Number(sp.page ?? 1);
  const [{ rows, total }, actions] = await Promise.all([
    listAuditLogs({ q: sp.q, action: sp.action, entityType: sp.entity, page, pageSize: 50 }),
    distinctAuditActions(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit logs"
        description="Every privileged action in the Academy, with the actor, entity, before/after values and device information."
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Audit logs" }]}
      />

      <Card>
        <CardBody className="flex flex-wrap items-center gap-2">
          <SearchInput placeholder="Search actor, action, entity…" className="w-full sm:w-72" />
          <FilterSelect paramKey="action" label="Action" allLabel="All actions" options={actions.map((a) => ({ value: a, label: a }))} />
          <FilterSelect paramKey="entity" label="Entity" allLabel="All entities" options={[
            "employee", "course", "assignment", "scorm_package", "migration", "report", "announcement", "role", "user",
            "training_event", "enrollment", "asset", "certification", "badge",
          ].map((e) => ({ value: e, label: e.replace("_", " ") }))} />
          <ClearFilters keys={["q", "action", "entity"]} />
          <Pill tone="neutral" className="ml-auto">{total.toLocaleString()} entries</Pill>
        </CardBody>
      </Card>

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<ScrollText size={28} />} title="No audit entries match those filters" />
        ) : (
          <TableWrap>
            <Table className="min-w-[980px]">
              <thead>
                <tr><Th>When</Th><Th>Actor</Th><Th>Action</Th><Th>Entity</Th><Th>Record</Th><Th>Previous</Th><Th>New</Th><Th>IP / device</Th></tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Tr key={row.id}>
                    <Td className="whitespace-nowrap text-[var(--muted)]">{formatDate(row.occurred_at, { hour: "numeric", minute: "2-digit" })}</Td>
                    <Td className="font-medium">{row.actor_name ?? "System"}</Td>
                    <Td><Pill tone={row.action.includes("deactivat") ? "danger" : row.action.includes("publish") || row.action.includes("created") ? "success" : "info"}>{row.action}</Pill></Td>
                    <Td className="capitalize text-[var(--muted)]">{row.entity_type?.replace("_", " ") ?? "—"}</Td>
                    <Td className="max-w-[220px] truncate">{row.entity_label ?? "—"}</Td>
                    <Td className="max-w-[180px] truncate font-mono text-[11px] text-[var(--muted)]">
                      {row.previous_value ? JSON.stringify(row.previous_value).slice(0, 90) : "—"}
                    </Td>
                    <Td className="max-w-[180px] truncate font-mono text-[11px] text-[var(--muted)]">
                      {row.new_value ? JSON.stringify(row.new_value).slice(0, 90) : "—"}
                    </Td>
                    <Td className="font-mono text-[11px] text-[var(--muted)]">{row.ip_address ?? "—"}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
        <Pagination page={page} pageCount={Math.max(1, Math.ceil(total / 50))} total={total} />
      </Card>
    </div>
  );
}
