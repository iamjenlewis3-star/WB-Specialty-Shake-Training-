import "server-only";
import { query } from "@/lib/db/client";
import type { CurrentUser } from "@/lib/auth/session";
import { isUuid } from "@/lib/rbac/scope";

/**
 * Academy Feed.
 *
 * Audience targeting is evaluated per viewer: organization-wide posts reach
 * everyone, while location / franchise group / region / role / department posts
 * only reach the people they were addressed to.
 */

export interface FeedPost {
  id: string;
  post_type: string;
  title: string | null;
  body: string;
  image_url: string | null;
  link_url: string | null;
  audience_type: string;
  audience_label: string | null;
  is_pinned: boolean;
  status: string;
  created_at: string;
  author_name: string | null;
  author_color: string | null;
  author_role: string | null;
  author_location: string | null;
  likes: string;
  celebrates: string;
  helpfuls: string;
  comment_count: string;
  my_reaction: string | null;
  bookmarked: boolean;
}

function audienceClause(user: CurrentUser, alias = "sp"): string {
  const clauses = [`${alias}.audience_type = 'organization'`];
  if (user.locationId) clauses.push(`(${alias}.audience_type = 'location' and ${alias}.audience_id = '${user.locationId}'::uuid)`);
  if (user.franchiseGroupId) clauses.push(`(${alias}.audience_type = 'franchise_group' and ${alias}.audience_id = '${user.franchiseGroupId}'::uuid)`);
  if (user.regionId) clauses.push(`(${alias}.audience_type = 'region' and ${alias}.audience_id = '${user.regionId}'::uuid)`);
  if (user.roleId) clauses.push(`(${alias}.audience_type = 'role' and ${alias}.audience_id = '${user.roleId}'::uuid)`);
  if (user.departmentId) clauses.push(`(${alias}.audience_type = 'department' and ${alias}.audience_id = '${user.departmentId}'::uuid)`);
  // Corporate roles with organization scope see every post so they can moderate.
  if (user.scope.level === "organization") clauses.push("true");
  return `(${clauses.join(" or ")})`;
}

export async function listFeed(
  user: CurrentUser,
  opts: { limit?: number; type?: string; bookmarked?: boolean; includeHidden?: boolean } = {},
): Promise<FeedPost[]> {
  const where = [audienceClause(user), opts.includeHidden ? "true" : "sp.status = 'published'"];
  const params: unknown[] = [user.id];
  if (opts.type) { params.push(opts.type); where.push(`sp.post_type = $${params.length}`); }
  if (opts.bookmarked) where.push(`exists (select 1 from social_bookmarks b where b.post_id = sp.id and b.user_id = $1)`);

  return query<FeedPost>(`
    select sp.id, sp.post_type, sp.title, sp.body, sp.image_url, sp.link_url, sp.audience_type,
           sp.is_pinned, sp.status, sp.created_at,
           a.full_name as author_name, a.avatar_color as author_color, a.role_name as author_role,
           a.location_name as author_location,
           case sp.audience_type
             when 'organization' then 'Everyone'
             when 'location' then (select name from locations where id = sp.audience_id)
             when 'franchise_group' then (select name from franchise_groups where id = sp.audience_id)
             when 'region' then (select name from regions where id = sp.audience_id)
             when 'role' then (select name from roles where id = sp.audience_id)
             when 'department' then (select name from departments where id = sp.audience_id)
           end as audience_label,
           (select count(*) from social_reactions r where r.post_id = sp.id and r.reaction_type = 'like')::text as likes,
           (select count(*) from social_reactions r where r.post_id = sp.id and r.reaction_type = 'celebrate')::text as celebrates,
           (select count(*) from social_reactions r where r.post_id = sp.id and r.reaction_type = 'helpful')::text as helpfuls,
           (select count(*) from social_comments c where c.post_id = sp.id and c.status = 'published')::text as comment_count,
           (select r.reaction_type from social_reactions r where r.post_id = sp.id and r.user_id = $1 limit 1) as my_reaction,
           exists (select 1 from social_bookmarks b where b.post_id = sp.id and b.user_id = $1) as bookmarked
      from social_posts sp
      left join v_people a on a.user_id = sp.author_user_id
     where ${where.join(" and ")}
     order by sp.is_pinned desc, sp.created_at desc
     limit ${Math.min(100, opts.limit ?? 25)}`, params);
}

export async function listComments(postId: string) {
  if (!isUuid(postId)) return [];
  return query<{ id: string; body: string; created_at: string; author_name: string | null; author_color: string | null; status: string; user_id: string }>(
    `select c.id, c.body, c.created_at, p.full_name as author_name, p.avatar_color as author_color, c.status, c.user_id
       from social_comments c left join v_people p on p.user_id = c.user_id
      where c.post_id = $1 and c.status = 'published'
      order by c.created_at asc`, [postId]);
}

export async function listAnnouncements(user: CurrentUser, opts: { includeExpired?: boolean } = {}) {
  const where = [audienceClause(user, "an"), "an.status = 'published'", "an.publish_at <= now()"];
  if (!opts.includeExpired) where.push("(an.expires_at is null or an.expires_at > now())");
  return query<{
    id: string; title: string; message: string; link_url: string | null; is_pinned: boolean;
    requires_acknowledgment: boolean; publish_at: string; expires_at: string | null;
    acknowledged: boolean; author_name: string | null; ack_count: string;
  }>(`
    select an.id, an.title, an.message, an.link_url, an.is_pinned, an.requires_acknowledgment,
           an.publish_at, an.expires_at, a.full_name as author_name,
           exists (select 1 from acknowledgments ak where ak.entity_type = 'announcement' and ak.entity_id = an.id and ak.user_id = $1) as acknowledged,
           (select count(*) from acknowledgments ak where ak.entity_type = 'announcement' and ak.entity_id = an.id)::text as ack_count
      from announcements an
      left join v_people a on a.user_id = an.created_by
     where ${where.join(" and ")}
     order by an.is_pinned desc, an.publish_at desc`, [user.id]);
}
