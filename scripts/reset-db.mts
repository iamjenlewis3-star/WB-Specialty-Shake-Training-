/* Drops the local database directory and rebuilds it (schema + demo data). */
import fs from "node:fs";
import path from "node:path";

const dataDir = process.env.WB_DATA_DIR || path.join(process.cwd(), ".data", "pgdata");
const storageDir = path.join(process.cwd(), "storage", "scorm");

fs.rmSync(dataDir, { recursive: true, force: true });
fs.rmSync(storageDir, { recursive: true, force: true });
console.log(`[reset] removed ${dataDir}`);

const { getDb } = await import("../src/lib/db/client");
const db = await getDb();
const { rows } = await db.query<{ count: string }>("select count(*)::text as count from users");
console.log(`[reset] database rebuilt — ${rows[0].count} users`);
process.exit(0);
