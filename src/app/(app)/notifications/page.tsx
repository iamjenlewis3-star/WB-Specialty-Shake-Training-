import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { listNotifications } from "@/lib/services/notifications";
import { markNotificationsRead } from "@/lib/actions/account";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Pill } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/interactive";
import { formatRelative, cn } from "@/lib/utils";

export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser();
  const notifications = await listNotifications(user.id, 100);

  return (
    <div className="mx-auto max-w-[760px] space-y-5">
      <PageHeader
        title="Notifications"
        description="Training assignments, due dates, certifications, badges and announcements."
        actions={
          <form action={markNotificationsRead}>
            <SubmitButton variant="outline" size="sm" pendingLabel="Marking…"><CheckCheck size={15} /> Mark all read</SubmitButton>
          </form>
        }
      />
      <Card>
        <CardHeader title="Recent" subtitle={`${notifications.filter((n) => !n.is_read).length} unread`} icon={<Bell size={17} />} />
        {notifications.length === 0 ? (
          <EmptyState title="No notifications yet" description="You'll hear from the Academy when training is assigned or due." />
        ) : (
          <div>
            {notifications.map((n) => (
              <Link
                key={n.id} href={n.link ?? "/dashboard"}
                className={cn("flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3 last:border-b-0 hover:bg-[var(--surface-2)]",
                  !n.is_read && "bg-[var(--info-bg)]/30")}
              >
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold">{n.title}</p>
                  {n.body ? <p className="text-[12.5px] text-[var(--muted)]">{n.body}</p> : null}
                </div>
                <span className="flex shrink-0 items-center gap-2">
                  <Pill tone="neutral">{n.type.replace(/_/g, " ")}</Pill>
                  <span className="text-[11.5px] text-[var(--muted-2)]">{formatRelative(n.created_at)}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
