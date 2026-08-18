import "server-only";
import { query, queryOne } from "@/lib/db/client";

/** Typed access to the `settings` key/value store (JSONB values). */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await queryOne<{ value: T }>(`select value from settings where key = $1`, [key]);
  return (row?.value as T) ?? fallback;
}

export async function setSetting(key: string, value: unknown, userId?: string | null): Promise<void> {
  await query(
    `insert into settings (key, value, updated_by) values ($1, $2::jsonb, $3)
     on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    [key, JSON.stringify(value), userId ?? null],
  );
}

export async function allSettings(): Promise<Record<string, unknown>> {
  const rows = await query<{ key: string; value: unknown }>(`select key, value from settings order by key`);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export interface InactivityRules {
  enabled: boolean;
  flagAfterDays: number;
  notifyManager: boolean;
  notifyAdmin: boolean;
  autoDeactivate: boolean;
  autoDeactivateAfterDays: number;
}

export const DEFAULT_INACTIVITY: InactivityRules = {
  enabled: true, flagAfterDays: 30, notifyManager: true, notifyAdmin: true,
  autoDeactivate: false, autoDeactivateAfterDays: 60,
};

export interface RiskThresholds { green: number; yellow: number }
export const DEFAULT_THRESHOLDS: RiskThresholds = { green: 90, yellow: 75 };
