"use client";

import * as React from "react";
import { Rocket } from "lucide-react";
import { Modal, Field, TextArea, SubmitButton } from "@/components/ui/interactive";
import { buttonClass } from "@/components/ui/button";
import { publishCourse } from "@/lib/actions/content";
import { cn } from "@/lib/utils";

/**
 * Publishing prompts the decision the spec calls for: keep existing completions
 * or require retraining. Either way, the historical record stays on transcripts.
 */
export function PublishCourseButton({
  courseId, status, version,
}: { courseId: string; status: string; version: number }) {
  const [open, setOpen] = React.useState(false);
  const [retraining, setRetraining] = React.useState<"keep" | "retrain">("keep");
  const isFirst = status !== "published";

  return (
    <>
      <button onClick={() => setOpen(true)} className={buttonClass("primary", "sm")}>
        <Rocket size={15} /> {isFirst ? "Publish course" : `Publish v${version + 1}`}
      </button>
      <Modal
        open={open} onClose={() => setOpen(false)}
        title={isFirst ? "Publish this course" : `Publish version ${version + 1}`}
        description={isFirst
          ? "Publishing makes the course available to assign and to learners in the Academy Library."
          : "A new version is created from the current modules. Choose what happens to people who already completed the previous version."}
      >
        <form action={publishCourse} className="space-y-4">
          <input type="hidden" name="course_id" value={courseId} />
          <input type="hidden" name="retraining" value={retraining} />
          {!isFirst ? (
            <div className="grid gap-2">
              {[
                { value: "keep" as const, title: "Keep existing completions", description: "Everyone who already completed v" + version + " stays complete. Their transcript records the version they finished." },
                { value: "retrain" as const, title: "Require retraining", description: "Completed learners are assigned the new version with a 30-day due date. The original completion remains on their transcript." },
              ].map((option) => (
                <button
                  key={option.value} type="button" onClick={() => setRetraining(option.value)}
                  className={cn("rounded-xl border p-3 text-left",
                    retraining === option.value ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-[var(--border)]")}
                >
                  <span className="block text-[13.5px] font-semibold">{option.title}</span>
                  <span className="mt-0.5 block text-[12px] text-[var(--muted)]">{option.description}</span>
                </button>
              ))}
            </div>
          ) : null}
          <Field label="Change notes" hint="Shown in version history and on the course page">
            <TextArea name="change_notes" rows={2} placeholder="What changed in this version…" />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost", "sm")}>Cancel</button>
            <SubmitButton pendingLabel="Publishing…">Publish</SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}
