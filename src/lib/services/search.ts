import "server-only";
import { query } from "@/lib/db/client";
import type { CurrentUser } from "@/lib/auth/session";
import { peopleScopeSql, locationScopeSql } from "@/lib/rbac/scope";

/**
 * Global search across the Academy. Results respect permissions and location
 * scope: a GM never sees employees from another restaurant, and learners only
 * ever match themselves in the people section.
 */
export interface SearchResults {
  courses: Array<{ id: string; title: string; description: string | null; category_name: string | null }>;
  people: Array<{ user_id: string; full_name: string; position_title: string | null; location_name: string | null; avatar_color: string }>;
  resources: Array<{ id: string; name: string; category: string | null; asset_type: string }>;
  locations: Array<{ id: string; name: string; store_number: string; city: string | null; state: string | null }>;
  paths: Array<{ id: string; name: string; description: string | null }>;
  certifications: Array<{ id: string; name: string; description: string | null }>;
  announcements: Array<{ id: string; title: string; message: string }>;
}

export async function globalSearch(user: CurrentUser, term: string): Promise<SearchResults> {
  const q = `%${term}%`;
  const canSeePeople = user.permissions.includes("users.view");

  const [courses, people, resources, locations, paths, certifications, announcements] = await Promise.all([
    query<SearchResults["courses"][number]>(
      `select c.id, c.title, c.description, cat.name as category_name
         from courses c left join course_categories cat on cat.id = c.category_id
        where c.status = 'published' and (c.title ilike $1 or c.description ilike $1 or c.code ilike $1)
        order by c.title limit 8`, [q]),
    canSeePeople
      ? query<SearchResults["people"][number]>(
          `select p.user_id, p.full_name, p.position_title, p.location_name, p.avatar_color
             from v_people p
            where (p.full_name ilike $1 or p.email ilike $1 or p.employee_id ilike $1)
              and (${peopleScopeSql(user.scope, "p.user_id", "p.primary_location_id")})
            order by p.full_name limit 8`, [q])
      : Promise.resolve([]),
    query<SearchResults["resources"][number]>(
      `select id, name, category, asset_type from assets
        where is_resource and not is_archived and (name ilike $1 or description ilike $1)
        order by name limit 6`, [q]),
    user.scope.level === "self"
      ? Promise.resolve([])
      : query<SearchResults["locations"][number]>(
          `select l.id, l.name, l.store_number, l.city, l.state from locations l
            where (l.name ilike $1 or l.store_number ilike $1 or l.city ilike $1)
              and (${locationScopeSql(user.scope, "l.id")})
            order by l.name limit 6`, [q]),
    query<SearchResults["paths"][number]>(
      `select id, name, description from learning_paths where status = 'published' and (name ilike $1 or description ilike $1)
        order by name limit 5`, [q]),
    query<SearchResults["certifications"][number]>(
      `select id, name, description from certifications where status = 'active' and (name ilike $1 or description ilike $1)
        order by name limit 5`, [q]),
    query<SearchResults["announcements"][number]>(
      `select id, title, message from announcements where status = 'published' and (title ilike $1 or message ilike $1)
        order by publish_at desc limit 5`, [q]),
  ]);

  return { courses, people, resources, locations, paths, certifications, announcements };
}
