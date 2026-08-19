import Link from "next/link";
import { Clock, Filter, GraduationCap, Route, Star } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { listCatalog, listCategories, listLearningPaths, learningPathDetail } from "@/lib/services/courses";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Pill, ProgressBar, Table, TableWrap, Td, Th, Tr } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { ClearFilters, FilterSelect, Pagination, SearchInput } from "@/components/ui/interactive";
import { formatDate, cn } from "@/lib/utils";

export const metadata = { title: "Academy Library" };
export const dynamic = "force-dynamic";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const page = Number(sp.page ?? 1);

  const [categories, paths, catalog, path] = await Promise.all([
    listCategories(),
    listLearningPaths(user.id),
    listCatalog(user.id, {
      q: sp.q, categoryId: sp.category, type: sp.type, required: sp.required, myStatus: sp.status,
      certification: sp.certification, maxMinutes: sp.duration ? Number(sp.duration) : undefined,
      minRating: sp.rating ? Number(sp.rating) : undefined, pathId: sp.path, sort: sp.sort, page,
    }),
    sp.path ? learningPathDetail(sp.path, user.id) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Academy Library"
        description="Every published Wahlburgers course — search by role, category, format or certification."
        actions={<LinkButton href="/my-learning" variant="outline" size="sm">My Learning</LinkButton>}
      />

      {path ? (
        <Card>
          <CardHeader
            title={`Learning path: ${path.name}`}
            subtitle={path.description}
            icon={<Route size={17} />}
            action={<LinkButton href="/library" variant="ghost" size="sm">Clear path filter</LinkButton>}
          />
          <TableWrap>
            <Table className="min-w-[560px]">
              <thead><tr><Th>#</Th><Th>Item</Th><Th>Type</Th><Th>Status</Th><Th className="text-right">Action</Th></tr></thead>
              <tbody>
                {path.items.map((item) => (
                  <Tr key={item.id}>
                    <Td className="w-10 tabular-nums text-[var(--muted)]">{item.position}</Td>
                    <Td className="font-medium">{item.course_title ?? item.title}</Td>
                    <Td className="capitalize text-[var(--muted)]">{item.item_type.replace("_", " ")}</Td>
                    <Td>
                      <Pill tone={item.my_status === "completed" ? "success" : item.my_status ? "info" : "neutral"}>
                        {item.my_status ? item.my_status.replace("_", " ") : "Not assigned"}
                      </Pill>
                    </Td>
                    <Td className="text-right">
                      {item.my_enrollment_id ? (
                        <LinkButton href={`/learn/${item.my_enrollment_id}`} variant="outline" size="sm">Open</LinkButton>
                      ) : item.course_id ? (
                        <LinkButton href={`/library/${item.course_id}`} variant="ghost" size="sm">Details</LinkButton>
                      ) : null}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Card>
      ) : null}

      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput placeholder="Search courses…" className="w-full sm:w-80" />
            <FilterSelect paramKey="category" label="Category" allLabel="All categories" options={categories.map((c) => ({ value: c.id, label: `${c.name} (${c.course_count})` }))} />
            <FilterSelect paramKey="type" label="Format" allLabel="All formats" options={[
              { value: "scorm", label: "SCORM" }, { value: "video", label: "Video" }, { value: "document", label: "Document" },
              { value: "blended", label: "Blended" }, { value: "assessment", label: "Assessment" }, { value: "checklist", label: "Checklist" },
            ]} />
            <FilterSelect paramKey="status" label="My status" allLabel="Any status" options={[
              { value: "assigned", label: "Assigned to me" }, { value: "not_started", label: "Not started" },
              { value: "in_progress", label: "In progress" }, { value: "completed", label: "Completed" },
              { value: "overdue", label: "Overdue" },
            ]} />
            <FilterSelect paramKey="required" label="Requirement" allLabel="Required & optional" options={[
              { value: "required", label: "Required" }, { value: "optional", label: "Optional" },
            ]} />
            <FilterSelect paramKey="certification" label="Certification" allLabel="Any" options={[{ value: "yes", label: "Leads to certification" }]} />
            <FilterSelect paramKey="duration" label="Duration" allLabel="Any length" options={[
              { value: "20", label: "20 min or less" }, { value: "45", label: "45 min or less" }, { value: "90", label: "90 min or less" },
            ]} />
            <FilterSelect paramKey="rating" label="Rating" allLabel="Any rating" options={[
              { value: "4", label: "4.0+" }, { value: "4.5", label: "4.5+" },
            ]} />
            <FilterSelect paramKey="sort" label="Sort" allLabel="Sort: A–Z" options={[
              { value: "newest", label: "Newest" }, { value: "rating", label: "Highest rated" },
              { value: "popular", label: "Most completed" }, { value: "duration", label: "Shortest" },
            ]} />
            <ClearFilters keys={["q", "category", "type", "status", "required", "certification", "duration", "rating", "sort", "path"]} />
          </div>
          <p className="flex items-center gap-1.5 text-[12.5px] text-[var(--muted)]">
            <Filter size={13} /> {catalog.total} course{catalog.total === 1 ? "" : "s"} match your filters
          </p>
        </CardBody>
      </Card>

      {catalog.rows.length === 0 ? (
        <Card><EmptyState title="No courses match those filters" description="Try clearing a filter or searching for something broader." /></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {catalog.rows.map((course) => (
            <Link key={course.id} href={`/library/${course.id}`} className="group block">
              <Card className="flex h-full flex-col overflow-hidden transition-shadow hover:shadow-[0_6px_20px_rgba(13,21,38,0.10)]">
                {course.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={course.thumbnail_url} alt="" className="h-20 w-full object-cover" />
                ) : (
                  <div className="h-20" style={{ background: `linear-gradient(135deg, ${course.thumbnail_color}, ${course.category_color ?? "#0e1f38"})` }} />
                )}
                <div className="flex flex-1 flex-col p-4">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    {course.category_name ? <Pill tone="neutral">{course.category_name}</Pill> : null}
                    {course.is_required_default ? <Pill tone="accent">Required</Pill> : null}
                    {course.certification_name ? <Pill tone="success">Certification</Pill> : null}
                  </div>
                  <h3 className="line-clamp-2 text-[14.5px] font-semibold group-hover:text-[var(--accent)]">{course.title}</h3>
                  <p className="mt-1 line-clamp-2 flex-1 text-[12.5px] text-[var(--muted)]">{course.description}</p>
                  <div className="mt-3 flex items-center justify-between text-[11.5px] text-[var(--muted)]">
                    <span className="flex items-center gap-1"><Clock size={12} /> {course.estimated_minutes} min</span>
                    <span className="flex items-center gap-2">
                      {Number(course.rating_avg) > 0 ? (
                        <span className="flex items-center gap-0.5"><Star size={12} className="text-[var(--wb-gold)]" fill="currentColor" /> {Number(course.rating_avg).toFixed(1)}</span>
                      ) : null}
                      <span>{course.module_count} modules</span>
                    </span>
                  </div>
                  {course.my_status ? (
                    <div className="mt-2.5">
                      <ProgressBar
                        value={course.my_status === "completed" ? 100 : course.my_status === "in_progress" ? 50 : 0}
                        tone={course.my_status === "completed" ? "success" : "info"} size="sm"
                      />
                      <p className={cn("mt-1 text-[11.5px]", course.my_status === "completed" ? "text-[var(--success)]" : "text-[var(--muted)]")}>
                        {course.my_status === "completed" ? "Completed" : course.my_status === "in_progress" ? "In progress" : "Assigned to you"}
                        {course.my_due_at ? ` · due ${formatDate(course.my_due_at)}` : ""}
                      </p>
                    </div>
                  ) : null}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Card><Pagination page={catalog.page} pageCount={catalog.pageCount} total={catalog.total} /></Card>

      <Card>
        <CardHeader title="Learning paths" subtitle="Structured curricula that lead to certification" icon={<GraduationCap size={17} />} />
        <CardBody className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {paths.map((p) => (
            <Link key={p.id} href={`/library?path=${p.id}`} className="rounded-xl border border-[var(--border)] p-3.5 hover:border-[var(--accent)]">
              <span className="mb-1.5 flex items-center gap-2 text-[13.5px] font-semibold">
                <span className="size-2.5 rounded-full" style={{ background: p.color }} aria-hidden />
                {p.name}
              </span>
              <p className="line-clamp-2 text-[12px] text-[var(--muted)]">{p.description}</p>
              <p className="mt-2 text-[11.5px] text-[var(--muted-2)]">
                {p.course_count} courses{p.certification_name ? ` · ${p.certification_name}` : ""}
              </p>
              {p.enrolled ? <div className="mt-2"><ProgressBar value={Number(p.progress ?? 0)} tone="info" size="sm" showLabel /></div> : null}
            </Link>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
