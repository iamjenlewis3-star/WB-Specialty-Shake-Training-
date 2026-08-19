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

/**
 * Single-writer lock.
 *
 * The embedded engine owns its data directory exclusively — two processes
 * opening it concurrently corrupts it. This refuses to start with a clear
 * message instead, and releases the lock when the process exits.
 */
const LOCK_FILE = path.join(DATA_DIR, ".wb-process.lock");

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireLock() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(LOCK_FILE)) {
    const owner = Number(fs.readFileSync(LOCK_FILE, "utf8").trim());
    if (owner && owner !== process.pid && isProcessAlive(owner)) {
      throw new Error(
        `The Wahlburgers Academy database is already in use by process ${owner}. ` +
          `The embedded PostgreSQL engine allows one process at a time — stop the running server ` +
          `(or script) before starting another, or set WB_DATA_DIR to a different directory.`,
      );
    }
  }
  fs.writeFileSync(LOCK_FILE, String(process.pid));
  const release = () => {
    try {
      if (fs.existsSync(LOCK_FILE) && Number(fs.readFileSync(LOCK_FILE, "utf8").trim()) === process.pid) {
        fs.unlinkSync(LOCK_FILE);
      }
    } catch {
      /* best effort */
    }
  };
  process.once("exit", release);
  process.once("SIGINT", () => { release(); process.exit(0); });
  process.once("SIGTERM", () => { release(); process.exit(0); });
}

async function createClient(): Promise<PGlite> {
  acquireLock();
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

/**
 * The embedded engine holds a single connection, so every statement is funneled
 * through a FIFO queue. Concurrent HTTP requests then queue instead of
 * interleaving on one connection (which the WASM build cannot do safely).
 */
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * If the engine ever aborts, drop the cached instance so the next statement
 * re-opens the database from disk rather than failing for the process lifetime.
 */
function handleFatal(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (/Aborted|memory access out of bounds|unreachable/i.test(message)) {
    globalThis.__wbDb = undefined;
  }
  throw error;
}

/** Run a parameterized query and return typed rows. */
export async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return enqueue(async () => {
    try {
      const db = await getDb();
      const res = await db.query<T>(sql, params as never[]);
      return res.rows as T[];
    } catch (error) {
      return handleFatal(error);
    }
  });
}

/** Run a query expecting at most one row. */
export async function queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length ? rows[0] : null;
}

/** Execute raw SQL (no parameters, multiple statements allowed). */
export async function exec(sql: string): Promise<void> {
  return enqueue(async () => {
    try {
      const db = await getDb();
      await db.exec(sql);
    } catch (error) {
      return handleFatal(error);
    }
  });
}

/** Run a set of statements inside a transaction. */
export async function tx<T>(fn: (client: SqlClient) => Promise<T>): Promise<T> {
  return enqueue(async () => {
    try {
      const db = await getDb();
      return (await db.transaction(async (t) => {
        return fn({
          query: (sql, params) => t.query(sql, (params ?? []) as never[]) as never,
          exec: (sql) => t.exec(sql),
        });
      })) as T;
    } catch (error) {
      return handleFatal(error);
    }
  });
}

/** Helper for building `$1, $2, ...` placeholder lists. */
export function placeholders(count: number, start = 1): string {
  return Array.from({ length: count }, (_, i) => `$${start + i}`).join(", ");
}
