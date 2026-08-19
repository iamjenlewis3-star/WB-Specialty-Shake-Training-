"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, LogOut, Menu, Search, User, UserCog, X, CheckCheck } from "lucide-react";
import { cn, formatRelative } from "@/lib/utils";
import { AcademyLogo } from "@/components/brand";
import { NavIcon } from "./icon";
import { ThemeToggle } from "@/components/theme-provider";
import { Avatar, Pill } from "@/components/ui/primitives";
import { Dropdown, MenuItem, Modal, inputClass } from "@/components/ui/interactive";
import { buttonClass } from "@/components/ui/button";
import type { NavSection } from "@/lib/navigation";
import type { NotificationRow } from "@/lib/services/notifications";

export interface TopbarUser {
  fullName: string;
  displayName: string;
  email: string;
  roleName: string;
  avatarColor: string;
  avatarUrl: string | null;
  locationName: string | null;
  isImpersonating: boolean;
  impersonatorName: string | null;
  canSwitchPersona: boolean;
}

const PERSONAS = [
  { email: "admin@wahlburgers.test", label: "Corporate Administrator" },
  { email: "training@wahlburgers.test", label: "Corporate Training" },
  { email: "ops@wahlburgers.test", label: "Corporate Operations" },
  { email: "exec@wahlburgers.test", label: "Executive Leadership" },
  { email: "fbp@wahlburgers.test", label: "Franchise Business Partner" },
  { email: "owner@wahlburgers.test", label: "Franchise Owner" },
  { email: "gm@wahlburgers.test", label: "General Manager" },
  { email: "cook@wahlburgers.test", label: "Cook (Learner)" },
  { email: "host@wahlburgers.test", label: "Host (Learner)" },
];

export function Topbar({
  user, sections, notifications, unread, onSignOut, onSwitchPersona, onMarkRead,
}: {
  user: TopbarUser;
  sections: NavSection[];
  notifications: NotificationRow[];
  unread: number;
  onSignOut: () => Promise<void>;
  onSwitchPersona: (email: string) => Promise<void>;
  onMarkRead: () => Promise<void>;
}) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [personaOpen, setPersonaOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) router.push(`/search?q=${encodeURIComponent(search.trim())}`);
  };

  return (
    <>
      {user.isImpersonating ? (
        <div className="flex items-center justify-center gap-2 bg-[var(--wb-gold)] px-4 py-1.5 text-[12px] font-semibold text-[#3a2a0c]">
          <UserCog size={14} />
          Demo view — signed in as {user.fullName} ({user.roleName}), switched by {user.impersonatorName}
        </div>
      ) : null}

      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)]/95 px-3 backdrop-blur sm:px-4">
        <button
          className="rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--surface-3)] lg:hidden"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
        >
          <Menu size={20} />
        </button>

        <Link href="/dashboard" className="lg:hidden">
          <AcademyLogo size="sm" showSubtitle={false} />
        </Link>

        <form onSubmit={submitSearch} className="relative ml-auto hidden w-full max-w-md md:ml-0 md:block">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-2)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search courses, people, resources, locations…"
            aria-label="Global search"
            className={cn(inputClass, "pl-8")}
          />
        </form>

        <div className="ml-auto flex items-center gap-1.5">
          <Link href="/search" className="rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--surface-3)] md:hidden" aria-label="Search">
            <Search size={19} />
          </Link>

          <ThemeToggle className="hidden sm:inline-flex" />

          <Dropdown
            trigger={
              <span className="relative flex size-9 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-3)]" aria-label={`Notifications (${unread} unread)`}>
                <Bell size={19} />
                {unread > 0 ? (
                  <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[9.5px] font-bold text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                ) : null}
              </span>
            }
          >
            <div className="flex items-center justify-between px-3 py-2">
              <p className="text-[13px] font-semibold">Notifications</p>
              <form action={onMarkRead}>
                <button type="submit" className="flex items-center gap-1 text-[11.5px] font-medium text-[var(--accent)] hover:underline">
                  <CheckCheck size={13} /> Mark all read
                </button>
              </form>
            </div>
            <div className="max-h-[340px] w-[320px] overflow-y-auto border-t border-[var(--border)]">
              {notifications.length === 0 ? (
                <p className="px-3 py-6 text-center text-[12.5px] text-[var(--muted)]">You are all caught up.</p>
              ) : (
                notifications.map((n) => (
                  <Link
                    key={n.id}
                    href={n.link ?? "/dashboard"}
                    className={cn("block border-b border-[var(--border)] px-3 py-2.5 last:border-b-0 hover:bg-[var(--surface-3)]", !n.is_read && "bg-[var(--info-bg)]/40")}
                  >
                    <p className="text-[12.5px] font-semibold">{n.title}</p>
                    {n.body ? <p className="mt-0.5 text-[12px] text-[var(--muted)]">{n.body}</p> : null}
                    <p className="mt-1 text-[11px] text-[var(--muted-2)]">{formatRelative(n.created_at)}</p>
                  </Link>
                ))
              )}
            </div>
          </Dropdown>

          <Dropdown
            trigger={
              <span className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-[var(--surface-3)]">
                <Avatar name={user.fullName} color={user.avatarColor} photoUrl={user.avatarUrl} size={30} />
                <span className="hidden text-left leading-tight sm:block">
                  <span className="block text-[13px] font-semibold">{user.displayName}</span>
                  <span className="block text-[11px] text-[var(--muted)]">{user.roleName}</span>
                </span>
              </span>
            }
          >
            <div className="border-b border-[var(--border)] px-3 py-2.5">
              <p className="text-[13px] font-semibold">{user.fullName}</p>
              <p className="text-[11.5px] text-[var(--muted)]">{user.email}</p>
              {user.locationName ? <Pill tone="neutral" className="mt-1.5">{user.locationName}</Pill> : null}
            </div>
            <MenuItem href="/profile" icon={<User size={15} />}>My profile</MenuItem>
            <MenuItem href="/my-learning" icon={<NavIcon name="book-open" size={15} />}>My learning</MenuItem>
            {user.canSwitchPersona ? (
              <MenuItem onClick={() => setPersonaOpen(true)} icon={<UserCog size={15} />}>Demo role switcher</MenuItem>
            ) : null}
            <div className="my-1 border-t border-[var(--border)]" />
            <form action={onSignOut}>
              <button type="submit" className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13.5px] text-[var(--danger)] hover:bg-[var(--surface-3)]">
                <LogOut size={15} /> Sign out
              </button>
            </form>
          </Dropdown>
        </div>
      </header>

      {/* Mobile navigation drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button className="absolute inset-0 bg-black/45" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
          <div className="animate-fade-up relative flex h-full w-[86vw] max-w-[300px] flex-col overflow-y-auto bg-[var(--surface)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <AcademyLogo size="sm" />
              <button onClick={() => setMobileOpen(false)} aria-label="Close" className="rounded-md p-1 text-[var(--muted)]">
                <X size={20} />
              </button>
            </div>
            <div className="px-3 py-3">
              {sections.map((section) => (
                <div key={section.label} className="mb-4">
                  <p className="px-2 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-2)]">{section.label}</p>
                  <ul className="space-y-0.5">
                    {section.items.map((item) => (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] font-medium text-[var(--foreground)] hover:bg-[var(--surface-3)]"
                        >
                          <NavIcon name={item.icon} className="text-[var(--muted-2)]" />
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <ThemeToggle className="mt-2 w-full justify-center" />
            </div>
          </div>
        </div>
      ) : null}

      {/* Demo role switcher (presentation aid, admin-gated) */}
      <Modal
        open={personaOpen}
        onClose={() => setPersonaOpen(false)}
        title="Demo role switcher"
        description="Signs you in as the selected demo persona. Every permission and location restriction below is enforced for real — this is a presentation aid, not production authentication."
        size="md"
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {PERSONAS.map((p) => (
            <form key={p.email} action={onSwitchPersona.bind(null, p.email)}>
              <button type="submit" className="w-full rounded-lg border border-[var(--border)] px-3 py-2.5 text-left hover:border-[var(--accent)] hover:bg-[var(--surface-2)]">
                <span className="block text-[13px] font-semibold">{p.label}</span>
                <span className="block text-[11.5px] text-[var(--muted)]">{p.email}</span>
              </button>
            </form>
          ))}
        </div>
        <p className="mt-4 text-[12px] text-[var(--muted)]">
          Signed in as <strong>{user.fullName}</strong>. Switching records an entry in the audit log.
        </p>
        <div className="mt-3 flex justify-end">
          <button onClick={() => setPersonaOpen(false)} className={buttonClass("outline", "sm")}>Close</button>
        </div>
      </Modal>
    </>
  );
}
