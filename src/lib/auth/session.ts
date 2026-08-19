import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { query, queryOne } from "@/lib/db/client";
import { hashToken, randomToken } from "./password";
import type { AccessScope } from "@/lib/rbac/scope";
import type { PermissionKey, ScopeLevel } from "@/lib/rbac/permissions";

export const SESSION_COOKIE = "wb_session";
const DEFAULT_TTL_HOURS = 12;
const REMEMBER_TTL_HOURS = 24 * 30;

export interface CurrentUser {
  id: string;
  organizationId: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  displayName: string;
  fullName: string;
  initials: string;
  avatarColor: string;
  avatarUrl: string | null;
  status: string;
  employeeId: string | null;
  positionTitle: string | null;
  hireDate: string | null;
  managerUserId: string | null;
  locationId: string | null;
  locationName: string | null;
  storeNumber: string | null;
  franchiseGroupId: string | null;
  franchiseGroupName: string | null;
  regionId: string | null;
  regionName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  roleId: string | null;
  roleCode: string;
  roleName: string;
  permissions: PermissionKey[];
  scope: AccessScope;
  theme: string;
  isImpersonating: boolean;
  impersonatorName: string | null;
  sessionId: string;
}

interface UserRow {
  user_id: string;
  organization_id: string;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  display_first_name: string;
  full_name: string;
  status: string;
  avatar_color: string;
  avatar_url: string | null;
  employee_id: string | null;
  position_title: string | null;
  hire_date: string | null;
  manager_user_id: string | null;
  primary_location_id: string | null;
  location_name: string | null;
  store_number: string | null;
  franchise_group_id: string | null;
  franchise_group_name: string | null;
  region_id: string | null;
  region_name: string | null;
  department_id: string | null;
  department_name: string | null;
  role_id: string | null;
  role_name: string | null;
  role_code: string | null;
  scope_level: ScopeLevel | null;
}

export async function createSession(
  userId: string,
  opts: { remember?: boolean; ip?: string; userAgent?: string; impersonatedBy?: string | null } = {},
): Promise<string> {
  const token = randomToken();
  const ttl = opts.remember ? REMEMBER_TTL_HOURS : DEFAULT_TTL_HOURS;
  await query(
    `insert into sessions (user_id, token_hash, expires_at, ip_address, user_agent, impersonated_by)
     values ($1, $2, now() + ($3 || ' hours')::interval, $4, $5, $6)`,
    [userId, hashToken(token), String(ttl), opts.ip ?? null, opts.userAgent ?? null, opts.impersonatedBy ?? null],
  );
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ttl * 3600,
  });
  return token;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await query(`update sessions set revoked_at = now() where token_hash = $1`, [hashToken(token)]);
  }
  store.delete(SESSION_COOKIE);
}

/** Resolve the effective location set for a user from their scope grants. */
export async function resolveScope(
  userId: string,
  organizationId: string,
  scopeLevel: ScopeLevel,
  primaryLocationId: string | null,
): Promise<AccessScope> {
  const grants = await query<{ scope_type: string; scope_id: string | null; is_read_only: boolean }>(
    `select scope_type, scope_id, is_read_only from user_scopes where user_id = $1`,
    [userId],
  );
  const explicit = await query<{ location_id: string }>(
    `select location_id from user_locations where user_id = $1`,
    [userId],
  );

  const readOnly = grants.some((g) => g.is_read_only);
  const orgWide = grants.some((g) => g.scope_type === "organization");
  const regionIds = grants.filter((g) => g.scope_type === "region" && g.scope_id).map((g) => g.scope_id!);
  const franchiseGroupIds = grants
    .filter((g) => g.scope_type === "franchise_group" && g.scope_id)
    .map((g) => g.scope_id!);
  const scopeLocationIds = grants
    .filter((g) => g.scope_type === "location" && g.scope_id)
    .map((g) => g.scope_id!);

  if (orgWide || scopeLevel === "organization") {
    return {
      level: "organization",
      locationIds: "all",
      franchiseGroupIds,
      regionIds,
      selfOnly: false,
      selfUserId: userId,
      readOnly,
    };
  }

  const ids = new Set<string>([...explicit.map((r) => r.location_id), ...scopeLocationIds]);

  if (regionIds.length) {
    const rows = await query<{ id: string }>(
      `select id from locations where organization_id = $1 and region_id = any($2::uuid[])`,
      [organizationId, regionIds],
    );
    rows.forEach((r) => ids.add(r.id));
  }
  if (franchiseGroupIds.length) {
    const rows = await query<{ id: string }>(
      `select id from locations where organization_id = $1 and franchise_group_id = any($2::uuid[])`,
      [organizationId, franchiseGroupIds],
    );
    rows.forEach((r) => ids.add(r.id));
  }
  if (scopeLevel === "location" && primaryLocationId) ids.add(primaryLocationId);

  if (scopeLevel === "self") {
    return {
      level: "self",
      locationIds: [],
      franchiseGroupIds: [],
      regionIds: [],
      selfOnly: true,
      selfUserId: userId,
      readOnly: true,
    };
  }

  return {
    level: scopeLevel,
    locationIds: [...ids],
    franchiseGroupIds,
    regionIds,
    selfOnly: false,
    selfUserId: userId,
    readOnly,
  };
}

async function loadUser(userId: string, sessionId: string, impersonatorName: string | null): Promise<CurrentUser | null> {
  const row = await queryOne<UserRow>(`select * from v_people where user_id = $1`, [userId]);
  if (!row) return null;

  const perms = await query<{ key: string }>(
    `select distinct p.key
       from permissions p
       join role_permissions rp on rp.permission_id = p.id
       join user_roles ur on ur.role_id = rp.role_id
      where ur.user_id = $1
      union
     select p.key from permissions p
       join user_permission_overrides o on o.permission_id = p.id
      where o.user_id = $1 and o.granted = true`,
    [userId],
  );
  const revoked = await query<{ key: string }>(
    `select p.key from permissions p
       join user_permission_overrides o on o.permission_id = p.id
      where o.user_id = $1 and o.granted = false`,
    [userId],
  );
  const revokedSet = new Set(revoked.map((r) => r.key));
  const permissions = perms.map((p) => p.key).filter((k) => !revokedSet.has(k)) as PermissionKey[];

  const scopeLevel = (row.scope_level ?? "self") as ScopeLevel;
  const scope = await resolveScope(userId, row.organization_id, scopeLevel, row.primary_location_id);

  const prefs = await queryOne<{ theme: string }>(`select theme from user_preferences where user_id = $1`, [userId]);
  const first = row.display_first_name || row.first_name;

  return {
    id: row.user_id,
    organizationId: row.organization_id,
    email: row.email,
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
    displayName: first,
    fullName: row.full_name,
    initials: `${first.charAt(0)}${row.last_name.charAt(0)}`.toUpperCase(),
    avatarColor: row.avatar_color || "#0e1f38",
    avatarUrl: row.avatar_url ?? null,
    status: row.status,
    employeeId: row.employee_id,
    positionTitle: row.position_title,
    hireDate: row.hire_date,
    managerUserId: row.manager_user_id,
    locationId: row.primary_location_id,
    locationName: row.location_name,
    storeNumber: row.store_number,
    franchiseGroupId: row.franchise_group_id,
    franchiseGroupName: row.franchise_group_name,
    regionId: row.region_id,
    regionName: row.region_name,
    departmentId: row.department_id,
    departmentName: row.department_name,
    roleId: row.role_id,
    roleCode: row.role_code ?? "hourly",
    roleName: row.role_name ?? "Hourly Employee",
    permissions,
    scope,
    theme: prefs?.theme ?? "system",
    isImpersonating: Boolean(impersonatorName),
    impersonatorName,
    sessionId,
  };
}

/** Current authenticated user, memoized for the lifetime of the request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await queryOne<{ id: string; user_id: string; impersonated_by: string | null }>(
    `select s.id, s.user_id, s.impersonated_by
       from sessions s
       join users u on u.id = s.user_id
      where s.token_hash = $1
        and s.revoked_at is null
        and s.expires_at > now()
        and u.status not in ('deactivated','terminated')`,
    [hashToken(token)],
  );
  if (!session) return null;
  let impersonatorName: string | null = null;
  if (session.impersonated_by) {
    const imp = await queryOne<{ full_name: string }>(`select full_name from v_people where user_id = $1`, [
      session.impersonated_by,
    ]);
    impersonatorName = imp?.full_name ?? "Administrator";
  }
  return loadUser(session.user_id, session.id, impersonatorName);
});
