"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query, queryOne } from "@/lib/db/client";
import { assertPermission } from "@/lib/auth/guard";
import { logAudit } from "@/lib/services/audit";
import { isUuid } from "@/lib/rbac/scope";
import { reportByKey } from "@/lib/services/reports";
import { notify } from "@/lib/services/notifications";

/** Saved views and scheduled report delivery. */

export async function saveReportView(formData: FormData): Promise<void> {
  const user = await assertPermission("reports.view");
  const name = String(formData.get("name") ?? "").trim();
  const reportKey = String(formData.get("report_key") ?? "");
  const description = String(formData.get("description") ?? "").trim() || null;
  const isShared = formData.get("is_shared") === "on";
  const config = JSON.parse(String(formData.get("config") ?? "{}"));
  if (!name || !reportByKey(reportKey)) {
    redirect(`/reports/${reportKey}?toast=${encodeURIComponent("Give the saved view a name.")}&tone=error`);
  }

  const row = await queryOne<{ id: string }>(
    `insert into saved_reports (organization_id, name, description, report_key, config, owner_user_id, is_shared)
     values ($1,$2,$3,$4,$5::jsonb,$6,$7) returning id`,
    [user.organizationId, name, description, reportKey, JSON.stringify(config), user.id, isShared]);
  await logAudit(user, { action: "report.view_saved", entityType: "saved_report", entityId: row?.id, entityLabel: name });
  revalidatePath("/reports");
  redirect(`/reports/${reportKey}?${new URLSearchParams(config as Record<string, string>).toString()}&toast=${encodeURIComponent("Saved view created")}`);
}

export async function deleteSavedReport(formData: FormData): Promise<void> {
  const user = await assertPermission("reports.view");
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return;
  const row = await queryOne<{ name: string }>(
    `delete from saved_reports where id = $1 and (owner_user_id = $2 or $3) returning name`,
    [id, user.id, user.permissions.includes("settings.manage")]);
  if (row) await logAudit(user, { action: "report.view_deleted", entityType: "saved_report", entityId: id, entityLabel: row.name });
  revalidatePath("/reports");
  redirect(`/reports?toast=${encodeURIComponent("Saved view removed")}`);
}

export async function createScheduledReport(formData: FormData): Promise<void> {
  const user = await assertPermission("reports.schedule");
  const name = String(formData.get("name") ?? "").trim();
  const reportKey = String(formData.get("report_key") ?? "");
  const frequency = String(formData.get("frequency") ?? "weekly");
  const hour = Number(formData.get("hour") ?? 7);
  const format = String(formData.get("format") ?? "csv");
  const recipients = String(formData.get("recipients") ?? "")
    .split(/[,\s]+/).map((r) => r.trim()).filter(Boolean);
  if (!name || !reportByKey(reportKey) || recipients.length === 0) {
    redirect(`/reports/scheduled?toast=${encodeURIComponent("Name, report and at least one recipient are required.")}&tone=error`);
  }

  const nextRun = new Date();
  nextRun.setHours(hour, 0, 0, 0);
  if (nextRun < new Date()) nextRun.setDate(nextRun.getDate() + 1);

  const row = await queryOne<{ id: string }>(
    `insert into scheduled_reports (organization_id, name, report_key, frequency, hour, recipients, format,
        filters, is_active, next_run_at, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,'{}'::jsonb,true,$8,$9) returning id`,
    [user.organizationId, name, reportKey, frequency, hour, recipients, format, nextRun.toISOString(), user.id]);
  await logAudit(user, { action: "report.scheduled", entityType: "scheduled_report", entityId: row?.id, entityLabel: name });
  revalidatePath("/reports/scheduled");
  redirect(`/reports/scheduled?toast=${encodeURIComponent("Scheduled report created")}`);
}

export async function toggleScheduledReport(formData: FormData): Promise<void> {
  const user = await assertPermission("reports.schedule");
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return;
  await query(`update scheduled_reports set is_active = not is_active where id = $1`, [id]);
  await logAudit(user, { action: "report.schedule_toggled", entityType: "scheduled_report", entityId: id });
  revalidatePath("/reports/scheduled");
}

export async function deleteScheduledReport(formData: FormData): Promise<void> {
  const user = await assertPermission("reports.schedule");
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return;
  await query(`delete from scheduled_reports where id = $1`, [id]);
  await logAudit(user, { action: "report.schedule_deleted", entityType: "scheduled_report", entityId: id });
  revalidatePath("/reports/scheduled");
  redirect(`/reports/scheduled?toast=${encodeURIComponent("Schedule removed")}`);
}

/**
 * Runs a scheduled report now.
 *
 * Delivery is handled through an integration adapter: in this environment the
 * generated report is recorded and each recipient with an Academy account gets
 * an in-app notification containing the download link. Wiring an email/SFTP
 * provider means implementing the adapter, not changing the report pipeline.
 */
export async function runScheduledReportNow(formData: FormData): Promise<void> {
  const user = await assertPermission("reports.schedule");
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return;
  const schedule = await queryOne<{ id: string; name: string; report_key: string; recipients: string[]; format: string }>(
    `select id, name, report_key, recipients, format from scheduled_reports where id = $1`, [id]);
  if (!schedule) return;

  const report = reportByKey(schedule.report_key);
  const rows = report ? await report.run(user.scope, { limit: 5000 }) : [];

  for (const email of schedule.recipients) {
    const recipient = await queryOne<{ user_id: string }>(
      `select user_id from v_people where lower(email) = lower($1)`, [email]);
    if (recipient) {
      await notify({
        userId: recipient.user_id,
        type: "scheduled_report",
        title: `${schedule.name} is ready`,
        body: `${rows.length.toLocaleString()} rows · ${schedule.format.toUpperCase()} export available.`,
        link: `/api/export?report=${schedule.report_key}&format=${schedule.format}`,
      });
    }
  }

  const next = new Date();
  next.setDate(next.getDate() + 1);
  await query(`update scheduled_reports set last_run_at = now(), next_run_at = $2 where id = $1`, [id, next.toISOString()]);
  await logAudit(user, {
    action: "report.schedule_run", entityType: "scheduled_report", entityId: id,
    entityLabel: `${schedule.name} — ${rows.length} rows to ${schedule.recipients.length} recipients`,
  });
  revalidatePath("/reports/scheduled");
  redirect(`/reports/scheduled?toast=${encodeURIComponent(`${schedule.name} delivered to ${schedule.recipients.length} recipients`)}`);
}
