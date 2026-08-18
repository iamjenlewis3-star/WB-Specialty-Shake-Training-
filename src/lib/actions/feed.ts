"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query, queryOne } from "@/lib/db/client";
import { assertPermission, assertUser } from "@/lib/auth/guard";
import { isUuid } from "@/lib/rbac/scope";
import { logAudit } from "@/lib/services/audit";
import { notifyMany } from "@/lib/services/notifications";

/** Academy Feed and announcements. */

export async function createPost(formData: FormData): Promise<void> {
  const user = await assertUser();
  const body = String(formData.get("body") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim() || null;
  const postType = String(formData.get("post_type") ?? "tip");
  const audienceType = String(formData.get("audience_type") ?? "location");
  const audienceId = String(formData.get("audience_id") ?? "");
  const linkUrl = String(formData.get("link_url") ?? "").trim() || null;

  if (body.length < 3) redirect(`/feed?toast=${encodeURIComponent("Write something first.")}&tone=error`);

  // Only feed managers may post to the whole organization.
  const canBroadcast = user.permissions.includes("feed.manage") || user.permissions.includes("announcements.publish");
  const effectiveAudience = audienceType === "organization" && !canBroadcast ? "location" : audienceType;
  const effectiveAudienceId =
    effectiveAudience === "organization" ? user.organizationId :
    effectiveAudience === "location" ? (isUuid(audienceId) ? audienceId : user.locationId) :
    isUuid(audienceId) ? audienceId : null;

  const row = await queryOne<{ id: string }>(
    `insert into social_posts (organization_id, author_user_id, post_type, title, body, link_url, audience_type, audience_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
    [user.organizationId, user.id, postType, title, body, linkUrl, effectiveAudience, effectiveAudienceId]);

  await logAudit(user, { action: "feed.post_created", entityType: "social_post", entityId: row?.id, entityLabel: title ?? body.slice(0, 60) });
  revalidatePath("/feed");
  redirect(`/feed?toast=${encodeURIComponent("Posted to the Academy Feed")}`);
}

export async function reactToPost(postId: string, reaction: "like" | "celebrate" | "helpful"): Promise<void> {
  const user = await assertUser();
  if (!isUuid(postId)) return;
  const existing = await queryOne<{ id: string; reaction_type: string }>(
    `select id, reaction_type from social_reactions where post_id = $1 and user_id = $2`, [postId, user.id]);
  if (existing?.reaction_type === reaction) {
    await query(`delete from social_reactions where id = $1`, [existing.id]);
  } else if (existing) {
    await query(`update social_reactions set reaction_type = $2 where id = $1`, [existing.id, reaction]);
  } else {
    await query(`insert into social_reactions (post_id, user_id, reaction_type) values ($1,$2,$3)
                 on conflict do nothing`, [postId, user.id, reaction]);
  }
  revalidatePath("/feed");
}

export async function toggleBookmark(postId: string): Promise<void> {
  const user = await assertUser();
  if (!isUuid(postId)) return;
  const existing = await queryOne<{ post_id: string }>(
    `select post_id from social_bookmarks where post_id = $1 and user_id = $2`, [postId, user.id]);
  if (existing) await query(`delete from social_bookmarks where post_id = $1 and user_id = $2`, [postId, user.id]);
  else await query(`insert into social_bookmarks (post_id, user_id) values ($1,$2) on conflict do nothing`, [postId, user.id]);
  revalidatePath("/feed");
}

export async function addComment(formData: FormData): Promise<void> {
  const user = await assertUser();
  const postId = String(formData.get("post_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!isUuid(postId) || body.length < 1) return;
  await query(`insert into social_comments (post_id, user_id, body) values ($1,$2,$3)`, [postId, user.id, body.slice(0, 1000)]);
  revalidatePath("/feed");
}

export async function moderateComment(formData: FormData): Promise<void> {
  const user = await assertPermission("feed.moderate");
  const commentId = String(formData.get("comment_id") ?? "");
  if (!isUuid(commentId)) return;
  await query(`update social_comments set status = 'hidden' where id = $1`, [commentId]);
  await logAudit(user, { action: "feed.comment_hidden", entityType: "social_comment", entityId: commentId });
  revalidatePath("/feed");
}

export async function moderatePost(formData: FormData): Promise<void> {
  const user = await assertPermission("feed.manage");
  const postId = String(formData.get("post_id") ?? "");
  const action = String(formData.get("moderation") ?? "");
  if (!isUuid(postId)) return;
  if (action === "pin") await query(`update social_posts set is_pinned = not is_pinned where id = $1`, [postId]);
  if (action === "hide") await query(`update social_posts set status = case when status = 'published' then 'hidden' else 'published' end where id = $1`, [postId]);
  await logAudit(user, { action: `feed.post_${action}`, entityType: "social_post", entityId: postId });
  revalidatePath("/feed");
}

export async function publishAnnouncement(formData: FormData): Promise<void> {
  const user = await assertPermission("announcements.publish");
  const title = String(formData.get("title") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const audienceType = String(formData.get("audience_type") ?? "organization");
  const audienceId = String(formData.get("audience_id") ?? "");
  const linkUrl = String(formData.get("link_url") ?? "").trim() || null;
  const expiresAt = String(formData.get("expires_at") ?? "") || null;
  const isPinned = formData.get("is_pinned") === "on";
  const requiresAck = formData.get("requires_acknowledgment") === "on";
  if (!title || !message) {
    redirect(`/admin/announcements?toast=${encodeURIComponent("Title and message are required.")}&tone=error`);
  }

  const row = await queryOne<{ id: string }>(
    `insert into announcements (organization_id, title, message, link_url, audience_type, audience_id,
        publish_at, expires_at, is_pinned, requires_acknowledgment, status, created_by)
     values ($1,$2,$3,$4,$5,$6, now(), $7, $8, $9, 'published', $10) returning id`,
    [user.organizationId, title, message, linkUrl, audienceType,
      audienceType === "organization" ? user.organizationId : (isUuid(audienceId) ? audienceId : null),
      expiresAt, isPinned, requiresAck, user.id]);

  const audience = await query<{ user_id: string }>(
    `select user_id from v_people where status = 'active' and (
        $1 = 'organization'
        or ($1 = 'location' and primary_location_id = $2::uuid)
        or ($1 = 'franchise_group' and franchise_group_id = $2::uuid)
        or ($1 = 'region' and region_id = $2::uuid)
        or ($1 = 'role' and role_id = $2::uuid)
        or ($1 = 'department' and department_id = $2::uuid))`,
    [audienceType, isUuid(audienceId) ? audienceId : null]);
  await notifyMany(audience.map((a) => a.user_id), {
    type: "announcement", title, body: message.slice(0, 140), link: "/feed",
  });

  await logAudit(user, {
    action: "announcement.published", entityType: "announcement", entityId: row?.id, entityLabel: title,
    newValue: { audienceType, recipients: audience.length, requiresAck },
  });
  revalidatePath("/feed");
  revalidatePath("/admin/announcements");
  redirect(`/admin/announcements?toast=${encodeURIComponent(`Announcement published to ${audience.length} people`)}`);
}

export async function acknowledgeAnnouncement(formData: FormData): Promise<void> {
  const user = await assertUser();
  const announcementId = String(formData.get("announcement_id") ?? "");
  if (!isUuid(announcementId)) return;
  await query(
    `insert into acknowledgments (user_id, entity_type, entity_id, entity_version, statement)
     values ($1, 'announcement', $2, 1, 'I have read and understand this announcement.')
     on conflict (user_id, entity_type, entity_id, entity_version) do update set acknowledged_at = now()`,
    [user.id, announcementId]);
  await logAudit(user, { action: "announcement.acknowledged", entityType: "announcement", entityId: announcementId });
  revalidatePath("/feed");
}
