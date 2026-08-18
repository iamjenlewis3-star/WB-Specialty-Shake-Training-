import { requirePermission } from "@/lib/auth/guard";
import { listCategories } from "@/lib/services/courses";
import { query } from "@/lib/db/client";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { Field, Select, TextArea, TextInput, Checkbox, SubmitButton } from "@/components/ui/interactive";
import { createCourse } from "@/lib/actions/content";

export const metadata = { title: "New course" };
export const dynamic = "force-dynamic";

export default async function NewCoursePage() {
  await requirePermission("courses.create");
  const [categories, certifications] = await Promise.all([
    listCategories(),
    query<{ id: string; name: string }>(`select id, name from certifications where status = 'active' order by name`),
  ]);

  return (
    <div className="mx-auto max-w-[820px] space-y-5">
      <PageHeader
        title="Create a course"
        description="Start with the basics. You'll add modules — SCORM, video, documents, assessments, checklists and manager validation — in the builder."
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Courses", href: "/admin/courses" }, { label: "New" }]}
      />
      <Card>
        <CardHeader title="Course details" />
        <CardBody>
          <form action={createCourse} className="grid gap-4 sm:grid-cols-2">
            <Field label="Course title" required className="sm:col-span-2">
              <TextInput name="title" required placeholder="e.g. Specialty Shakes: Fruity Pebbles & Kit Kat" />
            </Field>
            <Field label="Course code" required hint="Unique identifier, e.g. WB-130">
              <TextInput name="code" required placeholder="WB-130" />
            </Field>
            <Field label="Category">
              <Select name="category_id" defaultValue="">
                <option value="">No category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <TextArea name="description" rows={3} placeholder="What this course covers and who it's for…" />
            </Field>
            <Field label="Learning objectives" className="sm:col-span-2" hint="One per line">
              <TextArea name="objectives" rows={4} placeholder={"Build both specialty shakes to spec\nUpsell shakes at the counter"} />
            </Field>
            <Field label="Format">
              <Select name="course_type" defaultValue="blended">
                <option value="blended">Blended</option>
                <option value="scorm">SCORM</option>
                <option value="video">Video</option>
                <option value="document">Document</option>
                <option value="assessment">Assessment</option>
                <option value="checklist">Checklist</option>
                <option value="ilt">Instructor-led</option>
              </Select>
            </Field>
            <Field label="Estimated minutes"><TextInput name="estimated_minutes" type="number" min={1} max={600} defaultValue={30} /></Field>
            <Field label="Passing score (%)"><TextInput name="passing_score" type="number" min={0} max={100} defaultValue={80} /></Field>
            <Field label="Certification awarded">
              <Select name="certification_id" defaultValue="">
                <option value="">None</option>
                {certifications.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Checkbox name="is_required_default" label="Required by default" description="New assignments of this course default to required training" />
            </div>
            <div className="sm:col-span-2">
              <SubmitButton size="lg" pendingLabel="Creating…">Create course</SubmitButton>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
