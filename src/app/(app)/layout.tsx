import { Suspense } from "react";
import { requireUser } from "@/lib/auth/guard";
import { navigationFor, mobileNavFor } from "@/lib/navigation";
import { scopeLabel } from "@/lib/rbac/scope";
import { Sidebar, MobileNav } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { ThemeProvider } from "@/components/theme-provider";
import { setThemePreference } from "@/lib/actions/auth";
import { ToastListener } from "@/components/ui/interactive";
import { listNotifications, unreadCount } from "@/lib/services/notifications";
import { signOut, switchDemoPersona } from "@/lib/actions/auth";
import { markNotificationsRead } from "@/lib/actions/account";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const sections = navigationFor(user);
  const [notifications, unread] = await Promise.all([listNotifications(user.id, 12), unreadCount(user.id)]);

  return (
    <ThemeProvider initialTheme={user.theme as "light" | "dark" | "system"} onPersist={setThemePreference}>
      <div className="flex min-h-dvh bg-[var(--background)]">
        <Sidebar sections={sections} roleName={user.roleName} scopeLabel={scopeLabel(user.scope)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            user={{
              fullName: user.fullName,
              displayName: user.displayName,
              email: user.email,
              roleName: user.roleName,
              avatarColor: user.avatarColor,
              avatarUrl: user.avatarUrl,
              locationName: user.locationName,
              isImpersonating: user.isImpersonating,
              impersonatorName: user.impersonatorName,
              canSwitchPersona: user.permissions.includes("permissions.manage") || user.isImpersonating,
            }}
            sections={sections}
            notifications={notifications}
            unread={unread}
            onSignOut={signOut}
            onSwitchPersona={switchDemoPersona}
            onMarkRead={markNotificationsRead}
          />
          <main id="main" className="min-w-0 flex-1 px-3 pb-24 pt-4 sm:px-5 sm:pb-10 lg:px-7">
            <Suspense>
              <ToastListener />
            </Suspense>
            {children}
          </main>
          <MobileNav items={mobileNavFor(user)} />
        </div>
      </div>
    </ThemeProvider>
  );
}
