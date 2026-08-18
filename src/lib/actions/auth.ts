"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { query, queryOne } from "@/lib/db/client";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession, getCurrentUser } from "@/lib/auth/session";
import { logAudit } from "@/lib/services/audit";

const loginSchema = z.object({
  identifier: z.string().min(1, "Enter your email or username"),
  password: z.string().min(1, "Enter your password"),
  remember: z.boolean().optional(),
});

export interface LoginState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    identifier: String(formData.get("identifier") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    remember: formData.get("remember") === "on",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
    return { fieldErrors };
  }
  const { identifier, password, remember } = parsed.data;

  const user = await queryOne<{ id: string; password_hash: string | null; status: string; full_name: string }>(
    `select u.id, u.password_hash, u.status,
            coalesce(u.preferred_name, u.first_name) || ' ' || u.last_name as full_name
       from users u
      where lower(u.email) = lower($1) or lower(u.username) = lower($1)
      limit 1`,
    [identifier],
  );

  // Uniform failure message: never disclose whether an account exists.
  if (!user || !verifyPassword(password, user.password_hash)) {
    return { error: "That email/username and password combination is not recognized." };
  }
  if (["deactivated", "terminated"].includes(user.status)) {
    return { error: "This account is not active. Contact your manager or Corporate Training for help." };
  }

  const h = await headers();
  await createSession(user.id, {
    remember,
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    userAgent: h.get("user-agent") ?? undefined,
  });
  await query(`update users set last_login_at = now(), flagged_inactive_at = null where id = $1`, [user.id]);
  redirect("/dashboard");
}

export async function signOut(): Promise<void> {
  const user = await getCurrentUser();
  if (user) await logAudit(user, { action: "auth.logout", entityType: "user", entityId: user.id, entityLabel: user.fullName });
  await destroySession();
  redirect("/login");
}

/**
 * Presentation-only persona switcher.
 *
 * It creates a *real* session for the target demo account, so every downstream
 * permission and location-scoping check runs against that user for real. It is
 * gated on `users.edit`-level access and disabled outside development/demo mode;
 * it is not, and must never become, production authentication.
 */
export async function switchDemoPersona(email: string): Promise<void> {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  const demoEnabled = process.env.WB_DEMO_SWITCHER !== "off";
  if (!demoEnabled || !current.permissions.includes("permissions.manage")) {
    redirect("/denied");
  }
  const target = await queryOne<{ id: string; full_name: string }>(
    `select user_id as id, full_name from v_people where lower(email) = lower($1)`, [email]);
  if (!target) redirect("/denied");

  await logAudit(current, {
    action: "demo.persona_switch",
    entityType: "user",
    entityId: target.id,
    entityLabel: target.full_name,
    previousValue: { actor: current.email },
    newValue: { persona: email },
  });
  await destroySession();
  await createSession(target.id, { impersonatedBy: current.id });
  redirect("/dashboard");
}

export async function setThemePreference(theme: "light" | "dark" | "system"): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await query(
    `insert into user_preferences (user_id, theme) values ($1, $2)
     on conflict (user_id) do update set theme = excluded.theme`,
    [user.id, theme],
  );
  revalidatePath("/", "layout");
}
