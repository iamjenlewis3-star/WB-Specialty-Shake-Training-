import { ShieldCheck, Users } from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import { query } from "@/lib/db/client";
import { ROLE_DEFINITIONS } from "@/lib/rbac/permissions";
import { Card, CardBody, CardHeader, PageHeader, Pill, Table, TableWrap, Td, Th, Tr } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";

export const metadata = { title: "Roles" };
export const dynamic = "force-dynamic";

const SCOPE_LABELS: Record<string, string> = {
  self: "Own learning only",
  location: "One restaurant",
  multi_location: "Assigned restaurants",
  franchise_group: "Franchise group",
  region: "Region",
  organization: "Entire organization",
};

export default async function RolesPage() {
  await requirePermission("permissions.manage");
  const roles = await query<{
    id: string; name: string; code: string; description: string | null; scope_level: string;
    is_custom: boolean; is_learner_role: boolean; users: string; permissions: string;
  }>(`
    select r.id, r.name, r.code, r.description, r.scope_level, r.is_custom, r.is_learner_role,
           (select count(*) from user_roles ur where ur.role_id = r.id)::text as users,
           (select count(*) from role_permissions rp where rp.role_id = r.id)::text as permissions
      from roles r order by r.sort_order, r.name`);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Roles"
        description="Roles bundle permissions and set the data scope each person sees. Scope is enforced in the database layer on every query."
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Roles" }]}
        actions={<LinkButton href="/admin/permissions" variant="outline" size="sm">Permission matrix</LinkButton>}
      />

      <Card>
        <CardHeader title="Roles" subtitle={`${roles.length} roles`} icon={<ShieldCheck size={17} />} />
        <TableWrap>
          <Table className="min-w-[880px]">
            <thead><tr><Th>Role</Th><Th>Code</Th><Th>Data scope</Th><Th>Permissions</Th><Th>People</Th><Th>Type</Th><Th>Learner access</Th></tr></thead>
            <tbody>
              {roles.map((role) => (
                <Tr key={role.id}>
                  <Td>
                    <span className="font-medium">{role.name}</span>
                    <span className="block text-[11.5px] text-[var(--muted)]">{role.description}</span>
                  </Td>
                  <Td className="font-mono text-[12px] text-[var(--muted)]">{role.code}</Td>
                  <Td><Pill tone={role.scope_level === "organization" ? "accent" : role.scope_level === "self" ? "neutral" : "info"}>{SCOPE_LABELS[role.scope_level] ?? role.scope_level}</Pill></Td>
                  <Td className="tabular-nums">{role.permissions}</Td>
                  <Td className="tabular-nums">{Number(role.users).toLocaleString()}</Td>
                  <Td><Pill tone={role.is_custom ? "warning" : "neutral"}>{role.is_custom ? "Custom" : "System"}</Pill></Td>
                  <Td>{role.is_learner_role ? <Pill tone="success">Yes</Pill> : <span className="text-[var(--muted-2)]">—</span>}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      <Card>
        <CardHeader title="What each role can see" subtitle="Location-based security applied to every query" icon={<Users size={17} />} />
        <CardBody className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ROLE_DEFINITIONS.map((def) => (
            <div key={def.code} className="rounded-xl border border-[var(--border)] p-3.5">
              <p className="text-[13.5px] font-semibold">{def.name}</p>
              <p className="mt-0.5 text-[12px] text-[var(--muted)]">{def.description}</p>
              <p className="mt-2 text-[11.5px] text-[var(--muted-2)]">
                Scope: {SCOPE_LABELS[def.scopeLevel]}{def.readOnly ? " · read-only" : ""}
              </p>
              <p className="mt-1 text-[11.5px] text-[var(--muted-2)]">
                {def.permissions === "*" ? "All permissions" : `${def.permissions.length} permissions`}
              </p>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
