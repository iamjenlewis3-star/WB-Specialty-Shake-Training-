import Link from "next/link";
import { Route } from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import { listLearningPaths, listCatalog } from "@/lib/services/courses";
import { query } from "@/lib/db/client";
import { Card, CardBody, CardHeader, PageHeader, Pill, ProgressBar, Table, TableWrap, Td, Th, Tr } from "@/components/ui/primitives";
import { Field, Select, TextArea, TextInput, SubmitButton } from "@/components/ui/interactive";
import { createLearningPath } from "@/lib/actions/content";

export const metadata = { title: "Learning paths" };
export const dynamic = "force-dynamic";

export default async function LearningPathsPage() {
  const user = await requirePermission("learning_paths.manage");
  const [paths, catalog, certifications, stats] = await Promise.all([
    listLearningPaths(),
    listCatalog(user.id, { pageSize: 60 }),
    query<{ id: string; name: string }>(`select id, name from certifications where status = 'active' order by name`),
    query<{ learning_path_id: string; enrolled: string; completed: string; avg_progress: string }>(`
      select learning_path_id, count(*)::text as enrolled,
             count(*) filter (where status = 'completed')::text as completed,
             coalesce(round(avg(progress)), 0)::text as avg_progress
        from learning_path_enrollments group by learning_path_id`),
  ]);
  const statsByPath = new Map(stats.map((s) => [s.learning_path_id, s]));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Learning paths"
        description="Sequenced curricula that lead to certification. Assigning a path assigns every course inside it and tracks progress as one program."
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Learning paths" }]}
      />

      <Card>
        <CardHeader title="Create a learning path" icon={<Route size={17} />} />
        <CardBody>
          <form action={createLearningPath} className="grid gap-4 sm:grid-cols-2">
            <Field label="Path name" required><TextInput name="name" required placeholder="e.g. Bartender Certification" /></Field>
            <Field label="Category"><TextInput name="category" placeholder="beverage" /></Field>
            <Field label="Description" className="sm:col-span-2"><TextArea name="description" rows={2} /></Field>
            <Field label="Certification awarded">
              <Select name="certification_id" defaultValue="">
                <option value="">None</option>
                {certifications.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Courses in order" required hint="Ctrl/Cmd-click to select several — order follows the list">
              <select name="course_ids" multiple required size={8} className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] p-2 text-[13px]">
                {catalog.rows.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </Field>
            <div className="sm:col-span-2"><SubmitButton pendingLabel="Creating…">Create learning path</SubmitButton></div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Learning paths" subtitle={`${paths.length} published`} />
        <TableWrap>
          <Table className="min-w-[820px]">
            <thead><tr><Th>Path</Th><Th>Category</Th><Th>Courses</Th><Th>Certification</Th><Th>Enrolled</Th><Th>Completed</Th><Th className="w-40">Average progress</Th></tr></thead>
            <tbody>
              {paths.map((p) => {
                const s = statsByPath.get(p.id);
                return (
                  <Tr key={p.id}>
                    <Td>
                      <Link href={`/library?path=${p.id}`} className="flex items-center gap-2 font-medium hover:text-[var(--accent)]">
                        <span className="size-2.5 rounded-full" style={{ background: p.color }} aria-hidden />{p.name}
                      </Link>
                      <span className="block text-[11.5px] text-[var(--muted)]">{p.description}</span>
                    </Td>
                    <Td className="text-[var(--muted)]">{p.category ?? "—"}</Td>
                    <Td className="tabular-nums">{p.course_count}</Td>
                    <Td>{p.certification_name ? <Pill tone="success">{p.certification_name}</Pill> : <span className="text-[var(--muted-2)]">—</span>}</Td>
                    <Td className="tabular-nums">{Number(s?.enrolled ?? 0).toLocaleString()}</Td>
                    <Td className="tabular-nums">{Number(s?.completed ?? 0).toLocaleString()}</Td>
                    <Td><ProgressBar value={Number(s?.avg_progress ?? 0)} tone="info" showLabel size="sm" /></Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      </Card>
    </div>
  );
}
