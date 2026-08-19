# Wahlburgers Academy — architecture

This document explains how the platform is put together, why the significant decisions were made,
and where to extend it.

---

## 1. Layers

```
app/                      Next.js App Router — pages (server components) and route handlers
  (auth)/login            Sign-in, forgot password
  (app)/…                 The authenticated product (shell, dashboards, learner, admin)
  api/…                   SCORM delivery + runtime, asset delivery, exports, migration errors, JSON login

src/lib/
  db/                     schema.sql, client (single access point), seed data
  auth/                   password hashing, sessions, guards
  rbac/                   permission catalog, role definitions, access-scope helpers
  services/               ALL business logic and queries
  actions/                "use server" mutations — permission check, delegate to services, audit, revalidate
  assignments/targeting   audience resolution shared by the engine and the seeder
  scorm/                  SCORM archive validation, extraction and manifest parsing

src/components/           Design system, shell, feature components
```

**Rule of thumb:** pages read through services, actions write through services. Nothing queries the
database from a component. That is what makes the same logic reusable by the UI, the export
endpoints and the automated tests.

---

## 2. Database

`src/lib/db/schema.sql` is plain PostgreSQL: ~50 tables covering organization hierarchy, people and
access, content and versioning, SCORM packages, assignments and enrollments, assessments,
certifications and badges, calendar and attendance, engagement, and operations (imports, migrations,
audit, saved and scheduled reports, settings).

Two views carry most reads:

- `v_people` — user + employment + location + franchise group + region + department + role, the
  single source for anything person-shaped.
- `v_transcript` — enrollments joined to courses, which is why Academy training and migrated legacy
  training appear in one stream with nothing more than `source_system` telling them apart.

### Why an embedded PostgreSQL engine

The prototype runs PostgreSQL 18 compiled to WebAssembly (PGlite) against a local data directory.
That keeps `npm install && npm run dev` sufficient to get a fully populated system — no database to
provision — while every query, index, view, constraint, CTE and window function is genuine
PostgreSQL, not a SQLite-flavoured approximation.

Consequences worth knowing:

- The engine owns its data directory exclusively — **one process at a time**.
- It exposes a single connection, so `src/lib/db/client.ts` funnels statements through a FIFO queue
  and recovers by reopening if the engine ever aborts.
- Multi-row inserts are chunked; very large statements overflow the WASM wire buffer.

**Moving to hosted Postgres:** replace the client in `src/lib/db/client.ts` with a `pg` Pool that
exposes the same `query` / `queryOne` / `exec` / `tx` functions. No service, action, page or test
changes. `schema.sql` applies unchanged.

---

## 3. Authorization model

Two independent axes:

1. **Permissions** — what you may do. A flat catalog (`src/lib/rbac/permissions.ts`) bundled into
   roles, persisted to `permissions` / `role_permissions`, with per-user overrides.
2. **Scope** — whose data you may see. Resolved per user from `user_scopes` and `user_locations`
   into an `AccessScope`: organization-wide, a set of restaurants, or self only.

Every service query that touches people, enrollments or locations composes a scope predicate
(`peopleScopeSql`, `locationScopeSql`, `scopedPeopleCte`). A General Manager's dashboard, roster,
reports and exports are all limited by the same predicate, so there is no screen where the wrong
number can appear.

Guards live in `src/lib/auth/guard.ts`:

- `requireUser()` / `requirePermission()` for pages — redirect to `/login` or `/denied`.
- `assertUser()` / `assertPermission()` for actions and route handlers — throw.
- Route handlers additionally re-check ownership (for example, a SCORM commit is rejected unless the
  enrollment belongs to the signed-in learner).

Navigation is filtered by the same permission data purely for tidiness; removing that filter would
change nothing about what a user can reach.

---

## 4. SCORM

Ingestion (`src/lib/scorm/package.ts`) validates before writing anything: ZIP magic bytes, archive
and expanded size limits, entry count, absolute paths, `..` traversal, executable extensions, then
locates and parses `imsmanifest.xml` for the schema version, launch href, identifier and mastery
score. Packages extract to private storage (`storage/scorm/<id>`), never to `public/`.

Delivery is an authenticated route handler that re-resolves the requested path inside the package
directory and refuses anything that escapes it.

Runtime is split deliberately:

- **Browser** (`src/components/learn/scorm-player.tsx`) implements SCORM 1.2 `API` and SCORM 2004
  `API_1484_11` on the window hosting the content iframe — which is exactly what packaged content
  looks for when it walks up `window.parent`. Values are held in memory to satisfy the synchronous
  get/set contract and flushed on commit, on a 30-second timer and on page hide.
- **Server** (`src/lib/services/scorm.ts`) owns interpretation: mapping `lesson_status`,
  `success_status`, `score.raw` / `score.scaled` and session time into module progress, then into
  course completion, certifications and badges.

Because interpretation lives in one service, swapping in a commercial SCORM engine later means
replacing `commitScorm` and the delivery route, not touching the rest of the platform.

---

## 5. Completion engine

`src/lib/services/progress.ts` is the single path to "this training is done":

```
module progress  →  evaluateEnrollment()  →  enrollment completed
                                          →  certification issued (with expiry)
                                          →  learning path progress recalculated
                                          →  badges evaluated
                                          →  learner notified
                                          →  course completion counter updated
```

SCORM commits, assessment submissions, document acknowledgments, checklist submissions, instructor
attendance and manager validation all converge here, so every route to completion produces the same
records and the same dashboard movement.

---

## 6. Migration and imports

`src/lib/services/migration.ts` holds the entire pipeline: parse (CSV/XLSX) → suggest column mapping
from header aliases → validate every row (required fields, date formats, employee matching by
employee ID / email / username / name+location, course matching, duplicate detection) → import →
record every row's outcome → finalize the migration record.

Design decisions that matter for the "we will not lose our history" question:

- Imported completions are written to `enrollments` — the same table new Academy training uses — so
  transcripts, reports and exports include them automatically.
- The original row is also preserved in `historical_completions` for audit.
- Every imported row carries `source_system`, `source_record_id` and `migration_batch_id`.
- Legacy courses with no catalog match keep their original title on the transcript instead of being
  dropped.
- Failed and skipped rows are stored with their reasons and downloadable as CSV.
- Employee status changes never delete records: deactivation, termination and reactivation only
  touch the user row.

The employee importer is the same engine with `data_type = employees`.

---

## 7. Integration adapters

Where a production dependency would normally sit, the platform has a working local implementation
behind a boundary:

| Capability | Today | Production path |
| --- | --- | --- |
| Email / SMS / push notifications | `notifications` rows + in-app centre | Implement a channel adapter; `notify()` payloads already carry channel |
| Scheduled report delivery | Runs the report, notifies recipients with a download link, records the run | Swap the delivery step for an ESP/SFTP adapter |
| SSO | Placeholder on the sign-in screen | Add an identity provider callback that issues the same session |
| SCORM engine | In-house adapter + runtime store | Replace `commitScorm` + delivery route |
| Asset storage | Private local `storage/` served through an authenticated route | Point the route at object storage |

---

## 8. Performance

- Server-side filtering, sorting and pagination — the client never receives a full table.
- Indexes on the hot paths (enrollments by user/course/status/due date, people by location and role,
  audit by time, notifications by user).
- Aggregates computed in SQL (CTEs and filtered aggregates), not in JavaScript.
- Charts receive pre-aggregated series; large tables cap rendered rows and point at exports.
- Dashboards fan out with `Promise.all`, and the database client serializes the resulting statements.

## 9. Security posture

- scrypt password hashing with per-password salts; constant-time comparison.
- Server-side sessions with hashed tokens, expiry, revocation on deactivation, httpOnly/sameSite
  cookies.
- Parameterized SQL everywhere; the few inlined identifiers (scope id lists) are UUID-validated first.
- React escapes all rendered content; no `dangerouslySetInnerHTML` outside the theme bootstrap script.
- Upload validation for SCORM archives and assets (type, extension, size, archive contents, path).
- Untrusted package content is served from private storage through an authenticated handler and
  rendered in a sandboxed iframe.
- Every privileged mutation writes an audit entry with actor, entity, before/after values and IP.
