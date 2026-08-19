import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, History, Package, Settings2 } from "lucide-react";
import { requirePermission, can } from "@/lib/auth/guard";
import { getCourse, courseModules, courseVersions, listCategories } from "@/lib/services/courses";
import { listScormPackages } from "@/lib/services/scorm";
import { listAssets } from "@/lib/services/assets";
import { query } from "@/lib/db/client";
import { Card, CardBody, CardHeader, DescriptionList, PageHeader, Pill, Table, TableWrap, Td, Th, Tr } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { Field, Select, TextArea, TextInput, Checkbox, SubmitButton } from "@/components/ui/interactive";
import { CourseBuilder } from "@/components/admin/course-builder";
import { PublishCourseButton } from "@/components/admin/publish-course";
import { updateCourse, archiveCourse } from "@/lib/actions/content";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ courseId: string }> }) {
  const user = await requirePermission(["courses.edit", "courses.create"]);
  const { courseId } = await params;
  const course = await getCourse(user.id, courseId);
  return { title: course ? `${course.title} — Builder` : "Course builder" };
}

export default async function CourseBuilderPage({ params }: { params: Promise<{ courseId: string }> }) {
  const user = await requirePermission(["courses.edit", "courses.create"]);
  const { courseId } = await params;
  const course = await getCourse(user.id, courseId);
  if (!course) notFound();

  const [modules, versions, categories, certifications, scormPackages, assets, assessments, stats] = await Promise.all([
    courseModules(course.id, course.current_version),
    courseVersions(course.id),
    listCategories(),
    query<{ id: string; name: string }>(`select id, name from certifications where status = 'active' order by name`),
    listScormPackages(),
    listAssets({}),
    query<{ id: string; title: string }>(`select id, title from assessments where status = 'active' order by title`),
    query<{ assigned: string; completed: string; in_progress: string }>(`
      select count(*)::text as assigned,
             count(*) filter (where status = 'completed')::text as completed,
             count(*) filter (where status = 'in_progress')::text as in_progress
        from enrollments where course_id = $1`, [courseId]),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title={course.title}
        description={`${course.code} · version ${course.current_version} · ${modules.length} modules`}
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Courses", href: "/admin/courses" }, { label: course.title }]}
        actions={
          <>
            <LinkButton href={`/library/${course.id}`} variant="outline" size="sm"><ExternalLink size={15} /> Learner view</LinkButton>
            {can(user, "courses.archive") ? (
              <form action={archiveCourse}>
                <input type="hidden" name="course_id" value={course.id} />
                <SubmitButton variant="ghost" size="sm" pendingLabel="…">{course.status === "archived" ? "Restore" : "Archive"}</SubmitButton>
              </form>
            ) : null}
            {can(user, "courses.publish") ? (
              <PublishCourseButton courseId={course.id} status={course.status} version={course.current_version} />
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <CourseBuilder
            courseId={course.id}
            modules={modules.map((m) => ({
              id: m.id, title: m.title, description: m.description, module_type: m.module_type, position: m.position,
              is_required: m.is_required, min_seconds: m.min_seconds, passing_score: m.passing_score,
              attempt_limit: m.attempt_limit, asset_id: m.asset_id, scorm_package_id: m.scorm_package_id,
              assessment_id: m.assessment_id, content_text: m.content_text, external_url: m.external_url,
              completion_rule: m.completion_rule, requires_manager_validation: m.requires_manager_validation,
              sequence_required: m.sequence_required, asset_name: m.asset_name, scorm_version: m.scorm_version,
              assessment_title: m.assessment_title,
            }))}
            scormPackages={scormPackages.map((p) => ({ id: p.id, title: p.title, version: p.scorm_version }))}
            assets={assets.map((a) => ({ id: a.id, name: a.name, type: a.asset_type }))}
            assessments={assessments}
          />

          <Card>
            <CardHeader title="Course settings" icon={<Settings2 size={17} />} />
            <CardBody>
              <form action={updateCourse} className="grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="course_id" value={course.id} />
                <Field label="Title" required className="sm:col-span-2"><TextInput name="title" defaultValue={course.title} required /></Field>
                <Field label="Description" className="sm:col-span-2"><TextArea name="description" rows={3} defaultValue={course.description ?? ""} /></Field>
                <Field label="Objectives" className="sm:col-span-2" hint="One per line">
                  <TextArea name="objectives" rows={4} defaultValue={(course.objectives ?? []).join("\n")} />
                </Field>
                <Field label="Category">
                  <Select name="category_id" defaultValue={course.category_id ?? ""}>
                    <option value="">No category</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Field>
                <Field label="Format">
                  <Select name="course_type" defaultValue={course.course_type}>
                    {["blended", "scorm", "video", "document", "assessment", "checklist", "ilt"].map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Estimated minutes"><TextInput name="estimated_minutes" type="number" defaultValue={course.estimated_minutes} /></Field>
                <Field label="Passing score (%)"><TextInput name="passing_score" type="number" defaultValue={Number(course.passing_score)} /></Field>
                <Field label="Certification awarded">
                  <Select name="certification_id" defaultValue={""}>
                    <option value="">None</option>
                    {certifications.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Field>
                <div className="flex items-end">
                  <Checkbox name="is_required_default" label="Required by default" defaultChecked={course.is_required_default} />
                </div>
                <Field label="Course artwork" className="sm:col-span-2" hint="Shown on library cards. PNG, JPEG, WEBP or GIF up to 5 MB — leave empty to keep the current image.">
                  <div className="flex items-center gap-3">
                    {course.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={course.thumbnail_url} alt="" className="h-14 w-24 shrink-0 rounded-lg border border-[var(--border)] object-cover" />
                    ) : (
                      <span className="h-14 w-24 shrink-0 rounded-lg border border-[var(--border)]" style={{ background: course.thumbnail_color ?? "#0e1f38" }} />
                    )}
                    <input
                      type="file" name="thumbnail" accept="image/png,image/jpeg,image/webp,image/gif"
                      className="w-full text-[12.5px] file:mr-2 file:rounded-lg file:border-0 file:bg-[var(--surface-3)] file:px-3 file:py-1.5 file:text-[12.5px] file:font-medium"
                    />
                    {course.thumbnail_url ? <Checkbox name="remove_thumbnail" label="Remove" /> : null}
                  </div>
                </Field>
                <div className="sm:col-span-2"><SubmitButton pendingLabel="Saving…">Save course settings</SubmitButton></div>
              </form>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Status" />
            <CardBody>
              <DescriptionList
                items={[
                  { label: "Status", value: <Pill tone={course.status === "published" ? "success" : "warning"}>{course.status}</Pill> },
                  { label: "Current version", value: `v${course.current_version}` },
                  { label: "Owner", value: course.owner_name ?? "Corporate Training" },
                  { label: "Assigned", value: Number(stats[0]?.assigned ?? 0).toLocaleString() },
                  { label: "Completed", value: Number(stats[0]?.completed ?? 0).toLocaleString() },
                  { label: "In progress", value: Number(stats[0]?.in_progress ?? 0).toLocaleString() },
                  { label: "Rating", value: Number(course.rating_avg) > 0 ? `${Number(course.rating_avg).toFixed(1)} (${course.rating_count})` : "—" },
                  { label: "Updated", value: formatDate(course.updated_at) },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Version history" icon={<History size={17} />} subtitle="Transcripts record the version completed" />
            <TableWrap>
              <Table className="min-w-[280px]">
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
            <CardBody className="space-y-2 text-[12px] text-[var(--muted)]">
              {versions.filter((v) => v.change_notes).slice(0, 3).map((v) => (
                <p key={v.id}><strong className="text-[var(--foreground)]">v{v.version_number}:</strong> {v.change_notes}</p>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="SCORM packages" icon={<Package size={17} />} action={<Link href="/admin/scorm" className="text-[13px] font-medium text-[var(--accent)] hover:underline">Manage</Link>} />
            <CardBody className="space-y-2">
              {modules.filter((m) => m.scorm_package_id).length === 0 ? (
                <p className="text-[12.5px] text-[var(--muted)]">No SCORM module attached yet. Add a SCORM module above or upload a package.</p>
              ) : modules.filter((m) => m.scorm_package_id).map((m) => (
                <div key={m.id} className="rounded-lg border border-[var(--border)] p-2.5">
                  <p className="text-[13px] font-medium">{m.title}</p>
                  <p className="text-[11.5px] text-[var(--muted)]">SCORM {m.scorm_version} · launch {m.scorm_launch}</p>
                </div>
              ))}
              <LinkButton href={`/admin/scorm?course=${course.id}`} variant="outline" size="sm" className="w-full">Upload SCORM package</LinkButton>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
