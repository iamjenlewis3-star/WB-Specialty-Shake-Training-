"use client";

import * as React from "react";
import { CheckCircle2, ChevronRight, Clock, ExternalLink, FileText, PlayCircle, ShieldCheck } from "lucide-react";
import { Card, CardBody, Pill, ProgressBar } from "@/components/ui/primitives";
import { buttonClass } from "@/components/ui/button";
import { SubmitButton, Checkbox } from "@/components/ui/interactive";
import { completeModule, acknowledgeDocument, submitAssessment } from "@/lib/actions/learning";
import { cn } from "@/lib/utils";

/** Shared timer used by view-based modules to enforce minimum engagement time. */
function useDwellTimer(minSeconds: number) {
  const [elapsed, setElapsed] = React.useState(0);
  React.useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return { elapsed, satisfied: elapsed >= minSeconds, remaining: Math.max(0, minSeconds - elapsed) };
}

function CompleteForm({
  enrollmentId, moduleId, seconds, disabled, label = "Mark complete", hint,
}: { enrollmentId: string; moduleId: string; seconds: number; disabled?: boolean; label?: string; hint?: string }) {
  return (
    <form action={completeModule} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="enrollmentId" value={enrollmentId} />
      <input type="hidden" name="moduleId" value={moduleId} />
      <input type="hidden" name="seconds" value={seconds} />
      <SubmitButton pendingLabel="Saving…" className={disabled ? "pointer-events-none opacity-50" : ""}>
        <CheckCircle2 size={16} /> {label}
      </SubmitButton>
      {hint ? <span className="text-[12.5px] text-[var(--muted)]">{hint}</span> : null}
    </form>
  );
}

/** Simple, safe renderer for the light markdown used in text modules. */
function RichText({ text }: { text: string }) {
  const blocks = text.split("\n\n");
  return (
    <div className="space-y-3 text-[14.5px] leading-relaxed">
      {blocks.map((block, i) => {
        if (block.startsWith("### ")) return <h4 key={i} className="text-[15px] font-semibold">{block.slice(4)}</h4>;
        if (block.startsWith("## ")) return <h3 key={i} className="text-[17px] font-semibold tracking-tight">{block.slice(3)}</h3>;
        if (block.startsWith("- ")) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {block.split("\n").map((line, j) => <li key={j}>{line.replace(/^-\s*/, "")}</li>)}
            </ul>
          );
        }
        return <p key={i} className="text-[var(--foreground)]">{block}</p>;
      })}
    </div>
  );
}

export function TextModule({
  enrollmentId, moduleId, content, minSeconds, completed,
}: { enrollmentId: string; moduleId: string; content: string; minSeconds: number; completed: boolean }) {
  const { elapsed, satisfied, remaining } = useDwellTimer(minSeconds);
  return (
    <div className="space-y-5">
      <RichText text={content} />
      {completed ? (
        <Pill tone="success" dot>Completed</Pill>
      ) : (
        <CompleteForm
          enrollmentId={enrollmentId} moduleId={moduleId} seconds={elapsed} disabled={!satisfied}
          hint={satisfied ? undefined : `Minimum time on this module: ${remaining}s remaining`}
        />
      )}
    </div>
  );
}

export function MediaModule({
  enrollmentId, moduleId, minSeconds, completed, assetId, assetName, assetType, description,
}: {
  enrollmentId: string; moduleId: string; minSeconds: number; completed: boolean;
  assetId: string | null; assetName: string | null; assetType: string | null; description: string | null;
}) {
  const { elapsed, satisfied, remaining } = useDwellTimer(minSeconds);
  const isVideo = assetType === "video";
  const [playing, setPlaying] = React.useState(false);

  return (
    <div className="space-y-4">
      {isVideo ? (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[#0b1220]">
          <div className="relative flex aspect-video items-center justify-center">
            <button
              onClick={() => setPlaying((p) => !p)}
              className="flex flex-col items-center gap-2 text-white/85 transition-transform hover:scale-105"
              aria-label={playing ? "Pause module video" : "Play module video"}
            >
              <PlayCircle size={64} strokeWidth={1.2} className={cn(playing && "opacity-60")} />
              <span className="text-[13px] font-medium">{playing ? "Playing…" : "Play module video"}</span>
            </button>
            <div className="absolute inset-x-0 bottom-0 px-4 pb-3">
              <ProgressBar value={minSeconds ? Math.min(100, (elapsed / minSeconds) * 100) : 100} tone="accent" size="sm" />
              <p className="mt-1.5 text-[11.5px] text-white/60">
                {assetName ?? "Module video"} · watch time {elapsed}s
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          {assetId ? (
            <iframe
              src={`/api/assets/${assetId}/file`}
              title={assetName ?? "Course document"}
              className="h-[60vh] min-h-[420px] w-full bg-white"
            />
          ) : (
            <div className="flex h-64 items-center justify-center text-[var(--muted)]">
              <FileText size={28} />
            </div>
          )}
        </div>
      )}

      {description ? <p className="text-[13.5px] text-[var(--muted)]">{description}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        {completed ? (
          <Pill tone="success" dot>Completed</Pill>
        ) : (
          <CompleteForm
            enrollmentId={enrollmentId} moduleId={moduleId} seconds={elapsed} disabled={!satisfied}
            label={isVideo ? "I've watched this" : "I've reviewed this"}
            hint={satisfied ? undefined : `${remaining}s of minimum time remaining`}
          />
        )}
        {assetId ? (
          <a href={`/api/assets/${assetId}/file`} target="_blank" rel="noreferrer" className={buttonClass("outline", "sm")}>
            <ExternalLink size={14} /> Open in a new tab
          </a>
        ) : null}
      </div>
    </div>
  );
}

export function PolicyModule({
  enrollmentId, moduleId, assetId, title, completed, statement,
}: {
  enrollmentId: string; moduleId: string; assetId: string | null; title: string; completed: boolean; statement: string;
}) {
  const [checked, setChecked] = React.useState(false);
  return (
    <div className="space-y-4">
      {assetId ? (
        <iframe src={`/api/assets/${assetId}/file`} title={title} className="h-[52vh] min-h-[380px] w-full rounded-xl border border-[var(--border)] bg-white" />
      ) : null}
      {completed ? (
        <Card><CardBody className="flex items-center gap-2 text-[13.5px] text-[var(--success)]"><ShieldCheck size={17} /> Acknowledgment recorded.</CardBody></Card>
      ) : (
        <form action={acknowledgeDocument} className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <input type="hidden" name="enrollmentId" value={enrollmentId} />
          <input type="hidden" name="moduleId" value={moduleId} />
          <input type="hidden" name="entityId" value={assetId ?? ""} />
          <input type="hidden" name="entityType" value="asset" />
          <input type="hidden" name="statement" value={statement} />
          <Checkbox
            label={statement}
            description="Your name, the document version and a timestamp are recorded on your training record."
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          <SubmitButton className={checked ? "" : "pointer-events-none opacity-50"} pendingLabel="Recording…">
            Acknowledge
          </SubmitButton>
        </form>
      )}
    </div>
  );
}

export function LinkModule({
  enrollmentId, moduleId, url, completed,
}: { enrollmentId: string; moduleId: string; url: string; completed: boolean }) {
  const { elapsed } = useDwellTimer(0);
  return (
    <div className="space-y-4">
      <a href={url} target="_blank" rel="noreferrer" className={buttonClass("primary")}>
        <ExternalLink size={16} /> Open the resource
      </a>
      {completed ? <Pill tone="success" dot>Completed</Pill> : <CompleteForm enrollmentId={enrollmentId} moduleId={moduleId} seconds={elapsed} />}
    </div>
  );
}

export function ChecklistModule({
  enrollmentId, moduleId, items, completed,
}: { enrollmentId: string; moduleId: string; items: string[]; completed: boolean }) {
  const [checked, setChecked] = React.useState<Record<number, boolean>>({});
  const { elapsed } = useDwellTimer(0);
  const allChecked = items.every((_, i) => checked[i]);
  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-1">
          {items.map((item, i) => (
            <Checkbox
              key={i} label={item} checked={Boolean(checked[i])}
              onChange={(e) => setChecked((c) => ({ ...c, [i]: e.target.checked }))}
            />
          ))}
        </CardBody>
      </Card>
      {completed ? (
        <Pill tone="success" dot>Checklist complete</Pill>
      ) : (
        <CompleteForm
          enrollmentId={enrollmentId} moduleId={moduleId} seconds={elapsed} disabled={!allChecked}
          label="Submit checklist" hint={allChecked ? undefined : "Check every item to submit"}
        />
      )}
    </div>
  );
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  question_type: string;
  scenario_text: string | null;
  image_url: string | null;
  options: Array<{ id: string; label: string }>;
  /** Distinct match targets for matching questions (answer key stays server-side). */
  matchKeys?: string[];
}

/** Question types whose answers are collected by a bespoke control, not an option list. */
const ARRANGED = ["ordering", "matching"];

/** Ordering question: learners arrange the steps, order is submitted as the answer. */
function OrderingQuestion({ question }: { question: QuizQuestion }) {
  const [order, setOrder] = React.useState(question.options.map((o) => o.id));
  const move = (index: number, delta: number) => {
    const next = [...order];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
  };
  return (
    <div className="space-y-1.5 pl-8">
      {order.map((optionId, index) => {
        const option = question.options.find((o) => o.id === optionId)!;
        return (
          <div key={optionId} className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2">
            <input type="hidden" name={`q_${question.id}`} value={optionId} />
            <span className="flex size-6 items-center justify-center rounded-full bg-[var(--surface-3)] text-[12px] font-semibold">{index + 1}</span>
            <span className="flex-1 text-[13.5px]">{option.label}</span>
            <button type="button" onClick={() => move(index, -1)} className={buttonClass("ghost", "icon")} aria-label="Move up">↑</button>
            <button type="button" onClick={() => move(index, 1)} className={buttonClass("ghost", "icon")} aria-label="Move down">↓</button>
          </div>
        );
      })}
    </div>
  );
}

/** Matching question: each item is paired with one of the available targets. */
function MatchingQuestion({ question }: { question: QuizQuestion }) {
  return (
    <div className="space-y-2 pl-8">
      {question.options.map((option) => (
        <label key={option.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2">
          <span className="flex-1 text-[13.5px]">{option.label}</span>
          <select
            name={`q_${question.id}_${option.id}`}
            defaultValue=""
            className="h-8 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-[13px]"
          >
            <option value="">Match to…</option>
            {(question.matchKeys ?? []).map((key) => <option key={key} value={key}>{key}</option>)}
          </select>
          <input type="hidden" name={`q_${question.id}`} value={option.id} />
        </label>
      ))}
    </div>
  );
}

export function AssessmentModule({
  enrollmentId, moduleId, assessmentId, title, passingScore, attemptsUsed, attemptLimit, questions,
  lastAttempt, completed, timeLimitMinutes,
}: {
  enrollmentId: string; moduleId: string; assessmentId: string; title: string; passingScore: number;
  attemptsUsed: number; attemptLimit: number | null; questions: QuizQuestion[]; completed: boolean;
  timeLimitMinutes: number | null;
  lastAttempt: { score: string | null; passed: boolean | null; completed_at: string | null } | null;
}) {
  const [started, setStarted] = React.useState(false);
  const [startedAt] = React.useState(() => new Date().toISOString());
  const [answers, setAnswers] = React.useState<Record<string, string[]>>({});
  const outOfAttempts = attemptLimit !== null && attemptsUsed >= attemptLimit;

  const answered = questions.filter(
    (q) => ARRANGED.includes(q.question_type) || (answers[q.id]?.length ?? 0) > 0,
  ).length;

  if (completed && !started) {
    return (
      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center gap-2 text-[var(--success)]">
            <CheckCircle2 size={19} />
            <p className="text-[14.5px] font-semibold">Passed with {lastAttempt?.score ?? "—"}%</p>
          </div>
          <p className="text-[13.5px] text-[var(--muted)]">
            You met the {passingScore}% passing score. Your score is recorded on your transcript.
          </p>
          {attemptLimit === null || attemptsUsed < attemptLimit ? (
            <button onClick={() => setStarted(true)} className={buttonClass("outline", "sm")}>Retake for a higher score</button>
          ) : null}
        </CardBody>
      </Card>
    );
  }

  if (!started) {
    return (
      <Card>
        <CardBody className="space-y-3">
          <h3 className="text-[16px] font-semibold">{title}</h3>
          <ul className="space-y-1 text-[13.5px] text-[var(--muted)]">
            <li>{questions.length} questions · passing score {passingScore}%</li>
            <li>Attempts used: {attemptsUsed}{attemptLimit ? ` of ${attemptLimit}` : " (unlimited)"}</li>
            {timeLimitMinutes ? <li className="flex items-center gap-1.5"><Clock size={13} /> {timeLimitMinutes} minute time limit</li> : null}
          </ul>
          {lastAttempt && lastAttempt.passed === false ? (
            <Pill tone="danger">Last attempt: {lastAttempt.score}% — did not pass</Pill>
          ) : null}
          {outOfAttempts ? (
            <p className="text-[13px] font-medium text-[var(--danger)]">
              You have used all attempts. Ask your manager or Corporate Training to reset this assessment.
            </p>
          ) : (
            <button onClick={() => setStarted(true)} className={buttonClass("primary")}>
              Start assessment <ChevronRight size={16} />
            </button>
          )}
        </CardBody>
      </Card>
    );
  }

  return (
    <form action={submitAssessment} className="space-y-4">
      <input type="hidden" name="enrollmentId" value={enrollmentId} />
      <input type="hidden" name="moduleId" value={moduleId} />
      <input type="hidden" name="assessmentId" value={assessmentId} />
      <input type="hidden" name="startedAt" value={startedAt} />

      <div className="sticky top-14 z-10 flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)]/95 px-3 py-2 backdrop-blur">
        <span className="text-[13px] font-medium">{answered} of {questions.length} answered</span>
        <ProgressBar value={(answered / Math.max(1, questions.length)) * 100} tone="info" className="w-40" />
      </div>

      {questions.map((q, index) => (
        <Card key={q.id}>
          <CardBody className="space-y-3">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-3)] text-[12px] font-semibold">{index + 1}</span>
              <div className="min-w-0">
                {q.scenario_text ? <p className="mb-1.5 rounded-lg bg-[var(--surface-2)] p-2.5 text-[13px] italic text-[var(--muted)]">{q.scenario_text}</p> : null}
                <p className="text-[14.5px] font-medium">{q.prompt}</p>
                <p className="mt-0.5 text-[11.5px] uppercase tracking-wide text-[var(--muted-2)]">
                  {q.question_type === "multiple" ? "Select all that apply"
                    : q.question_type === "true_false" ? "True or false"
                    : q.question_type === "ordering" ? "Put these in the correct order"
                    : q.question_type === "matching" ? "Match each item to its pair"
                    : "Select one"}
                </p>
              </div>
            </div>
            {q.image_url ? (
              <img src={q.image_url} alt="" className="ml-8 max-h-64 rounded-lg border border-[var(--border)]" />
            ) : null}
            {q.question_type === "ordering" ? <OrderingQuestion question={q} /> : null}
            {q.question_type === "matching" ? <MatchingQuestion question={q} /> : null}
            {ARRANGED.includes(q.question_type) ? null : (
            <div className="space-y-1.5 pl-8">
              {q.options.map((opt) => {
                const multi = q.question_type === "multiple";
                const selected = (answers[q.id] ?? []).includes(opt.id);
                return (
                  <label
                    key={opt.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-[13.5px] transition-colors",
                      selected ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-[var(--border)] hover:bg-[var(--surface-2)]",
                    )}
                  >
                    <input
                      type={multi ? "checkbox" : "radio"}
                      name={`q_${q.id}`}
                      value={opt.id}
                      checked={selected}
                      onChange={(e) =>
                        setAnswers((prev) => {
                          const current = prev[q.id] ?? [];
                          if (multi) {
                            return { ...prev, [q.id]: e.target.checked ? [...current, opt.id] : current.filter((id) => id !== opt.id) };
                          }
                          return { ...prev, [q.id]: [opt.id] };
                        })
                      }
                      className="mt-0.5 size-4 accent-[var(--accent)]"
                    />
                    <span>{opt.label}</span>
                  </label>
                );
              })}
            </div>
            )}
          </CardBody>
        </Card>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton size="lg" pendingLabel="Grading…" className={answered === questions.length ? "" : "pointer-events-none opacity-50"}>
          Submit assessment
        </SubmitButton>
        <span className="text-[12.5px] text-[var(--muted)]">
          {answered === questions.length ? `Passing score is ${passingScore}%.` : "Answer every question to submit."}
        </span>
      </div>
    </form>
  );
}
