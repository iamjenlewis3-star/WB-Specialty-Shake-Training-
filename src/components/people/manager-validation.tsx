"use client";

import * as React from "react";
import { BadgeCheck } from "lucide-react";
import { Card, CardBody, CardHeader, Pill } from "@/components/ui/primitives";
import { Field, Select, TextArea, SubmitButton } from "@/components/ui/interactive";
import { recordManagerValidation } from "@/lib/actions/training";
import { formatDate } from "@/lib/utils";

/** Practical, on-the-floor manager sign-off recorded against the training record. */
export function ManagerValidationCard({
  items, learnerName,
}: {
  learnerName: string;
  items: Array<{
    enrollment_id: string; course_title: string; module_title: string; status: string | null;
    notes: string | null; validated_at: string | null; validator: string | null; evidence_url: string | null;
  }>;
}) {
  const [open, setOpen] = React.useState<string | null>(null);
  return (
    <Card>
      <CardHeader
        title="Manager validation"
        subtitle={`Observed skill checks for ${learnerName}`}
        icon={<BadgeCheck size={17} />}
      />
      <CardBody className="space-y-3">
        {items.map((item) => (
          <div key={item.enrollment_id} className="rounded-lg border border-[var(--border)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-semibold">{item.course_title}</p>
                <p className="text-[12px] text-[var(--muted)]">{item.module_title}</p>
              </div>
              {item.status ? (
                <Pill tone={item.status === "meets_standard" ? "success" : item.status === "needs_coaching" ? "warning" : "danger"}>
                  {item.status.replace(/_/g, " ")}
                </Pill>
              ) : (
                <Pill tone="neutral">Awaiting validation</Pill>
              )}
            </div>
            {item.validated_at ? (
              <p className="mt-1.5 text-[12px] text-[var(--muted)]">
                {item.validator} · {formatDate(item.validated_at)}{item.notes ? ` · "${item.notes}"` : ""}
              </p>
            ) : null}
            {item.evidence_url ? (
              <a href={item.evidence_url} target="_blank" rel="noreferrer" className="mt-2 inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.evidence_url} alt={`Skill check evidence for ${item.course_title}`}
                  className="h-20 rounded-lg border border-[var(--border)] object-cover" />
              </a>
            ) : null}
            {open === item.enrollment_id ? (
              <form action={recordManagerValidation} className="mt-3 space-y-3 border-t border-[var(--border)] pt-3">
                <input type="hidden" name="enrollmentId" value={item.enrollment_id} />
                <Field label="Observation result" required>
                  <Select name="status" required defaultValue="meets_standard">
                    <option value="meets_standard">Meets standard</option>
                    <option value="needs_coaching">Needs coaching</option>
                    <option value="reassessment_required">Reassessment required</option>
                  </Select>
                </Field>
                <Field label="Notes" hint="What you observed on the floor">
                  <TextArea name="notes" rows={3} placeholder="e.g. Held cook temps and build standard through a full rush." />
                </Field>
                <Field label="Evidence photo" hint="Optional — photograph the finished build or station. Up to 5 MB.">
                  <input
                    type="file" name="evidence" accept="image/png,image/jpeg,image/webp,image/gif" capture="environment"
                    className="w-full text-[12.5px] file:mr-2 file:rounded-lg file:border-0 file:bg-[var(--surface-3)] file:px-3 file:py-1.5 file:text-[12.5px] file:font-medium"
                  />
                </Field>
                <div className="flex gap-2">
                  <SubmitButton size="sm" pendingLabel="Recording…">Record validation</SubmitButton>
                  <button type="button" onClick={() => setOpen(null)} className="text-[13px] font-medium text-[var(--muted)]">Cancel</button>
                </div>
              </form>
            ) : (
              <button onClick={() => setOpen(item.enrollment_id)} className="mt-2 text-[13px] font-medium text-[var(--accent)] hover:underline">
                {item.status ? "Update validation" : "Record validation"}
              </button>
            )}
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
