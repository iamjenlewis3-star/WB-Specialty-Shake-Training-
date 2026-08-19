import { notFound } from "next/navigation";
import { ClipboardList, Trash2 } from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import { query, queryOne } from "@/lib/db/client";
import { Card, CardBody, CardHeader, DescriptionList, EmptyState, PageHeader, Pill, Table, TableWrap, Td, Th, Tr } from "@/components/ui/primitives";
import { Field, Select, TextArea, TextInput, SubmitButton } from "@/components/ui/interactive";
import { addQuestion, deleteQuestion } from "@/lib/actions/content";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AssessmentDetailPage({ params }: { params: Promise<{ assessmentId: string }> }) {
  await requirePermission("assessments.manage");
  const { assessmentId } = await params;

  const assessment = await queryOne<{
    id: string; title: string; description: string | null; passing_score: string; attempt_limit: number | null;
    time_limit_minutes: number | null; randomize_questions: boolean; show_correct_answers: boolean; retake_delay_hours: number;
  }>(`select id, title, description, passing_score::text as passing_score, attempt_limit, time_limit_minutes,
             randomize_questions, show_correct_answers, retake_delay_hours from assessments where id = $1`, [assessmentId]);
  if (!assessment) notFound();

  const [questions, options, attempts] = await Promise.all([
    query<{ id: string; position: number; question_type: string; prompt: string; points: string }>(
      `select id, position, question_type, prompt, points::text as points from questions where assessment_id = $1 order by position`, [assessmentId]),
    query<{ id: string; question_id: string; label: string; is_correct: boolean; position: number }>(
      `select o.id, o.question_id, o.label, o.is_correct, o.position from question_options o
         join questions q on q.id = o.question_id where q.assessment_id = $1 order by o.position`, [assessmentId]),
    query<{ full_name: string; score: string | null; passed: boolean | null; completed_at: string | null; attempt_number: number }>(
      `select p.full_name, aa.score::text as score, aa.passed, aa.completed_at, aa.attempt_number
         from assessment_attempts aa join v_people p on p.user_id = aa.user_id
        where aa.assessment_id = $1 order by aa.completed_at desc nulls last limit 20`, [assessmentId]),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title={assessment.title}
        description={assessment.description}
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Assessments", href: "/admin/assessments" }, { label: assessment.title }]}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Questions" subtitle={`${questions.length} questions`} icon={<ClipboardList size={17} />} />
            {questions.length === 0 ? (
              <EmptyState title="No questions yet" description="Add the first question below." />
            ) : (
              <ul>
                {questions.map((q) => (
                  <li key={q.id} className="border-b border-[var(--border)] px-4 py-3 last:border-b-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-medium">{q.position}. {q.prompt}</p>
                        <p className="mt-0.5 text-[11.5px] text-[var(--muted)]">
                          {q.question_type.replace("_", " ")} · {Number(q.points)} point{Number(q.points) === 1 ? "" : "s"}
                        </p>
                        <ul className="mt-1.5 space-y-0.5">
                          {options.filter((o) => o.question_id === q.id).map((o) => (
                            <li key={o.id} className="flex items-center gap-1.5 text-[12.5px]">
                              <span className={o.is_correct ? "text-[var(--success)]" : "text-[var(--muted-2)]"}>{o.is_correct ? "✓" : "○"}</span>
                              <span className={o.is_correct ? "font-medium" : "text-[var(--muted)]"}>{o.label}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <form action={deleteQuestion}>
                        <input type="hidden" name="question_id" value={q.id} />
                        <input type="hidden" name="assessment_id" value={assessmentId} />
                        <SubmitButton variant="ghost" size="sm" pendingLabel="…"><Trash2 size={14} /></SubmitButton>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Add a question" />
            <CardBody>
              <form action={addQuestion} className="grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="assessment_id" value={assessmentId} />
                <Field label="Question type" required>
                  <Select name="question_type" required defaultValue="single">
                    <option value="single">Single choice</option>
                    <option value="multiple">Multiple selection</option>
                    <option value="true_false">True / false</option>
                    <option value="scenario">Scenario</option>
                    <option value="image">Image-based</option>
                    <option value="ordering">Ordering</option>
                    <option value="matching">Matching</option>
                  </Select>
                </Field>
                <Field label="Points"><TextInput name="points" type="number" min={1} max={10} defaultValue={1} /></Field>
                <Field label="Prompt" required className="sm:col-span-2"><TextArea name="prompt" rows={2} required placeholder="What is the correct hold temperature…" /></Field>
                <Field label="Scenario text" className="sm:col-span-2" hint="Optional context shown above the question"><TextArea name="scenario_text" rows={2} /></Field>
                <Field label="Question image" className="sm:col-span-2" hint="For image-based questions. PNG, JPEG, WEBP or GIF up to 5 MB.">
                  <input
                    type="file" name="image" accept="image/png,image/jpeg,image/webp,image/gif"
                    className="w-full text-[12.5px] file:mr-2 file:rounded-lg file:border-0 file:bg-[var(--surface-3)] file:px-3 file:py-1.5 file:text-[12.5px] file:font-medium"
                  />
                </Field>
                <Field label="True/false answer" hint="Only used for true/false questions">
                  <Select name="correct_tf" defaultValue="true"><option value="true">True</option><option value="false">False</option></Select>
                </Field>
                <div className="sm:col-span-2">
                  <p className="mb-1.5 text-[12.5px] font-medium">Answer options</p>
                  <div className="space-y-2">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input type="checkbox" name="option_correct" value={String(i)} className="size-4 accent-[var(--accent)]" aria-label={`Option ${i + 1} is correct`} />
                        <TextInput name="option_label" placeholder={`Option ${i + 1}`} />
                        <TextInput name="option_match" placeholder="Matches…" className="max-w-[180px]" />
                      </div>
                    ))}
                  </div>
                  <p className="mt-1 text-[11.5px] text-[var(--muted)]">
                    Tick every correct option and leave unused options blank. For an <strong>ordering</strong> question,
                    type the steps in their correct sequence — the learner sees them shuffled. For a{" "}
                    <strong>matching</strong> question, put each item on the left and the target it pairs with in
                    &ldquo;Matches&rdquo;.
                  </p>
                </div>
                <Field label="Feedback when correct"><TextInput name="feedback_correct" placeholder="Correct — that matches the standard." /></Field>
                <Field label="Feedback when incorrect"><TextInput name="feedback_incorrect" placeholder="Not quite — review the module." /></Field>
                <div className="sm:col-span-2"><SubmitButton pendingLabel="Adding…">Add question</SubmitButton></div>
              </form>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Settings" />
            <CardBody>
              <DescriptionList
                items={[
                  { label: "Passing score", value: `${Number(assessment.passing_score)}%` },
                  { label: "Attempt limit", value: assessment.attempt_limit ?? "Unlimited" },
                  { label: "Time limit", value: assessment.time_limit_minutes ? `${assessment.time_limit_minutes} min` : "None" },
                  { label: "Randomize questions", value: assessment.randomize_questions ? "Yes" : "No" },
                  { label: "Show correct answers", value: assessment.show_correct_answers ? "Yes" : "No" },
                  { label: "Retake delay", value: `${assessment.retake_delay_hours} hours` },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Recent attempts" />
            <TableWrap>
              <Table className="min-w-[280px]">
                <thead><tr><Th>Learner</Th><Th>Score</Th><Th>Result</Th><Th>Date</Th></tr></thead>
                <tbody>
                  {attempts.map((a, i) => (
                    <Tr key={i}>
                      <Td className="font-medium">{a.full_name}</Td>
                      <Td className="tabular-nums">{a.score ? `${Math.round(Number(a.score))}%` : "—"}</Td>
                      <Td><Pill tone={a.passed ? "success" : "danger"}>{a.passed ? "Passed" : "Failed"}</Pill></Td>
                      <Td className="whitespace-nowrap text-[var(--muted)]">{formatDate(a.completed_at)}</Td>
                    </Tr>
                  ))}
                  {attempts.length === 0 ? <tr><Td colSpan={4} className="text-center text-[13px] text-[var(--muted)]">No attempts yet</Td></tr> : null}
                </tbody>
              </Table>
            </TableWrap>
          </Card>
        </div>
      </div>
    </div>
  );
}
