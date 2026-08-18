import "server-only";
import { query, queryOne } from "@/lib/db/client";
import { isUuid } from "@/lib/rbac/scope";

/** Asset library and resource library reads. */

export interface AssetRow {
  id: string;
  name: string;
  description: string | null;
  asset_type: string;
  category: string | null;
  tags: string[];
  version: number;
  file_name: string | null;
  file_size: string;
  status: string;
  is_resource: boolean;
  requires_acknowledgment: boolean;
  uploaded_by_name: string | null;
  created_at: string;
  updated_at: string;
  course_count: string;
  acknowledged?: boolean;
}

export async function listAssets(filters: {
  q?: string; type?: string; category?: string; resourcesOnly?: boolean; includeArchived?: boolean; userId?: string;
} = {}): Promise<AssetRow[]> {
  const where: string[] = [filters.includeArchived ? "true" : "a.is_archived = false"];
  const params: unknown[] = [filters.userId ?? null];
  if (filters.resourcesOnly) where.push("a.is_resource = true");
  if (filters.q) { params.push(`%${filters.q}%`); where.push(`(a.name ilike $${params.length} or a.description ilike $${params.length})`); }
  if (filters.type) { params.push(filters.type); where.push(`a.asset_type = $${params.length}`); }
  if (filters.category) { params.push(filters.category); where.push(`a.category = $${params.length}`); }

  return query<AssetRow>(
    `select a.id, a.name, a.description, a.asset_type, a.category, a.tags, a.version, a.file_name,
            a.file_size::text as file_size, a.status, a.is_resource, a.requires_acknowledgment,
            p.full_name as uploaded_by_name, a.created_at, a.updated_at,
            (select count(distinct m.course_id) from course_modules m where m.asset_id = a.id)::text as course_count,
            exists (select 1 from acknowledgments ak where ak.entity_type = 'asset' and ak.entity_id = a.id and ak.user_id = $1) as acknowledged
       from assets a left join v_people p on p.user_id = a.uploaded_by
      where ${where.join(" and ")}
      order by a.name`, params);
}

export async function getAsset(assetId: string) {
  if (!isUuid(assetId)) return null;
  const asset = await queryOne<AssetRow>(
    `select a.id, a.name, a.description, a.asset_type, a.category, a.tags, a.version, a.file_name,
            a.file_size::text as file_size, a.status, a.is_resource, a.requires_acknowledgment,
            p.full_name as uploaded_by_name, a.created_at, a.updated_at,
            (select count(distinct m.course_id) from course_modules m where m.asset_id = a.id)::text as course_count
       from assets a left join v_people p on p.user_id = a.uploaded_by where a.id = $1`, [assetId]);
  if (!asset) return null;
  const versions = await query<{ id: string; version: number; file_name: string | null; file_size: string; notes: string | null; created_at: string; uploaded_by_name: string | null }>(
    `select v.id, v.version, v.file_name, v.file_size::text as file_size, v.notes, v.created_at, p.full_name as uploaded_by_name
       from asset_versions v left join v_people p on p.user_id = v.uploaded_by
      where v.asset_id = $1 order by v.version desc`, [assetId]);
  const courses = await query<{ id: string; title: string }>(
    `select distinct c.id, c.title from course_modules m join courses c on c.id = m.course_id where m.asset_id = $1`, [assetId]);
  const acknowledgments = await query<{ full_name: string; acknowledged_at: string; location_name: string | null }>(
    `select p.full_name, ak.acknowledged_at, p.location_name
       from acknowledgments ak join v_people p on p.user_id = ak.user_id
      where ak.entity_type = 'asset' and ak.entity_id = $1 order by ak.acknowledged_at desc limit 200`, [assetId]);
  return { asset, versions, courses, acknowledgments };
}

export async function assetCategories(): Promise<string[]> {
  const rows = await query<{ category: string }>(
    `select distinct category from assets where category is not null order by category`);
  return rows.map((r) => r.category);
}
