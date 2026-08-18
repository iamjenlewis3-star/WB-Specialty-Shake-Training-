"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Star } from "lucide-react";
import { Modal, Field, TextInput, TextArea, Checkbox, SubmitButton } from "@/components/ui/interactive";
import { buttonClass } from "@/components/ui/button";
import { saveReportView } from "@/lib/actions/reports";

export function SaveViewButton({ reportKey }: { reportKey: string }) {
  const [open, setOpen] = React.useState(false);
  const params = useSearchParams();
  const config = Object.fromEntries(params.entries());

  return (
    <>
      <button onClick={() => setOpen(true)} className={buttonClass("primary", "sm")}>
        <Star size={15} /> Save view
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Save this report view"
        description="Saves the current filters so you or your team can reopen this exact report in one click.">
        <form action={saveReportView} className="space-y-4">
          <input type="hidden" name="report_key" value={reportKey} />
          <input type="hidden" name="config" value={JSON.stringify(config)} />
          <Field label="View name" required>
            <TextInput name="name" required placeholder="e.g. Weekly Franchise Training Compliance" />
          </Field>
          <Field label="Description">
            <TextArea name="description" rows={2} placeholder="What this view is for…" />
          </Field>
          <Checkbox name="is_shared" label="Share with everyone who can run reports" defaultChecked />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost", "sm")}>Cancel</button>
            <SubmitButton pendingLabel="Saving…">Save view</SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}
