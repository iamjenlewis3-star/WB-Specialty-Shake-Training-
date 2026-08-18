import Link from "next/link";
import {
  Award, BadgeCheck, Bell, Building2, CalendarDays, ClipboardList, Database, FileBarChart, FolderOpen,
  GraduationCap, Layers, Megaphone, Package, Radar, Repeat, Route, ScrollText, Settings, ShieldCheck, Store,
  Upload, Users,
} from "lucide-react";
import { requirePermission, can } from "@/lib/auth/guard";
import { queryOne } from "@/lib/db/client";
import { migrationStats } from "@/lib/services/migration";
import { Card, CardBody, CardHeader, KpiTile, PageHeader } from "@/components/ui/primitives";
import { formatRelative } from "@/lib/utils";
import type { PermissionKey } from "@/lib/rbac/permissions";

export const metadata = { title: "Admin Center" };
export const dynamic = "force-dynamic";

interface AdminLink {
  href: string; label: string; description: string; icon: React.ReactNode; permission?: PermissionKey | PermissionKey[];
}

const SECTIONS: Array<{ title: string; links: AdminLink[] }> = [
  {
    title: "People & organization",
    links: [
      { href: "/admin/people", label: "People", description: "Employee directory, profiles and bulk actions", icon: <Users size={18} />, permission: "users.view" },
      { href: "/admin/people/import", label: "Import Employees", description: "CSV/XLSX employee import with mapping and validation", icon: <Upload size={18} />, permission: "users.import" },
      { href: "/admin/locations", label: "Locations", description: "Restaurants, ownership, GMs and training health", icon: <Store size={18} />, permission: ["locations.manage", "reports.view"] },
      { href: "/admin/franchise-groups", label: "Franchise Groups & Regions", description: "Ownership structure and regional rollups", icon: <Building2 size={18} />, permission: ["franchise.manage", "reports.view"] },
      { href: "/admin/roles", label: "Roles", description: "Role definitions and scope levels", icon: <ShieldCheck size={18} />, permission: "permissions.manage" },
      { href: "/admin/permissions", label: "Permissions", description: "What each role can do, enforced server-side", icon: <Layers size={18} />, permission: "permissions.manage" },
    ],
  },
  {
    title: "Content",
    links: [
      { href: "/admin/courses", label: "Courses", description: "Course builder, versions and publishing", icon: <GraduationCap size={18} />, permission: ["courses.edit", "courses.create"] },
      { href: "/admin/scorm", label: "SCORM Packages", description: "Upload, validate and inspect SCORM 1.2 / 2004 packages", icon: <Package size={18} />, permission: "scorm.upload" },
      { href: "/admin/assets", label: "Asset Library", description: "Videos, PDFs, policies, job aids and versions", icon: <FolderOpen size={18} />, permission: "assets.manage" },
      { href: "/admin/learning-paths", label: "Learning Paths", description: "Certification curricula and sequences", icon: <Route size={18} />, permission: "learning_paths.manage" },
      { href: "/admin/assessments", label: "Assessments", description: "Question banks, scoring and attempt rules", icon: <ClipboardList size={18} />, permission: "assessments.manage" },
      { href: "/admin/certifications", label: "Certifications", description: "Requirements, validity and renewals", icon: <BadgeCheck size={18} />, permission: "certifications.manage" },
      { href: "/admin/badges", label: "Badges", description: "Achievement criteria and artwork", icon: <Award size={18} />, permission: "badges.manage" },
    ],
  },
  {
    title: "Training operations",
    links: [
      { href: "/admin/assignments", label: "Assignments", description: "Who is assigned what, and how it is landing", icon: <ClipboardList size={18} />, permission: "training.assign" },
      { href: "/admin/rules", label: "Automated Assignments", description: "Rules that assign training automatically", icon: <Repeat size={18} />, permission: "rules.manage" },
      { href: "/admin/campaigns", label: "Training Campaigns", description: "Launches, refreshes and rollouts", icon: <Radar size={18} />, permission: "campaigns.manage" },
      { href: "/calendar", label: "Calendar & Live Training", description: "Sessions, orientations and store training blocks", icon: <CalendarDays size={18} />, permission: "training.schedule" },
      { href: "/admin/announcements", label: "Announcements", description: "Targeted announcements with acknowledgments", icon: <Megaphone size={18} />, permission: "announcements.publish" },
      { href: "/admin/feed", label: "Academy Feed", description: "Moderate posts and comments", icon: <Megaphone size={18} />, permission: "feed.manage" },
    ],
  },
  {
    title: "Data & system",
    links: [
      { href: "/admin/migration", label: "Data Migration", description: "Import history from the legacy LMS", icon: <Database size={18} />, permission: "migration.run" },
      { href: "/reports", label: "Reports", description: "Standard reports, custom builder and exports", icon: <FileBarChart size={18} />, permission: "reports.view" },
      { href: "/admin/audit", label: "Audit Logs", description: "Every privileged action, with before and after", icon: <ScrollText size={18} />, permission: "audit.view" },
      { href: "/admin/notifications", label: "Notifications", description: "Delivery rules and reminder cadence", icon: <Bell size={18} />, permission: "settings.manage" },
      { href: "/admin/settings", label: "Settings", description: "Inactivity rules, thresholds, health score, branding", icon: <Settings size={18} />, permission: "settings.manage" },
    ],
  },
];

export default async function AdminPage() {
  const user = await requirePermission([
    "permissions.manage", "settings.manage", "migration.run", "users.import", "audit.view",
    "courses.edit", "training.assign", "assets.manage",
  ]);

  const [counts, migration] = await Promise.all([
    queryOne<{ users: string; courses: string; assignments: string; scorm: string; locations: string; assets: string }>(`
      select (select count(*)::text from users) as users,
             (select count(*)::text from courses) as courses,
             (select count(*)::text from assignments where status = 'published') as assignments,
             (select count(*)::text from scorm_packages where status = 'active') as scorm,
             (select count(*)::text from locations where status = 'active') as locations,
             (select count(*)::text from assets where not is_archived) as assets`),
    migrationStats(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Admin Center"
        description="Everything that runs Wahlburgers Academy — people, content, assignments, data and system settings."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <KpiTile label="Employees" value={Number(counts?.users ?? 0).toLocaleString()} tone="info" />
        <KpiTile label="Courses" value={counts?.courses ?? 0} tone="success" />
        <KpiTile label="Published assignments" value={counts?.assignments ?? 0} tone="accent" />
        <KpiTile label="SCORM packages" value={counts?.scorm ?? 0} tone="warning" />
        <KpiTile label="Restaurants" value={counts?.locations ?? 0} tone="neutral" />
        <KpiTile label="Library assets" value={counts?.assets ?? 0} tone="neutral" />
      </div>

      <Card>
        <CardHeader
          title="Migrated legacy data"
          subtitle={migration.last_migration ? `Last migration ${formatRelative(migration.last_migration)}` : "No migrations run yet"}
          icon={<Database size={17} />}
          action={can(user, "migration.run") ? <Link href="/admin/migration" className="text-[13px] font-medium text-[var(--accent)] hover:underline">Open Migration Center</Link> : null}
        />
        <CardBody className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {[
            { label: "Employees", value: migration.employees_imported },
            { label: "Training records", value: migration.historical_imported },
            { label: "Courses", value: migration.courses_imported },
            { label: "Assessments", value: migration.assessments_imported },
            { label: "Certifications", value: migration.certifications_imported },
            { label: "Learning paths", value: migration.paths_imported },
          ].map((item) => (
            <div key={item.label} className="rounded-lg bg-[var(--surface-2)] p-3">
              <p className="text-[20px] font-semibold tabular-nums">{Number(item.value).toLocaleString()}</p>
              <p className="text-[11.5px] text-[var(--muted)]">{item.label}</p>
            </div>
          ))}
        </CardBody>
      </Card>

      {SECTIONS.map((section) => {
        const links = section.links.filter((link) => !link.permission || can(user, link.permission));
        if (!links.length) return null;
        return (
          <Card key={section.title}>
            <CardHeader title={section.title} />
            <CardBody className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {links.map((link) => (
                <Link key={link.href} href={link.href} className="flex items-start gap-3 rounded-xl border border-[var(--border)] p-3.5 transition-colors hover:border-[var(--accent)]">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-3)] text-[var(--muted)]">
                    {link.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-semibold">{link.label}</span>
                    <span className="mt-0.5 block text-[12px] text-[var(--muted)]">{link.description}</span>
                  </span>
                </Link>
              ))}
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
