"use client";

import * as React from "react";
import { ArrowRightLeft, ShieldOff, ShieldCheck } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { Modal, Select, TextInput, Field, SubmitButton } from "@/components/ui/interactive";
import { buttonClass } from "@/components/ui/button";
import { setEmployeeStatus, transferEmployee } from "@/lib/actions/people";

export function EmployeeAdminActions({
  userId, name, status, locations, canTransfer, canDeactivate, canReactivate,
}: {
  userId: string; name: string; status: string;
  locations: Array<{ id: string; name: string; store_number: string }>;
  canTransfer: boolean; canDeactivate: boolean; canReactivate: boolean;
}) {
  const [transferOpen, setTransferOpen] = React.useState(false);
  const [statusOpen, setStatusOpen] = React.useState(false);
  const isInactive = ["deactivated", "terminated", "inactive"].includes(status);

  return (
    <Card>
      <CardHeader title="Administration" subtitle="Status changes never delete training history" />
      <CardBody className="flex flex-col gap-2">
        {canTransfer ? (
          <button onClick={() => setTransferOpen(true)} className={buttonClass("outline", "sm", "w-full justify-start")}>
            <ArrowRightLeft size={15} /> Transfer to another restaurant
          </button>
        ) : null}
        {isInactive ? (
          canReactivate ? (
            <form action={setEmployeeStatus}>
              <input type="hidden" name="user_id" value={userId} />
              <input type="hidden" name="status" value="active" />
              <SubmitButton variant="outline" size="sm" className="w-full justify-start" pendingLabel="Reactivating…">
                <ShieldCheck size={15} /> Reactivate employee
              </SubmitButton>
            </form>
          ) : null
        ) : canDeactivate ? (
          <button onClick={() => setStatusOpen(true)} className={buttonClass("outline", "sm", "w-full justify-start text-[var(--danger)]")}>
            <ShieldOff size={15} /> Change status / deactivate
          </button>
        ) : null}
      </CardBody>

      <Modal
        open={transferOpen} onClose={() => setTransferOpen(false)}
        title={`Transfer ${name}`}
        description="The employee keeps their full training history. Location-specific training rules run automatically after the transfer."
      >
        <form action={transferEmployee} className="space-y-4">
          <input type="hidden" name="user_id" value={userId} />
          <Field label="Receiving restaurant" required>
            <Select name="location_id" required>
              <option value="">Select a restaurant…</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name} (#{l.store_number})</option>)}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setTransferOpen(false)} className={buttonClass("ghost", "sm")}>Cancel</button>
            <SubmitButton pendingLabel="Transferring…">Transfer employee</SubmitButton>
          </div>
        </form>
      </Modal>

      <Modal
        open={statusOpen} onClose={() => setStatusOpen(false)}
        title={`Change status for ${name}`}
        description="Deactivated and terminated employees keep every training record, certification and transcript entry. They simply cannot sign in."
      >
        <form action={setEmployeeStatus} className="space-y-4">
          <input type="hidden" name="user_id" value={userId} />
          <Field label="New status" required>
            <Select name="status" required defaultValue="deactivated">
              <option value="deactivated">Deactivated</option>
              <option value="leave_of_absence">Leave of absence</option>
              <option value="inactive">Inactive</option>
              <option value="terminated">Terminated</option>
            </Select>
          </Field>
          <Field label="Reason" hint="Recorded in the audit log">
            <TextInput name="reason" placeholder="e.g. Seasonal separation" />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setStatusOpen(false)} className={buttonClass("ghost", "sm")}>Cancel</button>
            <SubmitButton variant="danger" pendingLabel="Saving…">Update status</SubmitButton>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
