import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/guard";
import { query, queryOne } from "@/lib/db/client";
import { isUuid } from "@/lib/rbac/scope";
import { logAudit } from "@/lib/services/audit";

/** Downloadable error report for a migration batch (CSV of failed/skipped rows). */
export async function GET(_req: Request, ctx: { params: Promise<{ migrationId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!can(user, ["migration.run", "users.import"])) return new NextResponse("Forbidden", { status: 403 });

  const { migrationId } = await ctx.params;
  if (!isUuid(migrationId)) return new NextResponse("Not found", { status: 404 });

  const migration = await queryOne<{ name: string; data_type: string }>(
    `select name, data_type from migrations where id = $1`, [migrationId]);
  if (!migration) return new NextResponse("Not found", { status: 404 });

  const rows = await query<{ row_number: number; status: string; message: string | null; resolution: string | null; raw: Record<string, string> }>(
    `select row_number, status, message, resolution, raw from migration_records
      where migration_id = $1 and status in ('failed','skipped','warning') order by row_number`, [migrationId]);

  const rawKeys = Array.from(new Set(rows.flatMap((r) => Object.keys(r.raw ?? {}))));
  const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const header = ["Row", "Status", "Message", "Resolution", ...rawKeys].map(escape).join(",");
  const body = rows.map((r) =>
    [String(r.row_number), r.status, r.message ?? "", r.resolution ?? "", ...rawKeys.map((k) => String(r.raw?.[k] ?? ""))]
      .map(escape).join(","));

  await logAudit(user, {
    action: "migration.errors_exported", entityType: "migration", entityId: migrationId,
    entityLabel: `${migration.name} — ${rows.length} rows`,
  });

  return new NextResponse([header, ...body].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="migration-errors-${migration.data_type}-${migrationId.slice(0, 8)}.csv"`,
    },
  });
}
