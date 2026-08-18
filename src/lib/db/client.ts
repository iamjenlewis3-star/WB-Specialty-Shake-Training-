import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

/**
 * Database access layer.
 *
 * The prototype runs a real PostgreSQL engine (PGlite = PostgreSQL compiled to
 * WASM) persisted to disk under `.data/pgdata`, so every query, index, view and
 * constraint in `schema.sql` is genuine PostgreSQL — no SQL dialect shims. To
 * move to a hosted Postgres/Supabase instance, only `getClient()` changes; the
 * `query()` / `tx()` surface used by every service stays the same.
 */

type PgResult<T> = { rows: T[]; affectedRows?: number };

export interface SqlClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<PgResult<T>>;
  exec(sql: string): Promise<unknown>;
}

const DATA_DIR = process.env.WB_DATA_DIR || path.join(process.cwd(), ".data", "pgdata");

declare global {
  // eslint-disable-next-line no-var
  var __wbDb: Promise<PGlite> | undefined;
}

async function createClient(): Promise<PGlite> {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new PGlite(DATA_DIR);
  await db.waitReady;
  await migrate(db);
  return db;
}

async function migrate(db: PGlite) {
  const schemaPath = path.join(process.cwd(), "src", "lib", "db", "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  await db.exec(schema);

  // First boot: populate the demo organization so the prototype is immediately
  // usable (`npm install && npm run dev` yields a fully populated Academy).
  const { rows } = await db.query<{ count: string }>("select count(*)::text as count from organizations");
  if (rows[0]?.count === "0") {
    const { seedDatabase } = await import("./seed");
    await seedDatabase(db as unknown as SqlClient);
  }
}

export function getDb(): Promise<PGlite> {
  if (!globalThis.__wbDb) globalThis.__wbDb = createClient();
  return globalThis.__wbDb;
}

/** Run a parameterized query and return typed rows. */
export async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const db = await getDb();
  const res = await db.query<T>(sql, params as never[]);
  return res.rows as T[];
}

/** Run a query expecting at most one row. */
export async function queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length ? rows[0] : null;
}

/** Execute raw SQL (no parameters, multiple statements allowed). */
export async function exec(sql: string): Promise<void> {
  const db = await getDb();
  await db.exec(sql);
}

/** Run a set of statements inside a transaction. */
export async function tx<T>(fn: (client: SqlClient) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction(async (t) => {
    return fn({
      query: (sql, params) => t.query(sql, (params ?? []) as never[]) as never,
      exec: (sql) => t.exec(sql),
    });
  }) as Promise<T>;
}

/** Helper for building `$1, $2, ...` placeholder lists. */
export function placeholders(count: number, start = 1): string {
  return Array.from({ length: count }, (_, i) => `$${start + i}`).join(", ");
}
