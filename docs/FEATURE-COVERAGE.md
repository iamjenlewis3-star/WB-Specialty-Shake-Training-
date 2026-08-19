# Feature coverage

Requirement-by-requirement map from the brief to where it lives in the platform. Everything listed
is implemented and functional against the database — no decorative screens.

## Platform foundations

| Requirement | Where |
| --- | --- |
| Authentication, remember me, show/hide password, forgot password, SSO placeholder | `/login`, `/login/forgot`, `src/lib/actions/auth.ts` |
| Role-based permission engine (individual, role, location, multi-location, franchise, region, department, corporate) | `src/lib/rbac/`, `user_scopes`, `user_locations`, `user_permission_overrides` |
| Permissions enforced in UI **and** server/database layer | `src/lib/auth/guard.ts`, `peopleScopeSql` / `locationScopeSql` / `scopedPeopleCte` in every service |
| Location-based security (GM, MUO, owner, FBP, corporate, executive read-only, hourly self-only) | `resolveScope()` in `src/lib/auth/session.ts`; verified by the test suite |
| Organization → brand → franchise group → region → location → department → role → employee | `schema.sql`, `/admin/locations`, `/admin/franchise-groups` |
| Custom roles | `roles.is_custom`, `/admin/roles` |
| Dark / light / system themes, persisted per user | `src/components/theme-provider.tsx`, `user_preferences.theme` |
| Mobile experience (bottom navigation, responsive cards, no desktop-only tables) | `src/components/shell/sidebar.tsx` (`MobileNav`), responsive layouts throughout |
| Accessibility (keyboard, focus rings, ARIA, contrast, skip link) | `globals.css`, `layout.tsx`, primitives |
| Audit log with actor, entity, before/after, IP/device | `audit_logs`, `src/lib/services/audit.ts`, `/admin/audit` |

## People

| Requirement | Where |
| --- | --- |
| Employee directory with all specified columns, search, sort, filters, pagination | `/admin/people`, `/team`, `src/lib/services/people.ts` |
| Employee profile (identity, employment, completion, paths, certifications, badges, assessments, transcript, activity) | `/people/[userId]` |
| Employee import (CSV/XLSX, preview, mapping, validation, duplicates, summary) | `/admin/people/import` → migration engine |
| Bulk actions (location, role, department, training, transfer, deactivate, reactivate, remind, export) | `src/components/people/people-table.tsx`, `bulkPeopleAction` |
| Statuses: active, inactive, deactivated, leave of absence, terminated, invited | `users.status` |
| Automatic deactivation rules with flagging, manager/admin notification, reactivation tracking | `/admin/settings`, `runInactivitySweep`, `users.deactivation_*` / `reactivated_*` |
| Training records never deleted on status change | Verified by the test suite ("deactivation preserves every training record") |
| Manager sign-off with meets standard / needs coaching / reassessment required | `recordManagerValidation`, `src/components/people/manager-validation.tsx` |
| Practical skill checks | Checklist modules + manager validation modules, with an optional evidence photo captured on the floor |
| Permanent transcript with source system, printable and exportable | `/people/[userId]/transcript` |

## Content

| Requirement | Where |
| --- | --- |
| Academy Library with categories and the full filter set | `/library` |
| Course page (artwork, objectives, prerequisites, modules, rating, version, progress, start/continue) | `/library/[courseId]`; artwork uploaded on the course builder |
| Drag-and-drop course builder with every module type and per-module rules | `/admin/courses/[courseId]`, `src/components/admin/course-builder.tsx` |
| SCORM 1.2 and 2004: upload, validate, extract, manifest parse, launch config, versioning | `/admin/scorm`, `src/lib/scorm/package.ts` |
| SCORM runtime: completion, success, score, progress, session/total time, bookmarks, suspend data, exit, resume | `src/components/learn/scorm-player.tsx`, `src/lib/services/scorm.ts` |
| SCORM kept modular for a commercial engine later | Interpretation isolated in `commitScorm` + delivery route |
| Course and package versioning with draft/scheduled/published/archived and keep-completions vs require-retraining | `course_versions`, `publishCourse`, `src/components/admin/publish-course.tsx` |
| Asset library: uploads, types, tags, versions, reuse across courses, archiving without erasing history | `/admin/assets`, `assets` / `asset_versions` |
| Resource library with search, filter, preview, download, acknowledgment | `/resources`, `/api/assets/[assetId]/file`, `acknowledgments` |
| Assessments: single, multiple, true/false, matching, ordering, scenario, image; passing score, attempts, randomization, pools, time limit, feedback, retake delay | `/admin/assessments`, `src/lib/services/assessments.ts` |
| Certifications with requirements, validity, manager approval, renewal and expiry reminders | `/admin/certifications`, `issueCertification`, settings |
| Badges and achievement criteria | `/admin/badges`, `evaluateBadges`, `/achievements` |
| Learning paths containing courses, standalone knowledge checks, instructor-led sessions, reference documents, certifications and manager validation, with visual progress | `/admin/learning-paths`, `/library?path=…`, `learning_path_enrollments` |

## Training operations

| Requirement | Where |
| --- | --- |
| Assignment engine across every target type with due dates, grace, priority, recurrence, reminders, certification | `/admin/assignments/new`, `src/lib/services/assignments.ts` |
| Estimated learner population before publishing | Live audience counter (`estimateAssignmentAudience`) |
| Automated assignment rules (new hire, role, location+role, transfer, department) | `/admin/rules`, `applyAutomationRules` |
| Training campaigns with audience, courses, dates and location performance | `/admin/campaigns`, campaign rollups on dashboards |
| Training calendar with month/week/day/agenda and every event type | `/calendar` |
| Store training blocks (protected learning time visible to the learner) | `/calendar/schedule`, `scheduleTrainingBlock` |
| Instructor-led and virtual training with capacity, materials, attendance statuses | `/calendar/new`, `/calendar/[eventId]`, `recordAttendance` |
| Attendance updates applicable training records | `recordAttendance` → `evaluateEnrollment` |
| Announcements with targeting, pinning, expiry and acknowledgment tracking | `/admin/announcements`, `/feed` |
| Notifications centre with the full type list and email/SMS/push architecture | `/notifications`, `/admin/notifications`, `notifications.channel` |
| Profile photos, course artwork and skill-check evidence photos | `/profile`, course builder, manager validation card — validated by `src/lib/uploads/image.ts`, served through `/api/media` |

## Dashboards and analytics

| Requirement | Where |
| --- | --- |
| Learner dashboard (all specified sections) | `/dashboard` → `LearnerDashboard` |
| Manager dashboard with team table and quick actions | `/dashboard` → `ManagerDashboard`, `/team` |
| Franchise Business Partner dashboard with risk thresholds | `/dashboard` → `PortfolioDashboard` |
| Franchise owner dashboard | Same component, franchise-group scope |
| Executive dashboard with the full KPI and chart list plus filters | `/analytics` |
| Academy Command Center | `/command-center` |
| Configurable training health score | `health_score_weights` setting, `locationPerformance()` |
| Leaderboards for locations, franchise groups and learners with configurable scoring that does not reward seat time | `/achievements`, `src/lib/services/leaderboard.ts` |

## Reporting and data ownership

| Requirement | Where |
| --- | --- |
| All 17 standard reports | `src/lib/services/reports.ts`, `/reports` |
| Search, filters, grouping, sorting, saved views | `/reports/[reportKey]`, `saved_reports` |
| Custom report builder | `/reports/builder` |
| Exports: CSV, XLSX, PDF-ready print | `/api/export`, `PrintButton` |
| Exportable entities: employees, training history, certifications, assessment results, locations, assignments, course metadata | Report registry |
| Scheduled reports (daily/weekly/monthly, recipients, filters, format) | `/reports/scheduled` |
| Global search across courses, resources, employees, locations, paths, certifications, announcements, permission-aware | `/search`, `src/lib/services/search.ts` |

## Migration

| Requirement | Where |
| --- | --- |
| Data Migration Center with all counters | `/admin/migration` |
| Supported data types: employees, courses, historical training, assessments, certifications, learning paths | `DATA_TYPES` in `src/lib/services/migration.ts` |
| Wizard: select type → upload → preview → map → match → validate → resolve → preview → import → report | `/admin/migration/[uploadId]`, `/admin/migration/report/[migrationId]` |
| Matching by employee ID, email, username, name + location | `validateRows` |
| Flags duplicates, unknown employees, unknown courses, missing locations, invalid dates, invalid roles, duplicate completions, missing required fields | `validateRows` |
| Resolution options: correct mapping, merge/update, create missing, skip, retry | Wizard options + re-runnable uploads |
| Downloadable error reports | `/api/migration/[migrationId]/errors` |
| `source_system`, `source_record_id`, `migration_batch_id` on every record | `users`, `courses`, `enrollments`, `user_certifications`, `assessment_attempts`, `learning_path_enrollments`, `historical_completions` |
| Legacy and Academy records in one transcript (no separate legacy area) | `v_transcript`, `/people/[userId]/transcript` |
| History survives inactive / terminated employees | Verified by the test suite |

## Engineering

| Requirement | Where |
| --- | --- |
| Normalized PostgreSQL schema with the specified entities | `src/lib/db/schema.sql` |
| Strong TypeScript, modular features, typed services, central authorization, input validation, error handling, environment variables | Throughout; Zod validation in actions |
| Performance: pagination, server-side filtering, indexes, aggregate SQL, lazy loading | Services and schema indexes |
| Demo data: 30–50 locations, 4–8 franchise groups, 250+ employees, regions, roles, 20–30 courses, paths, certifications, assessments, thousands of historical completions, inactive/overdue/new hires/expiring certifications | `src/lib/db/seed.ts` — 45 locations, 7 franchise groups, 446 people, 28 courses, 9,486 enrollments (2,477 migrated), 16,403 module progress records |
| Testing across the listed workflows | `npm test` — 199 assertions; `npm run e2e` — 35 browser assertions |
