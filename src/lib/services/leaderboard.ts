import "server-only";
import { query } from "@/lib/db/client";
import type { AccessScope } from "@/lib/rbac/scope";
import { scopedPeopleCte } from "./analytics";
import { getSetting } from "./settings";

/**
 * Academy Leaderboard.
 *
 * Scoring is configurable (Admin → Settings) and deliberately rewards required
 * completion, learning paths, certifications and achievements — never raw time
 * spent sitting in a course.
 */
export interface LeaderboardScoring {
  requiredCompletion: number;
  learningPaths: number;
  certifications: number;
  achievements: number;
  engagement: number;
  rewardTimeSpent: boolean;
}

const DEFAULT_SCORING: LeaderboardScoring = {
  requiredCompletion: 50, learningPaths: 20, certifications: 15, achievements: 10, engagement: 5, rewardTimeSpent: false,
};

export interface LeaderRow {
  id: string;
  name: string;
  subtitle: string | null;
  completion: number;
  paths: number;
  certifications: number;
  badges: number;
  engagement: number;
  score: number;
}

export async function leaderboard(
  scope: AccessScope,
  view: "learners" | "locations" | "franchise_groups" = "learners",
  limit = 25,
): Promise<{ rows: LeaderRow[]; scoring: LeaderboardScoring }> {
  const scoring = await getSetting<LeaderboardScoring>("leaderboard_scoring", DEFAULT_SCORING);

  if (view === "learners") {
    const rows = await query<Record<string, string>>(`
      with ${scopedPeopleCte(scope)}
      select p.user_id as id, p.full_name as name, coalesce(p.location_name, 'Corporate') as subtitle,
             coalesce(round(100.0 * count(e.id) filter (where e.is_required and e.assignment_id is not null and e.status = 'completed')
               / nullif(count(e.id) filter (where e.is_required and e.assignment_id is not null), 0)), 0)::text as completion,
             (select count(*) from learning_path_enrollments lpe where lpe.user_id = p.user_id and lpe.status = 'completed')::text as paths,
             (select count(*) from user_certifications uc where uc.user_id = p.user_id and uc.expires_at > now())::text as certifications,
             (select count(*) from user_badges ub where ub.user_id = p.user_id)::text as badges,
             (case when max(e.last_activity_at) > now() - interval '14 days' then 100 else 40 end)::text as engagement
        from scoped_people p
        left join enrollments e on e.user_id = p.user_id
       where p.status = 'active'
       group by p.user_id, p.full_name, p.location_name
       limit 500`);
    return { rows: rank(rows, scoring, limit), scoring };
  }

  const dimension = view === "locations" ? "p.location_name" : "p.franchise_group_name";
  // Aggregate per person first, then roll up — keeps every column either grouped
  // or aggregated (no correlated subqueries against ungrouped columns).
  const rows = await query<Record<string, string>>(`
    with ${scopedPeopleCte(scope)},
    person_stats as (
      select p.user_id,
             coalesce(${dimension}, 'Unassigned') as bucket,
             count(e.id) filter (where e.is_required and e.assignment_id is not null) as required_total,
             count(e.id) filter (where e.is_required and e.assignment_id is not null and e.status = 'completed') as required_done,
             max(e.last_activity_at) as last_activity,
             (select count(*) from learning_path_enrollments lpe where lpe.user_id = p.user_id and lpe.status = 'completed') as paths,
             (select count(*) from user_certifications uc where uc.user_id = p.user_id and uc.expires_at > now()) as certifications,
             (select count(*) from user_badges ub where ub.user_id = p.user_id) as badges
        from scoped_people p
        left join enrollments e on e.user_id = p.user_id
       where p.status = 'active'
       group by p.user_id, coalesce(${dimension}, 'Unassigned')
    )
    select bucket as id, bucket as name,
           (count(*) || ' employees') as subtitle,
           coalesce(round(100.0 * sum(required_done) / nullif(sum(required_total), 0)), 0)::text as completion,
           sum(paths)::text as paths,
           sum(certifications)::text as certifications,
           sum(badges)::text as badges,
           (case when max(last_activity) > now() - interval '7 days' then 100 else 50 end)::text as engagement
      from person_stats
     group by bucket`);
  return { rows: rank(rows, scoring, limit), scoring };
}

function rank(rows: Array<Record<string, string>>, scoring: LeaderboardScoring, limit: number): LeaderRow[] {
  const maxPaths = Math.max(1, ...rows.map((r) => Number(r.paths)));
  const maxCerts = Math.max(1, ...rows.map((r) => Number(r.certifications)));
  const maxBadges = Math.max(1, ...rows.map((r) => Number(r.badges)));
  return rows
    .map((r) => {
      const completion = Number(r.completion);
      const paths = Number(r.paths);
      const certifications = Number(r.certifications);
      const badges = Number(r.badges);
      const engagement = Number(r.engagement);
      const score =
        (completion / 100) * scoring.requiredCompletion +
        (paths / maxPaths) * scoring.learningPaths +
        (certifications / maxCerts) * scoring.certifications +
        (badges / maxBadges) * scoring.achievements +
        (engagement / 100) * scoring.engagement;
      return {
        id: r.id, name: r.name, subtitle: r.subtitle, completion, paths, certifications, badges, engagement,
        score: Math.round(score * 10) / 10,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
