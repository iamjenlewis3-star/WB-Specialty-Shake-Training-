import "server-only";
import { query, queryOne } from "@/lib/db/client";
import { isUuid } from "@/lib/rbac/scope";

/** Course catalog reads: Academy Library, course detail pages, course builder. */

export interface CatalogCourse {
  id: string;
  code: string;
  title: string;
  description: string | null;
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  course_type: string;
  thumbnail_color: string;
  thumbnail_url: string | null;
  estimated_minutes: number;
  is_required_default: boolean;
  status: string;
  rating_avg: string;
  rating_count: number;
  completion_count: number;
  current_version: number;
  certification_name: string | null;
  module_count: string;
  my_status: string | null;
  my_enrollment_id: string | null;
  my_due_at: string | null;
  source_system: string;
  updated_at: string;
  owner_name: string | null;
}

export interface CatalogFilters {
  q?: string;
  categoryId?: string;
  type?: string;
  status?: string;
  required?: string;
  myStatus?: string;
  certification?: string;
  maxMinutes?: number;
  minRating?: number;
  pathId?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
  includeDrafts?: boolean;
}

const CATALOG_SELECT = `
  select c.id, c.code, c.title, c.description, c.category_id, cat.name as category_name, cat.color as category_color,
         c.course_type, c.thumbnail_color, c.thumbnail_url, c.estimated_minutes, c.is_required_default, c.status,
         c.rating_avg::text as rating_avg, c.rating_count, c.completion_count, c.current_version,
         cert.name as certification_name, c.source_system, c.updated_at, own.full_name as owner_name,
         (select count(*) from course_modules m where m.course_id = c.id and m.course_version = c.current_version)::text as module_count,
         e.status as my_status, e.id as my_enrollment_id, e.due_at as my_due_at
    from courses c
    left join course_categories cat on cat.id = c.category_id
    left join certifications cert on cert.id = c.certification_id
    left join v_people own on own.user_id = c.owner_user_id
    left join lateral (
      select id, status, due_at from enrollments
       where course_id = c.id and user_id = $1
       order by (status <> 'completed') desc, assigned_at desc limit 1
    ) e on true`;

export async function listCatalog(
  userId: string,
  filters: CatalogFilters = {},
): Promise<{ rows: CatalogCourse[]; total: number; page: number; pageCount: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(60, filters.pageSize ?? 24);
  const where: string[] = [filters.includeDrafts ? "c.status <> 'deleted'" : "c.status = 'published'"];
  const params: unknown[] = [userId];

  if (filters.q) {
    params.push(`%${filters.q}%`);
    where.push(`(c.title ilike $${params.length} or c.description ilike $${params.length} or c.code ilike $${params.length})`);
  }
  if (isUuid(filters.categoryId)) { params.push(filters.categoryId); where.push(`c.category_id = $${params.length}::uuid`); }
  if (filters.type) { params.push(filters.type); where.push(`c.course_type = $${params.length}`); }
  if (filters.status && filters.includeDrafts) { params.push(filters.status); where.push(`c.status = $${params.length}`); }
  if (filters.required === "required") where.push("c.is_required_default");
  if (filters.required === "optional") where.push("not c.is_required_default");
  if (filters.certification === "yes") where.push("c.certification_id is not null");
  if (filters.maxMinutes) where.push(`c.estimated_minutes <= ${Number(filters.maxMinutes)}`);
  if (filters.minRating) where.push(`c.rating_avg >= ${Number(filters.minRating)}`);
  if (isUuid(filters.pathId)) {
    params.push(filters.pathId);
    where.push(`exists (select 1 from learning_path_items i where i.learning_path_id = $${params.length}::uuid and i.course_id = c.id)`);
  }
  switch (filters.myStatus) {
    case "completed": where.push("e.status = 'completed'"); break;
    case "in_progress": where.push("e.status = 'in_progress'"); break;
    case "not_started": where.push("(e.status is null or e.status = 'not_started')"); break;
    case "overdue": where.push("e.status <> 'completed' and e.due_at < now()"); break;
    case "assigned": where.push("e.id is not null"); break;
  }

  const sortMap: Record<string, string> = {
    title: "c.title asc",
    newest: "c.published_at desc nulls last",
    rating: "c.rating_avg desc nulls last",
    popular: "c.completion_count desc",
    duration: "c.estimated_minutes asc",
  };
  const order = sortMap[filters.sort ?? "title"] ?? "c.title asc";

  const totals = await query<{ count: string }>(
    `select count(*)::text as count from courses c left join lateral (select id, status, due_at from enrollments where course_id = c.id and user_id = $1 limit 1) e on true where ${where.join(" and ")}`,
    params);
  const total = Number(totals[0]?.count ?? 0);
  const rows = await query<CatalogCourse>(
    `${CATALOG_SELECT} where ${where.join(" and ")} order by ${order} limit ${pageSize} offset ${(page - 1) * pageSize}`,
    params);
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export interface CourseModule {
  id: string;
  title: string;
  description: string | null;
  module_type: string;
  position: number;
  asset_id: string | null;
  asset_name: string | null;
  asset_type: string | null;
  asset_file_name: string | null;
  scorm_package_id: string | null;
  scorm_version: string | null;
  scorm_launch: string | null;
  assessment_id: string | null;
  assessment_title: string | null;
  passing_score: string | null;
  attempt_limit: number | null;
  content_text: string | null;
  external_url: string | null;
  is_required: boolean;
  min_seconds: number;
  requires_manager_validation: boolean;
  sequence_required: boolean;
  completion_rule: string;
}

export async function courseModules(courseId: string, version: number): Promise<CourseModule[]> {
  if (!isUuid(courseId)) return [];
  return query<CourseModule>(
    `select m.id, m.title, m.description, m.module_type, m.position, m.asset_id, a.name as asset_name,
            a.asset_type, a.file_name as asset_file_name, m.scorm_package_id, sp.scorm_version, sp.launch_file as scorm_launch,
            m.assessment_id, ass.title as assessment_title, m.passing_score::text as passing_score, m.attempt_limit,
            m.content_text, m.external_url, m.is_required, m.min_seconds, m.requires_manager_validation, m.sequence_required, m.completion_rule
       from course_modules m
       left join assets a on a.id = m.asset_id
       left join scorm_packages sp on sp.id = m.scorm_package_id
       left join assessments ass on ass.id = m.assessment_id
      where m.course_id = $1 and m.course_version = $2
      order by m.position`,
    [courseId, version]);
}

export interface CourseDetail extends CatalogCourse {
  objectives: string[];
  prerequisites: string[];
  passing_score: string;
  published_at: string | null;
  tags: string[];
}

export async function getCourse(userId: string, courseId: string): Promise<CourseDetail | null> {
  if (!isUuid(courseId)) return null;
  return queryOne<CourseDetail>(
    `${CATALOG_SELECT.replace("select c.id,", "select c.objectives, c.prerequisites, c.passing_score::text as passing_score, c.published_at, c.tags, c.id,")}
      where c.id = $2`,
    [userId, courseId]);
}

export async function courseVersions(courseId: string) {
  return query<{ id: string; version_number: number; status: string; change_notes: string | null; published_at: string | null; author_name: string | null; requires_retraining: boolean }>(
    `select cv.id, cv.version_number, cv.status, cv.change_notes, cv.published_at, p.full_name as author_name, cv.requires_retraining
       from course_versions cv left join v_people p on p.user_id = cv.author_user_id
      where cv.course_id = $1 order by cv.version_number desc`, [courseId]);
}

export async function courseReviews(courseId: string, limit = 20) {
  return query<{ id: string; rating: number; comments: string | null; created_at: string; author_name: string | null; useful: number | null; relevant: number | null; easy_to_understand: number | null; more_confident: number | null }>(
    `select cr.id, cr.rating, cr.comments, cr.created_at, p.full_name as author_name,
            cr.useful, cr.relevant, cr.easy_to_understand, cr.more_confident
       from course_reviews cr left join v_people p on p.user_id = cr.user_id
      where cr.course_id = $1 order by cr.created_at desc limit $2`, [courseId, limit]);
}

export async function courseReviewSummary(courseId: string) {
  return queryOne<{ avg_rating: string; reviews: string; useful: string; easy: string; relevant: string; confident: string; five: string; four: string; three: string; two: string; one: string }>(
    `select round(avg(rating)::numeric, 2)::text as avg_rating, count(*)::text as reviews,
            round(avg(useful)::numeric, 1)::text as useful, round(avg(easy_to_understand)::numeric, 1)::text as easy,
            round(avg(relevant)::numeric, 1)::text as relevant, round(avg(more_confident)::numeric, 1)::text as confident,
            count(*) filter (where rating = 5)::text as five, count(*) filter (where rating = 4)::text as four,
            count(*) filter (where rating = 3)::text as three, count(*) filter (where rating = 2)::text as two,
            count(*) filter (where rating = 1)::text as one
       from course_reviews where course_id = $1`, [courseId]);
}

export async function listCategories() {
  return query<{ id: string; name: string; slug: string; color: string; course_count: string }>(
    `select cat.id, cat.name, cat.slug, cat.color,
            (select count(*) from courses c where c.category_id = cat.id and c.status = 'published')::text as course_count
       from course_categories cat order by cat.sort_order, cat.name`);
}

export async function listLearningPaths(userId?: string) {
  return query<{
    id: string; name: string; description: string | null; color: string; category: string | null;
    course_count: string; certification_name: string | null; enrolled: boolean; progress: string | null;
  }>(
    `select lp.id, lp.name, lp.description, lp.color, lp.category,
            (select count(*) from learning_path_items i where i.learning_path_id = lp.id and i.item_type = 'course')::text as course_count,
            c.name as certification_name,
            ${userId ? `exists (select 1 from learning_path_enrollments e where e.learning_path_id = lp.id and e.user_id = $1)` : "false"} as enrolled,
            ${userId ? `(select progress::text from learning_path_enrollments e where e.learning_path_id = lp.id and e.user_id = $1)` : "null"} as progress
       from learning_paths lp
       left join certifications c on c.id = lp.certification_id
      where lp.status = 'published'
      order by lp.name`,
    userId ? [userId] : []);
}

export async function learningPathDetail(pathId: string, userId?: string) {
  if (!isUuid(pathId)) return null;
  const path = await queryOne<{ id: string; name: string; description: string | null; color: string; category: string | null; certification_name: string | null }>(
    `select lp.id, lp.name, lp.description, lp.color, lp.category, c.name as certification_name
       from learning_paths lp left join certifications c on c.id = lp.certification_id where lp.id = $1`, [pathId]);
  if (!path) return null;
  const items = await query<{
    id: string; position: number; item_type: string; title: string | null; course_id: string | null;
    course_title: string | null; estimated_minutes: number | null; my_status: string | null; my_enrollment_id: string | null;
  }>(
    `select i.id, i.position, i.item_type, i.title, i.course_id, c.title as course_title, c.estimated_minutes,
            e.status as my_status, e.id as my_enrollment_id
       from learning_path_items i
       left join courses c on c.id = i.course_id
       left join lateral (
         select id, status from enrollments where course_id = i.course_id and user_id = $2 order by assigned_at desc limit 1
       ) e on $2 is not null
      where i.learning_path_id = $1 order by i.position`,
    [pathId, userId ?? null]);
  return { ...path, items };
}
