import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import { query } from "@/lib/db/client";
import { Card, CardBody, CardHeader, PageHeader, Pill, Table, TableWrap, Td, Th, Tr } from "@/components/ui/primitives";
import { Field, TextArea, TextInput, Checkbox, SubmitButton } from "@/components/ui/interactive";
import { createAssessment } from "@/lib/actions/content";

export const metadata = { title: "Assessments" };
export const dynamic = "force-dynamic";

export default async function AssessmentsPage() {
  await requirePermission("assessments.manage");
  const assessments = await query<{
    id: string; title: string; passing_score: string; attempt_limit: number | null; time_limit_minutes: number | null;
    randomize_questions: boolean; questions: string; attempts: string; pass_rate: string; avg_score: string;
  }>(`
    select a.id, a.title, a.passing_score::text as passing_score, a.attempt_limit, a.time_limit_minutes,
           a.randomize_questions,
           (select count(*) from questions q where q.assessment_id = a.id)::text as questions,
           (select count(*) from assessment_attempts at where at.assessment_id = a.id)::text as attempts,
           coalesce((select round(100.0 * count(*) filter (where passed) / nullif(count(*), 0))
                       from assessment_attempts at where at.assessment_id = a.id), 0)::text as pass_rate,
           coalesce((select round(avg(score)) from assessment_attempts at where at.assessment_id = a.id), 0)::text as avg_score
      from assessments a where a.status = 'active' order by a.title`);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Assessments"
        description="Question banks with scoring, attempt limits and randomization. Grading happens on the server — answer keys never reach the browser."
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Assessments" }]}
      />

      <Card>
        <CardHeader title="Create an assessment" icon={<ClipboardList size={17} />} />
        <CardBody>
          <form action={createAssessment} className="grid gap-4 sm:grid-cols-3">
            <Field label="Title" required className="sm:col-span-2"><TextInput name="title" required placeholder="e.g. Shake Standards Knowledge Check" /></Field>
            <Field label="Passing score (%)"><TextInput name="passing_score" type="number" min={0} max={100} defaultValue={80} /></Field>
            <Field label="Attempt limit"><TextInput name="attempt_limit" type="number" min={1} max={20} defaultValue={3} /></Field>
            <Field label="Time limit (minutes)"><TextInput name="time_limit_minutes" type="number" min={1} max={240} /></Field>
            <Field label="Questions per attempt" hint="Leave blank to use all questions"><TextInput name="questions_per_attempt" type="number" min={1} max={100} /></Field>
            <Field label="Retake delay (hours)"><TextInput name="retake_delay_hours" type="number" min={0} max={168} defaultValue={0} /></Field>
            <div className="space-y-1 sm:col-span-2">
              <Checkbox name="randomize_questions" label="Randomize question order" defaultChecked />
              <Checkbox name="show_correct_answers" label="Show correct answers after submission" defaultChecked />
            </div>
            <Field label="Description" className="sm:col-span-3"><TextArea name="description" rows={2} /></Field>
            <div className="sm:col-span-3"><SubmitButton pendingLabel="Creating…">Create assessment</SubmitButton></div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Assessments" subtitle={`${assessments.length} active`} />
        <TableWrap>
          <Table className="min-w-[880px]">
            <thead><tr><Th>Assessment</Th><Th>Questions</Th><Th>Passing score</Th><Th>Attempts allowed</Th><Th>Time limit</Th><Th>Attempts taken</Th><Th>Pass rate</Th><Th>Average score</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {assessments.map((a) => (
                <Tr key={a.id}>
                  <Td><Link href={`/admin/assessments/${a.id}`} className="font-medium hover:text-[var(--accent)]">{a.title}</Link></Td>
                  <Td className="tabular-nums">{a.questions}</Td>
                  <Td className="tabular-nums">{Number(a.passing_score)}%</Td>
                  <Td className="tabular-nums">{a.attempt_limit ?? "Unlimited"}</Td>
                  <Td>{a.time_limit_minutes ? `${a.time_limit_minutes} min` : "—"}</Td>
                  <Td className="tabular-nums">{Number(a.attempts).toLocaleString()}</Td>
                  <Td><Pill tone={Number(a.pass_rate) >= 80 ? "success" : Number(a.pass_rate) >= 60 ? "warning" : "danger"}>{a.pass_rate}%</Pill></Td>
                  <Td className="tabular-nums">{a.avg_score}%</Td>
                  <Td className="text-right">
                    <Link href={`/admin/assessments/${a.id}`} className="text-[13px] font-medium text-[var(--accent)] hover:underline">Edit questions</Link>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Card>
    </div>
  );
}
