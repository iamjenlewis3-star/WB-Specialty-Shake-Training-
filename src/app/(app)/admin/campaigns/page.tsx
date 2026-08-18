import { Rocket } from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import { campaignPerformance } from "@/lib/services/analytics";
import { listCatalog } from "@/lib/services/courses";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Pill, ProgressBar } from "@/components/ui/primitives";
import { Field, TextArea, TextInput, SubmitButton } from "@/components/ui/interactive";
import { createCampaign } from "@/lib/actions/assignments";
import { formatDate, completionTone } from "@/lib/utils";

export const metadata = { title: "Training campaigns" };
export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const user = await requirePermission("campaigns.manage");
  const [campaigns, catalog] = await Promise.all([
    campaignPerformance(user.scope),
    listCatalog(user.id, { pageSize: 60 }),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Training campaigns"
        description="Group assignments into a launch — menu rollouts, compliance cycles, LTOs — and track them as one program."
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Campaigns" }]}
      />

      <Card>
        <CardHeader title="Create a campaign" icon={<Rocket size={17} />} />
        <CardBody>
          <form action={createCampaign} className="grid gap-4 sm:grid-cols-2">
            <Field label="Campaign name" required><TextInput name="name" required placeholder="e.g. Winter LTO Rollout" /></Field>
            <Field label="Banner color"><TextInput name="banner_color" type="color" defaultValue="#c8102e" className="h-9 p-1" /></Field>
            <Field label="Description" className="sm:col-span-2"><TextArea name="description" rows={2} /></Field>
            <Field label="Launch date"><TextInput name="launch_at" type="date" /></Field>
            <Field label="Due date"><TextInput name="due_at" type="date" /></Field>
            <Field label="Courses" className="sm:col-span-2" hint="Ctrl/Cmd-click to select several">
              <select name="course_ids" multiple size={6} className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] p-2 text-[13px]">
                {catalog.rows.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </Field>
            <div className="sm:col-span-2"><SubmitButton pendingLabel="Creating…">Create campaign</SubmitButton></div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Campaign performance" subtitle={`${campaigns.length} campaigns`} />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          {campaigns.length === 0 ? <EmptyState title="No campaigns yet" /> : campaigns.map((c) => {
            const pct = Number(c.assigned) ? Math.round((Number(c.completed) / Number(c.assigned)) * 100) : 0;
            return (
              <div key={c.id} className="overflow-hidden rounded-xl border border-[var(--border)]">
                <div className="h-1.5" style={{ background: c.banner_color }} />
                <div className="p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[14px] font-semibold">{c.name}</p>
                    <Pill tone={c.status === "active" ? "success" : "neutral"}>{c.status}</Pill>
                  </div>
                  <ProgressBar value={pct} tone={completionTone(pct)} showLabel />
                  <p className="mt-2 text-[12px] text-[var(--muted)]">
                    {Number(c.completed).toLocaleString()} of {Number(c.assigned).toLocaleString()} assignments complete ·
                    {" "}{c.courses} courses · due {c.due_at ? formatDate(c.due_at) : "—"}
                  </p>
                </div>
              </div>
            );
          })}
        </CardBody>
      </Card>
    </div>
  );
}
