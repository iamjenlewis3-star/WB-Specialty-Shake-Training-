# Leadership demonstration script

A 12–15 minute walkthrough that proves Wahlburgers can move off the current LMS without losing
functionality, history, reporting or franchise visibility.

Sign in at `/login`. Password for every account is `Academy2026!`.

---

## 1 · Corporate opens the Academy Command Center (2 min)

1. Sign in as **admin@wahlburgers.test**.
2. You land on the corporate dashboard. Click **Command Center**.
3. Talk to the hero band: systemwide required completion, completions today and this week, overdue
   learners, inactive learners, restaurants below standard, certifications expiring, new hires in
   training, average course rating, training hours.
4. Scroll to **Locations requiring attention** — the health score blends completion, overdue,
   certification risk and activity, and the weights are configurable in Admin → Settings.

## 2 · Drill into a restaurant and an employee (2 min)

5. In **Locations requiring attention**, click the lowest restaurant.
6. Point out the roster sorted by lowest completion, certifications expiring and inactive users.
7. Click any employee to open their profile.

## 3 · The history question (2 min)

8. On the employee profile, click **Transcript**.
9. This is the centrepiece: **Legacy LMS** and **Wahlburgers Academy** records in one continuous
   record, with course, version, dates, score, status, duration, certification and source system.
10. Filter **Source system → Legacy LMS**, then clear it. Use **Print / PDF** or **Export CSV** to
    show the record leaves the platform whenever Wahlburgers wants it.
11. Optional: open **Admin → Data Migration** and show the counts of employees, historical
    completions, courses, assessments, certifications and learning paths already migrated, plus the
    batch history and downloadable error reports.

## 4 · Content and SCORM (3 min)

12. Go to **Admin → Courses → New course**, create a course (title, code, objectives, duration,
    passing score, certification) and save.
13. In the builder, add modules — drag to reorder, and show the module types: SCORM, video,
    document, policy acknowledgment, checklist, assessment, manager validation, instructor-led.
14. Go to **Admin → SCORM Packages**, upload one of the `WB_SpecialtyShakes_*.zip` archives from the
    repository root, tick **Add as a course module** and select your new course. The package is
    validated, extracted and attached.
15. Back in the course builder, click **Publish course**.

## 5 · Assign it (2 min)

16. Go to **Admin → Assignments → New assignment**.
17. Choose the course, then tick a role (for example **Hourly Employee**) or a region. Watch the
    **Audience** counter compute the exact learner population before you publish.
18. Set a due date and priority, then **Publish assignment**. The confirmation states how many
    learner records were created.

## 6 · Switch to the learner (2 min)

19. Open the user menu → **Demo role switcher** → **Cook (Learner)**. (This signs in as that persona
    for real — every restriction you see next is genuinely enforced.)
20. The new training is on the learner's home and in **My Learning**. Open it.
21. Launch the SCORM module: it runs inside the Academy, reports status and score back, and saves
    bookmarks and suspend data. Complete the knowledge check.
22. On completion the course lands on the transcript, the certification is issued and any badge is
    awarded.

## 7 · Roll it back up (2 min)

23. Switch to **General Manager** — the team roster shows the completion move, and the manager can
    send reminders, schedule a protected training block, or record a manager validation.
24. Switch to **Franchise Business Partner** — portfolio metrics for their restaurants only. Try
    opening a restaurant outside the portfolio: the platform refuses, because access is enforced in
    the database layer.
25. Switch back to **Corporate Administrator** — Command Center and executive analytics reflect the
    same completion, and **Reports** exports the evidence as CSV or XLSX.

---

## Optional segments

**Live migration (3 min).** Admin → Data Migration → select **Historical training**, upload
`demo-data/legacy-historical-training.csv`, review the auto-mapped columns, validate. The file
deliberately contains an unknown employee, a malformed date, a course that never existed in the
Academy catalog and a duplicate row, so validation, matching and the error report are all visible.
Import, then open the report and download the error CSV. Open the affected employee's transcript to
show the newly imported records sitting alongside their Academy training.

**Employee import (2 min).** Admin → People → Import Employees with `demo-data/legacy-employees.csv`.

**Automation (1 min).** Admin → Automated assignments — the rules that assign New Hire Orientation on
hire, Cook Certification by role, and local training on transfer. Use **Run now** to evaluate one.

**Engagement (1 min).** Academy Feed, announcements with acknowledgment capture, achievements and the
leaderboard (which deliberately rewards completion and certification, not time spent in a course).

**Operations (1 min).** Calendar → schedule an instructor-led session or a protected store training
block; record attendance and watch it complete the linked course on the attendees' records.
