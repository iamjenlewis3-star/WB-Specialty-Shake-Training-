import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft, BadgeCheck, CheckCircle2, ClipboardCheck, Circle, Clock, FileText, ListChecks, PlayCircle,
  ShieldCheck, Star,
} from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { getEnrollment } from "@/lib/services/learning";
import { courseModules } from "@/lib/services/courses";
import { moduleProgressFor } from "@/lib/services/progress";
import { getScormState } from "@/lib/services/scorm";
import { getScormPackage } from "@/lib/services/scorm";
import { query, queryOne } from "@/lib/db/client";
import { Card, CardBody, CardHeader, Pill, ProgressBar, SourcePill, StatusPill } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { ScormPlayer } from "@/components/learn/scorm-player";
import {
  AssessmentModule, ChecklistModule, LinkModule, MediaModule, PolicyModule, TextModule, type QuizQuestion,
} from "@/components/learn/module-views";
import { CourseReviewForm } from "@/components/learn/review-form";
import { formatDate, formatDuration, cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const MODULE_ICONS: Record<string, React.ReactNode> = {
  scorm: <PlayCircle size={15} />, video: <PlayCircle size={15} />, pdf: <FileText size={15} />,
  document: <FileText size={15} />, presentation: <FileText size={15} />, text: <FileText size={15} />,
  assessment: <ClipboardCheck size={15} />, checklist: <ListChecks size={15} />, policy: <ShieldCheck size={15} />,
  manager_validation: <BadgeCheck size={15} />, link: <FileText size={15} />,
};

export async function generateMetadata({ params }: { params: Promise<{ enrollmentId: string }> }) {
  const { enrollmentId } = await params;
  const user = await requireUser();
  const enrollment = await getEnrollment(user.id, enrollmentId);
  return { title: enrollment?.course_title ?? "Course" };
}

export default async function LearnPage({
  params, searchParams,
}: {
  params: Promise<{ enrollmentId: string }>;
  searchParams: Promise<{ m?: string; attempt?: string; completed?: string }>;
}) {
  const user = await requireUser();
  const { enrollmentId } = await params;
  const { m: moduleParam, attempt: attemptId, completed: justCompleted } = await searchParams;

  const enrollment = await getEnrollment(user.id, enrollmentId);
  if (!enrollment) notFound();

  const modules = enrollment.course_id
    ? await courseModules(enrollment.course_id, Number(enrollment.modules_total) >= 0 ? await currentVersionFor(enrollment.course_id, enrollmentId) : 1)
    : [];
  const progress = await moduleProgressFor(enrollmentId);

  const active =
    modules.find((mod) => mod.id === moduleParam) ??
    modules.find((mod) => progress[mod.id]?.status !== "completed") ??
    modules[0];

  const completedCount = modules.filter((mod) => progress[mod.id]?.status === "completed").length;
  const pct = modules.length ? Math.round((completedCount / modules.length) * 100) : Number(enrollment.progress_pct);

  const lastAttempt = attemptId
    ? await queryOne<{ score: string | null; passed: boolean | null; completed_at: string | null }>(
        `select score::text as score, passed, completed_at from assessment_attempts where id = $1 and user_id = $2`,
        [attemptId, user.id])
    : null;

  return (
    <div className="mx-auto max-w-[1180px] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/my-learning" className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--muted)] hover:text-[var(--foreground)]">
          <ArrowLeft size={15} /> Back to My Learning
        </Link>
        <div className="flex items-center gap-2">
          <SourcePill source={enrollment.source_system} />
          <StatusPill status={enrollment.status} />
        </div>
      </div>

      <Card>
        <div className="h-1.5" style={{ background: enrollment.thumbnail_color ?? "var(--wb-navy)" }} />
        <CardBody className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              {enrollment.category_name ? <Pill tone="neutral">{enrollment.category_name}</Pill> : null}
              {enrollment.is_required ? <Pill tone="accent">Required</Pill> : <Pill tone="neutral">Optional</Pill>}
              {enrollment.certification_name ? <Pill tone="success">{enrollment.certification_name}</Pill> : null}
              {enrollment.learning_path_name ? <Pill tone="info">{enrollment.learning_path_name}</Pill> : null}
            </div>
            <h1 className="text-[22px] font-semibold tracking-tight sm:text-[25px]">{enrollment.course_title}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-3 text-[12.5px] text-[var(--muted)]">
              {enrollment.course_code ? <span>{enrollment.course_code}</span> : null}
              {enrollment.estimated_minutes ? <span className="flex items-center gap-1"><Clock size={13} /> {enrollment.estimated_minutes} min</span> : null}
              {enrollment.due_at ? <span>Due {formatDate(enrollment.due_at)}</span> : null}
              {enrollment.completed_at ? <span className="text-[var(--success)]">Completed {formatDate(enrollment.completed_at)}</span> : null}
            </p>
          </div>
          <div className="w-full max-w-[260px]">
            <ProgressBar value={pct} tone={pct >= 100 ? "success" : "info"} showLabel />
            <p className="mt-1.5 text-[12px] text-[var(--muted)]">
              {completedCount} of {modules.length} modules complete
              {enrollment.score ? ` · score ${Math.round(Number(enrollment.score))}%` : ""}
            </p>
          </div>
        </CardBody>
      </Card>

      {(justCompleted || enrollment.status === "completed") && enrollment.course_id ? (
        <Card className="border-[var(--success)]">
          <CardBody className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-[var(--success-bg)] text-[var(--success)]"><CheckCircle2 size={22} /></span>
              <div>
                <p className="text-[15px] font-semibold">Course complete</p>
                <p className="text-[13px] text-[var(--muted)]">
                  This is now on your permanent training transcript{enrollment.certification_name ? ` and your ${enrollment.certification_name} certification has been issued` : ""}.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <LinkButton href={`/people/${user.id}/transcript`} variant="outline" size="sm">View transcript</LinkButton>
              <LinkButton href="/my-learning" variant="primary" size="sm">Back to My Learning</LinkButton>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {lastAttempt ? (
        <Card className={lastAttempt.passed ? "border-[var(--success)]" : "border-[var(--danger)]"}>
          <CardBody className="flex items-center gap-3">
            <span className={cn("flex size-10 items-center justify-center rounded-full",
              lastAttempt.passed ? "bg-[var(--success-bg)] text-[var(--success)]" : "bg-[var(--danger-bg)] text-[var(--danger)]")}>
              {lastAttempt.passed ? <CheckCircle2 size={21} /> : <Circle size={21} />}
            </span>
            <div>
              <p className="text-[14.5px] font-semibold">
                {lastAttempt.passed ? "Passed" : "Not passed"} — {lastAttempt.score}%
              </p>
              <p className="text-[13px] text-[var(--muted)]">
                {lastAttempt.passed ? "Your score has been recorded." : "Review the module and try again when you're ready."}
              </p>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* Module list */}
        <Card className="h-fit lg:sticky lg:top-[72px]">
          <CardHeader title="Course modules" subtitle={`${modules.length} module${modules.length === 1 ? "" : "s"}`} />
          <nav aria-label="Course modules">
            <ol>
              {modules.map((mod, i) => {
                const state = progress[mod.id]?.status ?? "not_started";
                const isActive = active?.id === mod.id;
                return (
                  <li key={mod.id}>
                    <Link
                      href={`/learn/${enrollmentId}?m=${mod.id}`}
                      aria-current={isActive ? "step" : undefined}
                      className={cn(
                        "flex items-start gap-2.5 border-b border-[var(--border)] px-4 py-3 text-[13.5px] last:border-b-0",
                        isActive ? "bg-[var(--surface-3)]" : "hover:bg-[var(--surface-2)]",
                      )}
                    >
                      <span className={cn("mt-0.5", state === "completed" ? "text-[var(--success)]" : "text-[var(--muted-2)]")}>
                        {state === "completed" ? <CheckCircle2 size={16} /> : MODULE_ICONS[mod.module_type] ?? <Circle size={15} />}
                      </span>
                      <span className="min-w-0">
                        <span className={cn("block", isActive && "font-semibold")}>{i + 1}. {mod.title}</span>
                        <span className="mt-0.5 block text-[11.5px] capitalize text-[var(--muted)]">
                          {mod.module_type.replace("_", " ")}
                          {mod.is_required ? "" : " · optional"}
                          {progress[mod.id]?.seconds_spent ? ` · ${formatDuration(progress[mod.id].seconds_spent)}` : ""}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </nav>
        </Card>

        {/* Active module */}
        <div className="min-w-0 space-y-4">
          {active ? (
            <Card>
              <CardHeader
                title={active.title}
                subtitle={active.description}
                action={progress[active.id]?.status === "completed" ? <Pill tone="success" dot>Complete</Pill> : null}
              />
              <CardBody>
                <ModuleRenderer
                  module={active}
                  enrollmentId={enrollmentId}
                  userId={user.id}
                  userName={`${user.lastName}, ${user.firstName}`}
                  employeeId={user.employeeId ?? user.id}
                  completed={progress[active.id]?.status === "completed"}
                />
              </CardBody>
            </Card>
          ) : (
            <Card><CardBody>This course has no modules yet.</CardBody></Card>
          )}

          {enrollment.status === "completed" && enrollment.course_id ? (
            <Card>
              <CardHeader title="How was this training?" subtitle="Your feedback goes to the course owner" icon={<Star size={17} />} />
              <CardBody>
                <CourseReviewForm courseId={enrollment.course_id} enrollmentId={enrollmentId} />
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

async function currentVersionFor(courseId: string, enrollmentId: string): Promise<number> {
  const row = await queryOne<{ course_version: number }>(
    `select course_version from enrollments where id = $1`, [enrollmentId]);
  if (row?.course_version) return row.course_version;
  const course = await queryOne<{ current_version: number }>(`select current_version from courses where id = $1`, [courseId]);
  return course?.current_version ?? 1;
}

async function ModuleRenderer({
  module: mod, enrollmentId, userId, userName, employeeId, completed,
}: {
  module: Awaited<ReturnType<typeof courseModules>>[number];
  enrollmentId: string; userId: string; userName: string; employeeId: string; completed: boolean;
}) {
  switch (mod.module_type) {
    case "scorm": {
      if (!mod.scorm_package_id) return <p className="text-[13.5px] text-[var(--muted)]">No SCORM package is attached to this module yet.</p>;
      const [pkg, state] = await Promise.all([
        getScormPackage(mod.scorm_package_id),
        getScormState(enrollmentId, mod.id),
      ]);
      if (!pkg) return <p className="text-[13.5px] text-[var(--muted)]">The SCORM package for this module is unavailable.</p>;
      return (
        <ScormPlayer
          enrollmentId={enrollmentId}
          moduleId={mod.id}
          packageId={pkg.id}
          launchFile={pkg.launch_file}
          scormVersion={pkg.scorm_version}
          studentName={userName}
          studentId={employeeId}
          masteryScore={pkg.mastery_score ? Number(pkg.mastery_score) : mod.passing_score ? Number(mod.passing_score) : null}
          initialState={{
            cmi: state.cmi as Record<string, string | number>,
            entry: state.entry,
            lessonStatus: state.lessonStatus,
            suspendData: state.suspendData,
            lessonLocation: state.lessonLocation,
            totalTimeSeconds: state.totalTimeSeconds,
            scoreRaw: state.scoreRaw,
          }}
        />
      );
    }
    case "assessment": {
      if (!mod.assessment_id) return <p className="text-[13.5px] text-[var(--muted)]">No assessment attached.</p>;
      const [assessment, questionRows, optionRows, attempts] = await Promise.all([
        queryOne<{ id: string; title: string; passing_score: string; attempt_limit: number | null; time_limit_minutes: number | null; randomize_questions: boolean; questions_per_attempt: number | null }>(
          `select id, title, passing_score::text as passing_score, attempt_limit, time_limit_minutes,
                  randomize_questions, questions_per_attempt from assessments where id = $1`, [mod.assessment_id]),
        query<{ id: string; prompt: string; question_type: string; scenario_text: string | null; image_url: string | null }>(
          `select id, prompt, question_type, scenario_text, image_url from questions where assessment_id = $1 order by position`,
          [mod.assessment_id]),
        query<{ id: string; question_id: string; label: string; position: number }>(
          `select o.id, o.question_id, o.label, o.position from question_options o
             join questions q on q.id = o.question_id where q.assessment_id = $1 order by o.position`, [mod.assessment_id]),
        query<{ score: string | null; passed: boolean | null; completed_at: string | null }>(
          `select score::text as score, passed, completed_at from assessment_attempts
            where assessment_id = $1 and user_id = $2 order by attempt_number desc`, [mod.assessment_id, userId]),
      ]);
      if (!assessment) return <p>Assessment unavailable.</p>;
      const questions: QuizQuestion[] = questionRows.map((q) => ({
        id: q.id, prompt: q.prompt, question_type: q.question_type,
        scenario_text: q.scenario_text, image_url: q.image_url,
        options: optionRows.filter((o) => o.question_id === q.id).map((o) => ({ id: o.id, label: o.label })),
      }));
      return (
        <AssessmentModule
          enrollmentId={enrollmentId} moduleId={mod.id} assessmentId={assessment.id} title={assessment.title}
          passingScore={Number(assessment.passing_score)} attemptsUsed={attempts.length}
          attemptLimit={assessment.attempt_limit} questions={questions} completed={completed}
          timeLimitMinutes={assessment.time_limit_minutes} lastAttempt={attempts[0] ?? null}
        />
      );
    }
    case "policy":
      return (
        <PolicyModule
          enrollmentId={enrollmentId} moduleId={mod.id} assetId={mod.asset_id} title={mod.title}
          completed={completed} statement="I have reviewed and understand this policy."
        />
      );
    case "checklist":
      return (
        <ChecklistModule
          enrollmentId={enrollmentId} moduleId={mod.id} completed={completed}
          items={[
            "Restaurant tour completed with the manager",
            "Introduced to the team and station leads",
            "Uniform, locker and time clock set up",
            "Academy account confirmed and first training launched",
            "Safety walkthrough: exits, first aid, chemical storage",
          ]}
        />
      );
    case "link":
      return <LinkModule enrollmentId={enrollmentId} moduleId={mod.id} url={mod.external_url ?? "#"} completed={completed} />;
    case "manager_validation":
      return (
        <div className="space-y-3">
          <p className="text-[14px]">
            Your manager verifies this skill on the floor. Once they observe you meeting the standard, they record the
            validation here and this module completes automatically.
          </p>
          <Pill tone={completed ? "success" : "warning"} dot>
            {completed ? "Validated by your manager" : "Waiting on manager validation"}
          </Pill>
        </div>
      );
    case "text":
      return (
        <TextModule
          enrollmentId={enrollmentId} moduleId={mod.id} completed={completed}
          content={mod.content_text ?? mod.description ?? mod.title} minSeconds={mod.min_seconds}
        />
      );
    default:
      return (
        <MediaModule
          enrollmentId={enrollmentId} moduleId={mod.id} completed={completed} minSeconds={mod.min_seconds}
          assetId={mod.asset_id} assetName={mod.asset_name} assetType={mod.asset_type} description={mod.description}
        />
      );
  }
}
