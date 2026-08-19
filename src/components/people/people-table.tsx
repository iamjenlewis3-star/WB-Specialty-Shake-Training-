"use client";

import * as React from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { Avatar, Pill, ProgressBar, Table, TableWrap, Td, Th, Tr, EmptyState } from "@/components/ui/primitives";
import { buttonClass } from "@/components/ui/button";
import { SortHeader, Pagination, Select, SubmitButton } from "@/components/ui/interactive";
import { TeamQuickActions } from "@/components/team/quick-actions";
import { bulkPeopleAction } from "@/lib/actions/people";
import { formatRelative, completionTone } from "@/lib/utils";
import type { PersonRow } from "@/lib/services/people";

export interface BulkOption { value: string; label: string }

export function PeopleTable({
  rows, page, pageCount, total, canBulk, locations, roles, departments, exportHref,
}: {
  rows: PersonRow[];
  page: number;
  pageCount: number;
  total: number;
  canBulk: boolean;
  locations: BulkOption[];
  roles: BulkOption[];
  departments: BulkOption[];
  exportHref: string;
}) {
  const [selected, setSelected] = React.useState<Record<string, boolean>>({});
  const [action, setAction] = React.useState("");
  const selectedIds = Object.keys(selected).filter((id) => selected[id]);
  const allChecked = rows.length > 0 && rows.every((r) => selected[r.user_id]);

  const valueOptions =
    action === "assign_location" ? locations :
    action === "assign_role" ? roles :
    action === "assign_department" ? departments : [];

  return (
    <div>
      {canBulk && selectedIds.length > 0 ? (
        <form action={bulkPeopleAction} className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5">
          {selectedIds.map((id) => <input key={id} type="hidden" name="userIds" value={id} />)}
          <span className="text-[13px] font-medium">{selectedIds.length} selected</span>
          <Select name="action" value={action} onChange={(e) => setAction(e.target.value)} className="w-auto">
            <option value="">Choose an action…</option>
            <option value="assign_location">Transfer to location</option>
            <option value="assign_role">Assign role</option>
            <option value="assign_department">Assign department</option>
            <option value="remind">Send reminder</option>
            <option value="deactivate">Deactivate</option>
            <option value="reactivate">Reactivate</option>
          </Select>
          {valueOptions.length > 0 ? (
            <Select name="value" className="w-auto" required>
              <option value="">Select…</option>
              {valueOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          ) : null}
          <SubmitButton size="sm" pendingLabel="Applying…">Apply</SubmitButton>
          <button type="button" onClick={() => setSelected({})} className={buttonClass("ghost", "sm")}>Clear</button>
          <a href={exportHref} className={buttonClass("outline", "sm", "ml-auto")}><Download size={14} /> Export CSV</a>
        </form>
      ) : (
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
          <p className="text-[12.5px] text-[var(--muted)]">{total.toLocaleString()} employees</p>
          <a href={exportHref} className={buttonClass("outline", "sm")}><Download size={14} /> Export CSV</a>
        </div>
      )}

      <TableWrap>
        <Table className="min-w-[980px]">
          <thead>
            <tr>
              {canBulk ? (
                <Th className="w-9">
                  <input
                    type="checkbox" aria-label="Select all on this page" checked={allChecked}
                    onChange={(e) => setSelected(e.target.checked ? Object.fromEntries(rows.map((r) => [r.user_id, true])) : {})}
                    className="size-4 accent-[var(--accent)]"
                  />
                </Th>
              ) : null}
              <Th><SortHeader column="name" label="Employee" /></Th>
              <Th><SortHeader column="employee_id" label="Employee ID" /></Th>
              <Th><SortHeader column="role" label="Role" /></Th>
              <Th>Department</Th>
              <Th><SortHeader column="location" label="Location" /></Th>
              <Th>Franchise group</Th>
              <Th className="w-36"><SortHeader column="completion" label="Completion" /></Th>
              <Th><SortHeader column="overdue" label="Overdue" /></Th>
              <Th>Certs</Th>
              <Th><SortHeader column="last_login" label="Last login" /></Th>
              <Th><SortHeader column="status" label="Status" /></Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <Tr key={p.user_id}>
                {canBulk ? (
                  <Td>
                    <input
                      type="checkbox" aria-label={`Select ${p.full_name}`} checked={Boolean(selected[p.user_id])}
                      onChange={(e) => setSelected((s) => ({ ...s, [p.user_id]: e.target.checked }))}
                      className="size-4 accent-[var(--accent)]"
                    />
                  </Td>
                ) : null}
                <Td>
                  <Link href={`/people/${p.user_id}`} className="flex items-center gap-2.5 hover:text-[var(--accent)]">
                    <Avatar name={p.full_name} color={p.avatar_color} photoUrl={p.avatar_url} size={30} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{p.full_name}</span>
                      <span className="block truncate text-[11.5px] text-[var(--muted)]">{p.position_title ?? p.role_name}</span>
                    </span>
                  </Link>
                </Td>
                <Td className="font-mono text-[12px] text-[var(--muted)]">{p.employee_id ?? "—"}</Td>
                <Td className="text-[var(--muted)]">{p.role_name ?? "—"}</Td>
                <Td className="text-[var(--muted)]">{p.department_name ?? "—"}</Td>
                <Td>
                  {p.location_name ? (
                    <Link href={`/locations/${p.primary_location_id}`} className="hover:text-[var(--accent)]">
                      {p.location_name}
                    </Link>
                  ) : "—"}
                </Td>
                <Td className="text-[var(--muted)]">{p.franchise_group_name ?? "—"}</Td>
                <Td><ProgressBar value={Number(p.completion_pct)} tone={completionTone(Number(p.completion_pct))} showLabel size="sm" /></Td>
                <Td>{Number(p.overdue_count) > 0 ? <Pill tone="danger">{p.overdue_count}</Pill> : <span className="text-[var(--muted-2)]">0</span>}</Td>
                <Td className="tabular-nums">{p.certification_count}</Td>
                <Td className="whitespace-nowrap text-[var(--muted)]">{formatRelative(p.last_login_at)}</Td>
                <Td>
                  <Pill tone={p.status === "active" ? "success" : p.status === "deactivated" || p.status === "terminated" ? "danger" : "warning"}>
                    {p.status.replace(/_/g, " ")}
                  </Pill>
                </Td>
                <Td className="text-right"><TeamQuickActions userId={p.user_id} name={p.full_name} /></Td>
              </Tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <Td colSpan={canBulk ? 13 : 12}>
                  <EmptyState title="No employees match those filters" description="Try clearing a filter or searching for a different name." />
                </Td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </TableWrap>
      <Pagination page={page} pageCount={pageCount} total={total} />
    </div>
  );
}
