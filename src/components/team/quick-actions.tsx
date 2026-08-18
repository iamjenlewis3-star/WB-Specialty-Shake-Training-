"use client";

import * as React from "react";
import { MoreHorizontal, Bell, CalendarPlus, UserRound, ClipboardList } from "lucide-react";
import { Dropdown, MenuItem, useToast } from "@/components/ui/interactive";
import { sendReminder } from "@/lib/actions/training";

export function TeamQuickActions({ userId, name }: { userId: string; name: string }) {
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();

  return (
    <Dropdown
      trigger={
        <span className="inline-flex size-8 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-3)]" aria-label={`Actions for ${name}`}>
          <MoreHorizontal size={17} />
        </span>
      }
    >
      <MenuItem href={`/people/${userId}`} icon={<UserRound size={15} />}>View profile</MenuItem>
      <MenuItem href={`/people/${userId}/transcript`} icon={<ClipboardList size={15} />}>Training transcript</MenuItem>
      <MenuItem href={`/admin/assignments/new?user=${userId}`} icon={<ClipboardList size={15} />}>Assign training</MenuItem>
      <MenuItem href={`/calendar/schedule?user=${userId}`} icon={<CalendarPlus size={15} />}>Schedule training block</MenuItem>
      <MenuItem
        icon={<Bell size={15} />}
        onClick={() =>
          startTransition(async () => {
            await sendReminder(userId);
            toast(`Reminder sent to ${name}`);
          })
        }
      >
        {pending ? "Sending…" : "Send reminder"}
      </MenuItem>
    </Dropdown>
  );
}
