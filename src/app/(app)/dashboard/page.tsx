import { requireUser } from "@/lib/auth/guard";
import { LearnerDashboard } from "./learner-dashboard";
import { ManagerDashboard } from "./manager-dashboard";
import { PortfolioDashboard } from "./portfolio-dashboard";
import { CorporateDashboard } from "./corporate-dashboard";

export const metadata = { title: "Home" };
export const dynamic = "force-dynamic";

/**
 * One route, five experiences. The dashboard a person lands on is derived from
 * their role's scope level and permissions — not from a hard-coded user list.
 */
export default async function DashboardPage() {
  const user = await requireUser();

  if (user.scope.level === "organization" && user.permissions.includes("analytics.executive")) {
    return <CorporateDashboard user={user} />;
  }
  if (["multi_location", "franchise_group", "region"].includes(user.scope.level)) {
    return <PortfolioDashboard user={user} />;
  }
  if (user.scope.level === "location" && user.permissions.includes("users.view")) {
    return <ManagerDashboard user={user} />;
  }
  return <LearnerDashboard user={user} />;
}
