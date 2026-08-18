/* Builds the database if it does not exist yet (schema + demo data). */
const { getDb } = await import("../src/lib/db/client");
const db = await getDb();
const stats = await db.query<{ label: string; count: string }>(`
  select 'users' as label, count(*)::text as count from users
  union all select 'locations', count(*)::text from locations
  union all select 'courses', count(*)::text from courses
  union all select 'enrollments', count(*)::text from enrollments
  union all select 'legacy records', count(*)::text from enrollments where source_system = 'Legacy LMS'
  union all select 'certifications', count(*)::text from user_certifications`);
console.table(stats.rows);
process.exit(0);
