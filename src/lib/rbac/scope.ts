import type { ScopeLevel } from "./permissions";

/**
 * Location-based data security.
 *
 * Every read that touches employee, enrollment or location data must be filtered
 * by the caller's `AccessScope`. The helpers below produce SQL fragments that are
 * appended to service queries — this is the server-side enforcement layer, and it
 * runs regardless of what the UI chose to render.
 */
export interface AccessScope {
  level: ScopeLevel;
  /** `"all"` for organization-wide access, otherwise the explicit location id set. */
  locationIds: "all" | string[];
  franchiseGroupIds: string[];
  regionIds: string[];
  /** Employees with `self` scope may only ever read their own records. */
  selfOnly: boolean;
  selfUserId: string;
  readOnly: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Renders a UUID list for inline use in SQL. Every value is validated against the
 * UUID grammar first, so nothing but a canonical UUID can ever reach the query
 * text (defense in depth alongside parameterized queries used everywhere else).
 */
export function uuidList(ids: string[]): string {
  const safe = ids.filter((id) => UUID_RE.test(id));
  if (!safe.length) return "null";
  return safe.map((id) => `'${id}'::uuid`).join(", ");
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** SQL predicate restricting a location id column to the caller's scope. */
export function locationScopeSql(scope: AccessScope, column: string): string {
  if (scope.selfOnly) return "false";
  if (scope.locationIds === "all") return "true";
  if (!scope.locationIds.length) return "false";
  return `${column} in (${uuidList(scope.locationIds)})`;
}

/**
 * SQL predicate restricting a *person* row to the caller's scope.
 * `userColumn` identifies the person; `locationColumn` their home restaurant.
 */
export function peopleScopeSql(scope: AccessScope, userColumn: string, locationColumn: string): string {
  if (scope.selfOnly) return `${userColumn} = '${scope.selfUserId}'::uuid`;
  if (scope.locationIds === "all") return "true";
  if (!scope.locationIds.length) return `${userColumn} = '${scope.selfUserId}'::uuid`;
  return `(${locationColumn} in (${uuidList(scope.locationIds)}) or ${userColumn} = '${scope.selfUserId}'::uuid)`;
}

export function canAccessLocation(scope: AccessScope, locationId: string | null | undefined): boolean {
  if (!locationId) return scope.locationIds === "all";
  if (scope.selfOnly) return false;
  if (scope.locationIds === "all") return true;
  return scope.locationIds.includes(locationId);
}

export function scopeLabel(scope: AccessScope): string {
  switch (scope.level) {
    case "organization":
      return "All locations";
    case "region":
      return `${scope.regionIds.length} region(s)`;
    case "franchise_group":
      return `${scope.franchiseGroupIds.length} franchise group(s)`;
    case "multi_location":
      return `${scope.locationIds === "all" ? "All" : scope.locationIds.length} locations`;
    case "location":
      return "1 location";
    default:
      return "Personal learning only";
  }
}
