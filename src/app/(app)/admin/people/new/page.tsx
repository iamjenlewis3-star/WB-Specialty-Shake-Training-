import { requirePermission } from "@/lib/auth/guard";
import { filterOptions, listPeople } from "@/lib/services/people";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { Field, Select, TextInput, SubmitButton } from "@/components/ui/interactive";
import { createEmployee } from "@/lib/actions/people";

export const metadata = { title: "Add employee" };
export const dynamic = "force-dynamic";

export default async function NewEmployeePage() {
  const user = await requirePermission(["users.create", "users.edit"]);
  const [options, managers] = await Promise.all([
    filterOptions(user.scope),
    listPeople(user.scope, { pageSize: 200 }),
  ]);

  return (
    <div className="mx-auto max-w-[880px] space-y-5">
      <PageHeader
        title="Add an employee"
        description="New employees receive an Academy account and any training your automation rules assign for their role, restaurant and new-hire status."
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "People", href: "/admin/people" }, { label: "Add" }]}
      />
      <Card>
        <CardHeader title="Employee details" />
        <CardBody>
          <form action={createEmployee} className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" required><TextInput name="first_name" required /></Field>
            <Field label="Last name" required><TextInput name="last_name" required /></Field>
            <Field label="Preferred name"><TextInput name="preferred_name" /></Field>
            <Field label="Employee ID" required hint="Must be unique"><TextInput name="employee_id" required placeholder="WB10500" /></Field>
            <Field label="Email" required><TextInput name="email" type="email" required /></Field>
            <Field label="Username" hint="Defaults to the email prefix"><TextInput name="username" /></Field>
            <Field label="Restaurant">
              <Select name="location_id" defaultValue={user.locationId ?? ""}>
                <option value="">No restaurant (corporate)</option>
                {options.locations.map((l) => <option key={l.id} value={l.id}>{l.name} (#{l.store_number})</option>)}
              </Select>
            </Field>
            <Field label="Department">
              <Select name="department_id" defaultValue="">
                <option value="">Not set</option>
                {options.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </Field>
            <Field label="Academy role" required hint="Controls permissions and data access">
              <Select name="role_id" required defaultValue="">
                <option value="">Select a role…</option>
                {options.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </Field>
            <Field label="Position title" required><TextInput name="position_title" required placeholder="Cook" /></Field>
            <Field label="Manager">
              <Select name="manager_user_id" defaultValue="">
                <option value="">Not set</option>
                {managers.rows.filter((m) => ["gm", "agm", "training_manager", "dept_manager"].includes(m.role_code ?? ""))
                  .map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name} — {m.location_name}</option>)}
              </Select>
            </Field>
            <Field label="Hire date"><TextInput name="hire_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
            <Field label="Employment type">
              <Select name="employment_type" defaultValue="Hourly">
                <option value="Hourly">Hourly</option><option value="Salaried">Salaried</option><option value="Corporate">Corporate</option>
              </Select>
            </Field>
            <Field label="Account status">
              <Select name="status" defaultValue="invited">
                <option value="invited">Invited</option><option value="active">Active</option>
                <option value="leave_of_absence">Leave of absence</option>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <SubmitButton size="lg" pendingLabel="Creating…">Create employee</SubmitButton>
              <p className="mt-2 text-[12px] text-[var(--muted)]">
                A temporary password is set and the employee is prompted to change it. Automation rules run immediately.
              </p>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
