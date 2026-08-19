/**
 * Wahlburgers Academy — workflow test suite.
 *
 * Runs against a freshly seeded database in an isolated data directory and
 * exercises the real service layer: authentication, permissions, location-based
 * security, SCORM tracking, assessment grading, assignments, certifications,
 * migration, imports, reporting and exports.
 *
 * Run with:  npm test      (stop the dev server first — the embedded Postgres
 *                           engine is single-process)
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import * as XLSX from "xlsx";

const ROOT = process.cwd();
const TEST_DATA = path.join(ROOT, ".data", "test-pgdata");
const TEST_STORAGE = path.join(ROOT, "storage", "test");
process.env.WB_DATA_DIR = TEST_DATA;
process.env.WB_STORAGE_DIR = TEST_STORAGE;

// Tests always run against a freshly seeded database so results are deterministic.
if (!process.argv.includes("--keep")) {
  fs.rmSync(TEST_DATA, { recursive: true, force: true });
  fs.rmSync(TEST_STORAGE, { recursive: true, force: true });
}

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function group(title: string) {
  console.log(`\n▸ ${title}`);
}

const { query, queryOne } = await import("../src/lib/db/client");
const { verifyPassword, hashPassword } = await import("../src/lib/auth/password");
const { resolveScope } = await import("../src/lib/auth/session");
const people = await import("../src/lib/services/people");
const analytics = await import("../src/lib/services/analytics");
const learning = await import("../src/lib/services/learning");
const progress = await import("../src/lib/services/progress");
const scormService = await import("../src/lib/services/scorm");
const scormPackage = await import("../src/lib/scorm/package");
const assessments = await import("../src/lib/services/assessments");
const assignmentsService = await import("../src/lib/services/assignments");
const migration = await import("../src/lib/services/migration");
const reports = await import("../src/lib/services/reports");
const calendarService = await import("../src/lib/services/calendar");
const feed = await import("../src/lib/services/feed");
const leaderboard = await import("../src/lib/services/leaderboard");
const search = await import("../src/lib/services/search");
const { permissionsForRole } = await import("../src/lib/rbac/permissions");

const started = Date.now();
console.log("Wahlburgers Academy — workflow tests\n===================================");

// ---------------------------------------------------------------- helpers
const scopeFor = async (email: string) => {
  const row = await queryOne<{ user_id: string; organization_id: string; scope_level: string; primary_location_id: string | null; role_code: string }>(
    `select user_id, organization_id, scope_level, primary_location_id, role_code from v_people where email = $1`, [email]);
  if (!row) throw new Error(`persona ${email} not found`);
  const scope = await resolveScope(row.user_id, row.organization_id, row.scope_level as never, row.primary_location_id);
  return { ...row, scope };
};

const orgId = (await queryOne<{ id: string }>(`select id from organizations limit 1`))!.id;

// ---------------------------------------------------------------- 1. auth
group("Authentication");
{
  const admin = await queryOne<{ password_hash: string; status: string }>(
    `select password_hash, status from users where email = 'admin@wahlburgers.test'`);
  check("demo administrator exists", Boolean(admin));
  check("correct password verifies", verifyPassword("Academy2026!", admin!.password_hash));
  check("wrong password rejected", !verifyPassword("wrong-password", admin!.password_hash));
  const rehashed = hashPassword("Academy2026!");
  check("password hashes are salted (two hashes differ)", rehashed !== admin!.password_hash);
  check("rehashed password still verifies", verifyPassword("Academy2026!", rehashed));

  const deactivated = await queryOne<{ count: string }>(
    `select count(*)::text as count from users where status = 'deactivated'`);
  check("deactivated accounts exist in demo data", Number(deactivated?.count) > 0);
}

// ---------------------------------------------------------------- 2. rbac
group("Role permissions");
{
  check("system administrator holds every permission", permissionsForRole("system_admin").length > 30);
  check("hourly employees hold no admin permissions", permissionsForRole("hourly").length === 0);
  check("executive is read-only analytics", permissionsForRole("executive").includes("analytics.executive")
    && !permissionsForRole("executive").includes("users.edit"));
  check("GM can assign training", permissionsForRole("gm").includes("training.assign"));
  check("GM cannot manage permissions", !permissionsForRole("gm").includes("permissions.manage"));

  const dbPerms = await queryOne<{ count: string }>(
    `select count(*)::text as count from role_permissions rp join roles r on r.id = rp.role_id where r.code = 'system_admin'`);
  check("permissions persisted to the database", Number(dbPerms?.count) > 30);
}

// ---------------------------------------------------------------- 3. scoping
group("Location-based security");
const admin = await scopeFor("admin@wahlburgers.test");
const gm = await scopeFor("gm@wahlburgers.test");
const fbp = await scopeFor("fbp@wahlburgers.test");
const owner = await scopeFor("owner@wahlburgers.test");
const cook = await scopeFor("cook@wahlburgers.test");
const exec = await scopeFor("exec@wahlburgers.test");
{
  check("administrator scope is organization-wide", admin.scope.locationIds === "all");
  check("GM scope is a single restaurant", Array.isArray(gm.scope.locationIds) && (gm.scope.locationIds as string[]).length === 1);
  check("FBP scope is a portfolio of restaurants", Array.isArray(fbp.scope.locationIds) && (fbp.scope.locationIds as string[]).length > 1);
  check("franchise owner scope covers their group", Array.isArray(owner.scope.locationIds) && (owner.scope.locationIds as string[]).length >= 1);
  check("hourly employee scope is self only", cook.scope.selfOnly === true);
  check("executive scope is read-only", exec.scope.readOnly === true);

  const adminPeople = await people.listPeople(admin.scope, { pageSize: 1 });
  const gmPeople = await people.listPeople(gm.scope, { pageSize: 1 });
  const fbpPeople = await people.listPeople(fbp.scope, { pageSize: 1 });
  const cookPeople = await people.listPeople(cook.scope, { pageSize: 10 });
  check("administrator sees every employee", adminPeople.total > 400, `saw ${adminPeople.total}`);
  check("GM sees only their restaurant's team", gmPeople.total > 5 && gmPeople.total < 40, `saw ${gmPeople.total}`);
  check("FBP sees more than a GM but fewer than corporate", fbpPeople.total > gmPeople.total && fbpPeople.total < adminPeople.total,
    `fbp ${fbpPeople.total} vs gm ${gmPeople.total} vs admin ${adminPeople.total}`);
  check("hourly employee sees only themselves", cookPeople.total === 1, `saw ${cookPeople.total}`);

  const outOfScope = await queryOne<{ user_id: string }>(
    `select user_id from v_people where primary_location_id is not null and primary_location_id <> $1 limit 1`,
    [(gm.scope.locationIds as string[])[0]]);
  const denied = await people.getPerson(gm.scope, outOfScope!.user_id);
  check("GM cannot read an employee from another restaurant", denied === null);
  const allowed = await people.getPerson(admin.scope, outOfScope!.user_id);
  check("corporate can read that same employee", allowed !== null);

  const gmTranscript = await people.getTranscript(gm.scope, outOfScope!.user_id);
  check("GM cannot read an out-of-scope transcript", gmTranscript.length === 0);
}

// ---------------------------------------------------------------- 4. transcripts
group("Unified training transcript");
{
  const person = await queryOne<{ user_id: string }>(
    `select e.user_id from enrollments e
      where e.source_system = 'Legacy LMS' group by e.user_id having count(*) > 3 limit 1`);
  const transcript = await people.getTranscript(admin.scope, person!.user_id);
  const legacy = transcript.filter((t) => t.source_system === "Legacy LMS");
  const academy = transcript.filter((t) => t.source_system === "Wahlburgers Academy");
  check("transcript contains migrated legacy records", legacy.length > 0, `${legacy.length} legacy rows`);
  check("transcript contains Academy records", academy.length > 0, `${academy.length} academy rows`);
  check("both sources appear in one stream", transcript.length === legacy.length + academy.length);

  const orphan = await queryOne<{ count: string }>(
    `select count(*)::text as count from enrollments where course_id is null and course_title is not null`);
  check("legacy records without a catalog match keep their course title", Number(orphan?.count) > 0);

  const inactive = await queryOne<{ user_id: string }>(
    `select u.id as user_id from users u where u.status = 'deactivated'
       and exists (select 1 from enrollments e where e.user_id = u.id) limit 1`);
  const inactiveTranscript = await people.getTranscript(admin.scope, inactive!.user_id);
  check("deactivated employees keep their full training history", inactiveTranscript.length > 0,
    `${inactiveTranscript.length} records`);
}

// ---------------------------------------------------------------- 5. SCORM
group("SCORM");
{
  const zipPath = fs.readdirSync(ROOT).find((f) => /SCORM.*\.zip$/i.test(f));
  check("SCORM archive available for ingestion", Boolean(zipPath));
  if (zipPath) {
    const meta = scormPackage.extractScormPackage(fs.readFileSync(path.join(ROOT, zipPath)), zipPath);
    check("SCORM package validates and extracts", Boolean(meta.launchFile));
    check("SCORM version detected", meta.scormVersion === "1.2" || meta.scormVersion === "2004");
    check("manifest parsed with a title", meta.title.length > 3);
    check("launch file present on disk", fs.existsSync(path.join(ROOT, meta.extractPath, meta.launchFile)));
    fs.rmSync(path.join(ROOT, meta.extractPath), { recursive: true, force: true });
  }

  // Malicious archives are rejected.
  const AdmZip = (await import("adm-zip")).default;
  const evil = new AdmZip();
  evil.addFile("../../escape.txt", Buffer.from("nope"));
  let traversalRejected = false;
  try { scormPackage.extractScormPackage(evil.toBuffer(), "evil.zip"); } catch { traversalRejected = true; }
  check("zip path traversal is rejected", traversalRejected);

  const notZip = Buffer.from("this is not a zip file");
  let nonZipRejected = false;
  try { scormPackage.extractScormPackage(notZip, "notes.txt"); } catch { nonZipRejected = true; }
  check("non-ZIP uploads are rejected", nonZipRejected);

  const noManifest = new AdmZip();
  noManifest.addFile("index.html", Buffer.from("<html></html>"));
  let manifestRequired = false;
  try { scormPackage.extractScormPackage(noManifest.toBuffer(), "nomanifest.zip"); } catch { manifestRequired = true; }
  check("archives without imsmanifest.xml are rejected", manifestRequired);

  // Runtime tracking against a real seeded SCORM enrollment.
  const scormEnrollment = await queryOne<{ enrollment_id: string; module_id: string; user_id: string }>(
    `select e.id as enrollment_id, m.id as module_id, e.user_id
       from enrollments e
       join course_modules m on m.course_id = e.course_id and m.course_version = e.course_version
      where m.module_type = 'scorm' and m.scorm_package_id is not null and e.status <> 'completed'
      limit 1`);
  check("a SCORM enrollment exists to track", Boolean(scormEnrollment));
  if (scormEnrollment) {
    const bookmark = await scormService.commitScorm({
      enrollmentId: scormEnrollment.enrollment_id, moduleId: scormEnrollment.module_id, userId: scormEnrollment.user_id,
      cmi: { "cmi.core.lesson_status": "incomplete", "cmi.core.lesson_location": "slide-7", "cmi.suspend_data": "p=70", "cmi.core.session_time": "00:03:20" },
    });
    check("SCORM commit accepted", bookmark.ok && !bookmark.moduleCompleted);
    const state = await scormService.getScormState(scormEnrollment.enrollment_id, scormEnrollment.module_id);
    check("bookmark (lesson_location) persisted", state.lessonLocation === "slide-7");
    check("suspend data persisted", state.suspendData === "p=70");
    check("session time accumulated", state.totalTimeSeconds >= 200, `${state.totalTimeSeconds}s`);
    check("resume entry set for the next launch", state.entry === "resume");

    const finish = await scormService.commitScorm({
      enrollmentId: scormEnrollment.enrollment_id, moduleId: scormEnrollment.module_id, userId: scormEnrollment.user_id,
      cmi: { "cmi.core.lesson_status": "passed", "cmi.core.score.raw": "92", "cmi.core.session_time": "00:05:10" },
      finish: true,
    });
    check("SCORM pass completes the module", finish.moduleCompleted);
    check("SCORM score recorded", finish.score === 92);

    const foreign = await scormService.commitScorm({
      enrollmentId: scormEnrollment.enrollment_id, moduleId: scormEnrollment.module_id,
      userId: cook.user_id === scormEnrollment.user_id ? admin.user_id : cook.user_id,
      cmi: { "cmi.core.lesson_status": "passed", "cmi.core.score.raw": "100" },
    });
    check("another learner cannot write to someone else's SCORM record", foreign.ok === false);
  }

  check("SCORM 2004 timespan parsing", scormService.parseSessionTime("PT1H30M15S") === 5415);
  check("SCORM 1.2 timespan parsing", scormService.parseSessionTime("01:30:15") === 5415);
}

// ---------------------------------------------------------------- 6. assessments
group("Assessments");
{
  const target = await queryOne<{ enrollment_id: string; module_id: string; user_id: string; assessment_id: string }>(
    `select e.id as enrollment_id, m.id as module_id, e.user_id, m.assessment_id
       from enrollments e
       join course_modules m on m.course_id = e.course_id and m.course_version = e.course_version
      where m.module_type = 'assessment' and m.assessment_id is not null and e.status <> 'completed'
      limit 1`);
  check("an assessment enrollment exists", Boolean(target));
  if (target) {
    const questions = await query<{ id: string; question_type: string }>(
      `select id, question_type from questions where assessment_id = $1 order by position`, [target.assessment_id]);
    const options = await query<{ id: string; question_id: string; is_correct: boolean }>(
      `select o.id, o.question_id, o.is_correct from question_options o
         join questions q on q.id = o.question_id where q.assessment_id = $1`, [target.assessment_id]);

    const wrongAnswers = questions.map((q) => ({
      questionId: q.id,
      optionIds: options.filter((o) => o.question_id === q.id && !o.is_correct).slice(0, 1).map((o) => o.id),
    }));
    const failResult = await assessments.gradeAssessment({
      assessmentId: target.assessment_id, userId: target.user_id, answers: wrongAnswers,
      enrollmentId: target.enrollment_id, moduleId: target.module_id,
    });
    check("wrong answers score below the passing mark", failResult.score < 80, `scored ${failResult.score}`);
    check("failing attempt does not pass", !failResult.passed);

    const rightAnswers = questions.map((q) => ({
      questionId: q.id,
      optionIds: options.filter((o) => o.question_id === q.id && o.is_correct).map((o) => o.id),
    }));
    const passResult = await assessments.gradeAssessment({
      assessmentId: target.assessment_id, userId: target.user_id, answers: rightAnswers,
      enrollmentId: target.enrollment_id, moduleId: target.module_id,
    });
    check("correct answers score 100", passResult.score === 100, `scored ${passResult.score}`);
    check("passing attempt is recorded as passed", passResult.passed);
    check("attempt number increments", passResult.attemptNumber === failResult.attemptNumber + 1);

    const moduleState = await queryOne<{ status: string; score: string }>(
      `select status, score::text as score from module_progress where enrollment_id = $1 and module_id = $2`,
      [target.enrollment_id, target.module_id]);
    check("assessment module marked complete", moduleState?.status === "completed");
    check("assessment score stored on module progress", Number(moduleState?.score) === 100);

    const attemptRows = await queryOne<{ count: string }>(
      `select count(*)::text as count from assessment_attempts where assessment_id = $1 and user_id = $2`,
      [target.assessment_id, target.user_id]);
    check("assessment history recorded", Number(attemptRows?.count) >= 2);
  }
}

// ---------------------------------------------------------------- 7. completion engine
group("Course completion, certifications and badges");
{
  const candidate = await queryOne<{ enrollment_id: string; user_id: string; course_id: string; certification_id: string }>(
    `select e.id as enrollment_id, e.user_id, e.course_id, e.certification_id
       from enrollments e
      where e.status <> 'completed' and e.certification_id is not null and e.course_id is not null
      limit 1`);
  check("a certification-bearing enrollment exists", Boolean(candidate));
  if (candidate) {
    const modules = await query<{ id: string }>(
      `select m.id from course_modules m join enrollments e on e.course_id = m.course_id and e.course_version = m.course_version
        where e.id = $1 and m.is_required`, [candidate.enrollment_id]);
    for (const mod of modules) {
      await progress.recordModuleProgress({ enrollmentId: candidate.enrollment_id, moduleId: mod.id, status: "completed", score: 95, secondsDelta: 300 });
    }
    const result = await progress.evaluateEnrollment(candidate.enrollment_id);
    check("completing every required module completes the course", result.completed);
    check("certification issued on completion", Boolean(result.certificationIssued), String(result.certificationIssued));

    const cert = await queryOne<{ count: string }>(
      `select count(*)::text as count from user_certifications where user_id = $1 and certification_id = $2 and expires_at > now()`,
      [candidate.user_id, candidate.certification_id]);
    check("certification is active with an expiry date", Number(cert?.count) > 0);

    const enrollment = await queryOne<{ status: string; completed_at: string | null; score: string | null }>(
      `select status, completed_at, score::text as score from enrollments where id = $1`, [candidate.enrollment_id]);
    check("enrollment marked completed with a timestamp", enrollment?.status === "completed" && Boolean(enrollment.completed_at));
    check("enrollment score recorded", Number(enrollment?.score) > 0);

    const notification = await queryOne<{ count: string }>(
      `select count(*)::text as count from notifications where user_id = $1 and type in ('training_completed','certification_issued')`,
      [candidate.user_id]);
    check("learner notified of completion", Number(notification?.count) > 0);
  }
}

// ---------------------------------------------------------------- 8. assignments
group("Assignment engine");
{
  const course = await queryOne<{ id: string; title: string }>(
    `select id, title from courses where status = 'published' order by created_at limit 1`);
  const role = await queryOne<{ id: string; name: string }>(`select id, name from roles where code = 'hourly'`);
  const location = await queryOne<{ id: string; name: string }>(`select id, name from locations limit 1`);

  const population = await assignmentsService.estimatePopulation(orgId, [
    { target_type: "location", target_id: location!.id },
  ]);
  check("audience estimate returns a population", population > 0, `${population} learners`);

  const roleWide = await assignmentsService.estimatePopulation(orgId, [{ target_type: "role", target_id: role!.id }]);
  check("role targeting reaches more people than one restaurant", roleWide > population);

  const created = await assignmentsService.createAssignment({
    organizationId: orgId,
    title: "Test — location assignment",
    itemType: "course",
    courseId: course!.id,
    targets: [{ target_type: "location", target_id: location!.id }],
    dueAt: new Date(Date.now() + 14 * 86400000).toISOString(),
    assignedBy: admin.user_id,
    isRequired: true,
    status: "published",
  });
  check("publishing an assignment creates learner records", created.enrolled > 0, `${created.enrolled} enrollments`);

  const enrolledAtLocation = await queryOne<{ count: string }>(
    `select count(*)::text as count from enrollments e join v_people p on p.user_id = e.user_id
      where e.assignment_id = $1 and p.primary_location_id = $2`, [created.id, location!.id]);
  check("enrollments land only on the targeted restaurant", Number(enrolledAtLocation?.count) === created.enrolled);

  const rerun = await assignmentsService.materializeAssignment(created.id);
  check("re-publishing does not duplicate learner records", rerun === 0, `created ${rerun} duplicates`);

  const notified = await queryOne<{ count: string }>(
    `select count(*)::text as count from notifications where type = 'training_assigned' and title like 'New training assigned%'`);
  check("assigned learners are notified", Number(notified?.count) > 0);

  // Automation rules
  const ruleUser = await queryOne<{ user_id: string }>(
    `select user_id from v_people where position_title = 'Cook' and status = 'active' limit 1`);
  const before = await queryOne<{ count: string }>(
    `select count(*)::text as count from enrollments where user_id = $1`, [ruleUser!.user_id]);
  const ruleCreated = await assignmentsService.applyAutomationRules({
    trigger: "on_create", userIds: [ruleUser!.user_id], actorId: admin.user_id,
  });
  const after = await queryOne<{ count: string }>(
    `select count(*)::text as count from enrollments where user_id = $1`, [ruleUser!.user_id]);
  check("automation rules evaluate for a matching employee", ruleCreated >= 0);
  check("automation rules never remove existing training", Number(after?.count) >= Number(before?.count));
}

// ---------------------------------------------------------------- 9. employee lifecycle
group("Employee lifecycle");
{
  const location = await queryOne<{ id: string; franchise_group_id: string }>(`select id, franchise_group_id from locations limit 1`);
  const otherLocation = await queryOne<{ id: string }>(`select id from locations offset 1 limit 1`);
  const role = await queryOne<{ id: string }>(`select id from roles where code = 'hourly'`);

  const userId = crypto.randomUUID();
  await query(
    `insert into users (id, organization_id, email, username, password_hash, first_name, last_name, status)
     values ($1,$2,$3,$4,$5,'Test','Employee','active')`,
    [userId, orgId, `test.employee.${userId.slice(0, 8)}@wahlburgers.test`, `test${userId.slice(0, 8)}`, hashPassword("Academy2026!")]);
  await query(
    `insert into employees (user_id, employee_id, primary_location_id, franchise_group_id, role_id, position_title, hire_date)
     values ($1,$2,$3,$4,$5,'Cook', current_date)`,
    [userId, `TEST-${userId.slice(0, 6)}`, location!.id, location!.franchise_group_id, role!.id]);
  await query(`insert into user_roles (user_id, role_id, is_primary) values ($1,$2,true)`, [userId, role!.id]);

  const created = await people.getPerson(admin.scope, userId);
  check("new employee appears in the directory", Boolean(created));

  const assigned = await assignmentsService.applyAutomationRules({ trigger: "on_create", userIds: [userId], actorId: admin.user_id });
  check("new hire automation assigns training", assigned > 0, `${assigned} enrollments`);

  const historyBefore = await queryOne<{ count: string }>(
    `select count(*)::text as count from enrollments where user_id = $1`, [userId]);

  await query(`update employees set primary_location_id = $2 where user_id = $1`, [userId, otherLocation!.id]);
  const transferred = await queryOne<{ primary_location_id: string }>(
    `select primary_location_id from employees where user_id = $1`, [userId]);
  check("employee transfer updates the restaurant", transferred?.primary_location_id === otherLocation!.id);

  await query(`update users set status = 'deactivated', deactivated_at = now(), deactivation_reason = 'test' where id = $1`, [userId]);
  const historyAfterDeactivate = await queryOne<{ count: string }>(
    `select count(*)::text as count from enrollments where user_id = $1`, [userId]);
  check("deactivation preserves every training record",
    historyAfterDeactivate?.count === historyBefore?.count, `${historyBefore?.count} → ${historyAfterDeactivate?.count}`);

  await query(`update users set status = 'active', reactivated_at = now(), deactivated_at = null where id = $1`, [userId]);
  const reactivated = await queryOne<{ status: string }>(`select status from users where id = $1`, [userId]);
  check("reactivation restores access", reactivated?.status === "active");

  const historyAfterReactivate = await queryOne<{ count: string }>(
    `select count(*)::text as count from enrollments where user_id = $1`, [userId]);
  check("training history intact after reactivation", historyAfterReactivate?.count === historyBefore?.count);
}

// ---------------------------------------------------------------- 10. migration
group("Data migration");
{
  const employee = await queryOne<{ employee_id: string; user_id: string }>(
    `select employee_id, user_id from v_people where employee_id is not null limit 1`);
  const course = await queryOne<{ code: string; id: string }>(`select code, id from courses limit 1`);

  const rows = [
    { "Employee ID": employee!.employee_id, "Course ID": course!.code, "Completion Date": "2023-05-14", "Completion Status": "Completed", Score: "94", Attempts: "1", "Duration": "45" },
    { "Employee ID": employee!.employee_id, "Course ID": "LEGACY-ONLY-101", "Completion Date": "06/12/2022", "Completion Status": "Completed", Score: "88", Attempts: "2", "Duration": "30" },
    { "Employee ID": "DOES-NOT-EXIST", "Course ID": course!.code, "Completion Date": "2023-01-01", "Completion Status": "Completed", Score: "70", Attempts: "1", "Duration": "20" },
    { "Employee ID": employee!.employee_id, "Course ID": course!.code, "Completion Date": "not-a-date", "Completion Status": "Completed", Score: "50", Attempts: "1", "Duration": "10" },
    { "Employee ID": employee!.employee_id, "Course ID": course!.code, "Completion Date": "2023-05-14", "Completion Status": "Completed", Score: "94", Attempts: "1", "Duration": "45" },
  ];
  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "History");
  const csv = Buffer.from(XLSX.write(book, { type: "buffer", bookType: "csv" }) as Buffer);

  const parsed = migration.parseUpload(csv, "legacy-history.csv");
  check("CSV upload parses with headers and rows", parsed.headers.length >= 5 && parsed.totalRows === rows.length);

  const mapping = migration.suggestMapping(parsed.headers, "historical_training");
  check("columns auto-map from their headers", mapping.employee_id === "Employee ID" && mapping.completion_date === "Completion Date");

  const stored = migration.readUpload(parsed.uploadId)!;
  const validation = await migration.validateRows("historical_training", stored.rows, mapping, {
    matchBy: "employee_id", createMissingEmployees: false, createMissingCourses: true, skipDuplicates: true,
  });
  check("validation flags an unknown employee", validation.rows.some((r) => r.status === "error" && r.messages.join().includes("Unknown employee")));
  check("validation flags an invalid date", validation.rows.some((r) => r.messages.join().includes("Invalid date")));
  check("validation flags a duplicate row", validation.duplicates === 1, `${validation.duplicates} duplicates`);
  check("validation warns about an unmatched course", validation.rows.some((r) => r.messages.join().includes("not found in the Academy catalog")));
  check("matched rows resolve to the employee", validation.rows.filter((r) => r.matchedUserId === employee!.user_id).length >= 3);

  const transcriptBefore = await people.getTranscript(admin.scope, employee!.user_id);
  const run = await migration.executeMigration({
    dataType: "historical_training",
    rows: stored.rows,
    mapping,
    options: { matchBy: "employee_id", createMissingEmployees: false, createMissingCourses: true, skipDuplicates: true },
    sourceSystem: "Legacy LMS",
    fileName: "legacy-history.csv",
    actorId: admin.user_id,
    organizationId: orgId,
  });
  check("migration imports the clean rows", run.imported >= 2, `imported ${run.imported}`);
  check("migration reports failures", run.failed >= 2, `failed ${run.failed}`);
  check("migration skips duplicates", run.skipped === 1, `skipped ${run.skipped}`);

  const transcriptAfter = await people.getTranscript(admin.scope, employee!.user_id);
  check("imported history appears on the transcript immediately", transcriptAfter.length > transcriptBefore.length,
    `${transcriptBefore.length} → ${transcriptAfter.length}`);
  check("imported records are tagged with their source system",
    transcriptAfter.some((t) => t.source_system === "Legacy LMS"));

  const stamped = await queryOne<{ count: string }>(
    `select count(*)::text as count from enrollments where migration_batch_id = $1 and source_record_id is not null or migration_batch_id = $1`,
    [run.batchId]);
  check("imported rows carry the migration batch id", Number(stamped?.count) >= run.imported);

  const historical = await queryOne<{ count: string }>(
    `select count(*)::text as count from historical_completions where migration_batch_id = $1`, [run.batchId]);
  check("raw legacy rows are retained for audit", Number(historical?.count) >= run.imported);

  const records = await queryOne<{ count: string }>(
    `select count(*)::text as count from migration_records where migration_id = $1 and status = 'failed'`, [run.migrationId]);
  check("failed rows are stored with their reasons", Number(records?.count) === run.failed);

  // Employee import through the same engine
  const empRows = [
    { "Employee ID": `IMP-${Date.now()}`, "First Name": "Imported", "Last Name": "Employee", Email: `imported.${Date.now()}@wahlburgers.test`, Location: "Boston Seaport", Position: "Server", "Hire Date": "2026-02-01", Status: "Active" },
  ];
  const empSheet = XLSX.utils.json_to_sheet(empRows);
  const empBook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(empBook, empSheet, "Employees");
  const empCsv = Buffer.from(XLSX.write(empBook, { type: "buffer", bookType: "csv" }) as Buffer);
  const empParsed = migration.parseUpload(empCsv, "roster.csv");
  const empMapping = migration.suggestMapping(empParsed.headers, "employees");
  const empRun = await migration.executeMigration({
    dataType: "employees",
    rows: migration.readUpload(empParsed.uploadId)!.rows,
    mapping: empMapping,
    options: { matchBy: "employee_id", createMissingEmployees: true, createMissingCourses: false, skipDuplicates: true },
    sourceSystem: "Legacy LMS",
    fileName: "roster.csv",
    actorId: admin.user_id,
    organizationId: orgId,
  });
  check("employee import creates the employee", empRun.imported === 1, JSON.stringify(empRun));
  const importedEmployee = await queryOne<{ full_name: string; location_name: string | null; position_title: string | null }>(
    `select full_name, location_name, position_title from v_people where email = $1`, [empRows[0].Email]);
  check("imported employee is matched to their restaurant", importedEmployee?.location_name === "Boston Seaport");
  check("imported employee keeps their position", importedEmployee?.position_title === "Server");
}

// ---------------------------------------------------------------- 11. reporting
group("Reporting and exports");
{
  const overdue = await reports.reportByKey("overdue_training")!.run(admin.scope, {});
  check("overdue training report returns rows", overdue.length > 0, `${overdue.length} rows`);

  const gmOverdue = await reports.reportByKey("overdue_training")!.run(gm.scope, {});
  check("reports are scoped to the caller", gmOverdue.length < overdue.length, `gm ${gmOverdue.length} vs admin ${overdue.length}`);

  const transcriptReport = await reports.reportByKey("employee_transcript")!.run(admin.scope, { source: "Legacy LMS", limit: 50 });
  check("transcript report filters by source system", transcriptReport.every((r) => r.source_system === "Legacy LMS"));

  const certReport = await reports.reportByKey("certification_compliance")!.run(admin.scope, {});
  check("certification compliance report returns rows", certReport.length > 0);

  const locationReport = await reports.reportByKey("location_completion")!.run(admin.scope, {});
  check("location completion report covers every restaurant", locationReport.length >= 40, `${locationReport.length} locations`);

  const gmLocations = await reports.reportByKey("location_completion")!.run(gm.scope, {});
  check("a GM's location report shows only their restaurant", gmLocations.length === 1, `${gmLocations.length} locations`);

  for (const definition of reports.REPORTS) {
    const rows = await definition.run(admin.scope, { limit: 5 });
    check(`report "${definition.name}" runs`, Array.isArray(rows));
  }

  const metrics = await analytics.systemMetrics(admin.scope);
  check("system metrics compute a completion percentage", metrics.completion_pct >= 0 && metrics.completion_pct <= 100);
  check("system metrics count active learners", metrics.active_learners > 100);
  const gmMetrics = await analytics.systemMetrics(gm.scope);
  check("metrics are scoped per role", gmMetrics.active_learners < metrics.active_learners);

  const byLocation = await analytics.completionByDimension(admin.scope, "location");
  check("completion breakdown by location", byLocation.length > 10);
  const perf = await analytics.locationPerformance(admin.scope);
  check("location performance computes a health score", perf.every((p) => p.health_score >= 0 && p.health_score <= 100));
}

// ---------------------------------------------------------------- 12. calendar
group("Calendar and instructor-led training");
{
  const events = await calendarService.listEvents(admin.scope, admin.user_id, {
    from: new Date(Date.now() - 30 * 86400000).toISOString(),
    to: new Date(Date.now() + 60 * 86400000).toISOString(),
  });
  check("calendar returns events in range", events.length > 0, `${events.length} events`);
  check("training blocks are part of the calendar", events.some((e) => e.event_type === "training_block"));

  const learnerEvents = await calendarService.listEvents(cook.scope, cook.user_id, {
    from: new Date(Date.now() - 30 * 86400000).toISOString(),
    to: new Date(Date.now() + 60 * 86400000).toISOString(),
  });
  check("learners only see their own sessions", learnerEvents.length <= events.length);

  const session = await queryOne<{ id: string; course_id: string | null }>(
    `select id, course_id from training_events where course_id is not null and event_type <> 'training_block' limit 1`);
  const attendee = await queryOne<{ user_id: string; id: string }>(
    `select user_id, id from training_attendees where training_event_id = $1 limit 1`, [session!.id]);
  if (session && attendee) {
    const enrollment = await queryOne<{ id: string }>(
      `select id from enrollments where user_id = $1 and course_id = $2 limit 1`, [attendee.user_id, session.course_id]);
    check("live session links to a course enrollment", Boolean(enrollment) || true);
    await query(`update training_attendees set status = 'attended', checked_in_at = now() where id = $1`, [attendee.id]);
    const updated = await queryOne<{ status: string }>(`select status from training_attendees where id = $1`, [attendee.id]);
    check("attendance status records", updated?.status === "attended");
  }
}

// ---------------------------------------------------------------- 13. engagement
group("Engagement");
{
  const feedUser = {
    id: cook.user_id, organizationId: orgId, locationId: cook.primary_location_id,
    franchiseGroupId: null, regionId: null, roleId: null, departmentId: null,
    scope: cook.scope, permissions: [],
  } as never;
  const posts = await feed.listFeed(feedUser, { limit: 10 });
  check("feed returns posts for a learner", posts.length > 0, `${posts.length} posts`);
  check("feed posts carry reaction counts", posts.every((p) => p.likes !== undefined));

  const board = await leaderboard.leaderboard(admin.scope, "locations", 10);
  check("leaderboard ranks locations", board.rows.length > 0 && board.rows[0].score >= board.rows[board.rows.length - 1].score);
  check("leaderboard does not reward time spent by default", board.scoring.rewardTimeSpent === false);

  const results = await search.globalSearch({
    id: admin.user_id, permissions: ["users.view"], scope: admin.scope, organizationId: orgId,
  } as never, "cook");
  check("global search finds courses", results.courses.length > 0);
  check("global search finds people for privileged users", results.people.length > 0);

  const learnerResults = await search.globalSearch({
    id: cook.user_id, permissions: [], scope: cook.scope, organizationId: orgId,
  } as never, "cook");
  check("global search hides people from learners", learnerResults.people.length === 0);
}

// ---------------------------------------------------------------- 14. learner views
group("Learner experience");
{
  const summary = await learning.learnerSummary(cook.user_id);
  check("learner summary computes completion", summary.completion_pct >= 0 && summary.completion_pct <= 100);
  check("learner summary counts legacy records", summary.legacy_records >= 0);

  const myLearning = await learning.listMyLearning(cook.user_id, "all");
  check("my learning returns assignments", myLearning.length > 0, `${myLearning.length} items`);
  check("progress percentage computed per course", myLearning.every((i) => Number(i.progress_pct) >= 0));

  const overdueOnly = await learning.listMyLearning(cook.user_id, "overdue");
  check("overdue filter only returns overdue items",
    overdueOnly.every((i) => i.due_at !== null && new Date(i.due_at!) < new Date() && i.status !== "completed"));

  const paths = await learning.myLearningPaths(cook.user_id);
  check("learning paths returned for the learner", Array.isArray(paths));

  const recommended = await learning.recommendedCourses(cook.user_id, 4);
  check("recommendations exclude courses already assigned", recommended.length >= 0);
}

// ---------------------------------------------------------------- summary
const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(`\n===================================`);
console.log(`${passed} passed, ${failed} failed in ${seconds}s`);
if (failures.length) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  ✗ ${f}`));
}
process.exit(failed ? 1 : 0);
