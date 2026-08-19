"use client";

import * as React from "react";
import {
  ChevronDown, ChevronUp, ClipboardCheck, FileText, GripVertical, ListChecks, Package, PlayCircle, Plus,
  ShieldCheck, Trash2, UserCheck,
} from "lucide-react";
import { Card, CardBody, CardHeader, EmptyState, Pill } from "@/components/ui/primitives";
import { Field, Modal, Select, TextArea, TextInput, Checkbox, SubmitButton, useToast } from "@/components/ui/interactive";
import { buttonClass } from "@/components/ui/button";
import { deleteModule, reorderModules, saveModule } from "@/lib/actions/content";
import { cn } from "@/lib/utils";

export interface BuilderModule {
  id: string;
  title: string;
  description: string | null;
  module_type: string;
  position: number;
  is_required: boolean;
  min_seconds: number;
  passing_score: string | null;
  attempt_limit: number | null;
  asset_id: string | null;
  scorm_package_id: string | null;
  assessment_id: string | null;
  content_text: string | null;
  external_url: string | null;
  completion_rule: string;
  requires_manager_validation: boolean;
  sequence_required: boolean;
  asset_name?: string | null;
  scorm_version?: string | null;
  assessment_title?: string | null;
}

const MODULE_TYPES = [
  { value: "scorm", label: "SCORM package", icon: <Package size={15} /> },
  { value: "video", label: "Video", icon: <PlayCircle size={15} /> },
  { value: "pdf", label: "PDF", icon: <FileText size={15} /> },
  { value: "document", label: "Document", icon: <FileText size={15} /> },
  { value: "presentation", label: "Presentation", icon: <FileText size={15} /> },
  { value: "image", label: "Image", icon: <FileText size={15} /> },
  { value: "text", label: "Text", icon: <FileText size={15} /> },
  { value: "link", label: "External link", icon: <FileText size={15} /> },
  { value: "assessment", label: "Assessment", icon: <ClipboardCheck size={15} /> },
  { value: "checklist", label: "Checklist", icon: <ListChecks size={15} /> },
  { value: "policy", label: "Policy acknowledgment", icon: <ShieldCheck size={15} /> },
  { value: "manager_validation", label: "Manager validation", icon: <UserCheck size={15} /> },
  { value: "ilt", label: "Instructor-led training", icon: <UserCheck size={15} /> },
  { value: "virtual", label: "Virtual training", icon: <PlayCircle size={15} /> },
];

/** Drag-and-drop course builder. Order persists immediately on drop. */
export function CourseBuilder({
  courseId, modules, scormPackages, assets, assessments,
}: {
  courseId: string;
  modules: BuilderModule[];
  scormPackages: Array<{ id: string; title: string; version: string }>;
  assets: Array<{ id: string; name: string; type: string }>;
  assessments: Array<{ id: string; title: string }>;
}) {
  const toast = useToast();
  const [items, setItems] = React.useState(modules);
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [editing, setEditing] = React.useState<BuilderModule | "new" | null>(null);
  const [, startTransition] = React.useTransition();

  React.useEffect(() => setItems(modules), [modules]);

  const persist = (next: BuilderModule[]) => {
    setItems(next);
    startTransition(async () => {
      await reorderModules(courseId, next.map((m) => m.id));
      toast("Module order saved");
    });
  };

  const move = (index: number, delta: number) => {
    const next = [...items];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    persist(next);
  };

  const onDrop = (index: number) => {
    if (dragIndex === null || dragIndex === index) return;
    const next = [...items];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(index, 0, moved);
    setDragIndex(null);
    persist(next);
  };

  const current = editing === "new" ? null : editing;

  return (
    <Card>
      <CardHeader
        title="Course modules"
        subtitle="Drag to reorder. Each module type has its own completion rule."
        action={<button onClick={() => setEditing("new")} className={buttonClass("primary", "sm")}><Plus size={15} /> Add module</button>}
      />
      {items.length === 0 ? (
        <EmptyState
          title="No modules yet"
          description="Add a SCORM package, a video, a document, an assessment, a checklist or a manager validation step."
          action={<button onClick={() => setEditing("new")} className={buttonClass("primary", "sm")}>Add the first module</button>}
        />
      ) : (
        <ul>
          {items.map((module, index) => (
            <li
              key={module.id}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(index)}
              data-testid="course-module"
              className={cn(
                "flex items-start gap-3 border-b border-[var(--border)] px-4 py-3 last:border-b-0",
                dragIndex === index && "opacity-50",
              )}
            >
              <span className="mt-1 cursor-grab text-[var(--muted-2)]" aria-hidden><GripVertical size={16} /></span>
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-3)] text-[12px] font-semibold">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold">{module.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11.5px] text-[var(--muted)]">
                  <Pill tone="neutral">{module.module_type.replace(/_/g, " ")}</Pill>
                  {module.is_required ? <Pill tone="accent">Required</Pill> : <Pill tone="neutral">Optional</Pill>}
                  {module.scorm_version ? <span>SCORM {module.scorm_version}</span> : null}
                  {module.assessment_title ? <span>{module.assessment_title}</span> : null}
                  {module.asset_name ? <span>{module.asset_name}</span> : null}
                  {module.passing_score ? <span>Pass {Number(module.passing_score)}%</span> : null}
                  {module.min_seconds ? <span>Min {module.min_seconds}s</span> : null}
                  <span>Completion: {module.completion_rule}</span>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button onClick={() => move(index, -1)} className={buttonClass("ghost", "icon")} aria-label="Move up"><ChevronUp size={15} /></button>
                <button onClick={() => move(index, 1)} className={buttonClass("ghost", "icon")} aria-label="Move down"><ChevronDown size={15} /></button>
                <button onClick={() => setEditing(module)} className={buttonClass("outline", "sm")}>Edit</button>
                <form action={deleteModule}>
                  <input type="hidden" name="module_id" value={module.id} />
                  <input type="hidden" name="course_id" value={courseId} />
                  <SubmitButton variant="ghost" size="sm" pendingLabel="…"><Trash2 size={14} /></SubmitButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={current ? `Edit module: ${current.title}` : "Add a module"}
        description="Module type determines how a learner completes it — SCORM tracks itself, assessments require a passing score, policies require acknowledgment and manager validation requires a sign-off."
        size="lg"
      >
        <form action={saveModule} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="course_id" value={courseId} />
          {current ? <input type="hidden" name="module_id" value={current.id} /> : null}
          <Field label="Module title" required className="sm:col-span-2">
            <TextInput name="title" required defaultValue={current?.title ?? ""} placeholder="e.g. Shake build walkthrough" />
          </Field>
          <Field label="Module type" required>
            <Select name="module_type" defaultValue={current?.module_type ?? "text"} required>
              {MODULE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label="Completion rule">
            <Select name="completion_rule" defaultValue={current?.completion_rule ?? "view"}>
              <option value="view">Viewed / opened</option>
              <option value="score">Passing score required</option>
              <option value="acknowledge">Acknowledgment required</option>
              <option value="attend">Attendance recorded</option>
              <option value="validate">Manager validation</option>
            </Select>
          </Field>
          <Field label="SCORM package" hint="For SCORM modules">
            <Select name="scorm_package_id" defaultValue={current?.scorm_package_id ?? ""}>
              <option value="">None</option>
              {scormPackages.map((p) => <option key={p.id} value={p.id}>{p.title} (SCORM {p.version})</option>)}
            </Select>
          </Field>
          <Field label="Asset" hint="Video, PDF, presentation or policy document">
            <Select name="asset_id" defaultValue={current?.asset_id ?? ""}>
              <option value="">None</option>
              {assets.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
            </Select>
          </Field>
          <Field label="Assessment" hint="For assessment modules">
            <Select name="assessment_id" defaultValue={current?.assessment_id ?? ""}>
              <option value="">None</option>
              {assessments.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
            </Select>
          </Field>
          <Field label="External link"><TextInput name="external_url" type="url" defaultValue={current?.external_url ?? ""} /></Field>
          <Field label="Description" className="sm:col-span-2">
            <TextArea name="description" rows={2} defaultValue={current?.description ?? ""} />
          </Field>
          <Field label="Text content" className="sm:col-span-2" hint="Markdown-style headings and bullet lists supported">
            <TextArea name="content_text" rows={4} defaultValue={current?.content_text ?? ""} />
          </Field>
          <Field label="Minimum time (seconds)"><TextInput name="min_seconds" type="number" min={0} defaultValue={current?.min_seconds ?? 0} /></Field>
          <Field label="Passing score (%)"><TextInput name="passing_score" type="number" min={0} max={100} defaultValue={current?.passing_score ? Number(current.passing_score) : ""} /></Field>
          <Field label="Attempt limit"><TextInput name="attempt_limit" type="number" min={1} max={20} defaultValue={current?.attempt_limit ?? ""} /></Field>
          <div className="space-y-1">
            <Checkbox name="is_required" label="Required module" defaultChecked={current?.is_required ?? true} />
            <Checkbox name="sequence_required" label="Must be completed in sequence" defaultChecked={current?.sequence_required ?? false} />
            <Checkbox name="requires_manager_validation" label="Requires manager validation" defaultChecked={current?.requires_manager_validation ?? false} />
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" onClick={() => setEditing(null)} className={buttonClass("ghost", "sm")}>Cancel</button>
            <SubmitButton pendingLabel="Saving…">{current ? "Save module" : "Add module"}</SubmitButton>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
