import { Megaphone } from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import { query } from "@/lib/db/client";
import { filterOptions } from "@/lib/services/people";
import { Card, CardBody, CardHeader, PageHeader, Pill, Table, TableWrap, Td, Th, Tr } from "@/components/ui/primitives";
import { Field, Select, TextArea, TextInput, Checkbox, SubmitButton } from "@/components/ui/interactive";
import { publishAnnouncement } from "@/lib/actions/feed";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Announcements" };
export const dynamic = "force-dynamic";

export default async function AnnouncementsPage() {
  const user = await requirePermission("announcements.publish");
  const [announcements, options] = await Promise.all([
    query<{
      id: string; title: string; message: string; audience_type: string; audience_label: string | null;
      publish_at: string; expires_at: string | null; is_pinned: boolean; requires_acknowledgment: boolean;
      status: string; acknowledgments: string; author: string | null;
    }>(`
      select a.id, a.title, a.message, a.audience_type,
             case a.audience_type
               when 'organization' then 'Everyone'
               when 'location' then (select name from locations where id = a.audience_id)
               when 'franchise_group' then (select name from franchise_groups where id = a.audience_id)
               when 'region' then (select name from regions where id = a.audience_id)
               when 'role' then (select name from roles where id = a.audience_id)
               when 'department' then (select name from departments where id = a.audience_id)
             end as audience_label,
             a.publish_at, a.expires_at, a.is_pinned, a.requires_acknowledgment, a.status,
             (select count(*) from acknowledgments ak where ak.entity_type = 'announcement' and ak.entity_id = a.id)::text as acknowledgments,
             p.full_name as author
        from announcements a left join v_people p on p.user_id = a.created_by
       order by a.publish_at desc`),
    filterOptions(user.scope),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Announcements"
        description="Targeted announcements with optional acknowledgment capture. Recipients see them in the Academy Feed and their notifications."
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Announcements" }]}
      />

      <Card>
        <CardHeader title="Publish an announcement" icon={<Megaphone size={17} />} />
        <CardBody>
          <form action={publishAnnouncement} className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" required className="sm:col-span-2"><TextInput name="title" required placeholder="e.g. Specialty Shakes launch this Friday" /></Field>
            <Field label="Message" required className="sm:col-span-2"><TextArea name="message" rows={4} required /></Field>
            <Field label="Audience" required>
              <Select name="audience_type" required defaultValue="organization">
                <option value="organization">Entire organization</option>
                <option value="location">A restaurant</option>
                <option value="franchise_group">A franchise group</option>
                <option value="region">A region</option>
                <option value="role">A role</option>
                <option value="department">A department</option>
              </Select>
            </Field>
            <Field label="Audience target" hint="Ignored for organization-wide announcements">
              <Select name="audience_id" defaultValue="">
                <option value="">Select…</option>
                <optgroup label="Locations">{options.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
                <optgroup label="Franchise groups">{options.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</optgroup>
                <optgroup label="Regions">{options.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>
                <optgroup label="Roles">{options.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>
                <optgroup label="Departments">{options.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>
              </Select>
            </Field>
            <Field label="Link"><TextInput name="link_url" placeholder="/library" /></Field>
            <Field label="Expires"><TextInput name="expires_at" type="date" /></Field>
            <div className="space-y-1 sm:col-span-2">
              <Checkbox name="is_pinned" label="Pin to the top of the feed" />
              <Checkbox name="requires_acknowledgment" label="Require acknowledgment" description="Captures who has read it, with a timestamp" />
            </div>
            <div className="sm:col-span-2"><SubmitButton pendingLabel="Publishing…">Publish announcement</SubmitButton></div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Published announcements" subtitle={`${announcements.length} total`} />
        <TableWrap>
          <Table className="min-w-[860px]">
            <thead><tr><Th>Title</Th><Th>Audience</Th><Th>Published</Th><Th>Expires</Th><Th>Acknowledgment</Th><Th>Acknowledged</Th><Th>Author</Th><Th>Status</Th></tr></thead>
            <tbody>
              {announcements.map((a) => (
                <Tr key={a.id}>
                  <Td>
                    <span className="font-medium">{a.title}</span>
                    <span className="block line-clamp-1 text-[11.5px] text-[var(--muted)]">{a.message}</span>
                  </Td>
                  <Td className="text-[var(--muted)]">{a.audience_label ?? a.audience_type}</Td>
                  <Td className="whitespace-nowrap">{formatDate(a.publish_at)}</Td>
                  <Td className="whitespace-nowrap text-[var(--muted)]">{a.expires_at ? formatDate(a.expires_at) : "—"}</Td>
                  <Td>{a.requires_acknowledgment ? <Pill tone="warning">Required</Pill> : <span className="text-[var(--muted-2)]">—</span>}</Td>
                  <Td className="tabular-nums">{Number(a.acknowledgments).toLocaleString()}</Td>
                  <Td className="text-[var(--muted)]">{a.author ?? "—"}</Td>
                  <Td><Pill tone={a.status === "published" ? "success" : "neutral"}>{a.status}</Pill>{a.is_pinned ? <Pill tone="accent" className="ml-1">Pinned</Pill> : null}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Card>
    </div>
  );
}
