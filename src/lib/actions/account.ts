"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query, queryOne } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth/session";
import { assertUser } from "@/lib/auth/guard";
import { notify } from "@/lib/services/notifications";
import { logAudit } from "@/lib/services/audit";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { saveImage } from "@/lib/uploads/image";

/**
 * Password reset request. In this prototype the reset is routed to the account's
 * administrators as an in-app notification (the email adapter is the integration
 * point for a production rollout) — no reset token is ever emailed from here.
 */
export async function requestPasswordReset(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim();
  const user = await queryOne<{ user_id: string; full_name: string; manager_user_id: string | null }>(
    `select user_id, full_name, manager_user_id from v_people where lower(email) = lower($1)`, [email]);
  if (user) {
    const admins = await query<{ user_id: string }>(
      `select distinct ur.user_id from user_roles ur
         join roles r on r.id = ur.role_id
        where r.code in ('system_admin','corp_training')`);
    for (const admin of admins) {
      await notify({
        userId: admin.user_id,
        type: "password_reset",
        title: "Password reset requested",
        body: `${user.full_name} (${email}) requested a password reset.`,
        link: "/admin/people",
      });
    }
    if (user.manager_user_id) {
      await notify({
        userId: user.manager_user_id, type: "password_reset", title: "Team member needs a password reset",
        body: `${user.full_name} requested a password reset.`, link: "/team",
      });
    }
    await logAudit(null, { action: "auth.password_reset_requested", entityType: "user", entityId: user.user_id, entityLabel: user.full_name });
  }
  redirect("/login/forgot?sent=1");
}

export async function updateProfile(formData: FormData): Promise<void> {
  const user = await assertUser();
  const preferredName = String(formData.get("preferred_name") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  await query(`update users set preferred_name = $1, phone = $2, updated_at = now() where id = $3`,
    [preferredName, phone, user.id]);
  await logAudit(user, { action: "user.profile_updated", entityType: "user", entityId: user.id, entityLabel: user.fullName });
  revalidatePath("/profile");
  redirect("/profile?toast=Profile+updated");
}

/**
 * Profile photo. Stored in private storage and served through `/api/media`, so a
 * photo is only ever visible to someone with an Academy session.
 */
export async function updateProfilePhoto(formData: FormData): Promise<void> {
  const user = await assertUser();
  if (formData.get("remove") === "1") {
    await query(`update users set avatar_url = null, updated_at = now() where id = $1`, [user.id]);
    await logAudit(user, { action: "user.photo_removed", entityType: "user", entityId: user.id, entityLabel: user.fullName });
    revalidatePath("/profile");
    redirect("/profile?toast=Photo+removed");
  }
  const saved = await saveImage(formData.get("photo"));
  if (!saved.ok) redirect(`/profile?toast=${encodeURIComponent(saved.error ?? "That image could not be used.")}&tone=error`);
  await query(`update users set avatar_url = $1, updated_at = now() where id = $2`, [saved.url, user.id]);
  await logAudit(user, { action: "user.photo_updated", entityType: "user", entityId: user.id, entityLabel: user.fullName });
  revalidatePath("/profile");
  revalidatePath(`/people/${user.id}`);
  redirect("/profile?toast=Photo+updated");
}

export async function updatePreferences(formData: FormData): Promise<void> {
  const user = await assertUser();
  const theme = String(formData.get("theme") ?? "system");
  const density = String(formData.get("density") ?? "comfortable");
  const emailNotifications = formData.get("email_notifications") === "on";
  const digest = String(formData.get("digest_frequency") ?? "weekly");
  await query(
    `insert into user_preferences (user_id, theme, density, email_notifications, digest_frequency)
     values ($1,$2,$3,$4,$5)
     on conflict (user_id) do update set theme = excluded.theme, density = excluded.density,
       email_notifications = excluded.email_notifications, digest_frequency = excluded.digest_frequency`,
    [user.id, theme, density, emailNotifications, digest],
  );
  revalidatePath("/", "layout");
  redirect("/profile?toast=Preferences+saved");
}

export async function changePassword(formData: FormData): Promise<void> {
  const user = await assertUser();
  const current = String(formData.get("current_password") ?? "");
  const next = String(formData.get("new_password") ?? "");
  const row = await queryOne<{ password_hash: string }>(`select password_hash from users where id = $1`, [user.id]);
  if (!verifyPassword(current, row?.password_hash)) {
    redirect("/profile?toast=Current+password+is+incorrect&tone=error");
  }
  if (next.length < 10) {
    redirect("/profile?toast=New+password+must+be+at+least+10+characters&tone=error");
  }
  await query(`update users set password_hash = $1, updated_at = now() where id = $2`, [hashPassword(next), user.id]);
  await logAudit(user, { action: "user.password_changed", entityType: "user", entityId: user.id, entityLabel: user.fullName });
  redirect("/profile?toast=Password+updated");
}

export async function markNotificationsRead(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await query(`update notifications set is_read = true where user_id = $1`, [user.id]);
  revalidatePath("/", "layout");
}
