# STC Testing System — Test Report

> **Latest: v1.2.0 (stc.edu.pk-style restyle + clean seed, no dummy data) verified
> 2026-11-16 ~07:56 UTC — E2E 149/149 PASS + headless-browser drive 28/28 PASS
> (0 JS errors). See "Restyle + clean seed 2026-11-16 — v1.2.0" at the end of
> this file. The v1.1.0 and v1.0.0 reports below are kept as history.**

**Date:** 2026-11-15 (verification run 2026-11-16 06:25 UTC on this machine)
**Version:** 1.0.0 · **Node:** v24.22.1 · **DB backends tested:** SQLite (`node:sqlite`) + JSON fallback
**Result: 92 / 92 checks PASS** (script `e2e-test.js`, exit code 0)

## How it was verified

1. Fresh database (deleted `data/stc.sqlite`), server started on test port 3102 —
   auto-seed on first start confirmed in the server log.
2. `node e2e-test.js http://127.0.0.1:3102` — scripted API end-to-end run (fetch),
   covering the full workflow: student test → teacher grading → Admin monthly
   report → 7:30 PM consolidation → Principal analytics, plus CSV import/export,
   logins, and code-level checks of the offline queue and teacher fallback.
3. JSON fallback verified separately by disabling `node:sqlite` in a scratch copy:
   health reports `db: "json"`, same seed (16 users / 7 courses / 17 students /
   2 tests), lookups and teacher list work, data persists as per-collection
   `.json` files in `data/`.
4. CSV BOM verified independently with `od` (first bytes `ef bb bf`).
5. `node --check` passes for `server.js`, `seed.js`, `e2e-test.js`, `public/app.js`.

## Results by area (92 checks)

| # | Area | Checks | Result |
|---|---|---|---|
| 1 | Health + static serving (landing, app.js, style.css, template) | 7 | 7 PASS |
| 2 | Logins — principal (Ramesh Kumar), admin (Danish Mustafa), **all 14 teachers**; wrong password → 401; removed teachers nadir/dileep → 401 | 19 | 19 PASS |
| 3 | Reference data — 14 teachers, no password-hash leak, E-commerce & Digital Marketing have no teacher (expected), 11 DIT instructors (fallback pool), 7 courses, 11 shifts | 7 | 7 PASS |
| 4 | Roll lookup auto-fill — STC-2026-001 → kelash, -012 → ghansham, -017 → kapil; unknown roll → found:false; **every teacher has ≥1 seeded student** (17 students) | 5 | 5 PASS |
| 5 | Tests — DIT monthly test month `2026-11`, 13 questions, anonymous fetch strips `correct`/`model_answer`, teacher fetch includes them, `?month=` filter, CIT quiz month null | 6 | 6 PASS |
| 6 | Submission + auto-score — 8/10 MCQ correct → 16/20, theory_max 30, total 16/50; **same client_id deduped**; CIT quiz 5/5 → 10/10 | 6 | 6 PASS |
| 7 | Teacher queue filtering — kelash sees only own (1), `teacher_id` spoof ignored, qurban sees only own (1), cross-teacher read → 403, admin sees all 3 | 5 | 5 PASS |
| 8 | Grading flow — send before grading → 400, grade 8+7+9 → total 40/50 graded, send → sent_to_admin, admin finalize → final | 4 | 4 PASS |
| 9 | Monthly report — 2026-11 row 40/50, 80%, Pass; CIT daily quiz excluded; 2026-10 empty; monthly + day CSV exports 200 with BOM | 5 | 5 PASS |
| 10 | Principal analytics — day (3 total, 1 final) + per-shift breakdown; month analytics load | 3 | 3 PASS |
| 11 | 7:30 PM consolidation — run → 3 rows locked; re-run idempotent; history lists today once; principal day sheet 3 rows; kelash day sheet 1 row; grading locked → 403; consolidation CSV + BOM | 7 | 7 PASS |
| 12 | CSV import — 2 imported (incl. quoted-comma name), 1 bad-shift row error, re-import skips 2 duplicates | 3 | 3 PASS |
| 13 | Test builder — monthly test without month → 400; with month → 201; teacher creating test → 403 | 3 | 3 PASS |
| 14 | Offline queue / session-clear / fallback (code-level) — `stc_offline_queue`, 15 s retry, "Saved offline", "Sync now", client_id dedupe, `sessionStorage.clear`, reset to blank start, DIT fallback + note + note element, login hint lists all 14 teachers | 11 | 11 PASS |
| 15 | Zero external requests — no `http(s)://` URLs or CDN references in `public/` | 1 | 1 PASS |
| | **Total** | **92** | **92 PASS, 0 FAIL** |

## Issues found during verification (all fixed)

1. **First E2E run: 85 PASS, 7 FAIL.** Six were test-script mistakes, fixed in
   `e2e-test.js` (not product bugs): submission POST returns 201, not 200;
   `fetch` `text()` strips the UTF-8 BOM so CSV checks now read raw bytes;
   day-analytics `totals.submitted` counts only status=submitted — the check now
   uses `totals.total`.
2. **One real product fix:** `GET /api/consolidation/:date` returned `locked`
   as the raw SQLite integer `1` instead of boolean `true`. Fixed in `server.js`
   (`locked: !!c.locked`). Re-run: **92/92 PASS**.
3. **Faculty updates applied mid-build** (user corrections): replaced the 3
   sample teachers with the real 13, then removed Nadir Ali + Dileep Kumar and
   added Ghansham Kachhi, Pawan, Kapil (final: 14 teachers). Seed, login hint,
   and student spread updated; stale test database wiped and re-seeded; verified
   removed logins return 401.
4. **Teacher dropdown fallback added** (coordinator fix in `public/app.js`):
   courses with no assigned teacher (E-commerce, Digital Marketing) now show all
   11 Computer Instructors with an explanatory note instead of an empty dropdown.

## What was NOT verified here (needs an on-site check)

- **Real browser run:** this environment has no live browser, so the exam screen,
  countdown timer, palette clicks, and the offline queue's in-browser behaviour
  were verified at code level (plus server-side dedupe), not by driving a browser.
  Recommended on-site smoke test: open the student portal on a laptop, take the
  CIT quiz, disconnect Wi-Fi mid-submit, confirm "Saved offline", reconnect,
  confirm it syncs; then confirm the start screen is blank for the next student.
- **7:30 PM auto-trigger timing:** the scheduler code runs (checked every minute,
  fires at 19:30 server-local) but the wall-clock firing was not waited on; the
  manual consolidation endpoint — the same code path — is fully verified above.
- **80-laptop concurrency** was not load-tested; the server is single-process
  Node with synchronous SQLite/JSON writes, which is ample for one submission
  every few seconds but has not been stress-tested.
- **Windows `START.bat`** was written but not executed on Windows (verified by
  reading; the equivalent `start.sh` path and `node server.js` were run here).

## Re-running the verification

```sh
# from the package folder:
rm -f data/stc.sqlite data/*.json
PORT=3102 node server.js &   # auto-seeds on first start
node e2e-test.js http://127.0.0.1:3102
# expected: E2E RESULT: 92 PASS, 0 FAIL
```

Then delete the test database again (`rm -f data/stc.sqlite data/*.json`) so the
shipped package starts clean on the Admin PC.

## Fix 2026-11-15 ~22:49 PST — START.bat line endings (CRLF)
On the user's Windows PC, double-clicking START.bat flashed a cmd window and closed instantly. Root cause: START.bat was saved with Unix LF line endings (0 CR characters), which Windows cmd.exe does not reliably parse. Fix: converted START.bat to Windows CRLF line endings (55/55 lines). No content changed. ZIP rebuilt with the fixed file. Node.js on the user's PC verified v25.9.0 (installed, not the problem).

## Fix 2026-11-15 ~22:54 PST — Port 3000 already in use (EADDRINUSE)
On the user's PC, `node server.js` loaded SQLite + seed data fine, then crashed: `listen EADDRINUSE: address already in use 0.0.0.0:3000` — something else on that PC already uses port 3000. Fix: START.bat now checks with netstat whether port 3000 is LISTENING and automatically falls back to port 3001 (all printed URLs use the chosen port). Manual workaround: `set PORT=3001 && node server.js`, then open http://localhost:3001. ZIP rebuilt with the updated START.bat (CRLF kept).


---

## Rework 2026-11-16 — v1.1.0: Separate portals + strict roll validation

**Date:** 2026-11-16 (verification run 2026-11-16 ~07:35 UTC on this machine)
**Version:** 1.1.0 · **Node:** v24.22.1 · **DB backend tested:** SQLite (`node:sqlite`)
**Result: 145 / 145 E2E checks PASS** (script `e2e-test.js`, exit code 0) **+ 40 / 40
headless-browser checks PASS** (Playwright-core + Chromium, script kept outside
the package at `/tmp/browser-check.js` — it needs a Chromium install the Admin PC
does not have, so it is not shipped).

### What changed in this rework

1. **Separate portals.** The single-page app was split into 5 pages with 5 URLs:
   `/` (landing, 4 entry buttons only), `/student`, `/teacher`, `/admin`,
   `/principal`. Each staff portal is a login shell only — the console markup
   lives in `fragments/` (outside `public/`, never served statically) and is
   fetched only after a successful login with the matching role
   (`/fragments/:name`, 401 without token, 403 wrong role). No page contains
   links to other portals; each portal has only its own Logout (back to its own
   login). Login accepts an optional `role` parameter: a valid login with the
   wrong role gets 403 `wrong_role` ("Ye login sirf Admin ke liye hai / This
   login is for Admin only") and no token. The SPA fallback was removed —
   unknown paths now return 404. Admin console has a Study-Vault-style sidebar
   (Dashboard, Students, Tests, Results, Monthly Reports, 7:30 PM Consolidation,
   Courses, Teachers). `public/app.js` was split into `common.js` (shared) +
   `student.js`, `teacher.js`, `admin.js`, `principal.js`, `landing.js`.
2. **Login actually gates the console.** Unauthenticated visits to `/teacher`,
   `/admin`, `/principal` show only the login form — verified both in served
   HTML (no console ids present) and in a real headless browser (console
   container empty, no dashboard markup in the DOM). Wrong password →
   "Ghalat username ya password / Incorrect username or password". 401 from any
   API → back to that portal's login with "Session expired — please login
   again". Each login screen shows a small demo hint with that portal's logins.
3. **Strict student roll validation** (deliberate spec change, replaces the
   manual-entry fallback, which was removed from frontend and server). Student
   enters a roll number → server lookup against the registered list → not
   found: "Ye roll number list mein nahi hai — Admin se rabta karein", no entry
   to any test. Found: registered details (name, father's name, course, shift,
   assigned teacher) shown read-only → confirm → test list → exam. Server-side
   too: `POST /api/submissions` requires a registered roll (unknown → 404
   `roll_not_registered`) and builds the submission from the **registered**
   record — client-supplied name/course/teacher are ignored (verified with a
   tampered payload). README §2/§6 now explain: import real student lists
   first, only listed roll numbers can take tests.
4. **Teacher portal** unchanged in behaviour (own students only, server-enforced
   + 403-tested, side-by-side grading, Generate Result & Send to Admin) in the
   new separate page. Everything else unchanged: 11 shifts, 7:30 PM
   consolidation button + 19:30 scheduler, monthly tests with month field,
   monthly reports, CSV import/export + print sheets, offline queue + auto
   session-clear after submit, 14 teachers, 7 courses, seed data, Navy/White/
   Emerald branding. `START.bat` untouched (CRLF, 62/62 lines, port 3000→3001
   auto-fallback — re-verified before re-zipping).

### How it was verified

1. Fresh database, server on test port 3102, `node e2e-test.js
   http://127.0.0.1:3102` — 145 checks, exit 0, **first full run passed with no
   product failures**.
2. Headless-browser drive (Playwright-core 1.65 + Chromium 1254) on test port
   3104: landing → login gating → wrong password / wrong role errors → admin
   login + sidebar + logout → student unknown-roll block + read-only details →
   exam + submit + blank start screen → teacher own-queue-only + grade + send
   to admin → principal analytics → no cross-portal links on any portal page
   → zero JS page errors. 40/40 PASS.
3. Smoke checks during the build (port 3103): fragment 401/403/200 matrix,
   wrong-role login 403, unknown-roll 404, tampered-submit stored from the
   registered record, unknown path 404.
4. `node --check` passes for `server.js`, `seed.js`, `e2e-test.js` and all six
   JS files in `public/`.

### Results by area (145 E2E checks)

| # | Area | Checks | Result |
|---|---|---|---|
| 1 | Health + separate portal pages (landing 4 links, login-only shells, distinct pages, 6 JS files, CSS sidebar styles, template CSV, unknown path 404) | 21 | 21 PASS |
| 2 | Logins — principal, admin, **all 14 teachers**; wrong password → 401; wrong-role login → 403 `wrong_role` (3 cases); matching role → 200; removed teachers nadir/dileep → 401 | 23 | 23 PASS |
| 3 | Reference data — 14 teachers, no password-hash leak, E-commerce & Digital Marketing have no teacher (expected), 11 DIT instructors (fallback pool), 7 courses, 11 shifts | 7 | 7 PASS |
| 4 | Roll lookup — STC-2026-001 → kelash, -012 → ghansham, -017 → kapil; unknown roll → found:false; **every teacher has ≥1 seeded student** (17 students) | 5 | 5 PASS |
| 5 | Tests — DIT monthly test month `2026-11`, 13 questions, anonymous fetch strips answers, teacher fetch includes them, `?month=` filter, CIT quiz month null | 6 | 6 PASS |
| 6 | Submission + auto-score — 8/10 MCQ correct → 16/20, theory_max 30, total 16/50; **same client_id deduped**; CIT quiz 5/5 → 10/10 | 6 | 6 PASS |
| 7 | Teacher queue filtering — kelash sees only own (1), `teacher_id` spoof ignored, qurban sees only own (1), cross-teacher read → 403, admin sees all 3 | 5 | 5 PASS |
| 8 | Grading flow — send before grading → 400, grade 8+7+9 → total 40/50 graded, send → sent_to_admin, admin finalize → final | 4 | 4 PASS |
| 9 | Monthly report — 2026-11 row 40/50, 80%, Pass; CIT daily quiz excluded; 2026-10 empty; monthly + day CSV exports 200 with BOM | 5 | 5 PASS |
| 10 | Principal analytics — day (3 total, 1 final) + per-shift breakdown; month analytics load | 3 | 3 PASS |
| 11 | 7:30 PM consolidation — run → 3 rows locked; re-run idempotent; history lists today once; principal day sheet 3 rows; kelash day sheet 1 row; grading locked → 403; consolidation CSV + BOM | 7 | 7 PASS |
| 12 | CSV import — 2 imported (incl. quoted-comma name), 1 bad-shift row error, re-import skips 2 duplicates | 3 | 3 PASS |
| 13 | Test builder — monthly test without month → 400; with month → 201; teacher creating test → 403 | 3 | 3 PASS |
| 14 | **Strict roll validation (server)** — unknown roll submit → 404 `roll_not_registered`; tampered submit (forged name/course/teacher) stored from registered record (Usman Ghani, CIT, pawan) | 3 | 3 PASS |
| 15 | **Unauthenticated staff APIs → 401** (11 endpoints incl. `/api/me`, `/api/students`, `/api/submissions`, `/api/users`, analytics, reports, consolidation, exports, POST `/api/tests`, POST `/api/consolidation/run`) | 11 | 11 PASS |
| 16 | **Portal separation + fragments** — shells contain no console markup; no cross-portal hrefs on any of the 4 portal pages; fragments 401 (no token) / 403 (wrong role) / 200 (right role, console markup); unknown fragment 404; fragment not served statically | 14 | 14 PASS |
| 17 | Offline queue / session-clear / fallback / strict UI (code-level) — `stc_offline_queue`, 15 s retry, "Saved offline", "Sync now", client_id, `sessionStorage.clear`, reset to blank start, Urdu strict-roll message, no manual-entry inputs, verify + read-only details flow, DIT fallback + note + note element, teacher hint lists all 14 teachers, admin/teacher sidebars, wrong-role + session-expiry handling | 18 | 18 PASS |
| 18 | Zero external requests — no `http(s)://` URLs or CDN references in `public/` + `fragments/` (15 files) | 1 | 1 PASS |
| | **Total** | **145** | **145 PASS, 0 FAIL** |

### Headless-browser drive results (40 checks)

| # | Area | Checks | Result |
|---|---|---|---|
| B1 | Landing page — 4 portal entry links; Teacher card navigates to /teacher login | 2 | 2 PASS |
| B2 | /admin unauthenticated — login form only, console hidden + empty, no logout, no dashboard markup in DOM | 5 | 5 PASS |
| B3 | Wrong password → Urdu/English error; teacher creds on /admin → wrong-role error; still on login after both | 4 | 4 PASS |
| B4 | Admin login → console + sidebar (7:30 PM Consolidation) + logout visible; Students tab loads table; logout → login only, console emptied, no dashboard markup | 8 | 8 PASS |
| B5 | Student — no login form; unknown roll blocked with Urdu error, no details/test entry; known roll shows registered details read-only (no inputs) | 5 | 5 PASS |
| B6 | Student exam — CIT test list, live timer, question palette (5), submit → MCQ score result, blank start screen for next student | 5 | 5 PASS |
| B7 | Teacher (ashok) — sees only own submission (Priya, not Aakash); grading panel opens; send to admin confirmed by toast; queue shows sent_to_admin | 4 | 4 PASS |
| B8 | Principal — day analytics + per-shift bars load | 2 | 2 PASS |
| B9 | No cross-portal links on any of the 4 portal pages (live DOM check) | 4 | 4 PASS |
| B10 | Zero JS page errors during the whole drive | 1 | 1 PASS |
| | **Total** | **40** | **40 PASS, 0 FAIL** |

### Notes from this rework's verification

- The v1.0.0 "not verified" item **"Real browser run"** is now covered: the
  headless-browser drive above exercised the exam screen, countdown timer,
  palette, grading, and the full loop in a real Chromium with zero JS errors.
  (The offline-queue's in-browser Wi-Fi-drop behaviour still needs the on-site
  smoke test — server-side dedupe + queue code are verified, the physical
  disconnect was not simulated.)
- During smoke testing, a submission with a fake test id returned 400 before
  the roll check — that is the intended order (test must exist first), not a
  bug.
- One E2E script check in section [16] was simplified during writing (a
  redundant/confusing assertion); no product code changed for it.
- **7:30 PM auto-trigger timing, 80-laptop concurrency, and Windows START.bat
  execution** remain as in the v1.0.0 report (not re-verified here; START.bat
  itself was not modified in this rework).

### Re-running the verification

```sh
# from the package folder:
rm -f data/stc.sqlite data/*.json
PORT=3102 node server.js &   # auto-seeds on first start
node e2e-test.js http://127.0.0.1:3102
# expected: E2E RESULT: 145 PASS, 0 FAIL
```

Then delete the test database again (`rm -f data/stc.sqlite data/*.json`) so the
shipped package starts clean on the Admin PC.

## Fix 2026-11-15 ~23:47 PST — START.bat still flashed closed in 1 second (v1.1)
User reported: double-clicking START.bat (v1.1, already CRLF) still opened cmd and auto-closed in ~1 second. The CRLF fix alone was not enough. Root cause (probable): fragile cmd constructs in the old script — `%errorlevel%` tests inside parenthesised if-blocks plus parentheses in echoed text — which cmd.exe can misparse and abort on. Fix: START.bat rewritten from scratch in the most robust batch style: no if-blocks at all (uses `if errorlevel 1 goto :no_node` and single-line `if not errorlevel 1 set PORT=3001`), no parentheses in any echoed text, pure ASCII, CRLF line endings. Port 3000→3001 auto-fallback kept. ZIP rebuilt with the rewritten START.bat. Immediate workaround (proven on the user's PC): run from an open cmd window: cd /d <folder> && set PORT=3001 && node server.js.

---

## Restyle + clean seed 2026-11-16 — v1.2.0: stc.edu.pk-style design, no dummy data

**Version:** 1.2.0 · **Node:** v24.22.1 · **DB backend tested:** SQLite (`node:sqlite`)
**Result: E2E 149 / 149 PASS + headless-browser drive 28 / 28 PASS (0 JS errors)**

### What changed (user's orders, 2026-11-15 ~23:50–23:52 PST)
1. **Restyle (visual only).** The design system was taken from the real
   stc.edu.pk HTML/CSS (fetched and read, not copied): navy `#0f172a` /
   `#0c1524`, body `#1e293b`, page `#f8fafc`, brand gradient
   `linear-gradient(to right, #059669, #0d9488, #0e7490)`, teal accent
   `#2dd4bf`, amber `#f59e0b` section labels, 16px-radius cards with soft
   shadows and hover lift. Applied to all 5 pages + all 3 console fragments:
   gradient hero band on the landing page (amber pill, display title with
   mint→cyan gradient text, 4 glass stat chips), gradient icon chips on the
   portal cards, gradient primary buttons with lift + shadow, glassy white
   sticky topbar, dark gradient sidebar with gradient active tab, gradient
   stat numbers, inline-SVG STC favicon (data URI, fully offline).
   System font stack only — zero external requests (no web fonts, no images,
   no remote libraries). No element id, class hook, form field, or API call
   changed; server.js logic, seed.js structure and e2e-test.js flow untouched
   except where noted below.
2. **Clean seed — NO dummy data.** The 17 sample students (Aakash Kumar,
   Priya Kumari, …) and the 2 sample tests (DIT Monthly Test, CIT Daily Quiz)
   were REMOVED from seed.js. The system now starts with **0 students and
   0 tests**; Admin adds real students (Add Student / CSV import) and creates
   each month's test fresh. Kept: all 14 real teachers, 7 real courses,
   11 shifts, and the real principal/admin/teacher accounts.
   Also cleaned: `students_template.csv` is now header-only (example rows
   removed), and the student roll placeholder no longer shows a fake roll.
   NOTE: an existing database from v1.1 already contains the 17 demo students
   — a clean start needs the old folder (or its `data/` directory) deleted
   before extracting v1.2.0; the new seed does not delete existing data.

### E2E suite — now self-contained (149 checks, was 145)
- New section [4] verifies the clean start (0 students, 0 tests on a fresh
  DB) and creates its own 4 E2E students + DIT monthly test (13 questions) +
  CIT daily quiz via the Admin API; all later sections use those. The suite
  must run against a freshly wiped DB (documented in its header).
- Version check updated to 1.2.0; style check updated to the new theme
  (`#0f172a`, `.hero`, `.console-layout`).
- One failure found and fixed during the run: the new style.css header
  comment contained the word "CDN", which tripped the zero-external keyword
  check — reworded; re-run 149/149 PASS.

### Headless-browser drive (Chromium, clean copy, port 3103) — 28/28 PASS
Landing hero + 4 cards + gradient chips + health line v1.2.0; student page
rejects the old demo roll STC-2026-001 (not registered); teacher login
(ghansham, incl. wrong-password error) + grading queue + sidebar; admin
login + 8-tab sidebar + Students list EMPTY + Tests list EMPTY + Add Student
present; principal login + day analytics. 0 JS errors on every page.
Screenshots: `landing-v1.2.png`, `admin-v1.2.png` (in the project folder,
not shipped inside the ZIP).

### Unchanged (verified by the suite)
5 separate pages/URLs, no cross-portal links, auth-gated fragments
(401/403), strict roll validation (unknown roll → 404 `roll_not_registered`,
forged payload details ignored), offline queue + session-clear, 7:30 PM
consolidation + lock, monthly reports. START.bat untouched (pure ASCII,
CRLF 46/46, identical md5 to the pre-restyle backup).

---

## v1.3.0 (2026-11-16) — real logo, Back to Home, teacher import, fill-in-the-blank, course-wise results

Ordered by the centre after running v1.2.0 live (localhost:3000). Exactly the
5 items asked for — no other features added.

1. **Real STC logo.** The official logo from stc.edu.pk is shipped as a LOCAL
   file, `public/stc-logo.webp` (444x444, 32,522 bytes), and shown in the
   header of every page (landing, student, teacher, admin, principal) in a
   white rounded chip on the dark navy header, plus on print sheets. Still
   fully offline — never a remote URL. Server now serves `.webp` with the
   correct `image/webp` MIME type.
2. **Back to Home.** Every portal page (student, teacher, admin, principal)
   has a "← Back to Home" button in the topbar linking to `/`. The topbar is
   shared by the login shell and the logged-in console, so the button is
   visible in both states. Still NO portal-to-portal links anywhere.
3. **Excel/CSV import with teacher assignment.**
   - Students: `students_template.csv` keeps its Assigned Teacher column; the
     importer now matches the teacher by **username or full name**
     (case-insensitive), and an unknown teacher name **rejects that row**
     with a clear error naming the row (it used to silently leave the
     student teacher-less).
   - Teachers (new): `teachers_template.csv` (Teacher Name, Course,
     Username, Password) + `POST /api/users/import` (Admin only). Username
     auto from first name if blank (suffixed until unique); password
     defaults to `teacher123`; several courses separated by `;`. Duplicate
     usernames and unknown courses reject the row with a clear error.
     CSV only (.xlsx → Save As CSV first), as before.
4. **Fill-in-the-blank questions.** Tests now have THREE question types: MCQ
   (auto-graded from the Admin's answer key), fill-in-the-blank
   (TEACHER-graded, like theory) and theory (teacher-graded). Admin adds FIB
   questions in the Test Builder (question text with `___` + a suggested
   answer + max marks); students answer in a text input; the suggested answer
   is shown to the teacher while grading and is NEVER auto-graded (anonymous
   test fetches strip it). FIB max marks count in the manual-marks bucket
   (`theory_max`); the teacher must mark every FIB + theory question before
   sending to Admin; marks sent for MCQ indexes are ignored. Labels now read
   "Theory / FIB" wherever the bucket is shown.
5. **Admin results — course-wise export + print.** New `GET
   /api/reports/course-wise?month=` (grouped JSON) and `GET
   /api/export/results.csv?month=` (CSV download, UTF-8 BOM, columns: roll,
   name, father's name, course, shift, teacher, test, MCQ marks, Theory/FIB
   marks, total, max, %, grade), both sorted by course then roll, covering
   monthly-test results sent to Admin or finalized. Buttons in Admin →
   Monthly Report ("Export Results to Excel (CSV)", "Print Course-wise
   Result Sheet") and in Results ("Export Results to Excel (CSV)" for the
   month of the selected date). The print sheet groups by course with the
   institute header (real logo) and signature lines.

### E2E suite — 205 checks (was 149)
- New section [20] (56 checks, runs LAST so its extra data cannot disturb
  earlier count assertions): logo served locally with image/webp MIME + real
  WebP header + present in a white chip on all 5 pages; Back to Home on all
  4 portal pages, none on landing, still no portal-to-portal links; student
  import by username + by full name + unknown-teacher row rejection;
  teacher import (auto username login, explicit login, duplicate + unknown
  course errors); FIB create → anonymous strip → student answers → MCQ
  auto-grade 2/2 → send blocked until graded → FIB + theory graded → total
  9/10 → sent to Admin; results CSV content + course sort order; course-wise
  JSON groups; print-view + FIB UI wiring (code-level); new endpoints 401
  without a token. Version check updated to 1.3.0.
- Full run on a freshly wiped DB: **205/205 PASS**.

### Headless-browser drive (Chromium, clean copy, port 3103) — 20/20 PASS
Full loop in a real browser: landing with the real logo (image loads,
naturalWidth > 0); Back to Home visible on the admin login shell AND inside
the console; Admin imports 2 students via CSV (teachers assigned); Admin
creates a test with MCQ + FIB + theory in the builder UI; student verifies
roll, answers the FIB in a text input, submits (MCQ 2/2); teacher grades FIB
(suggested answer shown) + theory and sends to Admin; Admin Monthly Report
shows 9/10, 90%, Pass; results CSV downloads with the right content
(Theory/FIB 7 / 8); course-wise print sheet generates (Course: CIT, real
logo, signature lines, window.print invoked). **0 JS errors.**
Screenshots: `landing-v1.3.png`, `admin-results-v1.3.png` (in the project
folder, not shipped inside the ZIP).

### Unchanged (verified by the suite)
5 separate pages/URLs, auth-gated fragments (401/403), strict roll validation
(unknown roll → 404 `roll_not_registered`, forged payload details ignored),
teacher-owns-students-only, monthly loop, 7:30 PM consolidation + lock,
offline queue + session-clear, no dummy data (0 students / 0 tests on first
run), zero external requests. START.bat untouched (pure ASCII, CRLF 46/46).

## v1.3.1 (2026-11-16) — renamed to STC Testing System
User set the project name: "STC Testing System". Renamed everywhere the old name
"STC Exam System" appeared: landing hero title, all page titles, headers, server
log line, START.bat title/REM lines, start.sh, README, style.css and e2e-test.js
header comments. No functional change. Version bumped to 1.3.1 (server health
output, README, e2e version assertion). ZIP renamed to stc-testing-system.zip.
START.bat re-verified after the text change: pure ASCII, CRLF 46/46.

## v1.3.1 patch (2026-11-16) — header logo bigger
User: header logo too small. Fix (CSS only): .header-logo-chip 58px -> 88px,
padding 4px -> 7px, radius 14px -> 16px. Logo now clearly readable in the
header on all pages. No version change, no other files changed. Delivered as a
single-file patch (public/style.css only) per the user's rule: no full ZIP for
small fixes.

## v1.3.2 (2026-11-16) — GitHub repo + one-click updates
User: no more ZIP downloads again and again, and nobody will click START on
every laptop. Fix: (1) code now lives in public GitHub repo
parvindarjambra/stc-testing-system; (2) new UPDATE.bat + UPDATE.ps1 on the
Admin PC download the latest code from GitHub (codeload main-branch ZIP) and
copy it over the install folder, never touching data/; the edited laptop
shortcut (STC-Testing-System.url) is also preserved; (3) laptops need nothing
installed — they just open http://<Admin-PC-IP>:3000 in the browser, or
double-click the copied shortcut file. Notes: GitHub Pages cannot run this
system live (it needs a Node.js server + SQLite database — Pages is static
hosting only), so the repo is for code + updates, not live hosting. The logo
ships in the repo as public/stc-logo.webp.b64 (base64 text) because the GitHub
upload path is text-only; UPDATE.ps1 decodes it to stc-logo.webp (round-trip
md5-verified). Default demo logins are in the public repo, so the system must
stay LAN-only (see README security note). Version bumped to 1.3.2.

## v1.4.0 (2026-11-16) — USB sync for offline labs
User picked USB sync (over evening Wi-Fi sync): the centre has 5 labs x 20
laptops (80+) with NO network at all — no Wi-Fi, no LAN — so data moves only
by USB stick. Router/hotspot solutions were rejected by the user.
Build: (1) NEW lab-template.html — a single self-contained offline lab app
(inline CSS+JS, zero external refs, zero fetch calls, runs from file:// on
double-click, no Node/server on lab laptops): roll validation against the
pack, read-only details, test picker, exam screen (timer, palette, MCQ +
fill-in-the-blank + theory, auto-submit), submit saves to localStorage and
clears for the next student, Export (Teacher) downloads submissions JSON,
Clear saved (confirm-guarded, teacher only after Admin confirms import).
(2) NEW server endpoints (Admin only): GET /api/lab-pack exports the
template filled with the pack (all students incl. assigned teacher, all
tests via the existing stripAnswers — NO answer keys anywhere: MCQ
`correct` and FIB suggested answers never leave the Admin PC) as
STC-Lab.html; POST /api/lab-import accepts the lab envelope (or a bare
array), validates test + registered roll like an online submit, auto-grades
MCQs server-side with gradeSubmission, inserts with the EXACT online
submission schema (status 'submitted'), and dedupes by client_id (re-import
is safe; reports imported/duplicates/errors). Submission date comes from
the lab record's submitted_at, so a Monday test counts on Monday even if
the USB import happens later. (3) Admin portal: new "USB Lab Sync" sidebar
tab with Lab Pack export + multi-file Import cards. Teacher grading,
send-to-admin, finalize and the monthly report are UNCHANGED — teachers
grade imported submissions on the Admin PC like online ones.
Tests: existing E2E still 205 PASS, 0 FAIL. NEW e2e-sync-test.js covers the
full loop (pack auth + no-keys check, import, server-side auto-grade,
dedupe, bad-row errors, teacher own-students-only grading, send, finalize,
monthly report): 51 PASS, 0 FAIL. Headless-Chromium smoke test of the REAL
exported STC-Lab.html (CDP-driven): roll verify incl. unknown-roll
rejection, full exam, localStorage save, Export download verified as a
valid envelope, Clear: 22 PASS, 0 FAIL. Version bumped to 1.4.0.

## v1.4.1 (2026-11-16) — No fixed consolidation time
User order: 7:30 PM is not mandatory — consolidation can also run the next
morning; no fixed time at all ("time nhi laghoo"). Change: the 19:30
auto-consolidation scheduler is REMOVED from server.js (startScheduler,
lastAutoDate guard, startup log line all deleted — the server log no longer
mentions any auto-consolidation). Consolidation is now manual-only: Admin
opens the renamed **Day Consolidation** tab, picks the date (today or any
past date — the date picker and the /api/consolidation/run date parameter
already supported this), and presses **Run Day Consolidation & Sync**.
All "7:30 PM" labels renamed: Admin tab/heading/button, teacher "My Day
Sheet", START.bat text, README daily-routine table (row is now "Evening or
next morning"). Re-running for a date stays safe (idempotent upsert, never
duplicates). No other behaviour changed.
Tests: existing E2E still 205 PASS, 0 FAIL; e2e-sync-test.js still 51 PASS,
0 FAIL. Extra live check: POST /api/consolidation/run with yesterday's date
(2026-11-15) returned 200 {"ok":true,"date":"2026-11-15","rows":0,
"locked":true}; served admin fragment contains "Day Consolidation" (3x) and
zero "7:30" matches. Version bumped to 1.4.1.
