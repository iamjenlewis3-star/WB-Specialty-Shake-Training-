"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth/guard";
import { setSetting } from "@/lib/services/settings";
import { logAudit } from "@/lib/services/audit";

/** System settings. Every value here is read live by the features it configures. */

export async function saveInactivityRules(formData: FormData): Promise<void> {
  const actor = await assertPermission("settings.manage");
  const value = {
    enabled: formData.get("enabled") === "on",
    flagAfterDays: Number(formData.get("flag_after_days") ?? 30),
    notifyManager: formData.get("notify_manager") === "on",
    notifyAdmin: formData.get("notify_admin") === "on",
    autoDeactivate: formData.get("auto_deactivate") === "on",
    autoDeactivateAfterDays: Number(formData.get("auto_deactivate_after_days") ?? 60),
  };
  await setSetting("inactivity_rules", value, actor.id);
  await logAudit(actor, { action: "settings.updated", entityType: "settings", entityLabel: "Inactivity rules", newValue: value });
  revalidatePath("/admin/settings");
  redirect(`/admin/settings?toast=${encodeURIComponent("Inactivity rules saved")}`);
}

export async function saveThresholds(formData: FormData): Promise<void> {
  const actor = await assertPermission("settings.manage");
  const thresholds = { green: Number(formData.get("green") ?? 90), yellow: Number(formData.get("yellow") ?? 75) };
  const weights = {
    requiredCompletion: Number(formData.get("w_completion") ?? 40),
    overdue: Number(formData.get("w_overdue") ?? 25),
    certification: Number(formData.get("w_certification") ?? 20),
    activity: Number(formData.get("w_activity") ?? 10),
    newHire: Number(formData.get("w_new_hire") ?? 5),
  };
  await setSetting("risk_thresholds", thresholds, actor.id);
  await setSetting("health_score_weights", weights, actor.id);
  await logAudit(actor, { action: "settings.updated", entityType: "settings", entityLabel: "Risk thresholds & health score", newValue: { thresholds, weights } });
  revalidatePath("/admin/settings");
  redirect(`/admin/settings?toast=${encodeURIComponent("Thresholds and health score weights saved")}`);
}

export async function saveLeaderboardScoring(formData: FormData): Promise<void> {
  const actor = await assertPermission("settings.manage");
  const value = {
    requiredCompletion: Number(formData.get("required_completion") ?? 50),
    learningPaths: Number(formData.get("learning_paths") ?? 20),
    certifications: Number(formData.get("certifications") ?? 15),
    achievements: Number(formData.get("achievements") ?? 10),
    engagement: Number(formData.get("engagement") ?? 5),
    rewardTimeSpent: formData.get("reward_time_spent") === "on",
  };
  await setSetting("leaderboard_scoring", value, actor.id);
  await logAudit(actor, { action: "settings.updated", entityType: "settings", entityLabel: "Leaderboard scoring", newValue: value });
  revalidatePath("/admin/settings");
  redirect(`/admin/settings?toast=${encodeURIComponent("Leaderboard scoring saved")}`);
}

export async function saveNotificationSettings(formData: FormData): Promise<void> {
  const actor = await assertPermission("settings.manage");
  const reminders = {
    days: String(formData.get("certification_days") ?? "90,60,30,14,7")
      .split(",").map((d) => Number(d.trim())).filter((d) => Number.isFinite(d) && d > 0),
  };
  const channels = {
    inApp: true,
    email: formData.get("channel_email") === "on",
    sms: formData.get("channel_sms") === "on",
    push: formData.get("channel_push") === "on",
    dueSoonDays: Number(formData.get("due_soon_days") ?? 7),
    overdueCadenceDays: Number(formData.get("overdue_cadence_days") ?? 3),
  };
  await setSetting("certification_reminders", reminders, actor.id);
  await setSetting("notification_channels", channels, actor.id);
  await logAudit(actor, { action: "settings.updated", entityType: "settings", entityLabel: "Notification settings", newValue: { reminders, channels } });
  revalidatePath("/admin/notifications");
  redirect(`/admin/notifications?toast=${encodeURIComponent("Notification settings saved")}`);
}

export async function saveBranding(formData: FormData): Promise<void> {
  const actor = await assertPermission("settings.manage");
  const value = {
    productName: String(formData.get("product_name") ?? "Wahlburgers Academy"),
    primaryColor: String(formData.get("primary_color") ?? "#0e1f38"),
    accentColor: String(formData.get("accent_color") ?? "#c8102e"),
    supportEmail: String(formData.get("support_email") ?? "academy@wahlburgers.test"),
  };
  await setSetting("branding", value, actor.id);
  await setSetting("new_hire_window_days", { days: Number(formData.get("new_hire_days") ?? 60) }, actor.id);
  await logAudit(actor, { action: "settings.updated", entityType: "settings", entityLabel: "Branding", newValue: value });
  revalidatePath("/admin/settings");
  redirect(`/admin/settings?toast=${encodeURIComponent("Branding saved")}`);
}
