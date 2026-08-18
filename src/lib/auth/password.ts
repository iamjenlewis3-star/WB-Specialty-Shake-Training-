import crypto from "node:crypto";

/**
 * Password hashing: scrypt with a per-password random salt (Node's built-in
 * crypto — no third-party hashing dependency). Format: scrypt$N$salt$hash.
 */
const KEYLEN = 64;
const COST = 16384;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, KEYLEN, { N: COST }).toString("hex");
  return `scrypt$${COST}$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "scrypt") return false;
  const cost = Number(parts[1]);
  const salt = parts[2];
  const expected = Buffer.from(parts[3], "hex");
  const derived = crypto.scryptSync(password, salt, expected.length, { N: cost });
  // Constant-time compare to avoid leaking hash prefixes through timing.
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
