import Link from "next/link";
import { notFound } from "next/navigation";
import { Bell, ClipboardList, Users } from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import { getAssignmentDetail } from "@/lib/services/assignments";
import { Card, CardBody, CardHeader, DescriptionList, EmptyState, KpiTile, PageHeader, Pill, ProgressBar, StatusPill, Table, TableWrap, Td, Th, Tr } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/interactive";
import { archiveAssignment, publishAssignment, remindAssignmentLearners } from "@/lib/actions/assignments";
import { formatDate, completionTone } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AssignmentDetailPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  await requirePermission("training.assign");
  const { assignmentId } = await params;
  const data = await getAssignmentDetail(assignmentId);
  if (!data) notFound();
  const { assignment, targets, learners } = data;

  const enrolled = Number(assignment.enrolled);
  const completed = Number(assignment.completed);
  const pct = enrolled ? Math.round((completed / enrolled) * 100) : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title={assignment.title}
        description={`${assignment.course_title ?? assignment.path_name ?? "Training"} · assigned ${formatDate(assignment.assigned_at)}`}
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Assignments", href: "/admin/assignments" }, { label: assignment.title }]}
        actions={
          <>
            {assignment.status === "draft" ? (
              <form action={publishAssignment}>
                <input type="hidden" name="assignment_id" value={assignment.id} />
                <SubmitButton size="sm" pendingLabel="Publishing…">Publish assignment</SubmitButton>
              </form>
            ) : (
              <form action={remindAssignmentLearners}>
                <input type="hidden" name="assignment_id" value={assignment.id} />
                <SubmitButton variant="outline" size="sm" pendingLabel="Sending…"><Bell size={15} /> Remind outstanding learners</SubmitButton>
              </form>
            )}
            <form action={archiveAssignment}>
              <input type="hidden" name="assignment_id" value={assignment.id} />
              <SubmitButton variant="ghost" size="sm" pendingLabel="…">Archive</SubmitButton>
            </form>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Learners assigned" value={enrolled.toLocaleString()} sublabel={`Estimated ${assignment.estimated_population.toLocaleString()} at publish`} tone="info" icon={<Users size={16} />} />
        <KpiTile label="Completed" value={completed.toLocaleString()} sublabel={`${pct}% completion`} tone={completionTone(pct)} />
        <KpiTile label="Overdue" value={Number(assignment.overdue).toLocaleString()} sublabel="Past the due date" tone="danger" />
        <KpiTile label="Due" value={assignment.due_at ? formatDate(assignment.due_at) : "No due date"} sublabel={assignment.recurrence !== "none" ? `Recurs ${assignment.recurrence}` : "One-time assignment"} tone="neutral" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader title="Learner progress" subtitle={`${learners.length} records`} icon={<ClipboardList size={17} />} />
          <TableWrap>
            <Table className="min-w-[720px]">
              <thead><tr><Th>Employee</Th><Th>Location</Th><Th>Status</Th><Th>Due</Th><Th>Completed</Th><Th>Score</Th></tr></thead>
              <tbody>
                {learners.map((l) => (
                  <Tr key={l.enrollment_id}>
                    <Td><Link href={`/people/${l.user_id}`} className="font-medium hover:text-[var(--accent)]">{l.full_name}</Link></Td>
                    <Td className="text-[var(--muted)]">{l.location_name ?? "—"}</Td>
                    <Td><StatusPill status={l.status} /></Td>
                    <Td className="whitespace-nowrap">{l.due_at ? formatDate(l.due_at) : "—"}</Td>
                    <Td className="whitespace-nowrap">{l.completed_at ? formatDate(l.completed_at) : "—"}</Td>
                    <Td className="tabular-nums">{l.score ? `${Math.round(Number(l.score))}%` : "—"}</Td>
                  </Tr>
                ))}
                {learners.length === 0 ? <tr><Td colSpan={6}><EmptyState title="No learner records yet" description="Publish the assignment to create learner records." /></Td></tr> : null}
              </tbody>
            </Table>
          </TableWrap>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Assignment details" />
            <CardBody>
              <DescriptionList
                items={[
                  { label: "Status", value: <Pill tone={assignment.status === "published" ? "success" : "warning"}>{assignment.status}</Pill> },
                  { label: "Type", value: assignment.item_type.replace("_", " ") },
                  { label: "Priority", value: assignment.priority },
                  { label: "Required", value: assignment.is_required ? "Required" : "Optional" },
                  { label: "Grace period", value: `${assignment.grace_period_days} days` },
                  { label: "Reminders", value: `Every ${assignment.reminder_cadence_days} days` },
                  { label: "Campaign", value: assignment.campaign_name ?? "—" },
                  { label: "Assigned by", value: assignment.assigned_by_name ?? "—" },
                ]}
              />
              {assignment.notes ? <p className="mt-3 rounded-lg bg-[var(--surface-2)] p-3 text-[12.5px] text-[var(--muted)]">{assignment.notes}</p> : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Audience" subtitle="How this assignment was targeted" />
            <CardBody className="flex flex-wrap gap-1.5">
              {targets.map((t, i) => (
                <Pill key={i} tone="info">{t.label ?? t.target_type.replace("_", " ")}</Pill>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
