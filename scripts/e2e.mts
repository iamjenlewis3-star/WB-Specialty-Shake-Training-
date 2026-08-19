/**
 * End-to-end browser test of the leadership demonstration flow.
 *
 * Drives the real UI (server actions and all) against a running server:
 *   sign in → create a course → add a module → publish → assign to a role →
 *   sign in as the learner → complete the course → verify the transcript.
 *
 * Usage:  npm start   (in one shell)
 *         npm run e2e (in another)
 */
import { chromium, type Page } from "playwright";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const PASSWORD = "Academy2026!";
const stamp = Date.now().toString().slice(-6);
const COURSE_TITLE = `E2E Shake Standards ${stamp}`;
const COURSE_CODE = `E2E-${stamp}`;

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failed += 1; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

async function signIn(page: Page, email: string) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="identifier"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL(/\/dashboard/, { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on("pageerror", (err) => console.log(`  ! page error: ${err.message}`));

console.log("Wahlburgers Academy — end-to-end demo flow\n==========================================");

console.log("\n▸ Sign in as Corporate Administrator");
await signIn(page, "admin@wahlburgers.test");
check("administrator lands on a dashboard", page.url().includes("/dashboard"));
check("corporate dashboard renders", (await page.locator("h1").first().innerText()).includes("Good to see you"));

console.log("\n▸ Command Center");
await page.goto(`${BASE}/command-center`, { waitUntil: "domcontentloaded" });
check("command center renders systemwide completion",
  (await page.getByText("Systemwide required completion").count()) > 0);

console.log("\n▸ Create a course");
await page.goto(`${BASE}/admin/courses/new`, { waitUntil: "domcontentloaded" });
await page.fill('input[name="title"]', COURSE_TITLE);
await page.fill('input[name="code"]', COURSE_CODE);
await page.fill('textarea[name="description"]', "End-to-end verification course.");
await page.fill('textarea[name="objectives"]', "Build the shake to spec\nHold quality during a rush");
await page.fill('input[name="estimated_minutes"]', "15");
await Promise.all([
  page.waitForURL(/\/admin\/courses\/[0-9a-f-]{36}/, { timeout: 30000 }),
  page.click('button[type="submit"]'),
]);
const courseUrl = page.url();
const courseId = courseUrl.match(/courses\/([0-9a-f-]{36})/)![1];
check("course created and builder opens", Boolean(courseId));

console.log("\n▸ Add a module");
await page.getByRole("button", { name: /Add module/i }).click();
await page.fill('input[name="title"]', "Shake build overview");
await page.selectOption('select[name="module_type"]', "text");
await page.fill('textarea[name="content_text"]', "## Build standard\n\nThree pumps of base, whipped cream crown, garnish.");
await page.fill('input[name="min_seconds"]', "0");
await Promise.all([
  page.waitForURL(/toast=/, { timeout: 30000 }),
  page.getByRole("button", { name: /^Add module$/ }).last().click(),
]);
await page.waitForSelector('[data-testid="course-module"]', { timeout: 30000 }).catch(() => {});
check("module appears in the builder", (await page.locator('[data-testid="course-module"]').count()) > 0);

console.log("\n▸ Publish the course");
await page.getByRole("button", { name: /Publish course/i }).click();
await Promise.all([
  page.waitForURL(/toast=/, { timeout: 30000 }),
  page.getByRole("button", { name: /^Publish$/ }).click(),
]);
await page.waitForTimeout(500);
check("course status is published", (await page.getByText("published", { exact: false }).count()) > 0);

console.log("\n▸ Assign it to the Cook position");
await page.goto(`${BASE}/admin/assignments/new`, { waitUntil: "domcontentloaded" });
await page.selectOption('select[name="course_id"]', { label: new RegExp(COURSE_TITLE.slice(0, 20)) as never as string })
  .catch(async () => {
    const option = await page.locator(`select[name="course_id"] option`, { hasText: COURSE_TITLE }).first().getAttribute("value");
    await page.selectOption('select[name="course_id"]', option!);
  });
await page.fill('input[name="title"]', `E2E assignment ${stamp}`);
// Target the flagship restaurant so the assignment reaches the demo learner.
await page.getByRole("checkbox", { name: /Boston Seaport/ }).check();
await page.waitForFunction(
  () => {
    const el = document.querySelector('[data-testid="audience-count"]');
    return Boolean(el && /[1-9]/.test(el.textContent ?? ""));
  },
  undefined,
  { timeout: 30000 },
).catch(() => {});
const audience = await page.locator('[data-testid="audience-count"]').innerText();
check("audience estimate computed before publishing", Number(audience.replace(/[^0-9]/g, "")) > 0, `audience: ${audience}`);
const dueDate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
await page.fill('input[name="due_at"]', dueDate);
await Promise.all([
  page.waitForURL(/\/admin\/assignments\/[0-9a-f-]{36}/, { timeout: 60000 }),
  page.getByRole("button", { name: /Publish assignment/i }).click(),
]);
const assignmentUrl = page.url();
const learnerRows = await page.locator("table tbody tr").count();
check("assignment published with learner records", learnerRows > 0, `${learnerRows} learner rows`);

console.log("\n▸ Learner completes the training");
const learnerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const learner = await learnerContext.newPage();
await signIn(learner, "gm@wahlburgers.test");
await learner.goto(`${BASE}/my-learning?q=${encodeURIComponent(COURSE_TITLE.slice(0, 18))}`, { waitUntil: "domcontentloaded" });
await learner.waitForTimeout(300);
const assigned = await learner.getByText(COURSE_TITLE).count();
check("new assignment appears in the learner's My Learning", assigned > 0);

await learner.getByRole("link", { name: COURSE_TITLE }).first().click();
await learner.waitForURL(/\/learn\/[0-9a-f-]{36}/, { timeout: 30000 });
check("course player opens", learner.url().includes("/learn/"));
check("module content renders", (await learner.getByText("Build standard").count()) > 0);

await Promise.all([
  learner.waitForURL(/\/learn\//, { timeout: 30000 }),
  learner.getByRole("button", { name: /Mark complete/i }).click(),
]);
await learner.waitForTimeout(800);
check("completion confirmed in the player", (await learner.getByText("Course complete").count()) > 0);

console.log("\n▸ Transcript and reporting reflect it");
await learner.goto(`${BASE}/my-learning?filter=completed`, { waitUntil: "domcontentloaded" });
check("course shows as completed in My Learning", (await learner.getByText(COURSE_TITLE).count()) > 0);

const learnerId = await learner.evaluate(() => document.querySelector('a[href^="/people/"]')?.getAttribute("href") ?? "");
await learner.goto(`${BASE}${learnerId || "/profile"}`, { waitUntil: "domcontentloaded" });

await page.goto(`${BASE}/reports/course_completion?q=${encodeURIComponent(COURSE_TITLE.slice(0, 18))}`, { waitUntil: "domcontentloaded" });
check("new course appears in the course completion report", (await page.getByText(COURSE_TITLE).count()) > 0);

console.log("\n▸ Transcript shows legacy and Academy records together");
await page.goto(`${BASE}/admin/people?q=Kayla`, { waitUntil: "domcontentloaded" });
const personLink = await page.locator('a[href^="/people/"]').first().getAttribute("href");
await page.goto(`${BASE}${personLink}/transcript`, { waitUntil: "domcontentloaded" });
const legacyCount = await page.getByText("Legacy LMS").count();
const academyCount = await page.getByText("Wahlburgers Academy").count();
check("transcript shows migrated legacy records", legacyCount > 0, `${legacyCount} mentions`);
check("transcript shows Academy records", academyCount > 0, `${academyCount} mentions`);

console.log("\n▸ Data migration wizard");
await page.goto(`${BASE}/admin/migration`, { waitUntil: "domcontentloaded" });
await page.selectOption('select[name="data_type"]', "historical_training");
await page.setInputFiles('input[type="file"]', "demo-data/legacy-historical-training.csv");
await Promise.all([
  page.waitForURL(/\/admin\/migration\/[0-9a-f-]{36}/, { timeout: 60000 }),
  page.getByRole("button", { name: /Upload and preview/i }).click(),
]);
check("migration wizard opens with the uploaded file", page.url().includes("/admin/migration/"));
check("columns auto-mapped", (await page.locator('select[name="map_employee_id"]').inputValue()) === "Employee ID");
await page.getByRole("checkbox", { name: /Create courses that don't exist/i }).check();
await Promise.all([
  page.waitForURL(/step=validate/, { timeout: 90000 }),
  page.getByRole("button", { name: /Validate/i }).click(),
]);
const errorsTile = await page.locator('[data-testid="kpi-errors"]').innerText().catch(() => "0");
check("validation reports errors for the bad rows", Number(errorsTile.replace(/[^0-9]/g, "")) > 0, `errors: ${errorsTile}`);
check("validation reports duplicates", (await page.getByText("Duplicates", { exact: true }).count()) > 0);
await Promise.all([
  page.waitForURL(/\/admin\/migration\/report\//, { timeout: 120000 }),
  page.getByRole("button", { name: /Import .* records/i }).click(),
]);
const reportText = await page.locator("body").innerText();
check("migration report shows imported records", /Imported/.test(reportText));
check("migration report shows failed rows with reasons", /Unknown employee|Invalid date/.test(reportText));

console.log("\n▸ Scheduled maintenance");
await page.goto(`${BASE}/admin/settings`, { waitUntil: "domcontentloaded" });
await Promise.all([
  page.waitForURL(/toast=/, { timeout: 120000 }),
  page.getByRole("button", { name: /Run daily automations now/i }).click(),
]);
check("daily automations run and report what they did", decodeURIComponent(page.url()).includes("Automations complete"),
  decodeURIComponent(page.url()).split("toast=")[1]?.slice(0, 80));

console.log("\n▸ Profile photo and course artwork");
// A one-pixel PNG, built here so the test never depends on a checked-in binary.
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64");
await page.goto(`${BASE}/profile`, { waitUntil: "domcontentloaded" });
await page.setInputFiles('input[name="photo"]', { name: "me.png", mimeType: "image/png", buffer: ONE_PIXEL_PNG });
await Promise.all([
  page.waitForURL(/toast=/, { timeout: 120000 }),
  page.getByRole("button", { name: /Upload photo/i }).click(),
]);
const toastText = (url: string) => decodeURIComponent(url).replace(/\+/g, " ");
check("profile photo uploads", toastText(page.url()).includes("Photo updated"), page.url());
const photoSrc = await page.locator('img[src^="/api/media/"]').first().getAttribute("src").catch(() => null);
check("profile photo renders from private media storage", Boolean(photoSrc), String(photoSrc));
if (photoSrc) {
  const authed = await page.request.get(`${BASE}${photoSrc}`);
  check("a signed-in request can read the photo", authed.status() === 200, String(authed.status()));
  const anon = await browser.newContext();
  const anonRes = await anon.request.get(`${BASE}${photoSrc}`);
  check("an anonymous request cannot read the photo", anonRes.status() === 401, String(anonRes.status()));
  await anon.close();
}

await page.goto(`${BASE}/admin/courses/${courseId}`, { waitUntil: "domcontentloaded" });
await page.setInputFiles('input[name="thumbnail"]', { name: "art.png", mimeType: "image/png", buffer: ONE_PIXEL_PNG });
await Promise.all([
  page.waitForURL(/toast=/, { timeout: 120000 }),
  page.getByRole("button", { name: /Save course settings/i }).click(),
]);
check("course artwork uploads", toastText(page.url()).includes("Course updated"), page.url());
check("course artwork is stored as media",
  (await page.locator('img[src^="/api/media/"]').count()) > 0);

// Back to a clean URL so the toast assertion below cannot match the previous one.
await page.goto(`${BASE}/admin/courses/${courseId}`, { waitUntil: "domcontentloaded" });
await page.setInputFiles('input[name="thumbnail"]', { name: "shell.png", mimeType: "image/png", buffer: Buffer.from("<?php echo 1; ?>") });
await Promise.all([
  page.waitForURL(/toast=/, { timeout: 120000 }),
  page.getByRole("button", { name: /Save course settings/i }).click(),
]);
check("a script renamed to .png is refused by the upload",
  toastText(page.url()).includes("not a readable image"), toastText(page.url()).slice(-80));

console.log("\n▸ Access control in the browser");
const cookContext = await browser.newContext();
const cookPage = await cookContext.newPage();
await signIn(cookPage, "cook@wahlburgers.test");
await cookPage.goto(`${BASE}/admin/people`, { waitUntil: "domcontentloaded" });
check("learner is redirected away from admin people", cookPage.url().includes("/denied"), cookPage.url());
await cookPage.goto(`${BASE}/command-center`, { waitUntil: "domcontentloaded" });
check("learner is redirected away from the command center", cookPage.url().includes("/denied"));

console.log("\n▸ Dark mode and mobile");
await cookPage.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
await cookPage.locator('button[title="Dark theme"]').first().click();
await cookPage.waitForTimeout(400);
const isDark = await cookPage.evaluate(() => document.documentElement.classList.contains("dark"));
check("dark mode toggles", isDark);

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const mobilePage = await mobile.newPage();
await signIn(mobilePage, "cook@wahlburgers.test");
check("mobile bottom navigation is visible", await mobilePage.locator('nav[aria-label="Primary mobile"]').isVisible());
const horizontalOverflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
check("no horizontal overflow on mobile", !horizontalOverflow);

await mobilePage.screenshot({ path: "/tmp/wb-mobile-dashboard.png" });
await page.screenshot({ path: "/tmp/wb-desktop-transcript.png", fullPage: false });

await browser.close();
console.log(`\n==========================================\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
