import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { getPersonDetail, filterOptions, listPeople } from "@/lib/services/people";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { Field, Select, TextInput, SubmitButton } from "@/components/ui/interactive";
import { updateEmployee } from "@/lib/actions/people";

export const metadata = { title: "Edit employee" };
export const dynamic = "force-dynamic";

export default async function EditEmployeePage({ params }: { params: Promise<{ userId: string }> }) {
  const user = await requirePermission("users.edit");
  const { userId } = await params;
  const [person, options, managers] = await Promise.all([
    getPersonDetail(user.scope, userId),
    filterOptions(user.scope),
    listPeople(user.scope, { pageSize: 200 }),
  ]);
  if (!person) notFound();

  return (
    <div className="mx-auto max-w-[880px] space-y-5">
      <PageHeader
        title={`Edit ${person.full_name}`}
        description="Employment details and Academy access. Transfers, deactivation and reactivation live on the employee profile."
        breadcrumb={[{ label: "People", href: "/admin/people" }, { label: person.full_name, href: `/people/${userId}` }, { label: "Edit" }]}
      />
      <Card>
        <CardHeader title="Employee details" />
        <CardBody>
          <form action={updateEmployee} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="user_id" value={userId} />
            <Field label="First name" required><TextInput name="first_name" required defaultValue={person.full_name.split(" ")[0]} /></Field>
            <Field label="Last name" required><TextInput name="last_name" required defaultValue={person.full_name.split(" ").slice(1).join(" ")} /></Field>
            <Field label="Preferred name"><TextInput name="preferred_name" /></Field>
            <Field label="Email" required><TextInput name="email" type="email" required defaultValue={person.email} /></Field>
            <Field label="Position title" required><TextInput name="position_title" required defaultValue={person.position_title ?? ""} /></Field>
            <Field label="Academy role">
              <Select name="role_id" defaultValue={person.role_id ?? ""}>
                {options.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </Field>
            <Field label="Department">
              <Select name="department_id" defaultValue={person.department_id ?? ""}>
                <option value="">Not set</option>
                {options.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </Field>
            <Field label="Manager">
              <Select name="manager_user_id" defaultValue={person.manager_user_id ?? ""}>
                <option value="">Not set</option>
                {managers.rows.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name} — {m.location_name}</option>)}
              </Select>
            </Field>
            <Field label="Employment type">
              <Select name="employment_type" defaultValue={person.employment_type ?? "Hourly"}>
                <option value="Hourly">Hourly</option><option value="Salaried">Salaried</option><option value="Corporate">Corporate</option>
              </Select>
            </Field>
            <Field label="Hire date"><TextInput name="hire_date" type="date" defaultValue={person.hire_date ?? ""} /></Field>
            <div className="sm:col-span-2"><SubmitButton pendingLabel="Saving…">Save employee</SubmitButton></div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
