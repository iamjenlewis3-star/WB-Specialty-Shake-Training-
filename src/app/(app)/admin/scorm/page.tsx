import Link from "next/link";
import { Package, Upload } from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import { listScormPackages, scormActivity } from "@/lib/services/scorm";
import { listCatalog } from "@/lib/services/courses";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Pill, Table, TableWrap, Td, Th, Tr } from "@/components/ui/primitives";
import { Field, Select, Checkbox, SubmitButton } from "@/components/ui/interactive";
import { uploadScormPackage } from "@/lib/actions/content";
import { formatDate, formatFileSize, formatDuration, formatRelative } from "@/lib/utils";

export const metadata = { title: "SCORM Packages" };
export const dynamic = "force-dynamic";

export default async function ScormPage({
  searchParams,
}: { searchParams: Promise<{ course?: string }> }) {
  const user = await requirePermission("scorm.upload");
  const sp = await searchParams;
  const [packages, courses, activity] = await Promise.all([
    listScormPackages(),
    listCatalog(user.id, { pageSize: 60, includeDrafts: true }),
    scormActivity(15),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="SCORM Packages"
        description="Upload SCORM 1.2 and SCORM 2004 packages. Archives are validated, safely extracted and served through an authenticated route — never from public storage."
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "SCORM Packages" }]}
      />

      <Card>
        <CardHeader title="Upload a package" icon={<Upload size={17} />} subtitle="ZIP archives up to 500 MB · imsmanifest.xml required" />
        <CardBody>
          <form action={uploadScormPackage} className="grid gap-4 sm:grid-cols-2" encType="multipart/form-data">
            <Field label="SCORM .zip file" required className="sm:col-span-2">
              <input
                type="file" name="file" accept=".zip,application/zip" required
                className="block w-full rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-6 text-[13px] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--primary)] file:px-3 file:py-1.5 file:text-[12.5px] file:font-semibold file:text-[var(--primary-foreground)]"
              />
            </Field>
            <Field label="Attach to course" hint="Optional — adds a SCORM module to the selected course">
              <Select name="course_id" defaultValue={sp.course ?? ""}>
                <option value="">Do not attach</option>
                {courses.rows.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </Select>
            </Field>
            <div className="flex items-end">
              <Checkbox name="attach_module" label="Add as a course module" defaultChecked={Boolean(sp.course)} description="Creates a required SCORM module using the package mastery score" />
            </div>
            <div className="sm:col-span-2">
              <SubmitButton size="lg" pendingLabel="Validating and extracting…">Upload and validate</SubmitButton>
              <p className="mt-2 text-[12px] text-[var(--muted)]">
                Uploads are checked for path traversal, oversized archives, executable content and a valid manifest before anything is written to disk.
              </p>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Packages" subtitle={`${packages.length} registered`} icon={<Package size={17} />} />
        {packages.length === 0 ? (
          <EmptyState title="No SCORM packages yet" description="Upload your first package above." />
        ) : (
          <TableWrap>
            <Table className="min-w-[880px]">
              <thead>
                <tr><Th>Package</Th><Th>SCORM</Th><Th>Launch file</Th><Th>Size</Th><Th>Courses</Th><Th>Uploaded by</Th><Th>Uploaded</Th><Th className="text-right">Actions</Th></tr>
              </thead>
              <tbody>
                {packages.map((p) => (
                  <Tr key={p.id}>
                    <Td>
                      <Link href={`/admin/scorm/${p.id}`} className="font-medium hover:text-[var(--accent)]">{p.title}</Link>
                      <span className="block text-[11.5px] text-[var(--muted)]">{p.file_name}</span>
                    </Td>
                    <Td><Pill tone="info">{p.scorm_version}</Pill></Td>
                    <Td className="font-mono text-[12px] text-[var(--muted)]">{p.launch_file}</Td>
                    <Td className="whitespace-nowrap">{formatFileSize(p.file_size)}</Td>
                    <Td className="tabular-nums">{p.course_count}</Td>
                    <Td className="text-[var(--muted)]">{p.uploaded_by_name ?? "—"}</Td>
                    <Td className="whitespace-nowrap text-[var(--muted)]">{formatDate(p.created_at)}</Td>
                    <Td className="text-right">
                      <Link href={`/admin/scorm/${p.id}`} className="text-[13px] font-medium text-[var(--accent)] hover:underline">Inspect</Link>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Card>
        <CardHeader title="Recent SCORM activity" subtitle="Live runtime tracking from learners" />
        <TableWrap>
          <Table className="min-w-[720px]">
            <thead><tr><Th>Learner</Th><Th>Location</Th><Th>Course</Th><Th>Lesson status</Th><Th>Score</Th><Th>Session time</Th><Th>Updated</Th></tr></thead>
            <tbody>
              {activity.map((a, i) => (
                <Tr key={i}>
                  <Td className="font-medium">{a.user_name}</Td>
                  <Td className="text-[var(--muted)]">{a.location_name ?? "—"}</Td>
                  <Td>{a.course_title}</Td>
                  <Td><Pill tone={a.lesson_status === "passed" || a.lesson_status === "completed" ? "success" : "info"}>{a.lesson_status ?? "not attempted"}</Pill></Td>
                  <Td className="tabular-nums">{a.score ? `${Math.round(Number(a.score))}%` : "—"}</Td>
                  <Td>{formatDuration(a.seconds)}</Td>
                  <Td className="whitespace-nowrap text-[var(--muted)]">{formatRelative(a.updated_at)}</Td>
                </Tr>
              ))}
              {activity.length === 0 ? <tr><Td colSpan={7}><EmptyState title="No SCORM activity yet" /></Td></tr> : null}
            </tbody>
          </Table>
        </TableWrap>
      </Card>
    </div>
  );
}
