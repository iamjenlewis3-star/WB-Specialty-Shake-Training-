import { NextResponse } from "next/server";
import { z } from "zod";
import { query, queryOne } from "@/lib/db/client";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

/**
 * JSON sign-in endpoint. The web app signs in through a server action; this
 * endpoint exposes the identical credential check and session issuance for
 * automated tests and future mobile / integration clients.
 */
const schema = z.object({ identifier: z.string().min(1), password: z.string().min(1), remember: z.boolean().optional() });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "identifier and password are required" }, { status: 400 });
  }
  const user = await queryOne<{ id: string; password_hash: string | null; status: string }>(
    `select id, password_hash, status from users where lower(email) = lower($1) or lower(username) = lower($1) limit 1`,
    [parsed.data.identifier],
  );
  if (!user || !verifyPassword(parsed.data.password, user.password_hash)) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  if (["deactivated", "terminated"].includes(user.status)) {
    return NextResponse.json({ error: "Account is not active" }, { status: 403 });
  }
  await createSession(user.id, { remember: parsed.data.remember });
  await query(`update users set last_login_at = now(), flagged_inactive_at = null where id = $1`, [user.id]);
  return NextResponse.json({ ok: true });
}
