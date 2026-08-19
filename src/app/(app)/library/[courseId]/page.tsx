import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Award, BookOpen, CheckCircle2, ClipboardCheck, Clock, FileText, ListChecks, PlayCircle, ShieldCheck, Star, Users,
} from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { getCourse, courseModules, courseReviews, courseReviewSummary, courseVersions } from "@/lib/services/courses";
import { Card, CardBody, CardHeader, DescriptionList, EmptyState, Pill, ProgressBar, SourcePill, Table, TableWrap, Td, Th, Tr } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { SelfEnrollButton } from "@/components/learn/self-enroll";
import { formatDate, formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

const MODULE_ICONS: Record<string, React.ReactNode> = {
  scorm: <PlayCircle size={16} />, video: <PlayCircle size={16} />, pdf: <FileText size={16} />,
  document: <FileText size={16} />, text: <FileText size={16} />, assessment: <ClipboardCheck size={16} />,
  checklist: <ListChecks size={16} />, policy: <ShieldCheck size={16} />, manager_validation: <Award size={16} />,
};

export async function generateMetadata({ params }: { params: Promise<{ courseId: string }> }) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await getCourse(user.id, courseId);
  return { title: course?.title ?? "Course" };
}

export default async function CourseDetailPage({ params }: { params: Promise<{ courseId: string }> }) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await getCourse(user.id, courseId);
  if (!course) notFound();

  const [modules, reviews, summary, versions] = await Promise.all([
    courseModules(course.id, course.current_version),
    courseReviews(course.id, 8),
    courseReviewSummary(course.id),
    courseVersions(course.id),
  ]);

  return (
    <div className="mx-auto max-w-[1100px] space-y-5">
      <Card className="overflow-hidden">
        {course.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={course.thumbnail_url} alt="" className="h-24 w-full object-cover" />
        ) : (
          <div className="h-24" style={{ background: `linear-gradient(135deg, ${course.thumbnail_color}, ${course.category_color ?? "#0e1f38"})` }} />
        )}
        <CardBody className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {course.category_name ? <Pill tone="neutral">{course.category_name}</Pill> : null}
              {course.is_required_default ? <Pill tone="accent">Required</Pill> : <Pill tone="neutral">Optional</Pill>}
              {course.certification_name ? <Pill tone="success">{course.certification_name}</Pill> : null}
              <SourcePill source={course.source_system} />
            </div>
            <h1 className="text-[24px] font-semibold tracking-tight sm:text-[28px]">{course.title}</h1>
            <p className="mt-2 max-w-2xl text-[14px] text-[var(--muted)]">{course.description}</p>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-[12.5px] text-[var(--muted)]">
              <span className="flex items-center gap-1.5"><Clock size={14} /> {course.estimated_minutes} minutes</span>
              <span className="flex items-center gap-1.5"><BookOpen size={14} /> {course.module_count} modules</span>
              <span className="flex items-center gap-1.5"><Users size={14} /> {course.completion_count.toLocaleString()} completions</span>
              {Number(course.rating_avg) > 0 ? (
                <span className="flex items-center gap-1"><Star size={14} className="text-[var(--wb-gold)]" fill="currentColor" /> {Number(course.rating_avg).toFixed(1)} ({course.rating_count})</span>
              ) : null}
              <span>v{course.current_version} · updated {formatDate(course.updated_at)}</span>
            </div>
          </div>
          <div className="w-full max-w-[260px] space-y-3">
            {course.my_enrollment_id ? (
              <>
                <ProgressBar value={course.my_status === "completed" ? 100 : course.my_status === "in_progress" ? 50 : 0} tone={course.my_status === "completed" ? "success" : "info"} showLabel />
                <LinkButton href={`/learn/${course.my_enrollment_id}`} variant="primary" size="lg" className="w-full">
                  {course.my_status === "completed" ? "Review course" : course.my_status === "in_progress" ? "Continue course" : "Start course"}
                </LinkButton>
                {course.my_due_at ? <p className="text-center text-[12px] text-[var(--muted)]">Due {formatDate(course.my_due_at)}</p> : null}
              </>
            ) : (
              <>
                <SelfEnrollButton courseId={course.id} />
                <p className="text-center text-[12px] text-[var(--muted)]">Not assigned to you — you can add it to your learning.</p>
              </>
            )}
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="What you'll learn" />
            <CardBody>
              <ul className="space-y-2">
                {(course.objectives ?? []).map((obj, i) => (
                  <li key={i} className="flex items-start gap-2 text-[14px]">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[var(--success)]" /> {obj}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          {course.prerequisites?.length ? (
            <Card>
              <CardHeader title="Prerequisites" subtitle="Complete these first" />
              <CardBody>
                <ul className="space-y-1.5 text-[14px]">
                  {course.prerequisites.map((id) => (
                    <li key={id}>
                      <Link href={`/library/${id}`} className="font-medium text-[var(--accent)] hover:underline">
                        View prerequisite course
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Course content" subtitle={`${modules.length} modules`} />
            <ol>
              {modules.map((mod, i) => (
                <li key={mod.id} className="flex items-start gap-3 border-b border-[var(--border)] px-4 py-3 last:border-b-0 sm:px-5">
                  <span className="mt-0.5 text-[var(--muted-2)]">{MODULE_ICONS[mod.module_type] ?? <FileText size={16} />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium">{i + 1}. {mod.title}</p>
                    <p className="text-[12px] capitalize text-[var(--muted)]">
                      {mod.module_type.replace("_", " ")}
                      {mod.scorm_version ? ` · SCORM ${mod.scorm_version}` : ""}
                      {mod.passing_score ? ` · passing score ${Number(mod.passing_score)}%` : ""}
                      {mod.is_required ? "" : " · optional"}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <CardHeader
              title="Learner feedback"
              subtitle={summary && Number(summary.reviews) ? `${summary.reviews} reviews · ${Number(summary.avg_rating).toFixed(1)} average` : "No reviews yet"}
              icon={<Star size={17} />}
            />
            <CardBody className="space-y-4">
              {summary && Number(summary.reviews) > 0 ? (
                <div className="grid gap-3 sm:grid-cols-4">
                  {[
                    { label: "Useful", value: summary.useful },
                    { label: "Easy to understand", value: summary.easy },
                    { label: "Relevant to role", value: summary.relevant },
                    { label: "More confident", value: summary.confident },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg bg-[var(--surface-2)] p-3 text-center">
                      <p className="text-[19px] font-semibold tabular-nums">{item.value ?? "—"}</p>
                      <p className="text-[11px] text-[var(--muted)]">{item.label}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              {reviews.length === 0 ? (
                <EmptyState title="No written feedback yet" description="Feedback appears here after learners complete the course." />
              ) : (
                reviews.filter((r) => r.comments).map((r) => (
                  <div key={r.id} className="border-b border-[var(--border)] pb-3 last:border-b-0 last:pb-0">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="flex items-center gap-0.5 text-[var(--wb-gold)]">
                        {Array.from({ length: r.rating }).map((_, i) => <Star key={i} size={12} fill="currentColor" />)}
                      </span>
                      <span className="text-[12px] text-[var(--muted)]">{r.author_name} · {formatRelative(r.created_at)}</span>
                    </div>
                    <p className="text-[13.5px]">{r.comments}</p>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Course details" />
            <CardBody>
              <DescriptionList
                items={[
                  { label: "Course code", value: course.code },
                  { label: "Owner", value: course.owner_name ?? "Corporate Training" },
                  { label: "Format", value: <span className="capitalize">{course.course_type}</span> },
                  { label: "Passing score", value: `${Number(course.passing_score)}%` },
                  { label: "Certification", value: course.certification_name ?? "None" },
                  { label: "Published", value: course.published_at ? formatDate(course.published_at) : "—" },
                  { label: "Source", value: <SourcePill source={course.source_system} /> },
                  { label: "Status", value: <Pill tone="success">{course.status}</Pill> },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Version history" subtitle="Transcripts record the version each learner completed" />
            <TableWrap>
              <Table className="min-w-[320px]">
                <thead><tr><Th>Version</Th><Th>Status</Th><Th>Published</Th></tr></thead>
                <tbody>
                  {versions.map((v) => (
                    <Tr key={v.id}>
                      <Td className="font-medium">v{v.version_number}</Td>
                      <Td><Pill tone={v.status === "published" ? "success" : "neutral"}>{v.status}</Pill></Td>
                      <Td className="text-[var(--muted)]">{v.published_at ? formatDate(v.published_at) : "—"}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </Card>

          <Card>
            <CardBody>
              <p className="text-[13px] text-[var(--muted)]">
                Need this assigned to your team? <Link href={`/admin/assignments/new?course=${course.id}`} className="font-medium text-[var(--accent)] hover:underline">Create an assignment</Link>.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
