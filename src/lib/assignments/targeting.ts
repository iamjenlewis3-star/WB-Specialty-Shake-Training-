/**
 * Assignment targeting.
 *
 * Shared by the runtime assignment engine and the demo seeder, so the population
 * a target resolves to is computed by exactly one piece of logic. Deliberately
 * takes an executor instead of importing the db client — that keeps it free of
 * import cycles and trivially testable.
 */

export interface QueryExecutor {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export type TargetType =
  | "user" | "role" | "department" | "location" | "franchise_group" | "region" | "organization" | "new_hire";

export interface AssignmentTarget {
  target_type: TargetType;
  target_id: string | null;
}

/** Number of days since hire that still counts as a "new hire". */
export const NEW_HIRE_WINDOW_DAYS = 60;

/**
 * Resolve targets to the set of active learner user ids.
 * Deactivated and terminated employees are never auto-enrolled, but their
 * historical records are untouched.
 */
export async function resolveTargetPopulation(
  exec: QueryExecutor,
  organizationId: string,
  targets: AssignmentTarget[],
): Promise<string[]> {
  if (!targets.length) return [];
  const clauses: string[] = [];
  const params: unknown[] = [organizationId];
  for (const t of targets) {
    switch (t.target_type) {
      case "organization":
        clauses.push("true");
        break;
      case "user":
        params.push(t.target_id);
        clauses.push(`p.user_id = $${params.length}::uuid`);
        break;
      case "role":
        params.push(t.target_id);
        clauses.push(`p.role_id = $${params.length}::uuid`);
        break;
      case "department":
        params.push(t.target_id);
        clauses.push(`p.department_id = $${params.length}::uuid`);
        break;
      case "location":
        params.push(t.target_id);
        clauses.push(`p.primary_location_id = $${params.length}::uuid`);
        break;
      case "franchise_group":
        params.push(t.target_id);
        clauses.push(`p.franchise_group_id = $${params.length}::uuid`);
        break;
      case "region":
        params.push(t.target_id);
        clauses.push(`p.region_id = $${params.length}::uuid`);
        break;
      case "new_hire":
        clauses.push(`p.hire_date >= current_date - interval '${NEW_HIRE_WINDOW_DAYS} days'`);
        break;
    }
  }
  if (!clauses.length) return [];
  const sql = `
    select p.user_id
      from v_people p
     where p.organization_id = $1
       and p.status in ('active','invited','leave_of_absence')
       and (${clauses.join(" or ")})`;
  const res = await exec.query<{ user_id: string }>(sql, params);
  return res.rows.map((r) => r.user_id);
}

export function describeTargets(
  targets: Array<AssignmentTarget & { label?: string }>,
): string {
  if (!targets.length) return "No audience selected";
  return targets
    .map((t) => {
      switch (t.target_type) {
        case "organization": return "Entire organization";
        case "new_hire": return "All new hires";
        default: return t.label ?? t.target_type.replace("_", " ");
      }
    })
    .join(" • ");
}
