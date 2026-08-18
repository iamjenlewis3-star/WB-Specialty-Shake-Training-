import Link from "next/link";
import { Plus, Star } from "lucide-react";
import { requirePermission, can } from "@/lib/auth/guard";
import { listCatalog, listCategories } from "@/lib/services/courses";
import { Card, CardBody, EmptyState, PageHeader, Pill, ProgressBar, Table, TableWrap, Td, Th, Tr } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { ClearFilters, FilterSelect, Pagination, SearchInput } from "@/components/ui/interactive";
import { formatDate, completionTone } from "@/lib/utils";

export const metadata = { title: "Courses" };
export const dynamic = "force-dynamic";

export default async function AdminCoursesPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission(["courses.edit", "courses.create"]);
  const sp = await searchParams;
  const [catalog, categories] = await Promise.all([
    listCatalog(user.id, {
      q: sp.q, categoryId: sp.category, type: sp.type, status: sp.status, includeDrafts: true,
      sort: sp.sort, page: Number(sp.page ?? 1), pageSize: 30,
    }),
    listCategories(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Courses"
        description="Build, version and publish every Wahlburgers course. Publishing keeps historical completions unless you require retraining."
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Courses" }]}
        actions={can(user, "courses.create") ? <LinkButton href="/admin/courses/new" variant="primary" size="sm"><Plus size={15} /> New course</LinkButton> : null}
      />

      <Card>
        <CardBody className="flex flex-wrap items-center gap-2">
          <SearchInput placeholder="Search courses…" className="w-full sm:w-72" />
          <FilterSelect paramKey="category" label="Category" allLabel="All categories" options={categories.map((c) => ({ value: c.id, label: c.name }))} />
          <FilterSelect paramKey="status" label="Status" allLabel="All statuses" options={[
            { value: "published", label: "Published" }, { value: "draft", label: "Draft" }, { value: "archived", label: "Archived" },
          ]} />
          <FilterSelect paramKey="type" label="Format" allLabel="All formats" options={[
            { value: "scorm", label: "SCORM" }, { value: "video", label: "Video" }, { value: "document", label: "Document" },
            { value: "blended", label: "Blended" }, { value: "assessment", label: "Assessment" }, { value: "checklist", label: "Checklist" },
          ]} />
          <FilterSelect paramKey="sort" label="Sort" allLabel="A–Z" options={[
            { value: "newest", label: "Newest" }, { value: "popular", label: "Most completed" }, { value: "rating", label: "Highest rated" },
          ]} />
          <ClearFilters keys={["q", "category", "status", "type", "sort"]} />
        </CardBody>
      </Card>

      <Card>
        {catalog.rows.length === 0 ? (
          <EmptyState title="No courses match those filters" />
        ) : (
          <TableWrap>
            <Table className="min-w-[980px]">
              <thead>
                <tr>
                  <Th>Course</Th><Th>Code</Th><Th>Category</Th><Th>Format</Th><Th>Modules</Th><Th>Version</Th>
                  <Th>Status</Th><Th>Completions</Th><Th>Rating</Th><Th>Updated</Th><Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {catalog.rows.map((course) => (
                  <Tr key={course.id}>
                    <Td>
                      <Link href={`/admin/courses/${course.id}`} className="flex items-center gap-2.5 hover:text-[var(--accent)]">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: course.thumbnail_color }} aria-hidden />
                        <span className="font-medium">{course.title}</span>
                      </Link>
                    </Td>
                    <Td className="font-mono text-[12px] text-[var(--muted)]">{course.code}</Td>
                    <Td className="text-[var(--muted)]">{course.category_name ?? "—"}</Td>
                    <Td className="capitalize text-[var(--muted)]">{course.course_type}</Td>
                    <Td className="tabular-nums">{course.module_count}</Td>
                    <Td className="tabular-nums">v{course.current_version}</Td>
                    <Td>
                      <Pill tone={course.status === "published" ? "success" : course.status === "draft" ? "warning" : "neutral"}>
                        {course.status}
                      </Pill>
                    </Td>
                    <Td className="tabular-nums">{course.completion_count.toLocaleString()}</Td>
                    <Td>
                      {Number(course.rating_avg) > 0 ? (
                        <span className="flex items-center gap-1 tabular-nums">
                          <Star size={12} className="text-[var(--wb-gold)]" fill="currentColor" /> {Number(course.rating_avg).toFixed(1)}
                        </span>
                      ) : <span className="text-[var(--muted-2)]">—</span>}
                    </Td>
                    <Td className="whitespace-nowrap text-[var(--muted)]">{formatDate(course.updated_at)}</Td>
                    <Td className="text-right">
                      <LinkButton href={`/admin/courses/${course.id}`} variant="outline" size="sm">Open builder</LinkButton>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
        <Pagination page={catalog.page} pageCount={catalog.pageCount} total={catalog.total} />
      </Card>
    </div>
  );
}
