import Link from "next/link";
import { ClipboardList, Plus, Repeat } from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import { listAssignments } from "@/lib/services/assignments";
import { Card, CardBody, EmptyState, PageHeader, Pill, ProgressBar, Table, TableWrap, Td, Th, Tr } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { ClearFilters, FilterSelect, SearchInput } from "@/components/ui/interactive";
import { formatDate, completionTone } from "@/lib/utils";

export const metadata = { title: "Assignments" };
export const dynamic = "force-dynamic";

export default async function AssignmentsPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const user = await requirePermission("training.assign");
  const sp = await searchParams;
  const assignments = await listAssignments(user.scope, { q: sp.q, status: sp.status });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Assignments"
        description="Every published assignment, who it reached and how it is landing."
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Assignments" }]}
        actions={
          <>
            <LinkButton href="/admin/rules" variant="outline" size="sm"><Repeat size={15} /> Automation rules</LinkButton>
            <LinkButton href="/admin/assignments/new" variant="primary" size="sm"><Plus size={15} /> New assignment</LinkButton>
          </>
        }
      />

      <Card>
        <CardBody className="flex flex-wrap items-center gap-2">
          <SearchInput placeholder="Search assignments…" className="w-full sm:w-72" />
          <FilterSelect paramKey="status" label="Status" allLabel="All statuses" options={[
            { value: "published", label: "Published" }, { value: "draft", label: "Draft" }, { value: "archived", label: "Archived" },
          ]} />
          <ClearFilters keys={["q", "status"]} />
          <Pill tone="neutral" className="ml-auto">{assignments.length} assignments</Pill>
        </CardBody>
      </Card>

      <Card>
        {assignments.length === 0 ? (
          <EmptyState icon={<ClipboardList size={28} />} title="No assignments yet" description="Create your first assignment to get training in front of your teams." />
        ) : (
          <TableWrap>
            <Table className="min-w-[980px]">
              <thead>
                <tr><Th>Assignment</Th><Th>Training</Th><Th>Priority</Th><Th>Due</Th><Th>Learners</Th><Th className="w-40">Completion</Th><Th>Overdue</Th><Th>Recurrence</Th><Th>Status</Th></tr>
              </thead>
              <tbody>
                {assignments.map((a) => {
                  const enrolled = Number(a.enrolled);
                  const completed = Number(a.completed);
                  const pct = enrolled ? Math.round((completed / enrolled) * 100) : 0;
                  return (
                    <Tr key={a.id}>
                      <Td>
                        <Link href={`/admin/assignments/${a.id}`} className="font-medium hover:text-[var(--accent)]">{a.title}</Link>
                        <span className="block text-[11.5px] text-[var(--muted)]">
                          Assigned {formatDate(a.assigned_at)} by {a.assigned_by_name ?? "the Academy"}
                          {a.campaign_name ? ` · ${a.campaign_name}` : ""}
                        </span>
                      </Td>
                      <Td className="text-[var(--muted)]">{a.course_title ?? a.path_name ?? "—"}</Td>
                      <Td><Pill tone={a.priority === "critical" ? "danger" : a.priority === "high" ? "warning" : "neutral"}>{a.priority}</Pill></Td>
                      <Td className="whitespace-nowrap">{a.due_at ? formatDate(a.due_at) : "—"}</Td>
                      <Td className="tabular-nums">{enrolled.toLocaleString()}</Td>
                      <Td><ProgressBar value={pct} tone={completionTone(pct)} showLabel size="sm" /></Td>
                      <Td>{Number(a.overdue) > 0 ? <Pill tone="danger">{a.overdue}</Pill> : <span className="text-[var(--muted-2)]">0</span>}</Td>
                      <Td className="capitalize text-[var(--muted)]">{a.recurrence}</Td>
                      <Td><Pill tone={a.status === "published" ? "success" : a.status === "draft" ? "warning" : "neutral"}>{a.status}</Pill></Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
