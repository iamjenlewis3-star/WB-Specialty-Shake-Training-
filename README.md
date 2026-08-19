# Wahlburgers Academy

A proprietary learning management platform built for Wahlburgers — courses, SCORM, certifications,
assignments, franchise reporting, engagement and a complete Data Migration Center that carries the
existing LMS history across without losing a single record.

This repository is a working, leadership-ready prototype: every screen runs on a real PostgreSQL
database, every workflow writes real records, and the numbers on every dashboard are computed from
those records.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

The first boot creates the database, applies the schema and seeds a complete demonstration system
(45 restaurants, 446 people, 28 courses, 8,000+ training records including 2,400+ migrated legacy
records). It takes about ten seconds, once.

**Run only one process against the database at a time** — the embedded PostgreSQL engine owns its
data directory exclusively. Stop `npm run dev` before running `npm test` or the scripts below.

### Demo accounts

Password for every account: `Academy2026!`

| Persona | Email | What they see |
| --- | --- | --- |
| Corporate Administrator | `admin@wahlburgers.test` | Everything, including migration and settings |
| Corporate Training | `training@wahlburgers.test` | Content, assignments, certifications, reporting |
| Corporate Operations | `ops@wahlburgers.test` | Systemwide operations and reporting |
| Executive Leadership | `exec@wahlburgers.test` | Read-only systemwide analytics |
| Franchise Business Partner | `fbp@wahlburgers.test` | Their portfolio of restaurants |
| Franchise Owner | `owner@wahlburgers.test` | Harborline Restaurant Group |
| General Manager | `gm@wahlburgers.test` | Boston Seaport only |
| Cook (learner) | `cook@wahlburgers.test` | Their own learning |
| Host (learner, new hire) | `host@wahlburgers.test` | Their own learning |

Administrators also have a **Demo role switcher** in the user menu that signs in as any persona for
presentations. It creates a real session for that persona, so every permission and location
restriction shown is genuinely enforced.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | 178-assertion workflow suite against a fresh, isolated database |
| `npm run e2e` | Browser walkthrough of the full demo flow (start the server first) |
| `npm run db:reset` | Rebuild the database and re-seed the demonstration data |
| `npm run db:seed` | Create the database if missing and print row counts |
| `npm run typecheck` | TypeScript, no emit |

---

## What is in the platform

**Learning** — Academy Library with faceted search, course pages, a module player supporting SCORM,
video, documents, policy acknowledgment, checklists, text, external links, assessments and manager
validation. Progress, bookmarks and scores are saved continuously; completion writes to the
transcript, issues certifications and awards badges.

**SCORM 1.2 and SCORM 2004** — Upload and validation (manifest parsing, zip-slip and archive-bomb
protection, executable-content rejection), authenticated content delivery, a full browser-side API
adapter (`API` / `API_1484_11`) and runtime persistence of lesson status, score, session time,
bookmarks, suspend data and exit status. Learners resume exactly where they stopped.

**People and organization** — Organization → brand → franchise group → region → location →
department → role → employee, with employee import, transfers, deactivation/reactivation,
inactivity rules and a complete, permanent training transcript per person.

**Assignments** — Assign a course or a learning path to individuals, roles, departments,
restaurants, franchise groups, regions, new hires or the entire organization, with due dates, grace
periods, priorities, recurrence, reminders and a live audience count before publishing. Automated
rules assign training on hire, on transfer and on role change.

**Reporting** — 17 standard reports, a custom report builder, saved views, scheduled delivery, and
CSV/XLSX/print exports. Every report, chart and export is scoped to the caller's access.

**Dashboards** — Learner, manager, franchise portfolio, franchise owner, corporate and the Academy
Command Center presentation screen, plus executive analytics with location, franchise group, region,
role and department breakdowns.

**Data Migration Center** — Upload CSV/XLSX exports from the legacy LMS for employees, courses,
historical training, assessments, certifications and learning path progress. The wizard previews the
file, auto-maps columns, validates every row, matches employees by employee ID / email / username /
name+location, flags duplicates, unknown employees, unknown courses, missing locations and invalid
dates, then imports with a downloadable error report. Imported records land in the same tables as
new Academy training, stamped with `source_system`, `source_record_id` and `migration_batch_id`, and
appear on the same transcript.

**Engagement and operations** — Training calendar (month/week/day/agenda), instructor-led and
virtual sessions with attendance that completes training records, protected store training blocks,
Academy Feed with targeting/reactions/comments/moderation, announcements with acknowledgment
capture, resource library, badges, configurable leaderboard, notifications and audit logs.

Sample legacy exports for the migration demo live in [`demo-data/`](./demo-data).

---

## Architecture in one page

- **Next.js 15 (App Router) + React 19 + TypeScript**, server components for data, server actions for
  mutations, a small set of client components for interactivity.
- **PostgreSQL** — the schema in [`src/lib/db/schema.sql`](./src/lib/db/schema.sql) is standard
  PostgreSQL (50+ tables, views, indexes). The prototype runs it on an embedded PostgreSQL engine
  (PGlite) persisted to `.data/pgdata`, so there is nothing to install; moving to a hosted
  Postgres/Supabase instance changes one file, `src/lib/db/client.ts`.
- **Authorization** — a permission catalog plus a location-scope model, enforced in the service layer
  on every query (`src/lib/rbac/`, `src/lib/auth/guard.ts`). Hiding a navigation link is never the
  control; unauthorized routes redirect to `/denied` and API routes return 401/403.
- **Services** own all business logic (`src/lib/services/`), actions are thin permission-checked
  wrappers (`src/lib/actions/`), so the same logic backs the UI, the exports and the tests.
- **Tailwind CSS v4** design system with light/dark/system themes, responsive layouts and a mobile
  bottom navigation.

Full detail: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).
Presentation walkthrough: [`docs/DEMO-SCRIPT.md`](./docs/DEMO-SCRIPT.md).
Requirement-by-requirement coverage: [`docs/FEATURE-COVERAGE.md`](./docs/FEATURE-COVERAGE.md).

---

## Testing

```bash
npm test
```

Builds a fresh database and runs 178 assertions across authentication, role permissions,
location-based security, transcripts, SCORM ingestion and runtime, assessment grading and every
question type, image uploads, the completion engine, assignments and automation rules, the employee
lifecycle, data migration, reporting, exports, calendar, engagement and the learner experience.

Security behaviour covered by the suite includes zip-slip rejection, non-ZIP and manifest-less
archive rejection, cross-learner SCORM writes, out-of-scope employee reads, out-of-scope transcript
reads, image uploads disguised by extension or MIME type, and media path traversal.

```bash
npm start          # in one shell
npm run e2e        # in another
```

`npm run e2e` drives a real browser through the leadership demo: sign in, create a course, add a
module, publish it, assign it to a restaurant, sign in as a learner, complete the course, then check
the transcript, the course completion report, the migration wizard, the scheduled maintenance run,
profile photo and course artwork uploads, access denials, dark mode and the mobile layout.

---

## Data and privacy

Every person, restaurant, course and training record in this environment is fictional demonstration
data generated by [`src/lib/db/seed.ts`](./src/lib/db/seed.ts). No real employee information is
stored. The two SCORM archives in the repository root are the real Wahlburgers Specialty Shakes
modules and are ingested through the same validated pipeline the admin upload screen uses.
