import { requirePermission } from "@/lib/auth/guard";
import { listPeople } from "@/lib/services/people";
import { listCatalog } from "@/lib/services/courses";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { Field, Select, TextInput, SubmitButton } from "@/components/ui/interactive";
import { scheduleTrainingBlock } from "@/lib/actions/training";

export const metadata = { title: "Schedule training block" };
export const dynamic = "force-dynamic";

export default async function ScheduleBlockPage({
  searchParams,
}: { searchParams: Promise<{ user?: string; course?: string }> }) {
  const user = await requirePermission("training.schedule");
  const sp = await searchParams;
  const [team, catalog] = await Promise.all([
    listPeople(user.scope, { pageSize: 200 }),
    listCatalog(user.id, { pageSize: 60 }),
  ]);

  return (
    <div className="mx-auto max-w-[720px] space-y-5">
      <PageHeader
        title="Schedule a store training block"
        description="Protected learning time on the floor. The block appears on the employee's Academy calendar and they are notified immediately."
        breadcrumb={[{ label: "Calendar", href: "/calendar" }, { label: "Training block" }]}
      />
      <Card>
        <CardHeader title="Training block" subtitle="Example: Maria · Cook Fundamentals · Tuesday 2:00–2:30 PM" />
        <CardBody>
          <form action={scheduleTrainingBlock} className="grid gap-4 sm:grid-cols-2">
            <Field label="Employee" required className="sm:col-span-2">
              <Select name="learnerId" required defaultValue={sp.user ?? ""}>
                <option value="">Select an employee…</option>
                {team.rows.map((p) => (
                  <option key={p.user_id} value={p.user_id}>{p.full_name} — {p.position_title} ({p.location_name})</option>
                ))}
              </Select>
            </Field>
            <Field label="Course" className="sm:col-span-2" hint="Optional — links the block to specific training">
              <Select name="courseId" defaultValue={sp.course ?? ""}>
                <option value="">No specific course</option>
                {catalog.rows.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </Select>
            </Field>
            <Field label="Date" required><TextInput name="date" type="date" required /></Field>
            <Field label="Start time" required><TextInput name="time" type="time" required defaultValue="14:00" /></Field>
            <Field label="Length (minutes)" required><TextInput name="minutes" type="number" min={15} max={480} step={15} defaultValue={30} required /></Field>
            <Field label="Custom title" hint="Defaults to the course name"><TextInput name="title" placeholder="Training block — Cook Fundamentals" /></Field>
            <div className="sm:col-span-2">
              <SubmitButton size="lg" pendingLabel="Scheduling…">Schedule training block</SubmitButton>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
