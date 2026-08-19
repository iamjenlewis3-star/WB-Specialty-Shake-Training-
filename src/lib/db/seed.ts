import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { SqlClient } from "./client";
import { PERMISSIONS, ROLE_DEFINITIONS, permissionsForRole } from "@/lib/rbac/permissions";
import {
  BADGES, CERTIFICATIONS, COURSES, COURSE_CATEGORIES, DEPARTMENTS, FEED_POSTS, FIRST_NAMES,
  FRANCHISE_GROUPS, LAST_NAMES, LEARNING_PATHS, LOCATIONS, POSITIONS, REGIONS, RESOURCES,
  REVIEW_COMMENTS, type SeedCourse,
} from "./seed-data";
import { hashPassword } from "@/lib/auth/password";
import { extractScormPackage } from "@/lib/scorm/package";

/**
 * Demo data generator.
 *
 * Produces a complete, internally consistent Wahlburgers system: organization
 * hierarchy, people, content, SCORM packages, assignments, a migrated legacy
 * training history and the engagement data the dashboards report on.
 * All names, emails and records are fictional.
 */

const DEMO_PASSWORD = "Academy2026!";
const uuid = () => crypto.randomUUID();

/** Deterministic PRNG so every environment seeds the same demo system. */
function makeRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = makeRandom(20260818);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const int = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min;
const chance = (p: number) => rnd() < p;

const NOW = new Date("2026-08-18T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86400000);
const daysAhead = (d: number) => new Date(NOW.getTime() + d * 86400000);
const iso = (d: Date) => d.toISOString();
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Encode JS arrays as Postgres array literals. Multi-row VALUES lists resolve
 * unknown parameter types to text, so array parameters are written in their
 * canonical `{"a","b"}` literal form and cast on assignment.
 */
function encodeParam(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return `{${value
    .map((v) => (v === null || v === undefined ? "NULL" : `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`))
    .join(",")}}`;
}

/** Chunked multi-row insert (stays well under the Postgres parameter limit). */
async function insertMany(
  db: SqlClient,
  table: string,
  columns: string[],
  rows: unknown[][],
  onConflict = "",
): Promise<void> {
  if (!rows.length) return;
  // Keep each statement small: very large multi-row INSERTs (tens of thousands of
  // bind parameters) overflow the wire protocol buffer of the embedded engine.
  const perChunk = Math.max(1, Math.min(400, Math.floor(6000 / columns.length)));
  for (let i = 0; i < rows.length; i += perChunk) {
    const chunk = rows.slice(i, i + perChunk);
    const params: unknown[] = [];
    const values = chunk
      .map((row) => {
        const ph = row.map((value) => {
          params.push(encodeParam(value));
          return `$${params.length}`;
        });
        return `(${ph.join(", ")})`;
      })
      .join(", ");
    await db.query(
      `insert into ${table} (${columns.join(", ")}) values ${values} ${onConflict}`,
      params,
    );
  }
}

export async function seedDatabase(db: SqlClient): Promise<void> {
  const started = Date.now();
  const log = (msg: string) => console.log(`[seed] ${msg}`);

  // ---------------- Organization ----------------
  const orgId = uuid();
  await db.query(`insert into organizations (id, name, slug) values ($1, $2, $3)`, [
    orgId, "Wahlburgers", "wahlburgers",
  ]);

  const brandId = uuid();
  const brandGrillId = uuid();
  await insertMany(db, "brands", ["id", "organization_id", "name", "code"], [
    [brandId, orgId, "Wahlburgers", "WB"],
    [brandGrillId, orgId, "Wahlburgers Grille", "WBG"],
  ]);

  const regionIds = new Map<string, string>();
  await insertMany(db, "regions", ["id", "organization_id", "name", "code"],
    REGIONS.map((r) => { const id = uuid(); regionIds.set(r.code, id); return [id, orgId, r.name, r.code]; }));

  const groupIds = new Map<string, string>();
  await insertMany(db, "franchise_groups",
    ["id", "organization_id", "name", "code", "ownership_type", "principal_name", "contact_email"],
    FRANCHISE_GROUPS.map((g) => {
      const id = uuid(); groupIds.set(g.code, id);
      return [id, orgId, g.name, g.code, g.ownership, g.principal, `${g.code.toLowerCase()}@wahlburgers.test`];
    }));

  const deptIds = new Map<string, string>();
  await insertMany(db, "departments", ["id", "organization_id", "name", "code"],
    DEPARTMENTS.map((d) => { const id = uuid(); deptIds.set(d.code, id); return [id, orgId, d.name, d.code]; }));

  // ---------------- Roles & permissions ----------------
  const permissionIds = new Map<string, string>();
  await insertMany(db, "permissions", ["id", "key", "label", "category", "description"],
    PERMISSIONS.map((p) => {
      const id = uuid(); permissionIds.set(p.key, id);
      return [id, p.key, p.label, p.category, p.label];
    }));

  const roleIds = new Map<string, string>();
  await insertMany(db, "roles",
    ["id", "organization_id", "name", "code", "description", "scope_level", "is_custom", "is_learner_role", "sort_order"],
    ROLE_DEFINITIONS.map((r) => {
      const id = uuid(); roleIds.set(r.code, id);
      return [id, orgId, r.name, r.code, r.description, r.scopeLevel, false, r.isLearnerRole, r.sortOrder];
    }));

  const rolePerms: unknown[][] = [];
  for (const role of ROLE_DEFINITIONS) {
    for (const key of permissionsForRole(role.code)) {
      rolePerms.push([roleIds.get(role.code), permissionIds.get(key)]);
    }
  }
  await insertMany(db, "role_permissions", ["role_id", "permission_id"], rolePerms, "on conflict do nothing");
  log("organization, roles and permissions created");

  // ---------------- Locations ----------------
  const locationIds: string[] = [];
  const locationByStore = new Map<string, string>();
  const locationRows = LOCATIONS.map((l, i) => {
    const id = uuid();
    locationIds.push(id);
    locationByStore.set(l.store, id);
    return [
      id, orgId, i % 9 === 8 ? brandGrillId : brandId, groupIds.get(l.group), regionIds.get(l.region),
      l.store, l.name, l.ownership, `${100 + i} Harbor Street`, l.city, l.state,
      String(10000 + i * 137).slice(0, 5), `(617) 555-${String(1000 + i).slice(-4)}`,
      "America/New_York", "active", isoDate(daysAgo(int(400, 2600))),
    ];
  });
  await insertMany(db, "locations",
    ["id", "organization_id", "brand_id", "franchise_group_id", "region_id", "store_number", "name",
      "ownership_type", "address_line1", "city", "state", "postal_code", "phone", "timezone", "status", "opened_on"],
    locationRows);
  log(`${locationIds.length} locations created`);

  // ---------------- People ----------------
  interface PersonSeed {
    userId: string; employeeRowId: string; employeeId: string; first: string; last: string;
    email: string; username: string; roleCode: string; positionTitle: string; deptCode: string;
    locationId: string | null; groupCode: string; status: string; hireDate: Date; lastLogin: Date | null;
    managerUserId: string | null; isNewHire: boolean; sourceSystem: string;
  }
  const people: PersonSeed[] = [];
  const usedEmails = new Set<string>();
  const passwordHash = hashPassword(DEMO_PASSWORD);
  let employeeSeq = 10000;

  function makeEmail(first: string, last: string) {
    const base = `${first.toLowerCase()}.${last.toLowerCase()}`.replace(/[^a-z.]/g, "");
    let email = `${base}@wahlburgers.test`;
    let n = 2;
    while (usedEmails.has(email)) email = `${base}${n++}@wahlburgers.test`;
    usedEmails.add(email);
    return email;
  }

  function addPerson(opts: Partial<PersonSeed> & { first: string; last: string; roleCode: string }): PersonSeed {
    const email = opts.email && !usedEmails.has(opts.email) ? opts.email : makeEmail(opts.first, opts.last);
    usedEmails.add(email);
    const person: PersonSeed = {
      userId: opts.userId ?? uuid(),
      employeeRowId: uuid(),
      employeeId: opts.employeeId ?? `WB${employeeSeq++}`,
      first: opts.first,
      last: opts.last,
      email,
      username: email.split("@")[0],
      roleCode: opts.roleCode,
      positionTitle: opts.positionTitle ?? "Team Member",
      deptCode: opts.deptCode ?? "FOH",
      locationId: opts.locationId ?? null,
      groupCode: opts.groupCode ?? "CORP",
      status: opts.status ?? "active",
      hireDate: opts.hireDate ?? daysAgo(int(60, 1500)),
      lastLogin: opts.lastLogin === undefined ? daysAgo(int(0, 20)) : opts.lastLogin,
      managerUserId: opts.managerUserId ?? null,
      isNewHire: opts.isNewHire ?? false,
      sourceSystem: opts.sourceSystem ?? "Legacy LMS",
    };
    people.push(person);
    return person;
  }

  // Demo personas used for the leadership presentation.
  const admin = addPerson({ first: "Dana", last: "Whitfield", roleCode: "system_admin", email: "admin@wahlburgers.test",
    positionTitle: "Director, Learning Technology", deptCode: "CORP", hireDate: daysAgo(1800), lastLogin: daysAgo(0) });
  const training = addPerson({ first: "Marcus", last: "Ellery", roleCode: "corp_training", email: "training@wahlburgers.test",
    positionTitle: "Director of Training", deptCode: "TRN", hireDate: daysAgo(1500), lastLogin: daysAgo(0) });
  const corpOps = addPerson({ first: "Priya", last: "Raman", roleCode: "corp_ops", email: "ops@wahlburgers.test",
    positionTitle: "VP Operations Services", deptCode: "CORP", hireDate: daysAgo(2000), lastLogin: daysAgo(1) });
  const exec = addPerson({ first: "Alan", last: "Brookings", roleCode: "executive", email: "exec@wahlburgers.test",
    positionTitle: "Chief Operating Officer", deptCode: "CORP", hireDate: daysAgo(2400), lastLogin: daysAgo(2) });
  const fbp = addPerson({ first: "Renee", last: "Caldwell", roleCode: "fbp", email: "fbp@wahlburgers.test",
    positionTitle: "Franchise Business Partner", deptCode: "CORP", hireDate: daysAgo(1200), lastLogin: daysAgo(1) });
  const owner = addPerson({ first: "Victor", last: "Salazar", roleCode: "franchise_owner", email: "owner@wahlburgers.test",
    positionTitle: "Franchise Owner, Harborline Restaurant Group", deptCode: "MGMT", groupCode: "HRB",
    hireDate: daysAgo(2200), lastLogin: daysAgo(3) });

  // Additional corporate trainers and FBPs.
  const extraFbps = [
    addPerson({ first: "Trevor", last: "Nakamura", roleCode: "fbp", positionTitle: "Franchise Business Partner", deptCode: "CORP" }),
    addPerson({ first: "Simone", last: "Adeyemi", roleCode: "fbp", positionTitle: "Franchise Business Partner", deptCode: "CORP" }),
  ];
  const extraOwners = FRANCHISE_GROUPS.filter((g) => g.code !== "CORP" && g.code !== "HRB").map((g) =>
    addPerson({
      first: g.principal.split(" ")[0], last: g.principal.split(" ")[1] ?? "Partner", roleCode: "franchise_owner",
      positionTitle: `Franchise Owner, ${g.name}`, deptCode: "MGMT", groupCode: g.code, hireDate: daysAgo(int(900, 2400)),
    }));

  // Store teams.
  const flagshipId = locationByStore.get("1001")!;
  const gmByLocation = new Map<string, PersonSeed>();
  const teamByLocation = new Map<string, PersonSeed[]>();

  LOCATIONS.forEach((loc, index) => {
    const locationId = locationByStore.get(loc.store)!;
    const team: PersonSeed[] = [];
    const isFlagship = loc.store === "1001";

    const gm = isFlagship
      ? addPerson({ first: "Kayla", last: "Nguyen", roleCode: "gm", email: "gm@wahlburgers.test",
          positionTitle: "General Manager", deptCode: "MGMT", locationId, groupCode: loc.group,
          hireDate: daysAgo(900), lastLogin: daysAgo(0) })
      : addPerson({ first: pick(FIRST_NAMES), last: pick(LAST_NAMES), roleCode: "gm",
          positionTitle: "General Manager", deptCode: "MGMT", locationId, groupCode: loc.group,
          hireDate: daysAgo(int(200, 2000)), lastLogin: chance(0.9) ? daysAgo(int(0, 12)) : daysAgo(int(35, 80)) });
    gmByLocation.set(locationId, gm);
    team.push(gm);

    const teamSize = isFlagship ? 16 : int(5, 12);
    for (let i = 0; i < teamSize; i++) {
      // Weighted position selection keeps the org chart realistic.
      const bucket: string[] = [];
      POSITIONS.forEach((p) => { for (let w = 0; w < p.weight; w++) bucket.push(p.title); });
      const title = pick(bucket);
      const position = POSITIONS.find((p) => p.title === title)!;
      const isNewHire = chance(0.14);
      const hireDate = isNewHire ? daysAgo(int(1, 55)) : daysAgo(int(70, 2000));
      const dormant = chance(0.09);
      const status = dormant && chance(0.35) ? "deactivated" : chance(0.04) ? "leave_of_absence" : "active";
      const lastLogin = status === "deactivated"
        ? daysAgo(int(60, 160))
        : dormant ? daysAgo(int(32, 95)) : chance(0.05) ? null : daysAgo(int(0, 25));

      const person = addPerson({
        first: pick(FIRST_NAMES), last: pick(LAST_NAMES), roleCode: position.role, positionTitle: title,
        deptCode: position.dept, locationId, groupCode: loc.group, hireDate, lastLogin,
        managerUserId: gm.userId, isNewHire, status,
      });
      team.push(person);
    }
    teamByLocation.set(locationId, team);
    if (index === 0) {
      // Guaranteed learner personas at the flagship for the demo script.
      const cook = addPerson({ first: "Diego", last: "Herrera", roleCode: "hourly", email: "cook@wahlburgers.test",
        positionTitle: "Cook", deptCode: "BOH", locationId: flagshipId, groupCode: loc.group,
        hireDate: daysAgo(120), lastLogin: daysAgo(0), managerUserId: gm.userId });
      const host = addPerson({ first: "Amara", last: "Johnson", roleCode: "hourly", email: "host@wahlburgers.test",
        positionTitle: "Host", deptCode: "FOH", locationId: flagshipId, groupCode: loc.group,
        hireDate: daysAgo(28), lastLogin: daysAgo(1), managerUserId: gm.userId, isNewHire: true });
      team.push(cook, host);
      teamByLocation.set(flagshipId, team);
    }
  });

  const userRows = people.map((p) => [
    p.userId, orgId, p.email, p.username, passwordHash, p.first, p.last, null,
    `#${["0e1f38", "c8102e", "14866d", "7c53c3", "1e5fbf", "a4620a", "3f7fa6"][Math.floor(rnd() * 7)]}`,
    p.status, p.lastLogin ? iso(p.lastLogin) : null,
    p.status === "deactivated" ? iso(daysAgo(int(10, 60))) : null,
    p.status === "deactivated" ? "Inactive for 30+ days" : null,
    p.status === "deactivated" ? "inactivity_rule" : null,
    p.sourceSystem, `LEG-${p.employeeId}`,
  ]);
  await insertMany(db, "users",
    ["id", "organization_id", "email", "username", "password_hash", "first_name", "last_name", "preferred_name",
      "avatar_color", "status", "last_login_at", "deactivated_at", "deactivation_reason", "deactivation_trigger",
      "source_system", "source_record_id"],
    userRows);

  await insertMany(db, "employees",
    ["id", "user_id", "employee_id", "primary_location_id", "franchise_group_id", "department_id", "role_id",
      "position_title", "manager_user_id", "hire_date", "employment_type"],
    people.map((p) => [
      p.employeeRowId, p.userId, p.employeeId, p.locationId, groupIds.get(p.groupCode) ?? null,
      deptIds.get(p.deptCode) ?? null, roleIds.get(p.roleCode), p.positionTitle, p.managerUserId,
      isoDate(p.hireDate), ["system_admin", "corp_training", "corp_ops", "executive", "fbp"].includes(p.roleCode)
        ? "Corporate" : ["gm", "agm", "training_manager", "dept_manager", "franchise_owner"].includes(p.roleCode)
        ? "Salaried" : "Hourly",
    ]));

  await insertMany(db, "user_roles", ["user_id", "role_id", "is_primary"],
    people.map((p) => [p.userId, roleIds.get(p.roleCode), true]));

  await insertMany(db, "user_preferences", ["user_id", "theme"], people.map((p) => [p.userId, "system"]));

  // Access scopes: corporate = organization; owners = their franchise group;
  // FBPs = an explicit portfolio of restaurants; store leaders = their restaurant.
  const scopeRows: unknown[][] = [];
  const userLocationRows: unknown[][] = [];
  for (const p of people) {
    const def = ROLE_DEFINITIONS.find((r) => r.code === p.roleCode)!;
    if (def.scopeLevel === "organization") {
      scopeRows.push([uuid(), p.userId, "organization", orgId, def.readOnly ?? false]);
    } else if (def.scopeLevel === "franchise_group") {
      scopeRows.push([uuid(), p.userId, "franchise_group", groupIds.get(p.groupCode), false]);
    } else if (def.scopeLevel === "location" && p.locationId) {
      scopeRows.push([uuid(), p.userId, "location", p.locationId, false]);
      userLocationRows.push([p.userId, p.locationId, "primary"]);
    } else {
      scopeRows.push([uuid(), p.userId, "self", null, true]);
    }
  }
  // FBP portfolios.
  const fbpPortfolios: Array<[PersonSeed, string[]]> = [
    [fbp, LOCATIONS.filter((l) => ["HRB", "CORP"].includes(l.group) && l.region === "NE").map((l) => locationByStore.get(l.store)!)],
    [extraFbps[0], LOCATIONS.filter((l) => ["GLD", "SUM"].includes(l.group)).slice(0, 8).map((l) => locationByStore.get(l.store)!)],
    [extraFbps[1], LOCATIONS.filter((l) => ["SUN", "LKS"].includes(l.group)).slice(0, 9).map((l) => locationByStore.get(l.store)!)],
  ];
  for (const [partner, locs] of fbpPortfolios) {
    for (const locId of locs) {
      scopeRows.push([uuid(), partner.userId, "location", locId, false]);
      userLocationRows.push([partner.userId, locId, "portfolio"]);
    }
  }
  await insertMany(db, "user_scopes", ["id", "user_id", "scope_type", "scope_id", "is_read_only"], scopeRows);
  await insertMany(db, "user_locations", ["user_id", "location_id", "access_type"], userLocationRows, "on conflict do nothing");

  // GM / FBP assignment on the location record.
  for (const [locId, gm] of gmByLocation) {
    await db.query(`update locations set gm_user_id = $1 where id = $2`, [gm.userId, locId]);
  }
  for (const [partner, locs] of fbpPortfolios) {
    if (locs.length) {
      await db.query(`update locations set fbp_user_id = $1 where id = any($2::uuid[])`, [partner.userId, locs]);
    }
  }
  log(`${people.length} people created`);

  // ---------------- Content: categories, certifications, badges ----------------
  const categoryIds = new Map<string, string>();
  await insertMany(db, "course_categories", ["id", "organization_id", "name", "slug", "color", "sort_order"],
    COURSE_CATEGORIES.map((c, i) => { const id = uuid(); categoryIds.set(c.slug, id); return [id, orgId, c.name, c.slug, c.color, i * 10]; }));

  const certIds = new Map<string, string>();
  await insertMany(db, "certifications",
    ["id", "organization_id", "name", "description", "validity_months", "passing_score", "requires_manager_approval", "renewal_requirements"],
    CERTIFICATIONS.map((c) => {
      const id = uuid(); certIds.set(c.name, id);
      return [id, orgId, c.name, c.description, c.months, 80, c.name.includes("Cook") || c.name.includes("Manager"),
        `Retake the required courses and pass the assessment every ${c.months} months.`];
    }));

  const badgeIds = new Map<string, string>();
  await insertMany(db, "badges", ["id", "organization_id", "name", "description", "criteria", "icon", "color"],
    BADGES.map((b) => { const id = uuid(); badgeIds.set(b.name, id); return [id, orgId, b.name, b.description, b.criteria, b.icon, b.color]; }));

  // ---------------- Assets & resource library ----------------
  const assetIds: string[] = [];
  const assetRows = RESOURCES.map((r) => {
    const id = uuid(); assetIds.push(id);
    return [id, orgId, r.name, `${r.category} reference material maintained by Corporate Training.`, r.type,
      r.category, r.tags, 1, `${r.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.${r.type === "pdf" ? "pdf" : r.type === "presentation" ? "pptx" : "docx"}`,
      null, null, int(180000, 6400000), training.userId, "active", true, r.name === "Team Member Handbook"];
  });
  await insertMany(db, "assets",
    ["id", "organization_id", "name", "description", "asset_type", "category", "tags", "version", "file_name",
      "file_path", "external_url", "file_size", "uploaded_by", "status", "is_resource", "requires_acknowledgment"],
    assetRows);
  await insertMany(db, "asset_versions", ["id", "asset_id", "version", "file_name", "file_size", "notes", "uploaded_by"],
    assetIds.map((id, i) => [uuid(), id, 1, assetRows[i][8], assetRows[i][11], "Initial upload", training.userId]));

  // Course media assets (videos / documents referenced by course modules).
  const mediaAssetByCourse = new Map<string, string>();
  const mediaRows: unknown[][] = [];
  for (const course of COURSES) {
    if (["video", "blended", "document", "checklist"].includes(course.type)) {
      const id = uuid();
      mediaAssetByCourse.set(course.code, id);
      const type = course.type === "video" || course.type === "blended" ? "video" : "pdf";
      mediaRows.push([id, orgId, `${course.title} — ${type === "video" ? "Module Video" : "Participant Guide"}`,
        `Primary media asset for ${course.title}.`, type, COURSE_CATEGORIES.find((c) => c.slug === course.category)?.name ?? "Training",
        [course.category], 1, `${course.code.toLowerCase()}-${type === "video" ? "module.mp4" : "guide.pdf"}`,
        null, null, int(2400000, 88000000), training.userId, "active", false, false]);
    }
  }
  await insertMany(db, "assets",
    ["id", "organization_id", "name", "description", "asset_type", "category", "tags", "version", "file_name",
      "file_path", "external_url", "file_size", "uploaded_by", "status", "is_resource", "requires_acknowledgment"],
    mediaRows);

  // ---------------- SCORM packages ----------------
  // The two production SCORM archives shipped with this repository are ingested
  // through the exact same validated pipeline the admin upload screen uses.
  const scormByCourse = new Map<string, string>();
  const scormRows: unknown[][] = [];
  const scormVersionRows: unknown[][] = [];
  const scormSources: Array<{ file: string; courseCode: string }> = [
    { file: "WB_SpecialtyShakes_CounterService_SCORM (2).zip", courseCode: "WB-113" },
    { file: "WB_SpecialtyShakes_FullService_SCORM (2).zip", courseCode: "WB-114" },
  ];
  for (const src of scormSources) {
    const full = path.join(process.cwd(), src.file);
    if (!fs.existsSync(full)) continue;
    try {
      const meta = extractScormPackage(fs.readFileSync(full), src.file);
      scormByCourse.set(src.courseCode, meta.id);
      scormRows.push([meta.id, orgId, meta.title, meta.identifier, meta.scormVersion, meta.launchFile,
        meta.extractPath, meta.manifestXml, meta.masteryScore, meta.fileSize, src.file, "active", 1, training.userId]);
      scormVersionRows.push([uuid(), meta.id, 1, meta.launchFile, meta.extractPath, meta.fileSize,
        "Initial publish from the authoring tool export.", training.userId]);
    } catch (err) {
      console.warn(`[seed] SCORM ingest failed for ${src.file}:`, (err as Error).message);
    }
  }
  // Simulated legacy SCORM packages for the remaining SCORM courses.
  for (const code of ["WB-102", "WB-111", "WB-117", "WB-118"]) {
    const course = COURSES.find((c) => c.code === code)!;
    const id = uuid();
    scormByCourse.set(code, id);
    scormRows.push([id, orgId, course.title, `WB_${code.replace("-", "_")}_MANIFEST`, "1.2", "index.html",
      `storage/scorm/legacy/${code}`, `<?xml version="1.0"?><manifest identifier="WB_${code}" version="1.0"><metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata></manifest>`,
      80, int(4000000, 42000000), `${code}_SCORM.zip`, "active", 1, training.userId]);
    scormVersionRows.push([uuid(), id, 1, "index.html", `storage/scorm/legacy/${code}`, int(4000000, 42000000),
      "Migrated from the legacy LMS content library.", training.userId]);
  }
  await insertMany(db, "scorm_packages",
    ["id", "organization_id", "title", "identifier", "scorm_version", "launch_file", "extract_path", "manifest_xml",
      "mastery_score", "file_size", "file_name", "status", "version", "uploaded_by"], scormRows);
  await insertMany(db, "scorm_versions",
    ["id", "scorm_package_id", "version", "launch_file", "extract_path", "file_size", "notes", "uploaded_by"], scormVersionRows);
  log(`${scormRows.length} SCORM packages registered`);

  // ---------------- Assessments ----------------
  interface QSeed {
    prompt: string;
    type: string;
    options?: Array<[string, boolean]>;
    /** Ordering questions: the steps stored in their correct sequence. */
    sequence?: string[];
    /** Matching questions: each item paired with the target it belongs to. */
    matches?: Array<[string, string]>;
    /** Image-based questions: the picture the learner is asked about. */
    image?: string;
    scenario?: string;
  }
  const QUESTION_BANK: Record<string, QSeed[]> = {
    "WB-102": [
      { prompt: "What is the correct minimum internal temperature for a Wahlburgers beef patty?", type: "single",
        options: [["155°F held for 15 seconds", true], ["135°F", false], ["120°F", false], ["165°F held for 1 minute", false]] },
      { prompt: "Select every situation that requires a full handwash.", type: "multiple",
        options: [["After handling raw protein", true], ["After taking out trash", true], ["Before putting on new gloves", true], ["After clocking in for break with clean hands", false]] },
      { prompt: "Cold food must be held at 41°F or below.", type: "true_false",
        options: [["True", true], ["False", false]] },
      { prompt: "A guest reports an allergy. What is your first step?", type: "scenario",
        options: [["Tell the manager and flag the ticket before it enters the kitchen", true], ["Wipe the station and continue", false], ["Ask the guest to order something else", false], ["Note it verbally to expo only", false]] },
      { prompt: "How long may prepared food remain in the temperature danger zone before it must be discarded?", type: "single",
        options: [["4 hours", true], ["8 hours", false], ["30 minutes", false], ["12 hours", false]] },
    ],
    "WB-108": [
      { prompt: "Which signature burger is topped with the house-made Wahl sauce and government cheese?", type: "single",
        options: [["Our Burger", true], ["The BBQ Bacon", false], ["Thanksgiving Day Burger", false], ["Impossible Burger", false]] },
      { prompt: "Select every allergen present in the classic shake build.", type: "multiple",
        options: [["Milk", true], ["Egg", false], ["Soy", true], ["Shellfish", false]] },
      { prompt: "All shakes are made to order.", type: "true_false", options: [["True", true], ["False", false]] },
      { prompt: "A guest asks what makes the Thanksgiving Day Burger different. What is the best answer?", type: "scenario",
        options: [["It layers roasted turkey, stuffing and cranberry for a full holiday plate on a bun", true], ["It is just a turkey burger", false], ["It is seasonal only", false], ["It has no distinguishing ingredients", false]] },
    ],
    "WB-113": [
      { prompt: "How many pumps of shake base go into a Fruity Pebbles specialty shake?", type: "single",
        options: [["Three", true], ["One", false], ["Five", false], ["Seven", false]] },
      { prompt: "Select the correct finishing steps for the Kit Kat shake.", type: "multiple",
        options: [["Whipped cream crown", true], ["Crushed Kit Kat topping", true], ["Full Kit Kat bar garnish", true], ["Caramel drizzle base", false]] },
      { prompt: "Counter service shakes are handed off with the guest's name called at the pickup window.", type: "true_false",
        options: [["True", true], ["False", false]] },
      { prompt: "Put the specialty shake build in the correct order.", type: "ordering",
        sequence: ["Chill the glass and stage the spindle cup", "Add three pumps of shake base",
          "Add the flavour mix-in and blend to spec", "Pour and crown with whipped cream", "Add the garnish and hand off"] },
      { prompt: "Match each specialty shake to its signature garnish.", type: "matching",
        matches: [["Fruity Pebbles Shake", "Cereal rim"], ["Kit Kat Shake", "Kit Kat bar"],
          ["Thin Mint Shake", "Cookie crumble"], ["Salted Caramel Shake", "Caramel drizzle"]] },
      { prompt: "Which shake build is pictured at the correct fill line?", type: "image",
        image: "/images/shake-fill-line.svg",
        options: [["B — filled to the band with the whipped cream crown above it", true],
          ["A — under-filled, well below the band", false],
          ["C — over-filled past the band", false]] },
    ],
    "WB-127": [
      { prompt: "Which lever most directly improves ticket times during a peak rush?", type: "single",
        options: [["Positioning and pre-shift assignment clarity", true], ["Adding menu items", false], ["Reducing prep par levels", false], ["Turning off the KDS", false]] },
      { prompt: "Select every element of a complete pre-shift.", type: "multiple",
        options: [["Sales target", true], ["Menu focus item", true], ["Station assignments", true], ["Payroll review with the team", false]] },
      { prompt: "A GM certification requires manager validation in addition to the capstone assessment.", type: "true_false",
        options: [["True", true], ["False", false]] },
      { prompt: "What do you do first?", type: "scenario",
        scenario: "It is 12:20 on a Saturday. Ticket times have climbed to nine minutes, two team members "
          + "called out and a delivery driver is waiting on three orders at the counter.",
        options: [["Reposition the line, move one person to expo and set a recovery target with the team", true],
          ["Ask the delivery driver to wait and keep the current positions", false],
          ["Start a new prep batch before addressing the line", false],
          ["Send a team member on their break to reset the rotation", false]] },
    ],
  };

  const assessmentByCourse = new Map<string, string>();
  const assessmentRows: unknown[][] = [];
  const questionRows: unknown[][] = [];
  const optionRows: unknown[][] = [];
  for (const course of COURSES) {
    const bank = QUESTION_BANK[course.code] ?? [
      { prompt: `Which statement best describes the purpose of ${course.title}?`, type: "single",
        options: [[course.objectives[0], true], ["Reduce the number of shifts scheduled", false],
          ["Replace the manager pre-shift", false], ["Track guest counts", false]] as Array<[string, boolean]> },
      { prompt: `Select every outcome expected after completing ${course.title}.`, type: "multiple",
        options: course.objectives.map((o) => [o, true] as [string, boolean]).concat([["Approve payroll changes", false]]) },
      { prompt: `${course.objectives[0]} is a required standard at every Wahlburgers restaurant.`, type: "true_false",
        options: [["True", true], ["False", false]] as Array<[string, boolean]> },
    ];
    const assessmentId = uuid();
    assessmentByCourse.set(course.code, assessmentId);
    assessmentRows.push([assessmentId, orgId, `${course.title} — Knowledge Check`,
      `Assessment for ${course.title}. Passing score ${course.code === "WB-127" ? 90 : 80}%.`,
      course.code === "WB-127" ? 90 : 80, 3, course.code === "WB-127" ? 45 : null, true, null, true, 0, "active", training.userId]);
    bank.forEach((q, qi) => {
      const questionId = uuid();
      questionRows.push([questionId, assessmentId, qi + 1, q.type, q.prompt, 1,
        "Correct — that matches the Wahlburgers standard.", "Not quite. Review the module and try again.",
        q.scenario ?? null, q.image ?? null]);
      if (q.type === "ordering" && q.sequence) {
        // Stored in the correct sequence; the player shuffles them for the learner.
        q.sequence.forEach((label, oi) => optionRows.push([uuid(), questionId, oi + 1, label, true, null]));
      } else if (q.type === "matching" && q.matches) {
        q.matches.forEach(([label, key], oi) => optionRows.push([uuid(), questionId, oi + 1, label, true, key]));
      } else {
        (q.options ?? []).forEach((o, oi) => optionRows.push([uuid(), questionId, oi + 1, o[0], o[1], null]));
      }
    });
  }
  await insertMany(db, "assessments",
    ["id", "organization_id", "title", "description", "passing_score", "attempt_limit", "time_limit_minutes",
      "randomize_questions", "questions_per_attempt", "show_correct_answers", "retake_delay_hours", "status", "created_by"],
    assessmentRows);
  await insertMany(db, "questions",
    ["id", "assessment_id", "position", "question_type", "prompt", "points", "feedback_correct", "feedback_incorrect",
      "scenario_text", "image_url"],
    questionRows);
  await insertMany(db, "question_options",
    ["id", "question_id", "position", "label", "is_correct", "match_key"], optionRows);
  log(`${assessmentRows.length} assessments with ${questionRows.length} questions created`);

  // ---------------- Courses, versions and modules ----------------
  const courseIds = new Map<string, string>();
  const courseRows: unknown[][] = [];
  const versionRows: unknown[][] = [];
  const moduleRows: unknown[][] = [];

  const moduleTypeFor = (course: SeedCourse): string[] => {
    switch (course.type) {
      case "scorm": return ["scorm", "assessment"];
      case "video": return ["video", "assessment"];
      case "document": return ["pdf", "policy", "assessment"];
      case "assessment": return ["text", "assessment"];
      case "checklist": return ["checklist", "manager_validation"];
      default: return ["text", "video", "assessment"];
    }
  };

  for (const course of COURSES) {
    const id = uuid();
    courseIds.set(course.code, id);
    const publishedAt = course.legacy ? daysAgo(int(200, 900)) : daysAgo(int(5, 120));
    courseRows.push([
      id, orgId, course.code, course.title, course.description, course.objectives,
      categoryIds.get(course.category), course.type,
      COURSE_CATEGORIES.find((c) => c.slug === course.category)?.color ?? "#0e1f38",
      course.minutes, course.required, course.code === "WB-127" ? 90 : 80, "published",
      training.userId, course.certification ? certIds.get(course.certification) : null,
      course.legacy ? 2 : 1, 0, 0, 0, [course.category, course.type],
      course.legacy ? "Legacy LMS" : "Wahlburgers Academy", course.legacy ? `LEG-${course.code}` : null,
      iso(publishedAt), iso(publishedAt),
    ]);
    if (course.legacy) {
      versionRows.push([uuid(), id, 1, "archived", "Original legacy LMS release migrated into Wahlburgers Academy.",
        training.userId, false, iso(daysAgo(int(900, 1400)))]);
      versionRows.push([uuid(), id, 2, "published", "Refreshed for the Wahlburgers Academy launch.",
        training.userId, false, iso(publishedAt)]);
    } else {
      versionRows.push([uuid(), id, 1, "published", "Initial release.", training.userId, false, iso(publishedAt)]);
    }

    const types = moduleTypeFor(course);
    types.forEach((type, i) => {
      const moduleId = uuid();
      const titles: Record<string, string> = {
        scorm: `${course.title} — Interactive Module`,
        video: `${course.title} — Video Walkthrough`,
        pdf: `${course.title} — Participant Guide`,
        policy: `${course.title} — Policy Acknowledgment`,
        text: `${course.title} — Overview`,
        assessment: `${course.title} — Knowledge Check`,
        checklist: `${course.title} — On-Floor Checklist`,
        manager_validation: `${course.title} — Manager Validation`,
      };
      moduleRows.push([
        moduleId, id, course.legacy ? 2 : 1, titles[type] ?? course.title,
        type === "assessment" ? "Demonstrate what you learned. You must score at or above the passing score to complete this course."
          : `Work through this ${type} module to meet the course objectives.`,
        type, i + 1,
        ["video", "pdf", "checklist", "policy"].includes(type) ? mediaAssetByCourse.get(course.code) ?? null : null,
        type === "scorm" ? scormByCourse.get(course.code) ?? null : null,
        type === "assessment" ? assessmentByCourse.get(course.code) ?? null : null,
        type === "text"
          ? `## ${course.title}\n\n${course.description}\n\n### What you will learn\n${course.objectives.map((o) => `- ${o}`).join("\n")}\n\nWork at your own pace. Your progress is saved automatically and appears on your transcript the moment you finish.`
          : null,
        true, type === "text" ? 30 : type === "video" ? 60 : 0,
        type === "assessment" ? (course.code === "WB-127" ? 90 : 80) : null,
        type === "assessment" ? 3 : null,
        type === "manager_validation", false,
        type === "assessment" ? "score" : type === "policy" ? "acknowledge" : type === "manager_validation" ? "validate" : "view",
      ]);
    });
  }
  await insertMany(db, "courses",
    ["id", "organization_id", "code", "title", "description", "objectives", "category_id", "course_type",
      "thumbnail_color", "estimated_minutes", "is_required_default", "passing_score", "status", "owner_user_id",
      "certification_id", "current_version", "rating_avg", "rating_count", "completion_count", "tags",
      "source_system", "source_record_id", "created_at", "published_at"], courseRows);
  await insertMany(db, "course_versions",
    ["id", "course_id", "version_number", "status", "change_notes", "author_user_id", "requires_retraining", "published_at"], versionRows);
  await insertMany(db, "course_modules",
    ["id", "course_id", "course_version", "title", "description", "module_type", "position", "asset_id",
      "scorm_package_id", "assessment_id", "content_text", "is_required", "min_seconds", "passing_score",
      "attempt_limit", "requires_manager_validation", "sequence_required", "completion_rule"], moduleRows);
  log(`${courseRows.length} courses with ${moduleRows.length} modules created`);

  // ---------------- Learning paths ----------------
  const pathIds = new Map<string, string>();
  await insertMany(db, "learning_paths",
    ["id", "organization_id", "name", "description", "category", "status", "certification_id", "color", "created_by"],
    LEARNING_PATHS.map((p) => {
      const id = uuid(); pathIds.set(p.name, id);
      return [id, orgId, p.name, `${p.name} curriculum: ${p.courses.length} courses culminating in ${p.certification ?? "role readiness"}.`,
        p.category, "published", p.certification ? certIds.get(p.certification) : null, p.color, training.userId];
    }));
  const pathItemRows: unknown[][] = [];
  for (const p of LEARNING_PATHS) {
    p.courses.forEach((code, i) => {
      pathItemRows.push([uuid(), pathIds.get(p.name), i + 1, "course", courseIds.get(code), null, null, null,
        COURSES.find((c) => c.code === code)?.title ?? code, true]);
    });
    if (p.certification) {
      pathItemRows.push([uuid(), pathIds.get(p.name), p.courses.length + 1, "certification", null, null,
        certIds.get(p.certification), null, p.certification, true]);
    }
    if (["Cook Certification", "General Manager Certification"].includes(p.name)) {
      pathItemRows.push([uuid(), pathIds.get(p.name), p.courses.length + 2, "manager_validation", null, null, null, null,
        "Manager validation — observed on the floor", true]);
    }
    // A path is a curriculum, not just a course list: classroom time and the
    // reference documents a learner keeps at their station belong in it too.
    if (["Cook Certification", "Shift Leader Development", "General Manager Certification"].includes(p.name)) {
      pathItemRows.push([uuid(), pathIds.get(p.name), p.courses.length + 3, "live_session", null, null, null, null,
        `${p.name} skills lab — instructor led`, true]);
    }
    if (assetIds.length > 0) {
      pathItemRows.push([uuid(), pathIds.get(p.name), p.courses.length + 4, "document", null, null, null,
        assetIds[pathItemRows.length % assetIds.length], "Reference document for this path", false]);
    }
  }
  await insertMany(db, "learning_path_items",
    ["id", "learning_path_id", "position", "item_type", "course_id", "assessment_id", "certification_id", "asset_id",
      "title", "is_required"],
    pathItemRows);
  log(`${LEARNING_PATHS.length} learning paths created`);

  // ---------------- Campaigns, assignments and enrollments ----------------
  const campaignIds = new Map<string, string>();
  const campaignDefs = [
    { name: "Fall Menu Launch", color: "#c8102e", launch: daysAgo(20), due: daysAhead(10), courses: ["WB-112", "WB-108"] },
    { name: "Specialty Shakes Rollout", color: "#7c53c3", launch: daysAgo(6), due: daysAhead(14), courses: ["WB-113", "WB-114"] },
    { name: "Food Safety Refresh", color: "#14866d", launch: daysAgo(75), due: daysAgo(10), courses: ["WB-102", "WB-121", "WB-115"] },
    { name: "Annual Compliance Cycle", color: "#0e1f38", launch: daysAgo(120), due: daysAhead(45), courses: ["WB-117", "WB-125"] },
  ];
  await insertMany(db, "training_campaigns",
    ["id", "organization_id", "name", "description", "banner_color", "launch_at", "due_at", "status", "created_by"],
    campaignDefs.map((c) => {
      const id = uuid(); campaignIds.set(c.name, id);
      return [id, orgId, c.name, `${c.name} training campaign covering ${c.courses.length} courses.`, c.color,
        iso(c.launch), iso(c.due), c.due < NOW ? "completed" : "active", training.userId];
    }));
  await insertMany(db, "campaign_courses", ["campaign_id", "course_id"],
    campaignDefs.flatMap((c) => c.courses.map((code) => [campaignIds.get(c.name), courseIds.get(code)])),
    "on conflict do nothing");

  const { resolveTargetPopulation } = await import("@/lib/assignments/targeting");
  const targetExec = {
    query: async <T,>(sql: string, params?: unknown[]) =>
      (await db.query<T>(sql, params)) as { rows: T[] },
  };

  interface AssignmentSeed {
    title: string; courseCode?: string; pathName?: string; targets: AssignmentTarget[];
    due: Date; required: boolean; priority: string; campaign?: string; recurrence?: string; assignedAt: Date;
  }
  type AssignmentTarget = { target_type: string; target_id: string | null };
  const roleId = (code: string) => roleIds.get(code)!;
  const deptId = (code: string) => deptIds.get(code)!;

  const assignmentSeeds: AssignmentSeed[] = [
    { title: "Food Safety Fundamentals — All Team Members", courseCode: "WB-102", required: true, priority: "critical",
      targets: [{ target_type: "organization", target_id: orgId }], due: daysAgo(5), assignedAt: daysAgo(75),
      campaign: "Food Safety Refresh", recurrence: "annual" },
    { title: "Harassment Prevention — Annual Compliance", courseCode: "WB-117", required: true, priority: "critical",
      targets: [{ target_type: "organization", target_id: orgId }], due: daysAhead(45), assignedAt: daysAgo(120),
      campaign: "Annual Compliance Cycle", recurrence: "annual" },
    { title: "Team Member Handbook Acknowledgment", courseCode: "WB-125", required: true, priority: "high",
      targets: [{ target_type: "organization", target_id: orgId }], due: daysAhead(30), assignedAt: daysAgo(120),
      campaign: "Annual Compliance Cycle" },
    { title: "Menu Knowledge Certification — All Restaurants", courseCode: "WB-108", required: true, priority: "high",
      targets: [{ target_type: "organization", target_id: orgId }], due: daysAhead(12), assignedAt: daysAgo(20),
      campaign: "Fall Menu Launch" },
    { title: "Fall LTO Training", courseCode: "WB-112", required: true, priority: "high",
      targets: [{ target_type: "organization", target_id: orgId }], due: daysAhead(10), assignedAt: daysAgo(20),
      campaign: "Fall Menu Launch" },
    { title: "Technology Systems Training", courseCode: "WB-110", required: true, priority: "normal",
      targets: [{ target_type: "organization", target_id: orgId }], due: daysAhead(60), assignedAt: daysAgo(90) },
    { title: "Workplace Safety — All Team Members", courseCode: "WB-111", required: true, priority: "high",
      targets: [{ target_type: "organization", target_id: orgId }], due: daysAgo(2), assignedAt: daysAgo(60) },
    { title: "Guest Experience Fundamentals — Front of House", courseCode: "WB-103", required: true, priority: "normal",
      targets: [{ target_type: "department", target_id: deptId("FOH") }], due: daysAhead(21), assignedAt: daysAgo(45) },
    { title: "Allergen Awareness — Front of House & Kitchen", courseCode: "WB-115", required: true, priority: "high",
      targets: [{ target_type: "department", target_id: deptId("FOH") }, { target_type: "department", target_id: deptId("BOH") }],
      due: daysAhead(18), assignedAt: daysAgo(40) },
    { title: "Cleaning & Sanitation Standards — Kitchen", courseCode: "WB-121", required: true, priority: "normal",
      targets: [{ target_type: "department", target_id: deptId("BOH") }], due: daysAgo(8), assignedAt: daysAgo(75),
      campaign: "Food Safety Refresh" },
    { title: "Alcohol Awareness — Bar Team", courseCode: "WB-118", required: true, priority: "critical",
      targets: [{ target_type: "department", target_id: deptId("BAR") }], due: daysAhead(25), assignedAt: daysAgo(50) },
    { title: "Manager Leadership Essentials", courseCode: "WB-109", required: true, priority: "normal",
      targets: [{ target_type: "role", target_id: roleId("gm") }, { target_type: "role", target_id: roleId("agm") },
        { target_type: "role", target_id: roleId("training_manager") }], due: daysAhead(40), assignedAt: daysAgo(70) },
    { title: "Shift Leader Development", courseCode: "WB-119", required: false, priority: "normal",
      targets: [{ target_type: "role", target_id: roleId("shift_leader") }], due: daysAhead(60), assignedAt: daysAgo(60) },
    { title: "Cash Handling & POS Accuracy — Leadership", courseCode: "WB-116", required: true, priority: "normal",
      targets: [{ target_type: "role", target_id: roleId("shift_leader") }, { target_type: "role", target_id: roleId("gm") },
        { target_type: "role", target_id: roleId("agm") }], due: daysAhead(35), assignedAt: daysAgo(55) },
    { title: "Specialty Shakes — Counter Service Restaurants", courseCode: "WB-113", required: true, priority: "high",
      targets: [{ target_type: "region", target_id: regionIds.get("NE")! }, { target_type: "region", target_id: regionIds.get("MW")! }],
      due: daysAhead(14), assignedAt: daysAgo(6), campaign: "Specialty Shakes Rollout" },
    { title: "Specialty Shakes — Full Service Restaurants", courseCode: "WB-114", required: true, priority: "high",
      targets: [{ target_type: "region", target_id: regionIds.get("SE")! }, { target_type: "region", target_id: regionIds.get("MA")! },
        { target_type: "region", target_id: regionIds.get("WE")! }],
      due: daysAhead(14), assignedAt: daysAgo(6), campaign: "Specialty Shakes Rollout" },
    { title: "New Hire Orientation — All New Hires", pathName: "New Hire Orientation", required: true, priority: "critical",
      targets: [{ target_type: "new_hire", target_id: null }], due: daysAhead(7), assignedAt: daysAgo(30) },
    { title: "Cook Certification Path — Kitchen Team", pathName: "Cook Certification", required: true, priority: "high",
      targets: [{ target_type: "department", target_id: deptId("BOH") }], due: daysAhead(45), assignedAt: daysAgo(80) },
    { title: "Server Certification Path", pathName: "Server Certification", required: false, priority: "normal",
      targets: [{ target_type: "department", target_id: deptId("FOH") }], due: daysAhead(50), assignedAt: daysAgo(80) },
  ];

  const performanceByLocation = new Map<string, number>();
  locationIds.forEach((id, i) => {
    // Spread completion performance so location dashboards show real variation.
    const base = i % 11 === 0 ? 0.58 : i % 7 === 0 ? 0.72 : i % 3 === 0 ? 0.88 : 0.94;
    performanceByLocation.set(id, Math.min(0.99, base + rnd() * 0.07 - 0.03));
  });
  const personByUser = new Map(people.map((p) => [p.userId, p]));

  const assignmentRows: unknown[][] = [];
  const targetRows: unknown[][] = [];
  const enrollmentRows: unknown[][] = [];
  const pathEnrollmentRows: unknown[][] = [];
  const enrollmentKeys = new Set<string>();
  const enrollmentIndex: Array<{ id: string; userId: string; courseCode: string; status: string; completedAt: Date | null; score: number | null }> = [];

  for (const seed of assignmentSeeds) {
    const assignmentId = uuid();
    const population = await resolveTargetPopulation(targetExec, orgId, seed.targets as never);
    assignmentRows.push([assignmentId, orgId, seed.title, seed.pathName ? "learning_path" : "course",
      seed.courseCode ? courseIds.get(seed.courseCode) : null, seed.pathName ? pathIds.get(seed.pathName) : null,
      seed.priority, seed.required, training.userId, iso(seed.assignedAt), iso(seed.due), 3,
      seed.recurrence ?? "none", 7, "published", seed.campaign ? campaignIds.get(seed.campaign) : null,
      population.length, `Auto-generated for the ${seed.title} rollout.`]);
    for (const t of seed.targets) targetRows.push([uuid(), assignmentId, t.target_type, t.target_id]);

    const courseCodes = seed.pathName
      ? LEARNING_PATHS.find((p) => p.name === seed.pathName)!.courses
      : [seed.courseCode!];

    for (const userId of population) {
      const person = personByUser.get(userId);
      if (!person) continue;
      const perf = person.locationId ? performanceByLocation.get(person.locationId)! : 0.95;
      if (seed.pathName) {
        const key = `${userId}|${seed.pathName}`;
        if (!enrollmentKeys.has(key)) {
          enrollmentKeys.add(key);
          pathEnrollmentRows.push([uuid(), userId, pathIds.get(seed.pathName), iso(seed.assignedAt), iso(seed.due), 0, null, "in_progress"]);
        }
      }
      for (const code of courseCodes) {
        const courseId = courseIds.get(code)!;
        const key = `${userId}|${courseId}|${assignmentId}`;
        if (enrollmentKeys.has(key)) continue;
        enrollmentKeys.add(key);

        const course = COURSES.find((c) => c.code === code)!;
        const isNew = person.hireDate > seed.assignedAt;
        const roll = rnd();
        let status = "not_started";
        let completedAt: Date | null = null;
        let startedAt: Date | null = null;
        let score: number | null = null;
        let duration = 0;
        if (roll < perf && !(isNew && chance(0.5))) {
          status = "completed";
          const span = Math.max(1, Math.round((NOW.getTime() - seed.assignedAt.getTime()) / 86400000));
          completedAt = daysAgo(int(0, Math.min(span, 120)));
          startedAt = new Date(completedAt.getTime() - int(20, 90) * 60000);
          score = int(78, 100);
          duration = course.minutes * 60 + int(-300, 900);
        } else if (roll < perf + 0.12) {
          status = "in_progress";
          startedAt = daysAgo(int(0, 12));
          duration = int(120, course.minutes * 40);
        }
        const eid = uuid();
        const certId = course.certification ? certIds.get(course.certification) : null;
        enrollmentRows.push([
          eid, userId, courseId, course.title, course.legacy ? 2 : 1, assignmentId,
          seed.pathName ? pathIds.get(seed.pathName) : null, status, seed.required, seed.priority,
          iso(seed.assignedAt), iso(seed.due), startedAt ? iso(startedAt) : null, completedAt ? iso(completedAt) : null,
          score, course.code === "WB-127" ? 90 : 80, status === "completed" ? int(1, 2) : status === "in_progress" ? 1 : 0,
          duration, certId,
          completedAt && certId ? iso(new Date(completedAt.getTime() + (CERTIFICATIONS.find((c) => c.name === course.certification)?.months ?? 12) * 30 * 86400000)) : null,
          completedAt ? iso(completedAt) : startedAt ? iso(startedAt) : null, "Wahlburgers Academy",
        ]);
        enrollmentIndex.push({ id: eid, userId, courseCode: code, status, completedAt, score });
      }
    }
  }
  await insertMany(db, "assignments",
    ["id", "organization_id", "title", "item_type", "course_id", "learning_path_id", "priority", "is_required",
      "assigned_by", "assigned_at", "due_at", "grace_period_days", "recurrence", "reminder_cadence_days", "status",
      "campaign_id", "estimated_population", "notes"], assignmentRows);
  await insertMany(db, "assignment_targets", ["id", "assignment_id", "target_type", "target_id"], targetRows);
  await insertMany(db, "enrollments",
    ["id", "user_id", "course_id", "course_title", "course_version", "assignment_id", "learning_path_id", "status",
      "is_required", "priority", "assigned_at", "due_at", "started_at", "completed_at", "score", "passing_score",
      "attempts", "duration_seconds", "certification_id", "expires_at", "last_activity_at", "source_system"],
    enrollmentRows);
  await insertMany(db, "learning_path_enrollments",
    ["id", "user_id", "learning_path_id", "assigned_at", "due_at", "progress", "completed_at", "status"],
    pathEnrollmentRows, "on conflict do nothing");
  log(`${assignmentRows.length} assignments produced ${enrollmentRows.length} enrollments`);

  // ---------------- Automated assignment rules ----------------
  await insertMany(db, "assignment_rules",
    ["id", "organization_id", "name", "description", "is_active", "trigger_event", "conditions", "actions", "created_by", "last_run_at", "matches_count"],
    [
      [uuid(), orgId, "New hire → New Hire Orientation", "Every new employee receives the New Hire Orientation path within 7 days of hire.",
        true, "on_create", JSON.stringify({ all: [{ field: "is_new_hire", op: "eq", value: true }] }),
        JSON.stringify({ assign: { type: "learning_path", id: pathIds.get("New Hire Orientation"), dueInDays: 7, required: true } }),
        training.userId, iso(daysAgo(1)), 46],
      [uuid(), orgId, "Role = Cook → Cook Certification", "Kitchen hires are enrolled in the Cook Certification path.",
        true, "on_create", JSON.stringify({ all: [{ field: "position_title", op: "eq", value: "Cook" }] }),
        JSON.stringify({ assign: { type: "learning_path", id: pathIds.get("Cook Certification"), dueInDays: 45, required: true } }),
        training.userId, iso(daysAgo(1)), 128],
      [uuid(), orgId, "Role = Manager → Manager Development", "GMs and AGMs are enrolled in Manager in Training.",
        true, "on_create", JSON.stringify({ all: [{ field: "role_code", op: "in", value: ["gm", "agm"] }] }),
        JSON.stringify({ assign: { type: "learning_path", id: pathIds.get("Manager in Training"), dueInDays: 90, required: true } }),
        training.userId, iso(daysAgo(1)), 61],
      [uuid(), orgId, "Location = Memphis AND role = Server → Memphis Server Training", "Location-specific onboarding for Memphis servers.",
        true, "on_create", JSON.stringify({ all: [{ field: "location_id", op: "eq", value: locationByStore.get("3009") }, { field: "position_title", op: "eq", value: "Server" }] }),
        JSON.stringify({ assign: { type: "course", id: courseIds.get("WB-106"), dueInDays: 21, required: true } }),
        training.userId, iso(daysAgo(1)), 7],
      [uuid(), orgId, "Employee transfers location → location training", "Transferred employees receive the receiving restaurant's local training.",
        true, "on_transfer", JSON.stringify({ all: [{ field: "event", op: "eq", value: "transfer" }] }),
        JSON.stringify({ assign: { type: "course", id: courseIds.get("WB-124"), dueInDays: 14, required: true } }),
        training.userId, iso(daysAgo(3)), 12],
      [uuid(), orgId, "Bar department → Alcohol Awareness", "Anyone assigned to the bar department must complete responsible service training.",
        true, "nightly", JSON.stringify({ all: [{ field: "department_code", op: "eq", value: "BAR" }] }),
        JSON.stringify({ assign: { type: "course", id: courseIds.get("WB-118"), dueInDays: 30, required: true } }),
        training.userId, iso(daysAgo(1)), 84],
    ]);

  // ---------------- Migrated legacy training history ----------------
  // Legacy completions land in the SAME enrollments table as Academy records —
  // the only difference is source_system — so transcripts are unified by design.
  const migrationBatchId = uuid();
  const legacyCourses = COURSES.filter((c) => c.legacy);
  const legacyEnrollmentRows: unknown[][] = [];
  const historicalRows: unknown[][] = [];
  const legacyCertRows: unknown[][] = [];
  const legacyAttemptRows: unknown[][] = [];
  let legacySeq = 500000;

  for (const person of people) {
    const tenureDays = Math.round((NOW.getTime() - person.hireDate.getTime()) / 86400000);
    if (tenureDays < 150) continue;
    const count = Math.min(legacyCourses.length, int(3, 10));
    const shuffled = [...legacyCourses].sort(() => rnd() - 0.5).slice(0, count);
    for (const course of shuffled) {
      const completedAt = daysAgo(int(200, Math.min(tenureDays, 1400)));
      const assignedAt = new Date(completedAt.getTime() - int(3, 30) * 86400000);
      const score = int(76, 100);
      const eid = uuid();
      const sourceRecordId = `LMS-${legacySeq++}`;
      const certName = course.certification;
      legacyEnrollmentRows.push([
        eid, person.userId, courseIds.get(course.code), course.title, 1, null, null, "completed", true, "normal",
        iso(assignedAt), iso(new Date(assignedAt.getTime() + 30 * 86400000)), iso(assignedAt), iso(completedAt),
        score, 80, int(1, 2), course.minutes * 60 + int(-400, 1200),
        certName ? certIds.get(certName) : null,
        certName ? iso(new Date(completedAt.getTime() + (CERTIFICATIONS.find((c) => c.name === certName)?.months ?? 12) * 30 * 86400000)) : null,
        iso(completedAt), "Legacy LMS", sourceRecordId, migrationBatchId,
      ]);
      historicalRows.push([uuid(), person.userId, person.employeeId, courseIds.get(course.code), course.code, "1.0",
        isoDate(assignedAt), isoDate(assignedAt), isoDate(completedAt), "Completed", score, 80, int(1, 2),
        Math.round(course.minutes), certName ?? null,
        certName ? isoDate(new Date(completedAt.getTime() + 365 * 86400000)) : null,
        "Legacy LMS", sourceRecordId, migrationBatchId, eid]);
      if (chance(0.35)) {
        legacyAttemptRows.push([uuid(), null, `${course.title} — Knowledge Check`, person.userId, eid, 1, score,
          score >= 80, iso(completedAt), iso(completedAt), int(300, 1500), JSON.stringify({}), "Legacy LMS", migrationBatchId]);
      }
    }
    // A handful of legacy records reference courses that were never migrated to the
    // Academy catalog. They stay on the transcript with their original title.
    if (chance(0.18)) {
      const orphanTitle = pick(["Legacy Cash Room Procedures", "2019 Brand Refresh Training", "Vendor Delivery Standards (Retired)", "Legacy Scheduling System Overview"]);
      const completedAt = daysAgo(int(400, 1600));
      const eid = uuid();
      const sourceRecordId = `LMS-${legacySeq++}`;
      legacyEnrollmentRows.push([eid, person.userId, null, orphanTitle, 1, null, null, "completed", false, "normal",
        iso(completedAt), null, iso(completedAt), iso(completedAt), int(80, 100), 80, 1, int(900, 4200), null, null,
        iso(completedAt), "Legacy LMS", sourceRecordId, migrationBatchId]);
      historicalRows.push([uuid(), person.userId, person.employeeId, null, orphanTitle, "1.0", null,
        isoDate(completedAt), isoDate(completedAt), "Completed", int(80, 100), 80, 1, int(15, 70), null, null,
        "Legacy LMS", sourceRecordId, migrationBatchId, eid]);
    }
  }
  await insertMany(db, "enrollments",
    ["id", "user_id", "course_id", "course_title", "course_version", "assignment_id", "learning_path_id", "status",
      "is_required", "priority", "assigned_at", "due_at", "started_at", "completed_at", "score", "passing_score",
      "attempts", "duration_seconds", "certification_id", "expires_at", "last_activity_at", "source_system",
      "source_record_id", "migration_batch_id"], legacyEnrollmentRows);
  await insertMany(db, "historical_completions",
    ["id", "user_id", "employee_ref", "course_id", "course_ref", "course_version", "assigned_date", "start_date",
      "completion_date", "completion_status", "score", "passing_score", "attempts", "duration_minutes",
      "certification_name", "expiration_date", "source_system", "source_record_id", "migration_batch_id", "enrollment_id"],
    historicalRows);
  log(`${legacyEnrollmentRows.length} migrated legacy training records created`);

  // ---------------- Migration batch records ----------------
  const migrationDefs = [
    { type: "employees", name: "Legacy LMS — Employee Master", total: people.length, imported: people.length - 6, skipped: 4, failed: 2, warnings: 9 },
    { type: "courses", name: "Legacy LMS — Course Catalog", total: legacyCourses.length + 4, imported: legacyCourses.length, skipped: 3, failed: 1, warnings: 2 },
    { type: "historical_training", name: "Legacy LMS — Historical Completions", total: historicalRows.length + 37, imported: historicalRows.length, skipped: 24, failed: 13, warnings: 41 },
    { type: "certifications", name: "Legacy LMS — Certification Records", total: 512, imported: 498, skipped: 9, failed: 5, warnings: 11 },
    { type: "assessments", name: "Legacy LMS — Assessment Results", total: legacyAttemptRows.length + 18, imported: legacyAttemptRows.length, skipped: 12, failed: 6, warnings: 7 },
    { type: "learning_paths", name: "Legacy LMS — Learning Path Progress", total: 289, imported: 281, skipped: 5, failed: 3, warnings: 4 },
  ];
  const migrationIds: string[] = [];
  await insertMany(db, "migrations",
    ["id", "name", "source_system", "data_type", "status", "file_name", "total_records", "imported", "skipped",
      "failed", "warnings", "batch_id", "created_by", "started_at", "completed_at", "summary"],
    migrationDefs.map((m, i) => {
      const id = uuid(); migrationIds.push(id);
      const startedAt = daysAgo(30 - i);
      return [id, m.name, "Legacy LMS", m.type, "completed", `${m.type}_export_2026.csv`, m.total, m.imported,
        m.skipped, m.failed, m.warnings, migrationBatchId, admin.userId, iso(startedAt),
        iso(new Date(startedAt.getTime() + int(4, 30) * 60000)),
        JSON.stringify({ matchedOn: ["employee_id", "email"], durationMinutes: int(4, 30) })];
    }));

  const failureMessages = [
    ["failed", "Unknown employee — no match on Employee ID, email or username"],
    ["failed", "Invalid completion date format (expected YYYY-MM-DD)"],
    ["failed", "Missing required field: completion_status"],
    ["warning", "Course not found in Academy catalog — imported with original course title"],
    ["warning", "Duplicate completion for the same employee, course and date — kept the highest score"],
    ["warning", "Location not found — employee imported without a restaurant assignment"],
    ["skipped", "Record already imported in an earlier batch"],
  ];
  const migrationRecordRows: unknown[][] = [];
  migrationIds.forEach((mid, mi) => {
    for (let i = 0; i < 24; i++) {
      const [status, message] = failureMessages[(i + mi) % failureMessages.length];
      migrationRecordRows.push([uuid(), mid, i + 2, JSON.stringify({
        employee_id: `WB${int(10000, 10400)}`, course_id: `LEG-${int(100, 130)}`,
        completion_date: status === "failed" && i % 3 === 0 ? "13/45/2024" : isoDate(daysAgo(int(200, 900))),
        completion_status: status === "failed" && i % 3 === 1 ? "" : "Completed", score: int(60, 100),
      }), status, message, migrationDefs[mi].type, null, null]);
    }
  });
  await insertMany(db, "migration_records",
    ["id", "migration_id", "row_number", "raw", "status", "message", "entity_type", "entity_id", "resolution"],
    migrationRecordRows);

  // ---------------- Certifications held ----------------
  const certHolders = new Map<string, { certId: string; issued: Date; months: number }>();
  const allCompleted = [...enrollmentIndex.filter((e) => e.status === "completed")];
  for (const e of allCompleted) {
    const course = COURSES.find((c) => c.code === e.courseCode)!;
    if (!course.certification || !e.completedAt) continue;
    const key = `${e.userId}|${course.certification}`;
    const months = CERTIFICATIONS.find((c) => c.name === course.certification)?.months ?? 12;
    const existing = certHolders.get(key);
    if (!existing || existing.issued < e.completedAt) {
      certHolders.set(key, { certId: certIds.get(course.certification)!, issued: e.completedAt, months });
    }
  }
  // Legacy certifications (issued before the Academy launch), some already expiring.
  for (const person of people) {
    if (chance(0.55)) {
      const cert = pick(CERTIFICATIONS);
      const key = `${person.userId}|${cert.name}`;
      if (!certHolders.has(key)) {
        const issued = daysAgo(int(180, 700));
        certHolders.set(key, { certId: certIds.get(cert.name)!, issued, months: cert.months });
      }
    }
  }
  const userCertRows: unknown[][] = [];
  let certSeq = 90000;
  for (const [key, value] of certHolders) {
    const [userId, certName] = key.split("|");
    const expires = new Date(value.issued.getTime() + value.months * 30.44 * 86400000);
    const status = expires < NOW ? "expired" : "active";
    userCertRows.push([uuid(), userId, value.certId, certName, iso(value.issued), iso(expires), status,
      `WB-CERT-${certSeq++}`, training.userId,
      value.issued < daysAgo(200) ? "Legacy LMS" : "Wahlburgers Academy",
      value.issued < daysAgo(200) ? migrationBatchId : null]);
  }
  await insertMany(db, "user_certifications",
    ["id", "user_id", "certification_id", "certification_name", "issued_at", "expires_at", "status",
      "certificate_number", "issued_by", "source_system", "migration_batch_id"], userCertRows);
  log(`${userCertRows.length} certifications issued`);

  // ---------------- Badges ----------------
  const badgeRows: unknown[][] = [];
  const completionsByUser = new Map<string, number>();
  for (const e of [...allCompleted]) {
    completionsByUser.set(e.userId, (completionsByUser.get(e.userId) ?? 0) + 1);
  }
  for (const person of people) {
    const done = completionsByUser.get(person.userId) ?? 0;
    const award = (name: string, when: Date) =>
      badgeRows.push([uuid(), person.userId, badgeIds.get(name), iso(when), null, `Earned automatically by the Academy badge engine.`]);
    if (done >= 10) award("Training All-Star", daysAgo(int(1, 90)));
    if (done >= 4 && chance(0.6)) award("Wahlburgers Academy Graduate", daysAgo(int(5, 200)));
    if (person.positionTitle === "Cook" && chance(0.55)) award("Cook Certified", daysAgo(int(5, 200)));
    if (person.positionTitle === "Host" && chance(0.6)) award("Host Certified", daysAgo(int(5, 200)));
    if (chance(0.22)) award("Food Safety Champion", daysAgo(int(5, 260)));
    if (chance(0.18)) award("Guest Experience Champion", daysAgo(int(5, 260)));
    if (chance(0.12)) award("Learning Streak", daysAgo(int(1, 40)));
    if (["gm", "agm", "training_manager"].includes(person.roleCode) && chance(0.5)) award("Manager Development Graduate", daysAgo(int(30, 400)));
  }
  await insertMany(db, "user_badges", ["id", "user_id", "badge_id", "awarded_at", "expires_at", "reason"], badgeRows, "on conflict do nothing");

  // ---------------- Assessment attempts ----------------
  const attemptRows: unknown[][] = [...legacyAttemptRows];
  for (const e of allCompleted) {
    if (!chance(0.3) || !e.completedAt) continue;
    const assessmentId = assessmentByCourse.get(e.courseCode);
    if (!assessmentId) continue;
    const attempts = chance(0.2) ? 2 : 1;
    for (let a = 1; a <= attempts; a++) {
      const passed = a === attempts;
      const score = passed ? (e.score ?? int(80, 100)) : int(52, 78);
      attemptRows.push([uuid(), assessmentId, null, e.userId, e.id, a, score, passed,
        iso(new Date(e.completedAt.getTime() - (attempts - a + 1) * 3600000)),
        iso(new Date(e.completedAt.getTime() - (attempts - a) * 3600000)), int(240, 1500),
        JSON.stringify({}), "Wahlburgers Academy", null]);
    }
  }
  await insertMany(db, "assessment_attempts",
    ["id", "assessment_id", "assessment_title", "user_id", "enrollment_id", "attempt_number", "score", "passed",
      "started_at", "completed_at", "duration_seconds", "answers", "source_system", "migration_batch_id"], attemptRows);
  log(`${attemptRows.length} assessment attempts created`);

  // ---------------- Module-level progress ----------------
  // Enrollments alone leave the course player and the SCORM Activity report
  // empty. Generating progress in SQL keeps the seed fast at this row count.
  await db.query(`
    insert into module_progress (enrollment_id, module_id, status, score, seconds_spent, completed_at, data, updated_at)
    select e.id, m.id,
           case when e.status = 'completed' then 'completed'
                when m.position <= greatest(1, (mods.total + 1) / 2) then 'completed'
                when m.position = greatest(1, (mods.total + 1) / 2) + 1 then 'in_progress'
                else 'not_started' end as status,
           case when m.module_type in ('assessment','scorm')
                then round((70 + (('x' || substr(md5(e.id::text || m.id::text), 1, 6))::bit(24)::int % 30))::numeric, 0)
                else null end as score,
           greatest(120, coalesce(m.min_seconds, 0) + 240 + (('x' || substr(md5(m.id::text), 1, 4))::bit(16)::int % 900)) as seconds_spent,
           case when e.status = 'completed' then e.completed_at
                when m.position <= greatest(1, (mods.total + 1) / 2) then e.started_at
                else null end as completed_at,
           case when m.module_type = 'scorm' then jsonb_build_object('scorm', jsonb_build_object(
                  'lessonStatus', case when e.status = 'completed' then 'passed'
                                       when m.position <= greatest(1, (mods.total + 1) / 2) then 'completed'
                                       else 'incomplete' end,
                  'location', 'page-' || m.position,
                  'suspendData', 'seed'))
                else '{}'::jsonb end as data,
           coalesce(e.completed_at, e.started_at, e.assigned_at) as updated_at
      from enrollments e
      join course_modules m on m.course_id = e.course_id and m.course_version = e.course_version
      join lateral (
        select count(*)::int as total from course_modules cm
         where cm.course_id = e.course_id and cm.course_version = e.course_version
      ) mods on true
     where e.status in ('completed', 'in_progress')
    on conflict (enrollment_id, module_id) do nothing`);
  const progressCount = await db.query<{ count: string }>(`select count(*)::text as count from module_progress`);
  log(`${progressCount.rows[0]?.count ?? 0} module progress records created`);

  // ---------------- Calendar: live training, orientations, store blocks ----------------
  const eventRows: unknown[][] = [];
  const attendeeRows: unknown[][] = [];
  const trainers = people.filter((p) => ["training_manager", "corp_training", "gm"].includes(p.roleCode));

  for (const locId of locationIds) {
    const team = teamByLocation.get(locId) ?? [];
    if (!team.length) continue;
    const gm = gmByLocation.get(locId)!;

    // Monthly orientation + a certification workshop per restaurant.
    for (const offset of [-24, -10, 4, 18, 32]) {
      const start = new Date(daysAhead(offset).setHours(9, 0, 0, 0));
      const eventId = uuid();
      const type = offset % 3 === 0 ? "orientation" : offset % 2 === 0 ? "ilt" : "certification";
      eventRows.push([eventId, orgId,
        type === "orientation" ? "New Hire Orientation Session" : type === "certification" ? "Cook Certification Workshop" : "Guest Experience Live Session",
        "Instructor-led session held in the restaurant training area.", type,
        (chance(0.5) ? gm : pick(trainers)).userId, locId, null, iso(start),
        iso(new Date(start.getTime() + 2 * 3600000)), 12, "Participant guide, station checklist",
        type === "certification" ? courseIds.get("WB-104") : courseIds.get("WB-103"), null, null,
        start < NOW ? "completed" : "scheduled", training.userId]);
      const invited = [...team].sort(() => rnd() - 0.5).slice(0, int(3, 8));
      for (const attendee of invited) {
        const status = start < NOW ? (chance(0.85) ? "attended" : chance(0.5) ? "no_show" : "completed") : "registered";
        attendeeRows.push([uuid(), eventId, attendee.userId, status,
          status === "attended" || status === "completed" ? iso(start) : null, null]);
      }
    }

    // Protected store training blocks scheduled by the manager for individuals.
    for (let i = 0; i < 3; i++) {
      const learner = pick(team);
      const start = new Date(daysAhead(int(1, 20)).setHours(int(9, 16), chance(0.5) ? 0 : 30, 0, 0));
      const eventId = uuid();
      const course = pick(COURSES);
      eventRows.push([eventId, orgId, `Training block — ${course.title}`,
        "Protected learning time scheduled by the restaurant manager.", "training_block",
        gm.userId, locId, null, iso(start), iso(new Date(start.getTime() + 30 * 60000)), 1,
        null, courseIds.get(course.code), null, learner.userId, "scheduled", gm.userId]);
      attendeeRows.push([uuid(), eventId, learner.userId, "registered", null, null]);
    }
  }
  // Corporate virtual sessions open to leadership.
  for (const offset of [3, 11, 25]) {
    const start = new Date(daysAhead(offset).setHours(14, 0, 0, 0));
    const eventId = uuid();
    eventRows.push([eventId, orgId, "Manager Development Virtual Workshop",
      "Corporate-led virtual session for restaurant leadership.", "virtual", training.userId, null,
      "https://virtual.wahlburgers.test/academy/manager-development", iso(start),
      iso(new Date(start.getTime() + 90 * 60000)), 60, "Pre-work: Manager Leadership Essentials",
      courseIds.get("WB-109"), null, null, "scheduled", training.userId]);
    for (const leader of people.filter((p) => ["gm", "agm"].includes(p.roleCode)).slice(0, 25)) {
      attendeeRows.push([uuid(), eventId, leader.userId, chance(0.7) ? "registered" : "canceled", null, null]);
    }
  }
  await insertMany(db, "training_events",
    ["id", "organization_id", "title", "description", "event_type", "instructor_user_id", "location_id",
      "virtual_link", "starts_at", "ends_at", "capacity", "materials", "course_id", "learning_path_id",
      "learner_user_id", "status", "created_by"], eventRows);
  await insertMany(db, "training_attendees",
    ["id", "training_event_id", "user_id", "status", "checked_in_at", "notes"], attendeeRows, "on conflict do nothing");
  log(`${eventRows.length} calendar events created`);

  // ---------------- Academy Feed, reviews, announcements ----------------
  const postRows: unknown[][] = [];
  const postIds: string[] = [];
  FEED_POSTS.forEach((p, i) => {
    const id = uuid(); postIds.push(id);
    const author = [training, admin, gmByLocation.get(flagshipId)!, corpOps][i % 4];
    postRows.push([id, orgId, author.userId, p.type, p.title, p.body, null, null, "organization", orgId,
      i === 1, "published", iso(daysAgo(i * 3 + 1))]);
  });
  for (let i = 0; i < 16; i++) {
    const id = uuid(); postIds.push(id);
    const author = pick(people.filter((p) => p.status === "active"));
    postRows.push([id, orgId, author.userId, pick(["tip", "recognition", "best_practice", "celebration"]),
      null, pick([
        "Great shift tonight — the whole line stayed under 8 minute ticket times through the rush.",
        "Reminder: the new allergen chart is posted at the expo window. Worth a 2 minute read before your shift.",
        "Congrats to our newest Food Safety Certified team members!",
        "Pro tip: pre-portion your shake toppings before the dinner rush. Saves 20 seconds a build.",
        "Guest wrote in to compliment our host team by name today. Proud of this crew.",
      ]), null, null, author.locationId ? "location" : "organization", author.locationId ?? orgId, false, "published",
      iso(daysAgo(int(0, 30)))]);
  }
  await insertMany(db, "social_posts",
    ["id", "organization_id", "author_user_id", "post_type", "title", "body", "image_url", "link_url",
      "audience_type", "audience_id", "is_pinned", "status", "created_at"], postRows);

  const commentRows: unknown[][] = [];
  const reactionRows: unknown[][] = [];
  const bookmarkRows: unknown[][] = [];
  const activePeople = people.filter((p) => p.status === "active");
  for (const postId of postIds) {
    for (let i = 0; i < int(0, 4); i++) {
      commentRows.push([uuid(), postId, pick(activePeople).userId, pick([
        "Love this.", "Great callout — we started doing the same thing at our store.",
        "Congrats team!", "This helped a lot during our launch.", "Sharing with my crew at pre-shift.",
      ]), "published", iso(daysAgo(int(0, 20)))]);
    }
    const reactors = [...activePeople].sort(() => rnd() - 0.5).slice(0, int(3, 22));
    for (const r of reactors) {
      reactionRows.push([uuid(), postId, null, r.userId, pick(["like", "celebrate", "helpful"])]);
    }
    for (const b of [...activePeople].sort(() => rnd() - 0.5).slice(0, int(0, 5))) {
      bookmarkRows.push([postId, b.userId]);
    }
  }
  await insertMany(db, "social_comments", ["id", "post_id", "user_id", "body", "status", "created_at"], commentRows);
  await insertMany(db, "social_reactions", ["id", "post_id", "comment_id", "user_id", "reaction_type"], reactionRows, "on conflict do nothing");
  await insertMany(db, "social_bookmarks", ["post_id", "user_id"], bookmarkRows, "on conflict do nothing");

  const reviewRows: unknown[][] = [];
  for (const e of allCompleted) {
    if (!chance(0.28)) continue;
    const rating = chance(0.72) ? 5 : chance(0.7) ? 4 : chance(0.6) ? 3 : 2;
    reviewRows.push([uuid(), courseIds.get(e.courseCode), e.userId, e.id, rating,
      Math.min(5, rating + (chance(0.3) ? 0 : -1) + 1), rating, rating, Math.max(1, rating - (chance(0.3) ? 1 : 0)),
      chance(0.45) ? pick(REVIEW_COMMENTS) : null,
      e.completedAt ? iso(e.completedAt) : iso(daysAgo(int(1, 90)))]);
  }
  await insertMany(db, "course_reviews",
    ["id", "course_id", "user_id", "enrollment_id", "rating", "useful", "easy_to_understand", "relevant",
      "more_confident", "comments", "created_at"], reviewRows);

  const announcementRows: unknown[][] = [
    [uuid(), orgId, "Specialty Shakes launch this Friday",
      "The Fruity Pebbles and Kit Kat specialty shakes launch systemwide on Friday. Complete your assigned shake training before your first shift this week. Counter service and full service restaurants have different modules — the Academy has already assigned the right one for your restaurant.",
      null, "/library", "organization", orgId, iso(daysAgo(4)), iso(daysAhead(10)), true, true, "published", training.userId],
    [uuid(), orgId, "Food Safety Refresh closes in 5 days",
      "Every team member must complete Food Safety Fundamentals before the end of the campaign. Managers: use My Team to see who is still outstanding and send reminders with one click.",
      null, "/team", "organization", orgId, iso(daysAgo(9)), iso(daysAhead(5)), true, false, "published", training.userId],
    [uuid(), orgId, "Updated Team Member Handbook — acknowledgment required",
      "The Team Member Handbook has been updated for 2026. Please review and acknowledge in the Resource Library.",
      null, "/resources", "organization", orgId, iso(daysAgo(30)), iso(daysAhead(30)), false, true, "published", admin.userId],
    [uuid(), orgId, "Welcome to Wahlburgers Academy",
      "Wahlburgers Academy is now the home for all training — your complete training history, including everything you completed in the previous system, is already here.",
      null, "/dashboard", "organization", orgId, iso(daysAgo(60)), null, false, false, "published", admin.userId],
  ];
  await insertMany(db, "announcements",
    ["id", "organization_id", "title", "message", "image_url", "link_url", "audience_type", "audience_id",
      "publish_at", "expires_at", "is_pinned", "requires_acknowledgment", "status", "created_by"], announcementRows);

  const ackRows: unknown[][] = [];
  const handbookAssetId = assetIds[RESOURCES.findIndex((r) => r.name === "Team Member Handbook")];
  for (const person of activePeople) {
    if (chance(0.62)) {
      ackRows.push([uuid(), person.userId, "announcement", announcementRows[0][0], 1,
        "I have reviewed and understand this announcement.", iso(daysAgo(int(0, 4)))]);
    }
    if (chance(0.55) && handbookAssetId) {
      ackRows.push([uuid(), person.userId, "asset", handbookAssetId, 1,
        "I have reviewed and understand this policy.", iso(daysAgo(int(1, 30)))]);
    }
  }
  await insertMany(db, "acknowledgments",
    ["id", "user_id", "entity_type", "entity_id", "entity_version", "statement", "acknowledged_at"], ackRows, "on conflict do nothing");

  // ---------------- Notifications ----------------
  const notificationRows: unknown[][] = [];
  for (const person of activePeople) {
    const notes: Array<[string, string, string, string]> = [];
    notes.push(["training_assigned", "New training assigned", "Specialty Shakes training has been assigned to you.", "/my-learning"]);
    if (chance(0.5)) notes.push(["due_soon", "Training due soon", "Menu Knowledge Certification is due in 5 days.", "/my-learning"]);
    if (chance(0.3)) notes.push(["overdue", "Overdue training", "Food Safety Fundamentals is past due. Please complete it today.", "/my-learning"]);
    if (chance(0.25)) notes.push(["badge_earned", "You earned a badge", "Training All-Star badge added to your achievements.", "/achievements"]);
    if (chance(0.2)) notes.push(["announcement", "New announcement", "Specialty Shakes launch this Friday.", "/feed"]);
    notes.forEach(([type, title, body, link], i) => {
      notificationRows.push([uuid(), person.userId, type, title, body, link, "in_app", chance(0.45), iso(daysAgo(int(0, 12) + i))]);
    });
  }
  await insertMany(db, "notifications",
    ["id", "user_id", "type", "title", "body", "link", "channel", "is_read", "created_at"], notificationRows);

  // ---------------- Settings, saved and scheduled reports ----------------
  await insertMany(db, "settings", ["key", "value", "updated_by"], [
    ["inactivity_rules", JSON.stringify({ enabled: true, flagAfterDays: 30, notifyManager: true, notifyAdmin: true, autoDeactivateAfterDays: 60, autoDeactivate: false }), admin.userId],
    ["risk_thresholds", JSON.stringify({ green: 90, yellow: 75 }), admin.userId],
    ["health_score_weights", JSON.stringify({ requiredCompletion: 40, overdue: 25, certification: 20, activity: 10, newHire: 5 }), admin.userId],
    ["leaderboard_scoring", JSON.stringify({ requiredCompletion: 50, learningPaths: 20, certifications: 15, achievements: 10, engagement: 5, rewardTimeSpent: false }), admin.userId],
    ["certification_reminders", JSON.stringify({ days: [90, 60, 30, 14, 7] }), admin.userId],
    ["branding", JSON.stringify({ productName: "Wahlburgers Academy", primaryColor: "#0e1f38", accentColor: "#c8102e", supportEmail: "academy@wahlburgers.test" }), admin.userId],
    ["new_hire_window_days", JSON.stringify({ days: 60 }), admin.userId],
  ]);

  const savedReportIds = [uuid(), uuid(), uuid()];
  await insertMany(db, "saved_reports",
    ["id", "organization_id", "name", "description", "report_key", "config", "owner_user_id", "is_shared"], [
      [savedReportIds[0], orgId, "Weekly Franchise Training Compliance", "Required completion and overdue counts by franchise group.",
        "location_completion", JSON.stringify({ groupBy: "franchise_group", columns: ["name", "employees", "completion", "overdue"], filters: { required: true } }), training.userId, true],
      [savedReportIds[1], orgId, "Certifications Expiring in 60 Days", "All certifications expiring inside the next 60 days.",
        "certification_compliance", JSON.stringify({ filters: { expiringWithinDays: 60 }, sort: "expires_at" }), training.userId, true],
      [savedReportIds[2], orgId, "New Hire Progress — Last 30 Days", "New hire orientation progress for recent hires.",
        "new_hire_progress", JSON.stringify({ filters: { hiredWithinDays: 30 } }), corpOps.userId, true],
    ]);
  await insertMany(db, "scheduled_reports",
    ["id", "organization_id", "name", "report_key", "saved_report_id", "frequency", "day_of_week", "hour",
      "recipients", "format", "filters", "is_active", "last_run_at", "next_run_at", "created_by"], [
      [uuid(), orgId, "Monday Franchise Compliance", "location_completion", savedReportIds[0], "weekly", 1, 7,
        ["training@wahlburgers.test", "ops@wahlburgers.test"], "xlsx", JSON.stringify({}), true, iso(daysAgo(3)), iso(daysAhead(4)), training.userId],
      [uuid(), orgId, "Daily Overdue Training Digest", "overdue_training", null, "daily", null, 6,
        ["ops@wahlburgers.test"], "csv", JSON.stringify({}), true, iso(daysAgo(1)), iso(daysAhead(1)), corpOps.userId],
      [uuid(), orgId, "Monthly Executive Summary", "training_completion", null, "monthly", null, 8,
        ["exec@wahlburgers.test"], "pdf", JSON.stringify({}), true, iso(daysAgo(18)), iso(daysAhead(12)), admin.userId],
    ]);

  // ---------------- Audit log ----------------
  const auditRows: unknown[][] = [];
  const auditActions: Array<[string, string, string]> = [
    ["employee.created", "employee", "Employee created"],
    ["employee.transferred", "employee", "Employee transferred between restaurants"],
    ["employee.deactivated", "employee", "Employee deactivated by inactivity rule"],
    ["employee.reactivated", "employee", "Employee reactivated"],
    ["training.assigned", "assignment", "Training assignment published"],
    ["course.published", "course", "Course published"],
    ["scorm.uploaded", "scorm_package", "SCORM package uploaded"],
    ["migration.run", "migration", "Legacy migration batch imported"],
    ["report.exported", "report", "Report exported"],
    ["announcement.published", "announcement", "Announcement published"],
    ["permission.changed", "role", "Role permissions updated"],
  ];
  for (let i = 0; i < 220; i++) {
    const [action, entity, label] = auditActions[i % auditActions.length];
    const actor = pick([admin, training, corpOps, gmByLocation.get(flagshipId)!]);
    auditRows.push([uuid(), iso(daysAgo(int(0, 45))), actor.userId, `${actor.first} ${actor.last}`, action, entity,
      null, label, null, null, `10.24.${int(1, 250)}.${int(1, 250)}`, "Wahlburgers Academy Web"]);
  }
  await insertMany(db, "audit_logs",
    ["id", "occurred_at", "actor_user_id", "actor_name", "action", "entity_type", "entity_id", "entity_label",
      "previous_value", "new_value", "ip_address", "user_agent"], auditRows);

  // ---------------- Derived rollups ----------------
  await db.query(`
    update courses c set
      rating_avg = coalesce(r.avg_rating, 0),
      rating_count = coalesce(r.cnt, 0),
      completion_count = coalesce(x.completions, 0)
    from (select id from courses) base
    left join (select course_id, round(avg(rating)::numeric, 2) as avg_rating, count(*) as cnt from course_reviews group by course_id) r
      on r.course_id = base.id
    left join (select course_id, count(*) as completions from enrollments where status = 'completed' group by course_id) x
      on x.course_id = base.id
    where c.id = base.id`);

  await db.query(`
    update learning_path_enrollments lpe set
      progress = coalesce(p.pct, 0),
      status = case when coalesce(p.pct, 0) >= 100 then 'completed' else 'in_progress' end,
      completed_at = case when coalesce(p.pct, 0) >= 100 then now() - interval '3 days' else null end
    from (
      select e.user_id, e.learning_path_id,
             round(100.0 * count(*) filter (where e.status = 'completed') / nullif(count(*), 0), 0) as pct
        from enrollments e
       where e.learning_path_id is not null
       group by e.user_id, e.learning_path_id
    ) p
    where p.user_id = lpe.user_id and p.learning_path_id = lpe.learning_path_id`);

  // Enrollments past their due date that were never completed are overdue by definition;
  // the status column stays factual (not_started / in_progress) and reporting derives
  // "overdue" from due_at, which keeps historical records honest.
  await db.query(`analyze`);

  log(`seed complete in ${Math.round((Date.now() - started) / 1000)}s`);
}
