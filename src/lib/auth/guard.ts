import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "./session";
import type { PermissionKey } from "@/lib/rbac/permissions";

/**
 * Server-side authorization guards. Pages, server actions and route handlers all
 * funnel through these — hiding a nav link is never treated as protection.
 */

export class AuthorizationError extends Error {
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export function can(user: CurrentUser, permission: PermissionKey | PermissionKey[]): boolean {
  const keys = Array.isArray(permission) ? permission : [permission];
  return keys.some((k) => user.permissions.includes(k));
}

export function canAll(user: CurrentUser, permissions: PermissionKey[]): boolean {
  return permissions.every((k) => user.permissions.includes(k));
}

/** Redirects unauthenticated users to login and unauthorized users to /denied. */
export async function requirePermission(permission: PermissionKey | PermissionKey[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user, permission)) redirect("/denied");
  return user;
}

/** For server actions / API routes: throws instead of redirecting. */
export async function assertPermission(permission: PermissionKey | PermissionKey[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthorizationError("You must be signed in.");
  if (!can(user, permission)) throw new AuthorizationError();
  return user;
}

export async function assertUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthorizationError("You must be signed in.");
  return user;
}

export function isManagerish(user: CurrentUser): boolean {
  return can(user, ["users.view", "reports.view"]) && user.scope.level !== "self";
}
