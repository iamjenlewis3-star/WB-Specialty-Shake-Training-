import { requirePermission } from "@/lib/auth/guard";
import { filterOptions } from "@/lib/services/people";
import { listCatalog } from "@/lib/services/courses";
import { EVENT_TYPE_LABELS } from "@/lib/services/calendar";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { Field, Select, TextArea, TextInput, SubmitButton } from "@/components/ui/interactive";
import { createTrainingSession } from "@/lib/actions/calendar";

export const metadata = { title: "New training session" };
export const dynamic = "force-dynamic";

export default async function NewSessionPage() {
  const user = await requirePermission(["live_training.manage", "training.schedule"]);
  const [options, catalog] = await Promise.all([
    filterOptions(user.scope),
    listCatalog(user.id, { pageSize: 60 }),
  ]);

  return (
    <div className="mx-auto max-w-[840px] space-y-5">
      <PageHeader
        title="Schedule instructor-led training"
        description="Create an in-restaurant or virtual session. Everyone at the restaurant is invited automatically and attendance updates their training records."
        breadcrumb={[{ label: "Calendar", href: "/calendar" }, { label: "New session" }]}
      />
      <Card>
        <CardHeader title="Session details" />
        <CardBody>
          <form action={createTrainingSession} className="grid gap-4 sm:grid-cols-2">
            <Field label="Session title" required className="sm:col-span-2">
              <TextInput name="title" required placeholder="e.g. Cook Certification Workshop" />
            </Field>
            <Field label="Session type" required>
              <Select name="event_type" required defaultValue="ilt">
                {Object.entries(EVENT_TYPE_LABELS).filter(([k]) => k !== "training_block").map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Linked course" hint="Attendance completes this course's live module">
              <Select name="course_id" defaultValue="">
                <option value="">No linked course</option>
                {catalog.rows.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </Select>
            </Field>
            <Field label="Date" required><TextInput name="date" type="date" required /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start time" required><TextInput name="start_time" type="time" required defaultValue="09:00" /></Field>
              <Field label="End time" required><TextInput name="end_time" type="time" required defaultValue="11:00" /></Field>
            </div>
            <Field label="Restaurant" hint="Leave blank for a corporate or virtual session">
              <Select name="location_id" defaultValue={user.locationId ?? ""}>
                <option value="">No restaurant (virtual / corporate)</option>
                {options.locations.map((l) => <option key={l.id} value={l.id}>{l.name} (#{l.store_number})</option>)}
              </Select>
            </Field>
            <Field label="Capacity"><TextInput name="capacity" type="number" min={1} max={500} defaultValue={12} /></Field>
            <Field label="Virtual link" className="sm:col-span-2">
              <TextInput name="virtual_link" type="url" placeholder="https://virtual.wahlburgers.test/…" />
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <TextArea name="description" rows={3} placeholder="What this session covers…" />
            </Field>
            <Field label="Materials" className="sm:col-span-2" hint="Participant guides, checklists, station setup">
              <TextInput name="materials" placeholder="Participant guide, station checklist" />
            </Field>
            <div className="sm:col-span-2">
              <SubmitButton size="lg" pendingLabel="Scheduling…">Schedule session</SubmitButton>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
