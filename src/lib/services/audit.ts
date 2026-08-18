import "server-only";
import { headers } from "next/headers";
import { query } from "@/lib/db/client";
import type { CurrentUser } from "@/lib/auth/session";

export interface AuditEntry {
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  entityLabel?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  locationId?: string | null;
}

/** Append-only audit trail. Every privileged mutation records one row. */
export async function logAudit(actor: CurrentUser | null, entry: AuditEntry): Promise<void> {
  let ip: string | null = null;
  let agent: string | null = null;
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    agent = h.get("user-agent");
  } catch {
    /* headers() is unavailable outside a request scope (e.g. scheduled jobs). */
  }
  await query(
    `insert into audit_logs (actor_user_id, actor_name, action, entity_type, entity_id, entity_label,
       previous_value, new_value, ip_address, user_agent, location_id)
     values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11)`,
    [
      actor?.id ?? null,
      actor?.fullName ?? "System",
      entry.action,
      entry.entityType ?? null,
      entry.entityId ?? null,
      entry.entityLabel ?? null,
      entry.previousValue === undefined ? null : JSON.stringify(entry.previousValue),
      entry.newValue === undefined ? null : JSON.stringify(entry.newValue),
      ip,
      agent,
      entry.locationId ?? null,
    ],
  );
}

export interface AuditRow {
  id: string;
  occurred_at: string;
  actor_name: string | null;
  action: string;
  entity_type: string | null;
  entity_label: string | null;
  previous_value: unknown;
  new_value: unknown;
  ip_address: string | null;
}

export async function listAuditLogs(filters: {
  action?: string; actor?: string; entityType?: string; q?: string; page?: number; pageSize?: number;
}): Promise<{ rows: AuditRow[]; total: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, filters.pageSize ?? 50);
  const where: string[] = ["1=1"];
  const params: unknown[] = [];
  if (filters.action) { params.push(filters.action); where.push(`action = $${params.length}`); }
  if (filters.entityType) { params.push(filters.entityType); where.push(`entity_type = $${params.length}`); }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    where.push(`(actor_name ilike $${params.length} or entity_label ilike $${params.length} or action ilike $${params.length})`);
  }
  const totalRow = await query<{ count: string }>(
    `select count(*)::text as count from audit_logs where ${where.join(" and ")}`, params);
  params.push(pageSize, (page - 1) * pageSize);
  const rows = await query<AuditRow>(
    `select id, occurred_at, actor_name, action, entity_type, entity_label, previous_value, new_value, ip_address
       from audit_logs where ${where.join(" and ")}
      order by occurred_at desc
      limit $${params.length - 1} offset $${params.length}`, params);
  return { rows, total: Number(totalRow[0]?.count ?? 0) };
}

export async function distinctAuditActions(): Promise<string[]> {
  const rows = await query<{ action: string }>(`select distinct action from audit_logs order by action`);
  return rows.map((r) => r.action);
}
