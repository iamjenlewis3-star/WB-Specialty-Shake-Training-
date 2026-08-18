import Link from "next/link";
import { Award, BadgeCheck, Flame, Trophy } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { myAchievements, availableBadges, learnerSummary } from "@/lib/services/learning";
import { leaderboard } from "@/lib/services/leaderboard";
import { Card, CardBody, CardHeader, EmptyState, KpiTile, PageHeader, Pill, ProgressBar, StatusPill, Table, TableWrap, Td, Th, Tr } from "@/components/ui/primitives";
import { FilterChips } from "@/components/ui/interactive";
import { formatDate, cn } from "@/lib/utils";

export const metadata = { title: "Achievements" };
export const dynamic = "force-dynamic";

export default async function AchievementsPage({
  searchParams,
}: { searchParams: Promise<{ board?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const view = (["learners", "locations", "franchise_groups"].includes(sp.board ?? "") ? sp.board : "learners") as
    "learners" | "locations" | "franchise_groups";

  const [achievements, allBadges, summary, board] = await Promise.all([
    myAchievements(user.id),
    availableBadges(),
    learnerSummary(user.id),
    leaderboard(user.scope, view, 20),
  ]);
  const earnedIds = new Set(achievements.badges.map((b) => b.name));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Achievements"
        description="Your badges, certifications and where you stand on the Academy leaderboard."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Badges earned" value={achievements.badges.length} sublabel={`${allBadges.length} available`} tone="accent" icon={<Award size={16} />} />
        <KpiTile label="Active certifications" value={achievements.certifications.filter((c) => c.status !== "expired").length} sublabel={`${summary.expiring_certifications} expiring in 60 days`} tone="success" icon={<BadgeCheck size={16} />} />
        <KpiTile label="Courses completed" value={summary.completed_total} sublabel="All time, all sources" tone="info" />
        <KpiTile label="Learning streak" value={`${achievements.streakWeeks} wks`} sublabel="Weeks with training completed" tone="warning" icon={<Flame size={16} />} />
      </div>

      <Card>
        <CardHeader title="My badges" subtitle="Earned through completion, certification and consistency" icon={<Award size={17} />} />
        <CardBody className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {allBadges.map((badge) => {
            const earned = earnedIds.has(badge.name);
            const record = achievements.badges.find((b) => b.name === badge.name);
            return (
              <div key={badge.id} className={cn("rounded-xl border p-3.5 text-center", earned ? "border-[var(--border-strong)]" : "border-dashed border-[var(--border)] opacity-60")}>
                <span
                  className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full text-white"
                  style={{ background: earned ? badge.color : "var(--muted-2)" }}
                  aria-hidden
                >
                  <Award size={22} />
                </span>
                <p className="text-[13px] font-semibold">{badge.name}</p>
                <p className="mt-0.5 line-clamp-2 text-[11.5px] text-[var(--muted)]">{badge.criteria ?? badge.description}</p>
                {earned && record ? <p className="mt-1.5 text-[11px] text-[var(--success)]">Earned {formatDate(record.awarded_at)}</p> : null}
              </div>
            );
          })}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="My certifications" icon={<BadgeCheck size={17} />} />
        <TableWrap>
          <Table className="min-w-[520px]">
            <thead><tr><Th>Certification</Th><Th>Issued</Th><Th>Expires</Th><Th>Status</Th></tr></thead>
            <tbody>
              {achievements.certifications.map((c) => (
                <Tr key={c.id}>
                  <Td className="font-medium">{c.certification_name}</Td>
                  <Td className="whitespace-nowrap">{formatDate(c.issued_at)}</Td>
                  <Td className="whitespace-nowrap">{c.expires_at ? formatDate(c.expires_at) : "—"}</Td>
                  <Td><StatusPill status={c.status} /></Td>
                </Tr>
              ))}
              {achievements.certifications.length === 0 ? <tr><Td colSpan={4}><EmptyState title="No certifications yet" description="Complete a certification path to earn your first one." /></Td></tr> : null}
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      <Card>
        <CardHeader
          title="Academy Leaderboard"
          subtitle="Scored on required completion, learning paths, certifications and achievements — not time spent"
          icon={<Trophy size={17} />}
        />
        <CardBody>
          <FilterChips paramKey="board" options={[
            { value: "learners", label: "Learners" },
            { value: "locations", label: "Locations" },
            { value: "franchise_groups", label: "Franchise groups" },
          ]} />
        </CardBody>
        <TableWrap>
          <Table className="min-w-[720px]">
            <thead>
              <tr><Th>#</Th><Th>{view === "learners" ? "Learner" : view === "locations" ? "Location" : "Franchise group"}</Th>
                <Th className="w-36">Required completion</Th><Th>Paths</Th><Th>Certifications</Th><Th>Badges</Th><Th>Score</Th></tr>
            </thead>
            <tbody>
              {board.rows.map((row, i) => (
                <Tr key={row.id} className={row.id === user.id ? "bg-[var(--info-bg)]/40" : ""}>
                  <Td className="w-10">
                    <span className={cn("flex size-6 items-center justify-center rounded-full text-[12px] font-semibold",
                      i === 0 ? "bg-[var(--wb-gold)] text-white" : i < 3 ? "bg-[var(--surface-3)]" : "text-[var(--muted)]")}>
                      {i + 1}
                    </span>
                  </Td>
                  <Td>
                    {view === "learners" ? (
                      <Link href={`/people/${row.id}`} className="font-medium hover:text-[var(--accent)]">{row.name}</Link>
                    ) : <span className="font-medium">{row.name}</span>}
                    <span className="block text-[11.5px] text-[var(--muted)]">{row.subtitle}</span>
                  </Td>
                  <Td><ProgressBar value={row.completion} tone="info" size="sm" showLabel /></Td>
                  <Td className="tabular-nums">{row.paths}</Td>
                  <Td className="tabular-nums">{row.certifications}</Td>
                  <Td className="tabular-nums">{row.badges}</Td>
                  <Td><Pill tone="accent">{row.score}</Pill></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Card>
    </div>
  );
}
