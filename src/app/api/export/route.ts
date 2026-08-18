import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/guard";
import { reportByKey, type ReportColumn } from "@/lib/services/reports";
import { logAudit } from "@/lib/services/audit";
import { formatDuration } from "@/lib/utils";

/**
 * Data export.
 *
 * Wahlburgers owns its data: every report can leave the platform as CSV or XLSX,
 * produced from the same scoped query that renders on screen. Exports are
 * permission-checked and written to the audit log.
 */

function formatValue(value: unknown, column: ReportColumn): string {
  if (value === null || value === undefined) return "";
  if (column.type === "date") {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().slice(0, 10);
  }
  if (column.type === "duration") return formatDuration(Number(value));
  if (column.type === "percent") return `${Math.round(Number(value))}%`;
  return String(value);
}

function toCsv(columns: ReportColumn[], rows: Array<Record<string, unknown>>): string {
  const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const header = columns.map((c) => escape(c.label)).join(",");
  const body = rows.map((row) => columns.map((c) => escape(formatValue(row[c.key], c))).join(","));
  return [header, ...body].join("\r\n");
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const key = url.searchParams.get("report") ?? "";
  const format = (url.searchParams.get("format") ?? "csv").toLowerCase();
  const report = reportByKey(key);
  if (!report) return new NextResponse("Unknown report", { status: 404 });

  const allowed = key === "employees" || key === "employee_transcript"
    ? can(user, ["reports.export", "users.view", "transcripts.view"])
    : can(user, ["reports.export", "reports.view"]);
  if (!allowed) return new NextResponse("Forbidden", { status: 403 });

  const filters = {
    q: url.searchParams.get("q") ?? undefined,
    locationId: url.searchParams.get("location") ?? undefined,
    franchiseGroupId: url.searchParams.get("group") ?? undefined,
    regionId: url.searchParams.get("region") ?? undefined,
    roleId: url.searchParams.get("role") ?? undefined,
    departmentId: url.searchParams.get("department") ?? undefined,
    courseId: url.searchParams.get("course") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    source: url.searchParams.get("source") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    userId: url.searchParams.get("user") ?? undefined,
    limit: 20000,
  };

  const rows = await report.run(user.scope, filters);
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `wahlburgers-academy-${report.key}-${stamp}`;

  await logAudit(user, {
    action: "report.exported",
    entityType: "report",
    entityLabel: `${report.name} (${format.toUpperCase()}, ${rows.length} rows)`,
    newValue: { filters, rows: rows.length },
  });

  if (format === "xlsx") {
    const data = rows.map((row) =>
      Object.fromEntries(report.columns.map((c) => [c.label, formatValue(row[c.key], c)])));
    const sheet = XLSX.utils.json_to_sheet(data, { header: report.columns.map((c) => c.label) });
    sheet["!cols"] = report.columns.map((c) => ({ wch: Math.max(12, Math.min(40, c.label.length + 6)) }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, report.name.slice(0, 30));
    const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
      },
    });
  }

  return new NextResponse(toCsv(report.columns, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
    },
  });
}
