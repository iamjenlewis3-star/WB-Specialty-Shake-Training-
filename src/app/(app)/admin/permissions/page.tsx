import { Check, Layers } from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import { query } from "@/lib/db/client";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { Card, CardBody, CardHeader, PageHeader, Pill, Table, TableWrap, Td, Th, Tr } from "@/components/ui/primitives";

export const metadata = { title: "Permissions" };
export const dynamic = "force-dynamic";

export default async function PermissionsPage() {
  await requirePermission("permissions.manage");
  const [roles, grants] = await Promise.all([
    query<{ id: string; name: string; code: string }>(`select id, name, code from roles order by sort_order`),
    query<{ role_code: string; permission_key: string }>(`
      select r.code as role_code, p.key as permission_key
        from role_permissions rp join roles r on r.id = rp.role_id join permissions p on p.id = rp.permission_id`),
  ]);

  const granted = new Set(grants.map((g) => `${g.role_code}|${g.permission_key}`));
  const categories = Array.from(new Set(PERMISSIONS.map((p) => p.category)));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Permission matrix"
        description="Every capability in the Academy, and which roles hold it. These grants are checked on the server for every page, action and export — hiding a menu item is never the control."
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Permissions" }]}
      />

      {categories.map((category) => (
        <Card key={category}>
          <CardHeader title={category} subtitle={`${PERMISSIONS.filter((p) => p.category === category).length} permissions`} icon={<Layers size={17} />} />
          <TableWrap>
            <Table className="min-w-[1100px]">
              <thead>
                <tr>
                  <Th className="sticky left-0 z-10 bg-[var(--surface-2)]">Permission</Th>
                  {roles.map((r) => <Th key={r.id} className="whitespace-nowrap text-center">{r.name}</Th>)}
                </tr>
              </thead>
              <tbody>
                {PERMISSIONS.filter((p) => p.category === category).map((permission) => (
                  <Tr key={permission.key}>
                    <Td className="sticky left-0 z-10 bg-[var(--surface)]">
                      <span className="font-medium">{permission.label}</span>
                      <span className="block font-mono text-[11px] text-[var(--muted-2)]">{permission.key}</span>
                    </Td>
                    {roles.map((role) => (
                      <Td key={role.id} className="text-center">
                        {granted.has(`${role.code}|${permission.key}`) ? (
                          <Check size={15} className="mx-auto text-[var(--success)]" />
                        ) : (
                          <span className="text-[var(--muted-2)]">—</span>
                        )}
                      </Td>
                    ))}
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Card>
      ))}

      <Card>
        <CardBody className="text-[13px] text-[var(--muted)]">
          <p className="mb-1.5 font-semibold text-[var(--foreground)]">Beyond role permissions</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Individual users can be granted or denied a permission directly (user permission overrides).</li>
            <li>Data scope is separate from permissions: a General Manager with <Pill tone="neutral">reports.view</Pill> only ever sees their own restaurant's rows.</li>
            <li>Franchise Business Partners hold an explicit restaurant portfolio; Franchise Owners inherit every restaurant in their group.</li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
