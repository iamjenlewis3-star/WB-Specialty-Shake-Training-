import { Bell, Mail, MessageSquare, Smartphone } from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import { getSetting } from "@/lib/services/settings";
import { query } from "@/lib/db/client";
import { Card, CardBody, CardHeader, KpiTile, PageHeader, Pill, Table, TableWrap, Td, Th, Tr } from "@/components/ui/primitives";
import { Field, TextInput, Checkbox, SubmitButton } from "@/components/ui/interactive";
import { saveNotificationSettings } from "@/lib/actions/settings";

export const metadata = { title: "Notification settings" };
export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage() {
  await requirePermission("settings.manage");
  const [reminders, channels, byType, totals] = await Promise.all([
    getSetting<{ days: number[] }>("certification_reminders", { days: [90, 60, 30, 14, 7] }),
    getSetting("notification_channels", { inApp: true, email: false, sms: false, push: false, dueSoonDays: 7, overdueCadenceDays: 3 }),
    query<{ type: string; count: string; unread: string }>(`
      select type, count(*)::text as count, count(*) filter (where not is_read)::text as unread
        from notifications group by type order by count(*) desc`),
    query<{ total: string; unread: string; last24: string }>(`
      select count(*)::text as total, count(*) filter (where not is_read)::text as unread,
             count(*) filter (where created_at > now() - interval '24 hours')::text as last24
        from notifications`),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifications"
        description="What the Academy sends, when it sends it, and which channels are enabled. In-app delivery is live; email, SMS and push are integration adapters ready to be wired to a provider."
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Notifications" }]}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiTile label="Notifications sent" value={Number(totals[0]?.total ?? 0).toLocaleString()} tone="info" icon={<Bell size={16} />} />
        <KpiTile label="Unread" value={Number(totals[0]?.unread ?? 0).toLocaleString()} tone="warning" />
        <KpiTile label="Last 24 hours" value={Number(totals[0]?.last24 ?? 0).toLocaleString()} tone="success" />
      </div>

      <Card>
        <CardHeader title="Delivery settings" icon={<Bell size={17} />} />
        <CardBody>
          <form action={saveNotificationSettings} className="grid gap-4 sm:grid-cols-2">
            <Field label="Certification reminder days" hint="Comma separated, counted back from the expiry date">
              <TextInput name="certification_days" defaultValue={reminders.days.join(", ")} />
            </Field>
            <Field label="Due-soon window (days)"><TextInput name="due_soon_days" type="number" min={1} max={60} defaultValue={channels.dueSoonDays} /></Field>
            <Field label="Overdue reminder cadence (days)"><TextInput name="overdue_cadence_days" type="number" min={1} max={30} defaultValue={channels.overdueCadenceDays} /></Field>
            <div className="space-y-1">
              <p className="text-[12.5px] font-medium">Channels</p>
              <Checkbox name="channel_in_app" label="In-app notifications" defaultChecked disabled description="Always on" />
              <Checkbox name="channel_email" label="Email" defaultChecked={channels.email} description="Requires an email provider adapter" />
              <Checkbox name="channel_sms" label="SMS" defaultChecked={channels.sms} description="Requires an SMS provider adapter" />
              <Checkbox name="channel_push" label="Mobile push" defaultChecked={channels.push} description="Requires a push provider adapter" />
            </div>
            <div className="sm:col-span-2"><SubmitButton pendingLabel="Saving…">Save notification settings</SubmitButton></div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Notification volume by type" />
        <TableWrap>
          <Table className="min-w-[420px]">
            <thead><tr><Th>Type</Th><Th>Sent</Th><Th>Unread</Th></tr></thead>
            <tbody>
              {byType.map((row) => (
                <Tr key={row.type}>
                  <Td className="capitalize font-medium">{row.type.replace(/_/g, " ")}</Td>
                  <Td className="tabular-nums">{Number(row.count).toLocaleString()}</Td>
                  <Td className="tabular-nums">{Number(row.unread).toLocaleString()}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      <Card>
        <CardHeader title="Channel architecture" />
        <CardBody className="grid gap-3 sm:grid-cols-3">
          {[
            { icon: <Mail size={17} />, name: "Email", note: "Adapter interface ready — plug in your ESP and the same notification payloads deliver by email." },
            { icon: <MessageSquare size={17} />, name: "SMS", note: "For urgent compliance deadlines and shift-critical training." },
            { icon: <Smartphone size={17} />, name: "Push", note: "Mobile push for learners on the floor." },
          ].map((c) => (
            <div key={c.name} className="rounded-xl border border-[var(--border)] p-3.5">
              <span className="flex size-9 items-center justify-center rounded-lg bg-[var(--surface-3)] text-[var(--muted)]">{c.icon}</span>
              <p className="mt-2 text-[13.5px] font-semibold">{c.name}</p>
              <p className="mt-0.5 text-[12px] text-[var(--muted)]">{c.note}</p>
              <Pill tone="neutral" className="mt-2">Integration adapter</Pill>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
