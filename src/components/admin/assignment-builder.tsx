"use client";

import * as React from "react";
import { Users } from "lucide-react";
import { Card, CardBody, CardHeader, Pill } from "@/components/ui/primitives";
import { Field, Select, TextInput, TextArea, Checkbox, SubmitButton } from "@/components/ui/interactive";
import { createAssignmentAction, estimateAssignmentAudience } from "@/lib/actions/assignments";
import { cn } from "@/lib/utils";

type Option = { value: string; label: string };

/**
 * Assignment builder. The audience estimate is computed server-side from the
 * same targeting logic the publish step uses, so "who will get this" is exact.
 */
export function AssignmentBuilder({
  courses, paths, locations, groups, regions, roles, departments, people, campaigns, canTargetOrganization, defaults,
}: {
  courses: Array<{ id: string; title: string; minutes: number }>;
  paths: Array<{ id: string; name: string; courses: number }>;
  locations: Option[]; groups: Option[]; regions: Option[]; roles: Option[]; departments: Option[];
  people: Option[]; campaigns: Option[];
  canTargetOrganization: boolean;
  defaults: { courseId?: string; userId?: string; locationId?: string };
}) {
  const [itemType, setItemType] = React.useState<"course" | "learning_path">("course");
  const [targets, setTargets] = React.useState<Record<string, string[]>>({
    target_locations: defaults.locationId ? [defaults.locationId] : [],
    target_groups: [], target_regions: [], target_roles: [], target_departments: [],
    target_users: defaults.userId ? [defaults.userId] : [],
  });
  const [orgWide, setOrgWide] = React.useState(false);
  const [newHires, setNewHires] = React.useState(false);
  const [estimate, setEstimate] = React.useState<number | null>(null);
  const [estimating, startEstimate] = React.useTransition();

  const toggle = (key: string, value: string) =>
    setTargets((prev) => ({
      ...prev,
      [key]: prev[key].includes(value) ? prev[key].filter((v) => v !== value) : [...prev[key], value],
    }));

  React.useEffect(() => {
    const payload: Record<string, string[]> = { ...targets };
    if (orgWide) payload.target_organization = ["on"];
    if (newHires) payload.target_new_hire = ["on"];
    const hasTargets = orgWide || newHires || Object.values(targets).some((v) => v.length);
    if (!hasTargets) { setEstimate(0); return; }
    startEstimate(async () => setEstimate(await estimateAssignmentAudience(payload)));
  }, [targets, orgWide, newHires]);

  const CheckList = ({ label, name, options }: { label: string; name: string; options: Option[] }) => (
    <div>
      <p className="mb-1.5 text-[12.5px] font-medium">{label}</p>
      <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-lg border border-[var(--border)] p-2">
        {options.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[13px] hover:bg-[var(--surface-2)]">
            <input
              type="checkbox" name={name} value={o.value}
              checked={targets[name]?.includes(o.value) ?? false}
              onChange={() => toggle(name, o.value)}
              className="size-4 accent-[var(--accent)]"
            />
            <span className="truncate">{o.label}</span>
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <form action={createAssignmentAction} className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <Card>
          <CardHeader title="1 · What are you assigning?" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="item_type" value={itemType} />
            <div className="sm:col-span-2 flex gap-2">
              {(["course", "learning_path"] as const).map((type) => (
                <button
                  key={type} type="button" onClick={() => setItemType(type)}
                  className={cn("flex-1 rounded-xl border p-3 text-left",
                    itemType === type ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-[var(--border)]")}
                >
                  <span className="block text-[13.5px] font-semibold">{type === "course" ? "A single course" : "A learning path"}</span>
                  <span className="mt-0.5 block text-[12px] text-[var(--muted)]">
                    {type === "course" ? "One course with a due date" : "Every course in the path, tracked together"}
                  </span>
                </button>
              ))}
            </div>
            {itemType === "course" ? (
              <Field label="Course" required className="sm:col-span-2">
                <Select name="course_id" required defaultValue={defaults.courseId ?? ""}>
                  <option value="">Select a course…</option>
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.title} ({c.minutes} min)</option>)}
                </Select>
              </Field>
            ) : (
              <Field label="Learning path" required className="sm:col-span-2">
                <Select name="learning_path_id" required defaultValue="">
                  <option value="">Select a learning path…</option>
                  {paths.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.courses} courses)</option>)}
                </Select>
              </Field>
            )}
            <Field label="Assignment title" className="sm:col-span-2" hint="Shown in reports and notifications">
              <TextInput name="title" placeholder="e.g. Specialty Shakes — Counter Service Restaurants" />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="2 · Who gets it?" subtitle="Combine audiences — everyone matching any selection is assigned" />
          <CardBody className="space-y-3">
            <div className="flex flex-wrap gap-4">
              {canTargetOrganization ? (
                <Checkbox name="target_organization" label="Entire organization" checked={orgWide} onChange={(e) => setOrgWide(e.target.checked)} />
              ) : null}
              <Checkbox name="target_new_hire" label="All new hires (last 60 days)" checked={newHires} onChange={(e) => setNewHires(e.target.checked)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <CheckList label="Locations" name="target_locations" options={locations} />
              <CheckList label="Franchise groups" name="target_groups" options={groups} />
              <CheckList label="Regions" name="target_regions" options={regions} />
              <CheckList label="Roles" name="target_roles" options={roles} />
              <CheckList label="Departments" name="target_departments" options={departments} />
              <CheckList label="Individual employees" name="target_users" options={people} />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="3 · Rules" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Due date"><TextInput name="due_at" type="date" /></Field>
            <Field label="Priority">
              <Select name="priority" defaultValue="normal">
                <option value="low">Low</option><option value="normal">Normal</option>
                <option value="high">High</option><option value="critical">Critical</option>
              </Select>
            </Field>
            <Field label="Grace period (days)"><TextInput name="grace_period_days" type="number" min={0} max={60} defaultValue={0} /></Field>
            <Field label="Reminder cadence (days)"><TextInput name="reminder_cadence_days" type="number" min={1} max={90} defaultValue={7} /></Field>
            <Field label="Recurrence">
              <Select name="recurrence" defaultValue="none">
                <option value="none">One time</option><option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option><option value="annual">Annual</option>
              </Select>
            </Field>
            <Field label="Campaign">
              <Select name="campaign_id" defaultValue="">
                <option value="">Not part of a campaign</option>
                {campaigns.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Checkbox name="is_required" label="Required training" defaultChecked description="Required assignments count toward completion percentages and compliance" />
            </div>
            <Field label="Notes" className="sm:col-span-2"><TextArea name="notes" rows={2} placeholder="Context for managers and reports…" /></Field>
          </CardBody>
        </Card>
      </div>

      <div className="space-y-4 lg:sticky lg:top-[72px] lg:h-fit">
        <Card>
          <CardHeader title="Audience" icon={<Users size={17} />} />
          <CardBody className="space-y-3 text-center">
            <p className="text-[36px] font-semibold leading-none tabular-nums">
              {estimating ? "…" : (estimate ?? 0).toLocaleString()}
            </p>
            <p className="text-[13px] text-[var(--muted)]">
              learners will be assigned this training the moment you publish.
            </p>
            {estimate === 0 ? <Pill tone="warning">Choose at least one audience</Pill> : <Pill tone="success">Ready to publish</Pill>}
            <div className="flex flex-col gap-2 pt-2">
              <input type="hidden" name="status" value="published" />
              <SubmitButton size="lg" className="w-full" pendingLabel="Publishing…">Publish assignment</SubmitButton>
              <button
                type="submit" name="status" value="draft"
                className="text-[13px] font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                Save as draft instead
              </button>
            </div>
          </CardBody>
        </Card>
      </div>
    </form>
  );
}
