"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { AcademyLogo } from "@/components/brand";
import { NavIcon } from "./icon";
import type { NavSection } from "@/lib/navigation";

export function Sidebar({
  sections, scopeLabel, roleName,
}: { sections: NavSection[]; scopeLabel: string; roleName: string }) {
  const pathname = usePathname();
  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label="Primary"
      className="hidden h-dvh w-[248px] shrink-0 flex-col overflow-y-auto border-r border-[var(--border)] bg-[var(--surface)] lg:flex"
    >
      <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-4">
        <Link href="/dashboard" className="block">
          <AcademyLogo size="md" />
        </Link>
      </div>

      <div className="flex-1 px-3 py-3">
        {sections.map((section) => (
          <div key={section.label} className="mb-4">
            <p className="px-2 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-2)]">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item.href, item.exact);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors",
                        active
                          ? "bg-[var(--wb-navy)] text-white"
                          : "text-[var(--muted)] hover:bg-[var(--surface-3)] hover:text-[var(--foreground)]",
                      )}
                    >
                      <NavIcon name={item.icon} className={active ? "text-white" : "text-[var(--muted-2)]"} />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="sticky bottom-0 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-2)]">Access</p>
        <p className="mt-1 text-[12.5px] font-medium">{roleName}</p>
        <p className="text-[11.5px] text-[var(--muted)]">{scopeLabel}</p>
      </div>
    </nav>
  );
}

export function MobileNav({ items }: { items: Array<{ href: string; label: string; icon: string; exact?: boolean }> }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary mobile"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-[var(--border)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium",
              active ? "text-[var(--accent)]" : "text-[var(--muted)]",
            )}
          >
            <NavIcon name={item.icon} size={19} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
