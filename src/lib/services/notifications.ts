import "server-only";
import { query } from "@/lib/db/client";

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

/**
 * In-app notification center. `channel` is stored on every row so email / SMS /
 * push delivery can be layered on later behind the same write path.
 */
export async function notify(input: {
  userId: string; type: string; title: string; body?: string | null; link?: string | null; channel?: string;
}): Promise<void> {
  await query(
    `insert into notifications (user_id, type, title, body, link, channel) values ($1,$2,$3,$4,$5,$6)`,
    [input.userId, input.type, input.title, input.body ?? null, input.link ?? null, input.channel ?? "in_app"],
  );
}

export async function notifyMany(userIds: string[], input: { type: string; title: string; body?: string; link?: string }): Promise<number> {
  if (!userIds.length) return 0;
  await query(
    `insert into notifications (user_id, type, title, body, link)
     select unnest($1::uuid[]), $2, $3, $4, $5`,
    [userIds, input.type, input.title, input.body ?? null, input.link ?? null],
  );
  return userIds.length;
}

export async function listNotifications(userId: string, limit = 25): Promise<NotificationRow[]> {
  return query<NotificationRow>(
    `select id, type, title, body, link, is_read, created_at
       from notifications where user_id = $1 order by created_at desc limit $2`,
    [userId, limit],
  );
}

export async function unreadCount(userId: string): Promise<number> {
  const rows = await query<{ count: string }>(
    `select count(*)::text as count from notifications where user_id = $1 and is_read = false`, [userId]);
  return Number(rows[0]?.count ?? 0);
}

export async function markRead(userId: string, notificationId?: string): Promise<void> {
  if (notificationId) {
    await query(`update notifications set is_read = true where id = $1 and user_id = $2`, [notificationId, userId]);
  } else {
    await query(`update notifications set is_read = true where user_id = $1`, [userId]);
  }
}
