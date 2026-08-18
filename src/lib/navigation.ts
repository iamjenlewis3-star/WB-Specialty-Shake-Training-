import type { CurrentUser } from "@/lib/auth/session";
import type { PermissionKey } from "@/lib/rbac/permissions";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  permission?: PermissionKey | PermissionKey[];
  exact?: boolean;
  scopeAbove?: "self";
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

function allowed(user: CurrentUser, item: NavItem): boolean {
  if (item.scopeAbove === "self" && user.scope.level === "self") return false;
  if (!item.permission) return true;
  const keys = Array.isArray(item.permission) ? item.permission : [item.permission];
  return keys.some((k) => user.permissions.includes(k));
}

/**
 * Role-aware navigation. This only decides what is *rendered*; every route also
 * re-checks permissions server-side, so hiding a link is never the control.
 */
export function navigationFor(user: CurrentUser): NavSection[] {
  const sections: NavSection[] = [
    {
      label: "My Academy",
      items: [
        { href: "/dashboard", label: "Home", icon: "home", exact: true },
        { href: "/my-learning", label: "My Learning", icon: "book-open" },
        { href: "/library", label: "Academy Library", icon: "library" },
        { href: "/resources", label: "Resources", icon: "folder-open" },
        { href: "/calendar", label: "Calendar", icon: "calendar" },
        { href: "/feed", label: "Academy Feed", icon: "megaphone" },
        { href: "/achievements", label: "Achievements", icon: "award" },
      ],
    },
    {
      label: "Lead",
      items: [
        { href: "/team", label: "My Team", icon: "users", permission: "users.view", scopeAbove: "self" },
        { href: "/team/training", label: "Training Dashboard", icon: "gauge", permission: "reports.view", scopeAbove: "self" },
        { href: "/reports", label: "Reports", icon: "file-bar-chart", permission: "reports.view", scopeAbove: "self" },
      ],
    },
    {
      label: "Corporate",
      items: [
        { href: "/command-center", label: "Academy Command Center", icon: "radar", permission: "analytics.executive" },
        { href: "/analytics", label: "Executive Analytics", icon: "trending-up", permission: "analytics.executive" },
        { href: "/admin/people", label: "People", icon: "contact", permission: "users.view", scopeAbove: "self" },
        { href: "/admin/locations", label: "Locations", icon: "store", permission: ["locations.manage", "reports.view"], scopeAbove: "self" },
        { href: "/admin/courses", label: "Content", icon: "graduation-cap", permission: ["courses.edit", "courses.create"] },
        { href: "/admin/assignments", label: "Assignments", icon: "clipboard-list", permission: "training.assign" },
        { href: "/admin/learning-paths", label: "Learning Paths", icon: "route", permission: "learning_paths.manage" },
        { href: "/admin/campaigns", label: "Campaigns", icon: "rocket", permission: "campaigns.manage" },
      ],
    },
    {
      label: "Administration",
      items: [
        { href: "/admin", label: "Admin Center", icon: "settings", exact: true, permission: ["permissions.manage", "settings.manage", "migration.run", "users.import", "audit.view"] },
        { href: "/admin/migration", label: "Data Migration", icon: "database", permission: "migration.run" },
        { href: "/admin/audit", label: "Audit Logs", icon: "scroll-text", permission: "audit.view" },
      ],
    },
  ];

  return sections
    .map((section) => ({ ...section, items: section.items.filter((item) => allowed(user, item)) }))
    .filter((section) => section.items.length > 0);
}

/** Bottom navigation for phones — the five destinations learners actually use. */
export function mobileNavFor(user: CurrentUser): NavItem[] {
  const items: NavItem[] = [
    { href: "/dashboard", label: "Home", icon: "home", exact: true },
    { href: "/my-learning", label: "Learn", icon: "book-open" },
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/feed", label: "Academy", icon: "megaphone" },
  ];
  if (user.scope.level !== "self" && user.permissions.includes("users.view")) {
    items.push({ href: "/team", label: "Team", icon: "users" });
  } else {
    items.push({ href: "/profile", label: "Profile", icon: "user" });
  }
  return items;
}
