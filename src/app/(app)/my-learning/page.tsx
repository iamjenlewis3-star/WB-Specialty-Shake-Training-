import Link from "next/link";
import { AlarmClock, BookOpen, CheckCircle2, Clock, GraduationCap, ScrollText } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { learnerSummary, listMyLearning, myLearningPaths, type LearningFilter } from "@/lib/services/learning";
import { Card, CardBody, CardHeader, EmptyState, KpiTile, PageHeader, Pill, ProgressBar, SourcePill, Table, TableWrap, Td, Th, Tr } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { FilterChips, SearchInput } from "@/components/ui/interactive";
import { formatDate, formatDuration, cn } from "@/lib/utils";

export const metadata = { title: "My Learning" };
export const dynamic = "force-dynamic";

const FILTERS: Array<{ value: LearningFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "required", label: "Required" },
  { value: "overdue", label: "Overdue" },
  { value: "due_soon", label: "Due soon" },
  { value: "in_progress", label: "In progress" },
  { value: "not_started", label: "Not started" },
  { value: "completed", label: "Completed" },
  { value: "optional", label: "Optional" },
];

export default async function MyLearningPage({
  searchParams,
}: { searchParams: Promise<{ filter?: string; q?: string }> }) {
  const user = await requireUser();
  const { filter, q } = await searchParams;
  const active = (FILTERS.find((f) => f.value === filter)?.value ?? "all") as LearningFilter;

  const [summary, items, paths] = await Promise.all([
    learnerSummary(user.id),
    listMyLearning(user.id, active, q),
    myLearningPaths(user.id),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Learning"
        description="Everything assigned to you, plus the training you've chosen for yourself."
        actions={
          <>
            <LinkButton href={`/people/${user.id}/transcript`} variant="outline" size="sm"><ScrollText size={15} /> My transcript</LinkButton>
            <LinkButton href="/library" variant="primary" size="sm">Browse the library</LinkButton>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Required completion" value={`${summary.completion_pct}%`} sublabel={`${summary.required_complete} of ${summary.required_total} complete`} tone={summary.completion_pct >= 90 ? "success" : summary.completion_pct >= 75 ? "warning" : "danger"} icon={<CheckCircle2 size={16} />} />
        <KpiTile label="Overdue" value={summary.overdue} sublabel="Complete these first" tone="danger" icon={<AlarmClock size={16} />} />
        <KpiTile label="In progress" value={summary.in_progress} sublabel="Pick up where you left off" tone="info" icon={<BookOpen size={16} />} />
        <KpiTile label="Training time" value={formatDuration(summary.training_seconds)} sublabel={`${summary.completed_total} courses completed`} tone="neutral" icon={<Clock size={16} />} />
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <FilterChips paramKey="filter" options={FILTERS.map((f) => ({ value: f.value, label: f.label }))} />
          <SearchInput placeholder="Search my training…" className="w-full sm:w-72" />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={FILTERS.find((f) => f.value === active)?.label ?? "All"} subtitle={`${items.length} item${items.length === 1 ? "" : "s"}`} />
        {items.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 size={28} />}
            title="Nothing here right now"
            description={active === "overdue" ? "You have no overdue training. Nice work." : "Try a different filter or browse the Academy Library."}
            action={<LinkButton href="/library" variant="outline" size="sm">Browse the library</LinkButton>}
          />
        ) : (
          <TableWrap>
            <Table className="min-w-[760px]">
              <thead>
                <tr>
                  <Th>Course</Th><Th>Type</Th><Th className="w-40">Progress</Th><Th>Due</Th>
                  <Th>Status</Th><Th>Source</Th><Th className="text-right">Action</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const overdue = item.due_at && item.status !== "completed" && new Date(item.due_at) < new Date();
                  return (
                    <Tr key={item.id}>
                      <Td>
                        <div className="flex items-start gap-2.5">
                          <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ background: item.thumbnail_color ?? "var(--wb-navy)" }} aria-hidden />
                          <div className="min-w-0">
                            <Link href={`/learn/${item.id}`} className="block truncate font-medium hover:text-[var(--accent)]">{item.course_title}</Link>
                            <span className="block text-[11.5px] text-[var(--muted)]">
                              {item.category_name ?? "Training"}
                              {item.is_required ? " · Required" : " · Optional"}
                              {item.learning_path_name ? ` · ${item.learning_path_name}` : ""}
                            </span>
                          </div>
                        </div>
                      </Td>
                      <Td className="capitalize text-[var(--muted)]">{item.course_type ?? "course"}</Td>
                      <Td><ProgressBar value={Number(item.progress_pct)} tone={item.status === "completed" ? "success" : overdue ? "danger" : "info"} showLabel size="sm" /></Td>
                      <Td className={cn("whitespace-nowrap", overdue && "font-semibold text-[var(--danger)]")}>
                        {item.due_at ? formatDate(item.due_at) : "—"}
                      </Td>
                      <Td>
                        <Pill tone={item.status === "completed" ? "success" : overdue ? "danger" : item.status === "in_progress" ? "info" : "neutral"}>
                          {overdue && item.status !== "completed" ? "Overdue" : item.status.replace("_", " ")}
                        </Pill>
                      </Td>
                      <Td><SourcePill source={item.source_system} /></Td>
                      <Td className="text-right">
                        <LinkButton href={`/learn/${item.id}`} variant={item.status === "completed" ? "outline" : "primary"} size="sm">
                          {item.status === "completed" ? "Review" : item.status === "in_progress" ? "Continue" : "Start"}
                        </LinkButton>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Card id="paths">
        <CardHeader title="My learning paths" subtitle="Certification curricula assigned to you" icon={<GraduationCap size={17} />} />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          {paths.length === 0 ? (
            <EmptyState title="No learning paths yet" description="Certification paths appear here when they're assigned." />
          ) : (
            paths.map((p) => (
              <Link key={p.id} href={`/library?path=${p.path_id}`} className="rounded-xl border border-[var(--border)] p-4 hover:border-[var(--accent)]">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 truncate text-[14px] font-semibold">
                    <span className="size-2.5 rounded-full" style={{ background: p.color }} aria-hidden />
                    {p.name}
                  </span>
                  <Pill tone={p.status === "completed" ? "success" : "info"}>{p.status.replace("_", " ")}</Pill>
                </div>
                <ProgressBar value={Number(p.progress)} tone={Number(p.progress) >= 100 ? "success" : "info"} showLabel />
                <p className="mt-2 text-[12px] text-[var(--muted)]">
                  {p.completed_courses} of {p.total_courses} courses complete{p.due_at ? ` · due ${formatDate(p.due_at)}` : ""}
                </p>
              </Link>
            ))
          )}
        </CardBody>
      </Card>
    </div>
  );
}
