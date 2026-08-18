import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Package } from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import { getScormPackage } from "@/lib/services/scorm";
import { query } from "@/lib/db/client";
import { Card, CardBody, CardHeader, DescriptionList, PageHeader, Pill, Table, TableWrap, Td, Th, Tr } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { formatDate, formatFileSize, formatDuration, formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ScormDetailPage({ params }: { params: Promise<{ packageId: string }> }) {
  await requirePermission("scorm.upload");
  const { packageId } = await params;
  const pkg = await getScormPackage(packageId);
  if (!pkg) notFound();

  const [courses, versions, tracking] = await Promise.all([
    query<{ id: string; title: string; module_title: string }>(
      `select distinct c.id, c.title, m.title as module_title
         from course_modules m join courses c on c.id = m.course_id where m.scorm_package_id = $1`, [packageId]),
    query<{ id: string; version: number; launch_file: string; file_size: string; notes: string | null; created_at: string }>(
      `select id, version, launch_file, file_size::text as file_size, notes, created_at
         from scorm_versions where scorm_package_id = $1 order by version desc`, [packageId]),
    query<{ full_name: string; lesson_status: string | null; score: string | null; seconds_spent: number; updated_at: string; suspend: string | null }>(
      `select p.full_name, mp.data->'scorm'->>'lessonStatus' as lesson_status, mp.score::text as score,
              mp.seconds_spent, mp.updated_at, mp.data->'scorm'->>'suspendData' as suspend
         from module_progress mp
         join course_modules m on m.id = mp.module_id and m.scorm_package_id = $1
         join enrollments e on e.id = mp.enrollment_id
         join v_people p on p.user_id = e.user_id
        order by mp.updated_at desc limit 25`, [packageId]),
  ]);

  return (
    <div className="mx-auto max-w-[1000px] space-y-5">
      <PageHeader
        title={pkg.title}
        description={`SCORM ${pkg.scorm_version} package · ${pkg.file_name ?? "uploaded archive"}`}
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "SCORM Packages", href: "/admin/scorm" }, { label: pkg.title }]}
        actions={
          <LinkButton href={`/api/scorm/${pkg.id}/content/${pkg.launch_file}`} target="_blank" variant="outline" size="sm">
            <ExternalLink size={15} /> Preview package
          </LinkButton>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Runtime tracking" subtitle="What the SCORM runtime has recorded for learners" />
            <TableWrap>
              <Table className="min-w-[620px]">
                <thead><tr><Th>Learner</Th><Th>Lesson status</Th><Th>Score</Th><Th>Session time</Th><Th>Bookmark / suspend</Th><Th>Updated</Th></tr></thead>
                <tbody>
                  {tracking.map((t, i) => (
                    <Tr key={i}>
                      <Td className="font-medium">{t.full_name}</Td>
                      <Td><Pill tone={t.lesson_status === "passed" || t.lesson_status === "completed" ? "success" : "info"}>{t.lesson_status ?? "not attempted"}</Pill></Td>
                      <Td className="tabular-nums">{t.score ? `${Math.round(Number(t.score))}%` : "—"}</Td>
                      <Td>{formatDuration(t.seconds_spent)}</Td>
                      <Td className="max-w-[220px] truncate font-mono text-[11.5px] text-[var(--muted)]">{t.suspend ?? "—"}</Td>
                      <Td className="whitespace-nowrap text-[var(--muted)]">{formatRelative(t.updated_at)}</Td>
                    </Tr>
                  ))}
                  {tracking.length === 0 ? <tr><Td colSpan={6} className="text-center text-[13px] text-[var(--muted)]">No learner has launched this package yet.</Td></tr> : null}
                </tbody>
              </Table>
            </TableWrap>
          </Card>

          <Card>
            <CardHeader title="Manifest" subtitle="Parsed from imsmanifest.xml at upload" />
            <CardBody>
              <pre className="max-h-[320px] overflow-auto rounded-lg bg-[var(--surface-2)] p-3 text-[11.5px] leading-relaxed">
                {pkg.manifest_xml?.slice(0, 4000) ?? "Manifest unavailable"}
              </pre>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Package details" icon={<Package size={17} />} />
            <CardBody>
              <DescriptionList
                items={[
                  { label: "SCORM version", value: <Pill tone="info">{pkg.scorm_version}</Pill> },
                  { label: "Identifier", value: <span className="font-mono text-[12px]">{pkg.identifier ?? "—"}</span> },
                  { label: "Launch file", value: <span className="font-mono text-[12px]">{pkg.launch_file}</span> },
                  { label: "Mastery score", value: pkg.mastery_score ? `${Number(pkg.mastery_score)}%` : "—" },
                  { label: "Archive size", value: formatFileSize(pkg.file_size) },
                  { label: "Uploaded by", value: pkg.uploaded_by_name ?? "—" },
                  { label: "Uploaded", value: formatDate(pkg.created_at) },
                  { label: "Status", value: <Pill tone="success">{pkg.status}</Pill> },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Used by courses" />
            <CardBody className="space-y-2">
              {courses.length === 0 ? (
                <p className="text-[12.5px] text-[var(--muted)]">Not attached to a course yet.</p>
              ) : courses.map((c) => (
                <Link key={c.id} href={`/admin/courses/${c.id}`} className="block rounded-lg border border-[var(--border)] p-2.5 hover:border-[var(--accent)]">
                  <p className="text-[13px] font-medium">{c.title}</p>
                  <p className="text-[11.5px] text-[var(--muted)]">{c.module_title}</p>
                </Link>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Version history" />
            <CardBody className="space-y-2">
              {versions.map((v) => (
                <div key={v.id} className="rounded-lg border border-[var(--border)] p-2.5">
                  <p className="text-[13px] font-medium">Version {v.version}</p>
                  <p className="text-[11.5px] text-[var(--muted)]">{formatFileSize(v.file_size)} · {formatDate(v.created_at)}</p>
                  {v.notes ? <p className="mt-1 text-[12px] text-[var(--muted)]">{v.notes}</p> : null}
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
