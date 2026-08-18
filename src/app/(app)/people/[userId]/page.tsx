import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Award, BadgeCheck, CalendarDays, ClipboardCheck, Clock, Mail, MapPin, Pencil, ScrollText, ShieldCheck,
  UserCog, Users,
} from "lucide-react";
import { requireUser, can } from "@/lib/auth/guard";
import {
  getPersonDetail, getPersonBadges, getPersonCertifications, getPersonLearningPaths, getPersonAssessments,
  getPersonActivity, getTranscript,
} from "@/lib/services/people";
import { listMyLearning } from "@/lib/services/learning";
import { query } from "@/lib/db/client";
import {
  Avatar, Card, CardBody, CardHeader, DescriptionList, EmptyState, KpiTile, PageHeader, Pill, ProgressBar,
  ProgressRing, SourcePill, StatusPill, Table, TableWrap, Td, Th, Tr,
} from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { EmployeeAdminActions } from "@/components/people/employee-actions";
import { ManagerValidationCard } from "@/components/people/manager-validation";
import { formatDate, formatDuration, formatRelative, completionTone } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ userId: string }> }) {
  const user = await requireUser();
  const { userId } = await params;
  const person = await getPersonDetail(user.scope, userId);
  return { title: person?.full_name ?? "Employee" };
}

export default async function PersonPage({ params }: { params: Promise<{ userId: string }> }) {
  const viewer = await requireUser();
  const { userId } = await params;
  const person = await getPersonDetail(viewer.scope, userId);
  if (!person) notFound();

  const isSelf = viewer.id === userId;
  const [certifications, badges, paths, assessments, activity, transcript, assignments, pendingValidations, locations] =
    await Promise.all([
      getPersonCertifications(userId),
      getPersonBadges(userId),
      getPersonLearningPaths(userId),
      getPersonAssessments(userId),
      getPersonActivity(userId, 12),
      getTranscript(viewer.scope, userId),
      listMyLearning(userId, "all"),
      query<{ enrollment_id: string; course_title: string; module_title: string; status: string | null; notes: string | null; validated_at: string | null; validator: string | null }>(
        `select e.id as enrollment_id, coalesce(c.title, e.course_title) as course_title, m.title as module_title,
                e.manager_validation_status as status, e.manager_notes as notes, e.manager_validated_at as validated_at,
                v.full_name as validator
           from enrollments e
           join course_modules m on m.course_id = e.course_id and m.course_version = e.course_version
                and m.module_type = 'manager_validation'
           left join courses c on c.id = e.course_id
           left join v_people v on v.user_id = e.manager_validated_by
          where e.user_id = $1
          order by e.assigned_at desc limit 10`, [userId]),
      can(viewer, "users.transfer")
        ? query<{ id: string; name: string; store_number: string }>(
            `select id, name, store_number from locations where status = 'active' order by name`)
        : Promise.resolve([]),
    ]);

  const completion = Number(person.completion_pct);
  const legacyCount = transcript.filter((t) => t.source_system !== "Wahlburgers Academy").length;
  const overdue = assignments.filter((a) => a.due_at && a.status !== "completed" && new Date(a.due_at) < new Date());

  return (
    <div className="space-y-5">
      <PageHeader
        title={person.full_name}
        description={`${person.position_title ?? person.role_name ?? "Team member"}${person.location_name ? ` · ${person.location_name}` : ""}`}
        breadcrumb={[{ label: "People", href: can(viewer, "users.view") ? "/admin/people" : "/dashboard" }, { label: person.full_name }]}
        actions={
          <>
            <LinkButton href={`/people/${userId}/transcript`} variant="outline" size="sm"><ScrollText size={15} /> Transcript</LinkButton>
            {can(viewer, "training.assign") ? (
              <LinkButton href={`/admin/assignments/new?user=${userId}`} variant="outline" size="sm">Assign training</LinkButton>
            ) : null}
            {can(viewer, "users.edit") && !isSelf ? (
              <LinkButton href={`/admin/people/${userId}/edit`} variant="primary" size="sm"><Pencil size={15} /> Edit</LinkButton>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardBody className="flex flex-col items-center gap-3 text-center">
              <Avatar name={person.full_name} color={person.avatar_color} size={72} />
              <div>
                <p className="text-[17px] font-semibold">{person.full_name}</p>
                <p className="text-[13px] text-[var(--muted)]">{person.position_title ?? person.role_name}</p>
              </div>
              <StatusPill status={person.status} />
              <ProgressRing value={completion} tone={completionTone(completion)} size={110} sublabel="Required" />
              <div className="grid w-full grid-cols-2 gap-2 text-left">
                <div className="rounded-lg bg-[var(--surface-2)] p-2.5">
                  <p className="text-[17px] font-semibold tabular-nums">{person.certification_count}</p>
                  <p className="text-[11px] text-[var(--muted)]">Certifications</p>
                </div>
                <div className="rounded-lg bg-[var(--surface-2)] p-2.5">
                  <p className="text-[17px] font-semibold tabular-nums text-[var(--danger)]">{person.overdue_count}</p>
                  <p className="text-[11px] text-[var(--muted)]">Overdue</p>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Employee details" icon={<UserCog size={17} />} />
            <CardBody>
              <DescriptionList
                items={[
                  { label: "Employee ID", value: <span className="font-mono">{person.employee_id ?? "—"}</span> },
                  { label: "Email", value: <a href={`mailto:${person.email}`} className="hover:text-[var(--accent)]">{person.email}</a> },
                  { label: "Location", value: person.location_name ? <Link href={`/locations/${person.primary_location_id}`} className="hover:text-[var(--accent)]">{person.location_name}</Link> : "—" },
                  { label: "Franchise group", value: person.franchise_group_name ?? "—" },
                  { label: "Region", value: person.region_name ?? "—" },
                  { label: "Department", value: person.department_name ?? "—" },
                  { label: "Role", value: person.role_name ?? "—" },
                  { label: "Manager", value: person.manager_user_id ? <Link href={`/people/${person.manager_user_id}`} className="hover:text-[var(--accent)]">{person.manager_name}</Link> : "—" },
                  { label: "Hire date", value: formatDate(person.hire_date) },
                  { label: "Employment type", value: person.employment_type ?? "—" },
                  { label: "Last login", value: formatRelative(person.last_login_at) },
                  { label: "Training hours", value: formatDuration(Number(person.training_seconds)) },
                  { label: "Record source", value: <SourcePill source={person.source_system} /> },
                  ...(person.deactivated_at ? [{ label: "Deactivated", value: formatDate(person.deactivated_at) }] : []),
                  ...(person.termination_date ? [{ label: "Termination date", value: formatDate(person.termination_date) }] : []),
                ]}
              />
            </CardBody>
          </Card>

          {can(viewer, ["users.deactivate", "users.reactivate", "users.transfer"]) && !isSelf ? (
            <EmployeeAdminActions
              userId={userId}
              name={person.full_name}
              status={person.status}
              locations={locations}
              canTransfer={can(viewer, "users.transfer")}
              canDeactivate={can(viewer, "users.deactivate")}
              canReactivate={can(viewer, "users.reactivate")}
            />
          ) : null}
        </div>

        <div className="min-w-0 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiTile label="Required completion" value={`${completion}%`} sublabel={`${person.required_complete} of ${person.required_total}`} tone={completionTone(completion)} />
            <KpiTile label="Overdue" value={overdue.length} sublabel="Past due date" tone={overdue.length ? "danger" : "success"} />
            <KpiTile label="Transcript records" value={transcript.length} sublabel={`${legacyCount} migrated from Legacy LMS`} tone="info" href={`/people/${userId}/transcript`} />
            <KpiTile label="Badges" value={badges.length} sublabel="Achievements earned" tone="accent" />
          </div>

          {pendingValidations.length > 0 && can(viewer, "training.validate") && !isSelf ? (
            <ManagerValidationCard items={pendingValidations} learnerName={person.full_name} />
          ) : null}

          <Card>
            <CardHeader
              title="Training transcript"
              subtitle="Legacy LMS and Wahlburgers Academy records in one permanent record"
              icon={<ScrollText size={17} />}
              action={<LinkButton href={`/people/${userId}/transcript`} variant="outline" size="sm">Full transcript</LinkButton>}
            />
            <TableWrap>
              <Table className="min-w-[720px]">
                <thead>
                  <tr><Th>Course</Th><Th>Version</Th><Th>Completed</Th><Th>Score</Th><Th>Status</Th><Th>Source</Th></tr>
                </thead>
                <tbody>
                  {transcript.slice(0, 10).map((t) => (
                    <Tr key={t.id}>
                      <Td className="font-medium">
                        {t.course_id ? <Link href={`/library/${t.course_id}`} className="hover:text-[var(--accent)]">{t.course_title}</Link> : t.course_title}
                      </Td>
                      <Td className="text-[var(--muted)]">v{t.course_version}</Td>
                      <Td className="whitespace-nowrap">{t.completed_at ? formatDate(t.completed_at) : "—"}</Td>
                      <Td className="tabular-nums">{t.score ? `${Math.round(Number(t.score))}%` : "—"}</Td>
                      <Td><StatusPill status={t.status} /></Td>
                      <Td><SourcePill source={t.source_system} /></Td>
                    </Tr>
                  ))}
                  {transcript.length === 0 ? <tr><Td colSpan={6}><EmptyState title="No training records yet" /></Td></tr> : null}
                </tbody>
              </Table>
            </TableWrap>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Certifications" icon={<BadgeCheck size={17} />} />
              <CardBody className="space-y-2.5">
                {certifications.length === 0 ? <EmptyState title="No certifications yet" /> : certifications.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-2.5 last:border-b-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-medium">{c.certification_name}</p>
                      <p className="text-[11.5px] text-[var(--muted)]">
                        Issued {formatDate(c.issued_at)}{c.expires_at ? ` · expires ${formatDate(c.expires_at)}` : ""} · {c.source_system}
                      </p>
                    </div>
                    <StatusPill status={c.status} />
                  </div>
                ))}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Learning paths" icon={<Users size={17} />} />
              <CardBody className="space-y-3">
                {paths.length === 0 ? <EmptyState title="No learning paths assigned" /> : paths.map((p) => (
                  <div key={p.id}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="truncate text-[13.5px] font-medium">{p.name}</span>
                      <Pill tone={p.status === "completed" ? "success" : "info"}>{p.status.replace("_", " ")}</Pill>
                    </div>
                    <ProgressBar value={Number(p.progress)} tone={Number(p.progress) >= 100 ? "success" : "info"} showLabel size="sm" />
                  </div>
                ))}
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader title="Current assignments" subtitle="Active and upcoming training" icon={<ClipboardCheck size={17} />} />
            <TableWrap>
              <Table className="min-w-[640px]">
                <thead><tr><Th>Course</Th><Th>Due</Th><Th className="w-32">Progress</Th><Th>Status</Th><Th>Required</Th></tr></thead>
                <tbody>
                  {assignments.filter((a) => a.status !== "completed").slice(0, 12).map((a) => (
                    <Tr key={a.id}>
                      <Td className="font-medium">{a.course_title}</Td>
                      <Td className="whitespace-nowrap">{a.due_at ? formatDate(a.due_at) : "—"}</Td>
                      <Td><ProgressBar value={Number(a.progress_pct)} tone="info" size="sm" showLabel /></Td>
                      <Td><StatusPill status={a.status} /></Td>
                      <Td>{a.is_required ? <Pill tone="accent">Required</Pill> : <Pill tone="neutral">Optional</Pill>}</Td>
                    </Tr>
                  ))}
                  {assignments.filter((a) => a.status !== "completed").length === 0 ? (
                    <tr><Td colSpan={5}><EmptyState title="Nothing outstanding" description="All assigned training is complete." /></Td></tr>
                  ) : null}
                </tbody>
              </Table>
            </TableWrap>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Badges" icon={<Award size={17} />} />
              <CardBody className="flex flex-wrap gap-2">
                {badges.length === 0 ? <EmptyState title="No badges yet" /> : badges.map((b) => (
                  <span key={b.id} className="flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1.5">
                    <span className="size-2.5 rounded-full" style={{ background: b.color }} aria-hidden />
                    <span className="text-[12.5px] font-medium">{b.name}</span>
                    <span className="text-[11px] text-[var(--muted)]">{formatDate(b.awarded_at)}</span>
                  </span>
                ))}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Assessment history" icon={<ClipboardCheck size={17} />} />
              <TableWrap>
                <Table className="min-w-[420px]">
                  <thead><tr><Th>Assessment</Th><Th>Attempt</Th><Th>Score</Th><Th>Result</Th><Th>Date</Th></tr></thead>
                  <tbody>
                    {assessments.slice(0, 8).map((a) => (
                      <Tr key={a.id}>
                        <Td className="font-medium">{a.title}</Td>
                        <Td className="tabular-nums">{a.attempt_number}</Td>
                        <Td className="tabular-nums">{a.score ? `${Math.round(Number(a.score))}%` : "—"}</Td>
                        <Td><Pill tone={a.passed ? "success" : "danger"}>{a.passed ? "Passed" : "Failed"}</Pill></Td>
                        <Td className="whitespace-nowrap text-[var(--muted)]">{formatDate(a.completed_at)}</Td>
                      </Tr>
                    ))}
                    {assessments.length === 0 ? <tr><Td colSpan={5}><EmptyState title="No assessment attempts" /></Td></tr> : null}
                  </tbody>
                </Table>
              </TableWrap>
            </Card>
          </div>

          <Card>
            <CardHeader title="Activity history" icon={<Clock size={17} />} />
            <CardBody className="space-y-2">
              {activity.length === 0 ? <EmptyState title="No recorded activity" /> : activity.map((a, i) => (
                <div key={i} className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-2 text-[13px] last:border-b-0 last:pb-0">
                  <span className="truncate"><span className="font-medium capitalize">{a.action.replace(/[._]/g, " ")}</span> {a.entity_label ? `· ${a.entity_label}` : ""}</span>
                  <span className="shrink-0 text-[11.5px] text-[var(--muted)]">{formatRelative(a.occurred_at)}</span>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
