import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer, Download, ScrollText } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { getPersonDetail, getTranscript, getPersonCertifications } from "@/lib/services/people";
import {
  Card, CardBody, CardHeader, EmptyState, KpiTile, PageHeader, Pill, SourcePill, StatusPill, Table, TableWrap, Td, Th, Tr,
} from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { FilterSelect, SearchInput, ClearFilters } from "@/components/ui/interactive";
import { PrintButton } from "@/components/ui/print-button";
import { formatDate, formatDuration } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ userId: string }> }) {
  const user = await requireUser();
  const { userId } = await params;
  const person = await getPersonDetail(user.scope, userId);
  return { title: person ? `${person.full_name} — Transcript` : "Transcript" };
}

export default async function TranscriptPage({
  params, searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ source?: string; status?: string; q?: string }>;
}) {
  const viewer = await requireUser();
  const { userId } = await params;
  const sp = await searchParams;
  const person = await getPersonDetail(viewer.scope, userId);
  if (!person) notFound();

  const [records, certifications] = await Promise.all([
    getTranscript(viewer.scope, userId, { source: sp.source, status: sp.status, q: sp.q }),
    getPersonCertifications(userId),
  ]);

  const completed = records.filter((r) => r.status === "completed");
  const legacy = records.filter((r) => r.source_system !== "Wahlburgers Academy");
  const totalSeconds = records.reduce((sum, r) => sum + Number(r.duration_seconds ?? 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${person.full_name} — Training transcript`}
        description="Every training record this employee holds, from the legacy LMS and from Wahlburgers Academy, in one permanent history."
        breadcrumb={[{ label: "People", href: "/admin/people" }, { label: person.full_name, href: `/people/${userId}` }, { label: "Transcript" }]}
        actions={
          <>
            <PrintButton />
            <LinkButton href={`/api/export?report=transcript&user=${userId}`} variant="outline" size="sm">
              <Download size={15} /> Export CSV
            </LinkButton>
          </>
        }
      />

      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[13px] text-[var(--muted)]">Employee</p>
            <p className="text-[15px] font-semibold">{person.full_name} · {person.employee_id}</p>
            <p className="text-[12.5px] text-[var(--muted)]">
              {person.position_title} · {person.location_name ?? "Corporate"}{person.franchise_group_name ? ` · ${person.franchise_group_name}` : ""}
            </p>
          </div>
          <div>
            <p className="text-[13px] text-[var(--muted)]">Record generated</p>
            <p className="text-[15px] font-semibold">{formatDate(new Date())}</p>
            <p className="text-[12.5px] text-[var(--muted)]">Wahlburgers Academy · official training record</p>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Total records" value={records.length} sublabel="Across every source system" tone="info" />
        <KpiTile label="Completed" value={completed.length} sublabel="Courses finished" tone="success" />
        <KpiTile label="Migrated records" value={legacy.length} sublabel="Preserved from the legacy LMS" tone="neutral" />
        <KpiTile label="Recorded training time" value={formatDuration(totalSeconds)} sublabel="All sources" tone="neutral" />
      </div>

      <Card className="no-print">
        <CardBody className="flex flex-wrap items-center gap-2">
          <SearchInput placeholder="Search this transcript…" className="w-full sm:w-72" />
          <FilterSelect paramKey="source" label="Source system" allLabel="All sources" options={[
            { value: "Wahlburgers Academy", label: "Wahlburgers Academy" },
            { value: "Legacy LMS", label: "Legacy LMS" },
          ]} />
          <FilterSelect paramKey="status" label="Status" allLabel="All statuses" options={[
            { value: "completed", label: "Completed" }, { value: "in_progress", label: "In progress" },
            { value: "not_started", label: "Not started" },
          ]} />
          <ClearFilters keys={["q", "source", "status"]} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Training history"
          subtitle={`${records.length} records · legacy and Academy training shown together`}
          icon={<ScrollText size={17} />}
        />
        <TableWrap>
          <Table className="min-w-[900px]">
            <thead>
              <tr>
                <Th>Course</Th><Th>Category</Th><Th>Version</Th><Th>Assigned</Th><Th>Completed</Th>
                <Th>Score</Th><Th>Status</Th><Th>Duration</Th><Th>Certification</Th><Th>Source</Th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <Tr key={r.id}>
                  <Td className="font-medium">
                    {r.course_id ? <Link href={`/library/${r.course_id}`} className="hover:text-[var(--accent)]">{r.course_title}</Link> : r.course_title}
                    {r.course_code ? <span className="ml-1.5 text-[11px] text-[var(--muted-2)]">{r.course_code}</span> : null}
                  </Td>
                  <Td className="text-[var(--muted)]">{r.category_name ?? "—"}</Td>
                  <Td className="text-[var(--muted)]">v{r.course_version}</Td>
                  <Td className="whitespace-nowrap text-[var(--muted)]">{formatDate(r.assigned_at)}</Td>
                  <Td className="whitespace-nowrap">{r.completed_at ? formatDate(r.completed_at) : "—"}</Td>
                  <Td className="tabular-nums">{r.score ? `${Math.round(Number(r.score))}%` : "—"}</Td>
                  <Td><StatusPill status={r.status} /></Td>
                  <Td className="whitespace-nowrap text-[var(--muted)]">{formatDuration(r.duration_seconds)}</Td>
                  <Td>{r.certification_id ? <Pill tone="success">Yes</Pill> : <span className="text-[var(--muted-2)]">—</span>}</Td>
                  <Td><SourcePill source={r.source_system} /></Td>
                </Tr>
              ))}
              {records.length === 0 ? <tr><Td colSpan={10}><EmptyState title="No records match those filters" /></Td></tr> : null}
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      <Card>
        <CardHeader title="Certifications held" subtitle="Including certifications migrated from the legacy system" />
        <TableWrap>
          <Table className="min-w-[620px]">
            <thead><tr><Th>Certification</Th><Th>Issued</Th><Th>Expires</Th><Th>Certificate #</Th><Th>Status</Th><Th>Source</Th></tr></thead>
            <tbody>
              {certifications.map((c) => (
                <Tr key={c.id}>
                  <Td className="font-medium">{c.certification_name}</Td>
                  <Td className="whitespace-nowrap">{formatDate(c.issued_at)}</Td>
                  <Td className="whitespace-nowrap">{c.expires_at ? formatDate(c.expires_at) : "—"}</Td>
                  <Td className="font-mono text-[12px] text-[var(--muted)]">{c.certificate_number ?? "—"}</Td>
                  <Td><StatusPill status={c.status} /></Td>
                  <Td><SourcePill source={c.source_system} /></Td>
                </Tr>
              ))}
              {certifications.length === 0 ? <tr><Td colSpan={6}><EmptyState title="No certifications on record" /></Td></tr> : null}
            </tbody>
          </Table>
        </TableWrap>
      </Card>
    </div>
  );
}
