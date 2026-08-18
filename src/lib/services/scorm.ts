import "server-only";
import { query, queryOne } from "@/lib/db/client";
import { evaluateEnrollment, recordModuleProgress } from "./progress";

/**
 * SCORM runtime data store (the "LMS side" of the SCORM API).
 *
 * The browser-side API adapter keeps CMI values in memory and commits them
 * here; this module owns interpretation — mapping lesson_status / success_status
 * / score into Academy module progress and course completion. Keeping the
 * mapping in one place is what makes it swappable for a commercial SCORM engine.
 */

export interface ScormCmi {
  [key: string]: string | number | undefined;
}

export interface ScormState {
  cmi: ScormCmi;
  lessonStatus: string;
  scoreRaw: number | null;
  totalTimeSeconds: number;
  suspendData: string;
  lessonLocation: string;
  entry: "ab-initio" | "resume";
}

const emptyState = (): ScormState => ({
  cmi: {}, lessonStatus: "not attempted", scoreRaw: null, totalTimeSeconds: 0,
  suspendData: "", lessonLocation: "", entry: "ab-initio",
});

export async function getScormState(enrollmentId: string, moduleId: string): Promise<ScormState> {
  const row = await queryOne<{ data: { scorm?: ScormState } | null; seconds_spent: number }>(
    `select data, seconds_spent from module_progress where enrollment_id = $1 and module_id = $2`,
    [enrollmentId, moduleId]);
  const stored = row?.data?.scorm;
  if (!stored) return emptyState();
  return {
    ...emptyState(),
    ...stored,
    entry: stored.lessonStatus && stored.lessonStatus !== "not attempted" ? "resume" : "ab-initio",
    totalTimeSeconds: row?.seconds_spent ?? stored.totalTimeSeconds ?? 0,
  };
}

/** SCORM `HH:MM:SS(.hh)` timespan → seconds. Also accepts ISO 8601 durations (SCORM 2004). */
export function parseSessionTime(value: string | undefined | null): number {
  if (!value) return 0;
  if (/^PT/i.test(value)) {
    const m = value.match(/PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?/i);
    if (!m) return 0;
    return Math.round(Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0));
  }
  const parts = value.split(":");
  if (parts.length !== 3) return 0;
  return Math.round(Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]));
}

export interface CommitInput {
  enrollmentId: string;
  moduleId: string;
  userId: string;
  cmi: ScormCmi;
  finish?: boolean;
}

export interface CommitResult {
  ok: boolean;
  moduleCompleted: boolean;
  courseCompleted: boolean;
  score: number | null;
  lessonStatus: string;
}

const value = (cmi: ScormCmi, ...keys: string[]): string | undefined => {
  for (const key of keys) {
    const v = cmi[key];
    if (v !== undefined && v !== null && String(v) !== "") return String(v);
  }
  return undefined;
};

/** Persist a SCORM commit and roll the result into Academy progress. */
export async function commitScorm(input: CommitInput): Promise<CommitResult> {
  const owns = await queryOne<{ id: string; module_id: string; passing_score: string | null }>(
    `select e.id, m.id as module_id, coalesce(m.passing_score, c.passing_score)::text as passing_score
       from enrollments e
       join course_modules m on m.id = $2
       left join courses c on c.id = e.course_id
      where e.id = $1 and e.user_id = $3`,
    [input.enrollmentId, input.moduleId, input.userId]);
  if (!owns) return { ok: false, moduleCompleted: false, courseCompleted: false, score: null, lessonStatus: "" };

  const previous = await getScormState(input.enrollmentId, input.moduleId);
  const cmi: ScormCmi = { ...previous.cmi, ...input.cmi };

  const lessonStatus =
    value(cmi, "cmi.core.lesson_status", "cmi.completion_status") ?? previous.lessonStatus;
  const successStatus = value(cmi, "cmi.success_status");
  const rawScore = value(cmi, "cmi.core.score.raw", "cmi.score.raw");
  const scaled = value(cmi, "cmi.score.scaled");
  const score = rawScore !== undefined ? Number(rawScore) : scaled !== undefined ? Math.round(Number(scaled) * 100) : previous.scoreRaw;
  const sessionSeconds = parseSessionTime(value(cmi, "cmi.core.session_time", "cmi.session_time"));
  const suspendData = value(cmi, "cmi.suspend_data") ?? previous.suspendData;
  const lessonLocation = value(cmi, "cmi.core.lesson_location", "cmi.location") ?? previous.lessonLocation;

  const passing = owns.passing_score ? Number(owns.passing_score) : 80;
  const statusPool = [lessonStatus, successStatus].filter(Boolean).map((s) => String(s).toLowerCase());
  const passed = statusPool.includes("passed") || statusPool.includes("completed") ||
    (score !== null && score >= passing && statusPool.includes("completed"));
  const failed = statusPool.includes("failed");
  const moduleCompleted = passed || (score !== null && score >= passing && !failed && statusPool.includes("passed"));

  const state: ScormState = {
    cmi, lessonStatus: String(lessonStatus), scoreRaw: score ?? null,
    totalTimeSeconds: previous.totalTimeSeconds + sessionSeconds,
    suspendData: String(suspendData), lessonLocation: String(lessonLocation),
    entry: "resume",
  };

  await recordModuleProgress({
    enrollmentId: input.enrollmentId,
    moduleId: input.moduleId,
    status: moduleCompleted ? "completed" : failed ? "failed" : "in_progress",
    score: score ?? null,
    secondsDelta: sessionSeconds,
    data: { scorm: state },
  });

  let courseCompleted = false;
  if (moduleCompleted || input.finish) {
    const result = await evaluateEnrollment(input.enrollmentId);
    courseCompleted = result.completed;
  }
  return { ok: true, moduleCompleted, courseCompleted, score: score ?? null, lessonStatus: String(lessonStatus) };
}

export async function listScormPackages() {
  return query<{
    id: string; title: string; identifier: string | null; scorm_version: string; launch_file: string;
    file_size: string; file_name: string | null; status: string; version: number; created_at: string;
    uploaded_by_name: string | null; course_count: string;
  }>(
    `select sp.id, sp.title, sp.identifier, sp.scorm_version, sp.launch_file, sp.file_size::text as file_size,
            sp.file_name, sp.status, sp.version, sp.created_at, p.full_name as uploaded_by_name,
            (select count(distinct m.course_id) from course_modules m where m.scorm_package_id = sp.id)::text as course_count
       from scorm_packages sp left join v_people p on p.user_id = sp.uploaded_by
      order by sp.created_at desc`);
}

export async function getScormPackage(id: string) {
  return queryOne<{
    id: string; title: string; identifier: string | null; scorm_version: string; launch_file: string;
    extract_path: string; manifest_xml: string | null; mastery_score: string | null; file_size: string;
    file_name: string | null; status: string; version: number; created_at: string; uploaded_by_name: string | null;
  }>(
    `select sp.id, sp.title, sp.identifier, sp.scorm_version, sp.launch_file, sp.extract_path, sp.manifest_xml,
            sp.mastery_score::text as mastery_score, sp.file_size::text as file_size, sp.file_name, sp.status,
            sp.version, sp.created_at, p.full_name as uploaded_by_name
       from scorm_packages sp left join v_people p on p.user_id = sp.uploaded_by where sp.id = $1`, [id]);
}

export async function scormActivity(limit = 50) {
  return query<{
    user_name: string; course_title: string | null; lesson_status: string | null; score: string | null;
    seconds: number; updated_at: string; location_name: string | null;
  }>(
    `select p.full_name as user_name, coalesce(c.title, e.course_title) as course_title,
            mp.data->'scorm'->>'lessonStatus' as lesson_status, mp.score::text as score,
            mp.seconds_spent as seconds, mp.updated_at, p.location_name
       from module_progress mp
       join enrollments e on e.id = mp.enrollment_id
       join v_people p on p.user_id = e.user_id
       join course_modules m on m.id = mp.module_id
       left join courses c on c.id = e.course_id
      where m.module_type = 'scorm'
      order by mp.updated_at desc limit $1`, [limit]);
}
