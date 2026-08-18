import { Award } from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import { query } from "@/lib/db/client";
import { Card, CardBody, CardHeader, PageHeader, Table, TableWrap, Td, Th, Tr } from "@/components/ui/primitives";
import { Field, TextArea, TextInput, SubmitButton } from "@/components/ui/interactive";
import { createBadge } from "@/lib/actions/content";

export const metadata = { title: "Badges" };
export const dynamic = "force-dynamic";

export default async function BadgesPage() {
  await requirePermission("badges.manage");
  const badges = await query<{ id: string; name: string; description: string | null; criteria: string | null; color: string; awarded: string }>(`
    select b.id, b.name, b.description, b.criteria, b.color,
           (select count(*) from user_badges ub where ub.badge_id = b.id)::text as awarded
      from badges b order by b.name`);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Badges"
        description="Achievements the Academy awards automatically as learners complete training, earn certifications and keep their streaks."
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Badges" }]}
      />

      <Card>
        <CardHeader title="Create a badge" icon={<Award size={17} />} />
        <CardBody>
          <form action={createBadge} className="grid gap-4 sm:grid-cols-2">
            <Field label="Badge name" required><TextInput name="name" required placeholder="e.g. Shake Master" /></Field>
            <Field label="Color"><TextInput name="color" type="color" defaultValue="#e0a33c" className="h-9 p-1" /></Field>
            <Field label="Description" className="sm:col-span-2"><TextArea name="description" rows={2} /></Field>
            <Field label="Criteria" className="sm:col-span-2" hint="Shown to learners on the achievements page">
              <TextInput name="criteria" placeholder="Complete every LTO shake course with a 90%+ score" />
            </Field>
            <Field label="Expires after (months)"><TextInput name="expires_months" type="number" min={1} max={120} /></Field>
            <div className="sm:col-span-2"><SubmitButton pendingLabel="Creating…">Create badge</SubmitButton></div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Badges" subtitle={`${badges.length} configured`} />
        <TableWrap>
          <Table className="min-w-[640px]">
            <thead><tr><Th>Badge</Th><Th>Criteria</Th><Th>Times awarded</Th></tr></thead>
            <tbody>
              {badges.map((b) => (
                <Tr key={b.id}>
                  <Td>
                    <span className="flex items-center gap-2 font-medium">
                      <span className="flex size-7 items-center justify-center rounded-full text-white" style={{ background: b.color }} aria-hidden>
                        <Award size={14} />
                      </span>
                      {b.name}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] text-[var(--muted)]">{b.description}</span>
                  </Td>
                  <Td className="text-[var(--muted)]">{b.criteria ?? "—"}</Td>
                  <Td className="tabular-nums">{Number(b.awarded).toLocaleString()}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Card>
    </div>
  );
}
