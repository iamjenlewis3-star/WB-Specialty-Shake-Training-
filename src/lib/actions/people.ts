"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { query, queryOne } from "@/lib/db/client";
import { assertPermission } from "@/lib/auth/guard";
import { canAccessLocation, isUuid } from "@/lib/rbac/scope";
import { hashPassword } from "@/lib/auth/password";
import { logAudit } from "@/lib/services/audit";
import { notify } from "@/lib/services/notifications";
import { applyAutomationRules } from "@/lib/services/assignments";

/**
 * Employee lifecycle.
 *
 * Deactivation, reactivation, transfer and termination never delete training
 * records — status changes are recorded on the user row and the audit log while
 * enrollments, certifications and transcripts stay exactly as they were.
 */

const employeeSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  preferred_name: z.string().optional(),
  email: z.string().email("A valid email is required"),
  username: z.string().min(3).optional(),
  employee_id: z.string().min(1, "Employee ID is required"),
  location_id: z.string().uuid().optional().or(z.literal("")),
  department_id: z.string().uuid().optional().or(z.literal("")),
  role_id: z.string().uuid("Select a role"),
  position_title: z.string().min(1, "Position is required"),
  manager_user_id: z.string().uuid().optional().or(z.literal("")),
  hire_date: z.string().optional(),
  employment_type: z.string().optional(),
  status: z.string().optional(),
});

function formValues(formData: FormData) {
  return Object.fromEntries([...formData.entries()].map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]));
}

export async function createEmployee(formData: FormData): Promise<void> {
  const actor = await assertPermission(["users.create", "users.edit"]);
  const parsed = employeeSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    redirect(`/admin/people/new?toast=${encodeURIComponent(parsed.error.issues[0].message)}&tone=error`);
  }
  const data = parsed.data;
  if (data.location_id && !canAccessLocation(actor.scope, data.location_id)) {
    redirect(`/admin/people/new?toast=${encodeURIComponent("That restaurant is outside your access.")}&tone=error`);
  }

  const duplicate = await queryOne<{ id: string }>(
    `select id from users where lower(email) = lower($1) union
     select u.id from users u join employees e on e.user_id = u.id where e.employee_id = $2`,
    [data.email, data.employee_id]);
  if (duplicate) {
    redirect(`/admin/people/new?toast=${encodeURIComponent("An employee with that email or Employee ID already exists.")}&tone=error`);
  }

  const role = await queryOne<{ code: string; scope_level: string }>(`select code, scope_level from roles where id = $1`, [data.role_id]);
  const username = data.username || data.email.split("@")[0];
  const user = await queryOne<{ id: string }>(
    `insert into users (organization_id, email, username, password_hash, first_name, last_name, preferred_name,
        status, source_system)
     values ((select organization_id from users where id = $1), $2, $3, $4, $5, $6, $7, $8, 'Wahlburgers Academy')
     returning id`,
    [actor.id, data.email, username, hashPassword("Academy2026!"), data.first_name, data.last_name,
      data.preferred_name || null, data.status || "invited"]);
  if (!user) throw new Error("Could not create the employee record.");

  const location = data.location_id
    ? await queryOne<{ franchise_group_id: string | null }>(`select franchise_group_id from locations where id = $1`, [data.location_id])
    : null;

  await query(
    `insert into employees (user_id, employee_id, primary_location_id, franchise_group_id, department_id, role_id,
        position_title, manager_user_id, hire_date, employment_type)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [user.id, data.employee_id, data.location_id || null, location?.franchise_group_id ?? null,
      data.department_id || null, data.role_id, data.position_title, data.manager_user_id || null,
      data.hire_date || new Date().toISOString().slice(0, 10), data.employment_type || "Hourly"]);

  await query(`insert into user_roles (user_id, role_id, is_primary) values ($1, $2, true)`, [user.id, data.role_id]);
  if (role?.scope_level === "location" && data.location_id) {
    await query(`insert into user_scopes (user_id, scope_type, scope_id) values ($1, 'location', $2)`, [user.id, data.location_id]);
    await query(`insert into user_locations (user_id, location_id, access_type) values ($1, $2, 'primary') on conflict do nothing`, [user.id, data.location_id]);
  } else if (role?.scope_level === "organization") {
    await query(`insert into user_scopes (user_id, scope_type, scope_id) values ($1, 'organization', (select organization_id from users where id = $1))`, [user.id]);
  } else {
    await query(`insert into user_scopes (user_id, scope_type, scope_id, is_read_only) values ($1, 'self', null, true)`, [user.id]);
  }

  await logAudit(actor, {
    action: "employee.created", entityType: "employee", entityId: user.id,
    entityLabel: `${data.first_name} ${data.last_name}`, newValue: { employee_id: data.employee_id, email: data.email },
    locationId: data.location_id || null,
  });

  // Automated assignment rules run on creation (new hire, role, location rules).
  const assigned = await applyAutomationRules({ trigger: "on_create", userIds: [user.id], actorId: actor.id });

  await notify({
    userId: user.id, type: "welcome", title: "Welcome to Wahlburgers Academy",
    body: assigned ? `${assigned} training item${assigned === 1 ? "" : "s"} have been assigned to get you started.` : "Your Academy account is ready.",
    link: "/my-learning",
  });

  revalidatePath("/admin/people");
  redirect(`/people/${user.id}?toast=${encodeURIComponent(`${data.first_name} ${data.last_name} created${assigned ? ` · ${assigned} assignments generated` : ""}`)}`);
}

export async function updateEmployee(formData: FormData): Promise<void> {
  const actor = await assertPermission("users.edit");
  const userId = String(formData.get("user_id") ?? "");
  if (!isUuid(userId)) throw new Error("Invalid employee.");

  const before = await queryOne<Record<string, unknown>>(
    `select u.first_name, u.last_name, u.preferred_name, u.email, u.status, e.position_title, e.role_id,
            e.department_id, e.primary_location_id, e.manager_user_id, e.employment_type, e.hire_date
       from users u join employees e on e.user_id = u.id where u.id = $1`, [userId]);
  if (!before) throw new Error("Employee not found.");
  if (!canAccessLocation(actor.scope, before.primary_location_id as string | null)) {
    throw new Error("That employee is outside your access.");
  }

  const data = formValues(formData);
  await query(
    `update users set first_name = $2, last_name = $3, preferred_name = $4, email = $5, updated_at = now()
      where id = $1`,
    [userId, data.first_name, data.last_name, (data.preferred_name as string) || null, data.email]);
  await query(
    `update employees set position_title = $2, role_id = $3, department_id = $4, manager_user_id = $5,
            employment_type = $6, hire_date = $7, updated_at = now()
      where user_id = $1`,
    [userId, data.position_title, data.role_id || null, data.department_id || null,
      data.manager_user_id || null, data.employment_type || "Hourly", data.hire_date || null]);
  if (data.role_id) {
    await query(`delete from user_roles where user_id = $1`, [userId]);
    await query(`insert into user_roles (user_id, role_id, is_primary) values ($1, $2, true)`, [userId, data.role_id]);
  }

  await logAudit(actor, {
    action: "employee.edited", entityType: "employee", entityId: userId,
    entityLabel: `${data.first_name} ${data.last_name}`, previousValue: before, newValue: data,
  });
  revalidatePath(`/people/${userId}`);
  redirect(`/people/${userId}?toast=${encodeURIComponent("Employee updated")}`);
}

export async function transferEmployee(formData: FormData): Promise<void> {
  const actor = await assertPermission("users.transfer");
  const userId = String(formData.get("user_id") ?? "");
  const locationId = String(formData.get("location_id") ?? "");
  if (!isUuid(userId) || !isUuid(locationId)) throw new Error("Invalid transfer request.");
  if (!canAccessLocation(actor.scope, locationId)) throw new Error("That restaurant is outside your access.");

  const person = await queryOne<{ full_name: string; primary_location_id: string | null; location_name: string | null }>(
    `select full_name, primary_location_id, location_name from v_people where user_id = $1`, [userId]);
  if (!person) throw new Error("Employee not found.");

  const destination = await queryOne<{ name: string; franchise_group_id: string | null }>(
    `select name, franchise_group_id from locations where id = $1`, [locationId]);

  await query(
    `update employees set primary_location_id = $2, franchise_group_id = $3, updated_at = now() where user_id = $1`,
    [userId, locationId, destination?.franchise_group_id ?? null]);
  await query(`delete from user_locations where user_id = $1 and access_type = 'primary'`, [userId]);
  await query(`insert into user_locations (user_id, location_id, access_type) values ($1,$2,'primary') on conflict (user_id, location_id) do update set access_type = 'primary'`, [userId, locationId]);
  await query(`update user_scopes set scope_id = $2 where user_id = $1 and scope_type = 'location'`, [userId, locationId]);

  await logAudit(actor, {
    action: "employee.transferred", entityType: "employee", entityId: userId, entityLabel: person.full_name,
    previousValue: { location: person.location_name }, newValue: { location: destination?.name }, locationId,
  });

  // Transfer rules assign the receiving restaurant's local training.
  const assigned = await applyAutomationRules({ trigger: "on_transfer", userIds: [userId], actorId: actor.id });
  await notify({
    userId, type: "training_assigned", title: `Transferred to ${destination?.name ?? "a new restaurant"}`,
    body: assigned ? `${assigned} location-specific training item${assigned === 1 ? "" : "s"} assigned.` : "Your restaurant assignment has been updated.",
    link: "/my-learning",
  });

  revalidatePath(`/people/${userId}`);
  redirect(`/people/${userId}?toast=${encodeURIComponent(`Transferred to ${destination?.name}${assigned ? ` · ${assigned} assignments generated` : ""}`)}`);
}

export async function setEmployeeStatus(formData: FormData): Promise<void> {
  const status = String(formData.get("status") ?? "");
  const actor = await assertPermission(status === "active" ? "users.reactivate" : "users.deactivate");
  const userId = String(formData.get("user_id") ?? "");
  const reason = String(formData.get("reason") ?? "");
  if (!isUuid(userId)) throw new Error("Invalid employee.");

  const person = await queryOne<{ full_name: string; primary_location_id: string | null; status: string }>(
    `select full_name, primary_location_id, status from v_people where user_id = $1`, [userId]);
  if (!person) throw new Error("Employee not found.");
  if (!canAccessLocation(actor.scope, person.primary_location_id)) throw new Error("That employee is outside your access.");

  if (status === "active") {
    await query(
      `update users set status = 'active', reactivated_at = now(), reactivated_by = $2, deactivated_at = null,
              deactivation_reason = null, deactivation_trigger = null, flagged_inactive_at = null, updated_at = now()
        where id = $1`, [userId, actor.id]);
  } else {
    await query(
      `update users set status = $2, deactivated_at = now(), deactivation_reason = $3,
              deactivation_trigger = 'manual', updated_at = now() where id = $1`,
      [userId, status, reason || null]);
    if (status === "terminated") {
      await query(`update employees set termination_date = current_date where user_id = $1`, [userId]);
    }
    await query(`update sessions set revoked_at = now() where user_id = $1 and revoked_at is null`, [userId]);
  }

  await logAudit(actor, {
    action: status === "active" ? "employee.reactivated" : "employee.deactivated",
    entityType: "employee", entityId: userId, entityLabel: person.full_name,
    previousValue: { status: person.status }, newValue: { status, reason },
    locationId: person.primary_location_id,
  });

  revalidatePath(`/people/${userId}`);
  revalidatePath("/admin/people");
  redirect(`/people/${userId}?toast=${encodeURIComponent(
    status === "active" ? `${person.full_name} reactivated — training history preserved` : `${person.full_name} set to ${status.replace("_", " ")} — training history preserved`)}`);
}

const BULK_ACTIONS = ["assign_location", "assign_department", "assign_role", "deactivate", "reactivate", "remind"] as const;

export async function bulkPeopleAction(formData: FormData): Promise<void> {
  const actor = await assertPermission("users.edit");
  const action = String(formData.get("action") ?? "");
  const value = String(formData.get("value") ?? "");
  const ids = formData.getAll("userIds").map(String).filter(isUuid);
  if (!BULK_ACTIONS.includes(action as (typeof BULK_ACTIONS)[number]) || ids.length === 0) {
    redirect(`/admin/people?toast=${encodeURIComponent("Select employees and an action first.")}&tone=error`);
  }

  const scoped = await query<{ user_id: string; primary_location_id: string | null }>(
    `select user_id, primary_location_id from v_people where user_id = any($1::uuid[])`, [ids]);
  const allowed = scoped.filter((p) => canAccessLocation(actor.scope, p.primary_location_id)).map((p) => p.user_id);
  if (!allowed.length) redirect(`/admin/people?toast=${encodeURIComponent("None of those employees are in your access.")}&tone=error`);

  switch (action) {
    case "assign_location":
      if (!isUuid(value)) break;
      await query(`update employees set primary_location_id = $2,
                     franchise_group_id = (select franchise_group_id from locations where id = $2)
                    where user_id = any($1::uuid[])`, [allowed, value]);
      break;
    case "assign_department":
      if (!isUuid(value)) break;
      await query(`update employees set department_id = $2 where user_id = any($1::uuid[])`, [allowed, value]);
      break;
    case "assign_role":
      if (!isUuid(value)) break;
      await query(`update employees set role_id = $2 where user_id = any($1::uuid[])`, [allowed, value]);
      await query(`delete from user_roles where user_id = any($1::uuid[])`, [allowed]);
      await query(`insert into user_roles (user_id, role_id, is_primary) select unnest($1::uuid[]), $2, true`, [allowed, value]);
      break;
    case "deactivate":
      await query(`update users set status = 'deactivated', deactivated_at = now(), deactivation_trigger = 'manual',
                     deactivation_reason = 'Bulk deactivation' where id = any($1::uuid[])`, [allowed]);
      break;
    case "reactivate":
      await query(`update users set status = 'active', reactivated_at = now(), reactivated_by = $2,
                     deactivated_at = null, deactivation_reason = null where id = any($1::uuid[])`, [allowed, actor.id]);
      break;
    case "remind":
      await query(`insert into notifications (user_id, type, title, body, link)
                   select unnest($1::uuid[]), 'manager_reminder', $2, $3, '/my-learning'`,
        [allowed, `Training reminder from ${actor.displayName}`, "You have training that needs your attention."]);
      break;
  }

  await logAudit(actor, {
    action: `employee.bulk_${action}`, entityType: "employee", entityLabel: `${allowed.length} employees`,
    newValue: { action, value, count: allowed.length },
  });
  revalidatePath("/admin/people");
  redirect(`/admin/people?toast=${encodeURIComponent(`${action.replace("_", " ")} applied to ${allowed.length} employees`)}`);
}

/** Nightly-style inactivity sweep, runnable on demand from Admin → Settings. */
export async function runInactivitySweep(): Promise<void> {
  const actor = await assertPermission("settings.manage");
  const { getSetting, DEFAULT_INACTIVITY } = await import("@/lib/services/settings");
  const rules = await getSetting("inactivity_rules", DEFAULT_INACTIVITY);
  if (!rules.enabled) redirect(`/admin/settings?toast=${encodeURIComponent("Inactivity rules are switched off.")}&tone=error`);

  const flagged = await query<{ user_id: string; full_name: string; manager_user_id: string | null }>(
    `update users u set flagged_inactive_at = now()
      from employees e where e.user_id = u.id
        and u.status = 'active' and u.flagged_inactive_at is null
        and (u.last_login_at is null or u.last_login_at < now() - ($1 || ' days')::interval)
      returning u.id as user_id,
        coalesce(u.preferred_name, u.first_name) || ' ' || u.last_name as full_name, e.manager_user_id`,
    [String(rules.flagAfterDays)]);

  for (const person of flagged) {
    if (rules.notifyManager && person.manager_user_id) {
      await notify({
        userId: person.manager_user_id, type: "inactive_flagged", title: "Team member flagged as inactive",
        body: `${person.full_name} has not signed in for ${rules.flagAfterDays}+ days.`, link: "/team?inactive=1",
      });
    }
  }

  let deactivated = 0;
  if (rules.autoDeactivate) {
    const rows = await query<{ id: string }>(
      `update users set status = 'deactivated', deactivated_at = now(),
              deactivation_reason = $2, deactivation_trigger = 'inactivity_rule'
        where status = 'active'
          and (last_login_at is null or last_login_at < now() - ($1 || ' days')::interval)
        returning id`,
      [String(rules.autoDeactivateAfterDays), `Inactive for ${rules.autoDeactivateAfterDays}+ days`]);
    deactivated = rows.length;
  }

  await logAudit(actor, {
    action: "settings.inactivity_sweep", entityType: "settings",
    entityLabel: `${flagged.length} flagged, ${deactivated} deactivated`,
  });
  revalidatePath("/admin/settings");
  redirect(`/admin/settings?toast=${encodeURIComponent(`Inactivity sweep complete — ${flagged.length} flagged, ${deactivated} deactivated`)}`);
}
