import { BadgeCheck } from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import { query } from "@/lib/db/client";
import { Card, CardBody, CardHeader, PageHeader, Pill, Table, TableWrap, Td, Th, Tr } from "@/components/ui/primitives";
import { Field, TextArea, TextInput, Checkbox, SubmitButton } from "@/components/ui/interactive";
import { createCertification } from "@/lib/actions/content";
import { getSetting } from "@/lib/services/settings";

export const metadata = { title: "Certifications" };
export const dynamic = "force-dynamic";

export default async function CertificationsPage() {
  await requirePermission("certifications.manage");
  const [certifications, reminders] = await Promise.all([
    query<{
      id: string; name: string; description: string | null; validity_months: number; passing_score: string;
      requires_manager_approval: boolean; renewal_requirements: string | null; holders: string; expiring: string; expired: string; courses: string;
    }>(`
      select c.id, c.name, c.description, c.validity_months, c.passing_score::text as passing_score,
             c.requires_manager_approval, c.renewal_requirements,
             (select count(*) from user_certifications uc where uc.certification_id = c.id and uc.expires_at > now())::text as holders,
             (select count(*) from user_certifications uc where uc.certification_id = c.id and uc.expires_at between now() and now() + interval '60 days')::text as expiring,
             (select count(*) from user_certifications uc where uc.certification_id = c.id and uc.expires_at < now())::text as expired,
             (select count(*) from courses co where co.certification_id = c.id)::text as courses
        from certifications c where c.status = 'active' order by c.name`),
    getSetting<{ days: number[] }>("certification_reminders", { days: [90, 60, 30, 14, 7] }),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Certifications"
        description="Certifications are issued automatically when their course requirements are met, and they expire on a schedule with reminders."
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Certifications" }]}
      />

      <Card>
        <CardHeader title="Create a certification" icon={<BadgeCheck size={17} />} />
        <CardBody>
          <form action={createCertification} className="grid gap-4 sm:grid-cols-2">
            <Field label="Certification name" required><TextInput name="name" required placeholder="e.g. Expo Certified" /></Field>
            <Field label="Validity (months)"><TextInput name="validity_months" type="number" min={1} max={120} defaultValue={12} /></Field>
            <Field label="Passing score (%)"><TextInput name="passing_score" type="number" min={0} max={100} defaultValue={80} /></Field>
            <div className="flex items-end">
              <Checkbox name="requires_manager_approval" label="Requires manager approval" description="Issued as pending until a manager signs off" />
            </div>
            <Field label="Description" className="sm:col-span-2"><TextArea name="description" rows={2} /></Field>
            <Field label="Renewal requirements" className="sm:col-span-2"><TextArea name="renewal_requirements" rows={2} placeholder="Retake the required courses and pass the assessment." /></Field>
            <div className="sm:col-span-2"><SubmitButton pendingLabel="Creating…">Create certification</SubmitButton></div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Certifications" subtitle={`Expiration reminders at ${reminders.days.join(", ")} days`} />
        <TableWrap>
          <Table className="min-w-[880px]">
            <thead><tr><Th>Certification</Th><Th>Validity</Th><Th>Passing score</Th><Th>Manager approval</Th><Th>Courses</Th><Th>Active holders</Th><Th>Expiring</Th><Th>Expired</Th></tr></thead>
            <tbody>
              {certifications.map((c) => (
                <Tr key={c.id}>
                  <Td>
                    <span className="font-medium">{c.name}</span>
                    <span className="block text-[11.5px] text-[var(--muted)]">{c.description}</span>
                  </Td>
                  <Td>{c.validity_months} months</Td>
                  <Td className="tabular-nums">{Number(c.passing_score)}%</Td>
                  <Td>{c.requires_manager_approval ? <Pill tone="warning">Required</Pill> : <span className="text-[var(--muted-2)]">—</span>}</Td>
                  <Td className="tabular-nums">{c.courses}</Td>
                  <Td className="tabular-nums">{Number(c.holders).toLocaleString()}</Td>
                  <Td className="tabular-nums text-[var(--warning)]">{c.expiring}</Td>
                  <Td className="tabular-nums text-[var(--danger)]">{c.expired}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Card>
    </div>
  );
}
