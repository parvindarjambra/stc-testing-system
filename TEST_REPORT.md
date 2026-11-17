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

## v1.4.2 (2026-11-16) — Forgiving student CSV import + demo row in the template
User's import failed on all 8 rows: teachers written "Sir Ashok Kumar" /
"Sir Kapil" (unknown — the system matched exact full name or username only)
and one shift typed "09:00 AM - 010:00 AM" (extra 0). User asked: if the
format must be exact, the sample should show at least one demo line.
Fix: (1) students_template.csv (root + public/) now carries one demo row
(1001,Demo Student,Demo Father,CIT,08:00 AM - 09:00 AM,Ashok Kumar) showing
the exact format — delete that line before importing your own list.
(2) The importer is forgiving: a leading honorific (Sir/Mr./Mrs./Miss/Ms./
Madam/Dr.) is ignored, shift values are normalized (whitespace collapsed,
en/em dashes treated as hyphens, single-digit hours zero-padded: "9:00 AM"
works as "09:00 AM"), and course names match case-insensitively to the
canonical list ("cit" -> "CIT"). Genuinely wrong values still reject the row
("No Such Teacher", "25:00 PM - 26:00 PM"). Stored values are canonical.
Tests: E2E 208 PASS, 0 FAIL (was 205; +3 new: forgiving import row, canonical
values via lookup, template demo row); e2e-sync-test.js still 51 PASS,
0 FAIL. Version bumped to 1.4.2.

## v1.5.0 (2026-11-16) — Modern redesign
User compared our design unfavourably with the other (Antigravity) system on
his PC (dark navy sidebar, pill badges, gradient buttons) and ordered ours
modern, EVEN BETTER. Restyle only — no functional changes, no new features:
(1) style.css rewritten — deep-navy sidebar console with brand block (logo +
console name) and icon tabs (active tab = emerald→teal gradient pill),
rounded-2xl cards with soft layered shadows, modern tables (light uppercase
headers, hover tint), pill badges for teachers (blue), courses (purple) and
shifts (grey) in every table, refined buttons/inputs/toast/stats, refreshed
landing hero + portal cards; (2) dark-navy login screens — the login card
carries the real STC logo chip + "Staff & Faculty Portal" pill and a
full-width gradient button (body.login-mode toggled by common.js);
(3) sidebar tabs scroll horizontally on phone widths. Two wording changes
from the user's 7-point spec: wrong-roll message is now exactly "Aapka Roll
Number ghalat hai." (student.js + lab-template.html + README) and the teacher
button is renamed "Submit to Admin" (id grade-send unchanged). All element
ids/classes the JS depends on are unchanged; print sheets untouched.
Tests: E2E 208 PASS, 0 FAIL; e2e-sync-test.js 51 PASS, 0 FAIL. Headless-
Chromium visual check (CDP, real server): landing, admin login, admin
console (Students + Dashboard), teacher queue, student page — desktop 1280
and phone 390 — all render clean, no overlaps, zero page JS errors;
wrong-roll message verified live. Screenshots: v150-*.png in the project
folder (not shipped in the ZIP). Version bumped to 1.5.0.

## v1.5.1 (2026-11-16) — Home page is the Student Terminal
User order (with a screenshot of the other system on his PC): the home page
must show ONLY the student roll-number terminal — students must NOT see the
Admin/Teacher/Principal portals; staff access moves to one small discreet
"Staff / Faculty Login" control at the top-right.
Build: `/` now serves the SAME terminal page as `/student` (server route
change — zero duplication: one markup file, one student.js). The terminal
got the reference look in our brand: dark navy full page, slim header with
logo + institute name and a "Staff / Faculty Login" pill button (dropdown:
Teacher, Admin / Exam Controller, Principal — the only staff links on the
page), centered dark card with logo, "LAN EXAMINATION STATION • MULTI-SHIFT"
pill, "Candidate Identity Verification" heading, roll input and an
emerald→teal→cyan "Verify Identity & Unlock Test" button, plus a tiny footer
version line (filled live from /api/health). The full student flow works
from `/` unchanged: roll verify -> read-only registered details -> test
picker -> exam -> submit. Test picker and exam screens are white cards on
the dark page; the offline-queue badge + Sync now button moved into the
header. The old landing (hero + 4 portal cards) is gone: public/index.html
is now a tiny redirect stub to `/` (so /index.html can never show the old
portals again, even from a stale copy on the Admin PC — UPDATE.bat only
copies, never deletes), and public/landing.js is removed (deleted from the
repo too). Dead hero/portal CSS removed; `.section-label` kept (consoles
use it). "Back to Home" stays on the three staff portals; the terminal IS
home, so it has none. All portal URLs keep working; no functional changes.
Tests: E2E still 208 PASS, 0 FAIL (landing assertions rewritten for the
terminal: Staff menu links, no portal cards, / and /student serve the same
page, /index.html redirects); e2e-sync-test.js still 51 PASS, 0 FAIL.
Headless-Chromium check (CDP, real server, 0 JS errors): terminal desktop
1280 + phone 390, staff dropdown open (exactly /teacher, /admin,
/principal), wrong-roll message verified live in the browser ("Aapka Roll
Number ghalat hai.", test stays locked), valid roll LAB001 shows the
read-only details. Version bumped to 1.5.1.

## v1.6.0 (2026-11-16) — Four-field student verification

User order (Roman Urdu): the student must enter ALL FOUR fields — Name,
Father's Name, Course, Roll Number — not roll number only. The system
checks ("approves") them against the students Admin imported; if all match,
the student takes the test and the teacher's name auto-fills from Admin's
data; if a field is wrong, the system says WHICH one is wrong, IN ENGLISH.
Build: new endpoint POST /api/students/verify (no auth, like the old
lookup). Matching is ordered — name, then father's name, then course, then
roll number — and the first mismatch is reported: name_wrong / "Your Name
is wrong.", father_wrong / "Your Father's Name is wrong.", course_wrong /
"Your Course is wrong.", roll_wrong / "Your Roll Number is wrong."
Comparison is case-insensitive with whitespace collapsed; course names are
matched to the canonical course list ("cit" matches "CIT"). Full match
returns 200 verified:true with the student record (roll, name, father_name,
course, shift, teacher_name — the teacher name IS the auto-fill). Missing
fields -> 400 fields_required. The old GET /api/students/lookup is retired
(no callers remained; returns 404). The terminal (public/student.html +
student.js) now shows the four fields in the same v1.5.1 dark-navy card
(Course is a free-text input, NOT a dropdown, so a student whose imported
course spelling differs is never locked out); empty fields get a plain
English prompt; on error the server's exact message shows and the test
stays locked; on success the existing read-only details table (Teacher
auto-filled) -> Confirm -> test picker -> exam is unchanged. The lab app
(lab-template.html) has the same four-field form and the SAME matching
logic + messages, client-side against the pack; no answer keys in the
pack (unchanged). The Roman Urdu message ("Aapka Roll Number ghalat hai.")
is gone everywhere. No other functional changes.
Tests: E2E 219 PASS, 0 FAIL (was 208; +11: new verify checks in section
[5] — full match, case/whitespace tolerance, all four wrong-field
messages, missing field, retired lookup — and new source checks for the
English messages + four fields in both apps); e2e-sync-test.js still 51
PASS, 0 FAIL. Headless-Chromium check (CDP, real server, 0 JS errors):
terminal desktop 1280 + phone 390 with four fields, wrong-name and
wrong-roll messages verified live in the browser (exact text, test stays
locked), full match shows details with teacher auto-filled. Lab smoke
(real exported STC-Lab.html in Chromium): 23 PASS, 0 FAIL (wrong name /
wrong roll / full match + full exam + export + clear). Screenshots:
v160-*.png in the project folder (not shipped in the ZIP). Version
bumped to 1.6.0.

## v1.6.1 (2026-11-16) — No credentials shown in the UI

User order (angry, with a screenshot of the Admin login page): this is a
REAL production system for Super Sys-Tech Computers Centre — not a demo —
but the login pages DISPLAYED the passwords: admin.html showed
'Demo: admin / admin123', teacher.html listed ALL 14 teacher usernames
plus 'Password for all teachers: teacher123', principal.html showed
'Demo: principal / principal123'. Fix: the demo-hint paragraphs are
removed entirely from all three login pages (clean login form only, no
replacement text) and the now-unused .demo-hint CSS rule is deleted. The
Admin console teacher-import help text no longer shows a password value
('Password (optional — a default is set automatically if left blank)'),
and the two 'Download sample template' links now read 'Download
template'. Full audit of public/, fragments/ and lab-template.html:
zero matches for admin123/teacher123/principal123, zero 'demo-hint',
zero 'sample', and zero user-visible 'Demo' wording — the only remaining
'Demo' is the user-ordered demo row in students_template.csv, which
stays. The accounts themselves are unchanged (admin/admin123,
principal/principal123, teachers firstname/teacher123 all still log in);
README/TEST_REPORT keep the logins as admin documentation only. No
password-change feature added (user rejected it). No other functional
changes.
Tests: E2E 222 PASS, 0 FAIL (was 219; +3 new checks — login pages show
no demo hints or passwords, style.css has no demo-hint rule, admin
fragment shows no password value — and the old 'teacher login hint lists
all 14 teachers' check rewritten to assert the login page lists NO
teacher usernames); e2e-sync-test.js still 51 PASS, 0 FAIL.
Headless-Chromium check (CDP, real server, 0 JS errors, 19/19 checks):
all three staff login pages screenshotted with NO demo hint, NO password
values and NO teacher usernames visible; a real admin login in the
browser still works and the console shows no password values.
Screenshots: v161-login-admin.png, v161-login-teacher.png,
v161-login-principal.png, v161-admin-console.png in the project folder
(not shipped in the ZIP). Version bumped to 1.6.1.

## v1.7.0 (2026-11-16) — Full-width consoles, inline errors, no student back/change

Three console UX fixes in one release, all ordered by the user with
screenshots:

1. **Full-width consoles (ordered 08:54 PST).** The Admin Console looked
narrow/cramped next to the Study Vault Admin Dashboard the user sent as a
reference. Fix: staff consoles (Admin, Teacher, Principal) now fill the
whole screen width — common.js toggles `body.console-mode` while the
console is showing and style.css drops the 1160px container (main,
header-inner, toast) in that mode. LAYOUT ONLY: the v1.5.0 design (dark
navy sidebar, pill badges, gradient active tab) is unchanged, and NO Study
Vault features were added (no stat cards, Security Center, Activity Logs,
Messages, notifications — all still rejected). Login pages and the Student
Terminal keep their centred cards; the phone layout still stacks the
sidebar above the content.
2. **Inline validation errors + auto-scroll (ordered 08:58 PST).** A
test-builder error ('Question 2: a fill-in-the-blank question needs ___
for the blank.') appeared ONLY in the top-of-page toast, which an Admin
scrolled down the Questions list never sees. Fix: the error now shows
INLINE under the offending question card (red border + red message) and
smooth-scrolls that card into view; form-level errors (title/course/
duration/month, no questions) show in a `#tb-form-error` slot above the
Save button, also scrolled into view. Editing a question clears its inline
error. The same inline + auto-scroll pattern now applies to the other
console forms whose errors were toast-only: student add/edit
(`#st-form-error`), teacher add/edit (`#tc-form-error`), course add/rename
(`#course-form-error`) and teacher grading (`#grade-form-error`), via
shared `showFormError`/`hideFormError` helpers in common.js. Validation
rules are unchanged — only where/how errors are shown. The top toast still
shows too.
3. **No student back/change (ordered ~08:59 PST).** The test picker had a
plain 'Back — change details' link and the details screen a 'Change
details' button — the user asked why the student is given permission to go
back and change details. Both controls (and their JS handlers) are removed
from the online terminal AND the lab app; the now-unused `.btn-link` CSS
rule is deleted too. After verification the student can only go forward:
Confirm → test picker → Start Exam → submit → reset for the next student
(the post-submit reset stays as-is).

Tests: E2E 237 PASS, 0 FAIL (was 222; +15 new checks in §23 — full-width
console-mode rules + toggle, inline-error styles + helpers + builder
wiring, form-error slots in both fragments, and the back/change controls
asserted ABSENT in the terminal and the lab app with the forward-only flow
asserted present); e2e-sync-test.js still 51 PASS, 0 FAIL.
Headless-Chromium check (CDP, real server, 0 JS errors, 34/34 checks):
console-main spans to 1260/1280px at desktop with the teachers table at
full width; the FIB-without-___ error verified live in the browser
(exact text, under the Q2 card, card scrolled into view, clears on edit);
phone 390 layout stacks with no horizontal overflow; terminal + lab app
details/picker show NO back/change controls while Confirm and Start Exam
still work. Lab smoke of the real exported STC-Lab.html: 23/23 PASS.
Screenshots: v170-console-desktop.png, v170-console-phone.png,
v170-inline-error.png, v170-no-back-link.png, v170-lab-no-back-link.png
in the project folder (not shipped in the ZIP). Version bumped to 1.7.0.

## v1.8.0 (2026-11-16) — Anti-cheat: tab-switch warning, auto-lock, teacher flag

Ordered by the user (09:02 PST): during the exam, if the student opens
another site / switches away from the exam page — 1st time an automatic
warning alert, 2nd time the test locks directly (auto-submit), and the
teacher must be informed the student was changing sites.

How it works: while an exam is active (after Start Exam, before submit —
never on the verify/details/test-picker screens), the terminal listens for
BOTH `document visibilitychange` (tab hidden) and `window blur` (window
loses focus). Each counts as leaving the exam page. 1st switch: a blocking
warning modal — 'Warning: Do not leave the exam page. If you switch again,
your test will be locked.' — with a Continue button; the exam timer keeps
running and the exam resumes on dismiss. 2nd switch: the test auto-submits
immediately with the answers so far (existing submit flow) and a locked
screen shows — 'Your test has been locked because you left the exam page.
Your answers have been submitted.' — and the student cannot resume.
One switch can fire BOTH visibilitychange and blur, so an "away" flag
dedupes them: only the first event of an away episode counts, and
returning (tab visible / window focus) clears it. Listeners are removed
on submit, timeout and lock.

The violation is recorded on the submission: `tab_switches` (count) and
`auto_locked` (boolean) are stored by both the online submit endpoint and
the lab-import endpoint (sanitized: the count is a non-negative integer
capped at 99, the lock is a real boolean) and returned by the
teacher-facing submission fetches. The teacher console shows a prominent
red banner in the grading view for any submission with `tab_switches > 0`:
'⚠️ This student left the exam page N time(s) during the test.' + 'The
test was auto-locked.' when locked. That banner IS the message to the
teacher — there is no live push; the teacher sees it on the student's
result. The lab app (STC-Lab.html) has the identical detection + warning +
lock client-side; the flags travel in the localStorage submission and the
exported JSON, and the server preserves them at USB import.

Honest scope note: detection sees tab-hidden + window-blur only — it
cannot tell WHICH site or app the student opened, only that they left
the exam page.

Tests: E2E 252 PASS, 0 FAIL (was 237; +15 new checks in §24 — flagged
submission stored, plain-submission defaults, forged-flag sanitization,
teacher list fetch returns the flags, and code checks for the detection,
modal, payload fields, teacher banner and lab mirror); e2e-sync-test.js
53 PASS, 0 FAIL (was 51; +2 — lab-import preserves tab_switches /
auto_locked, defaults on the unflagged submission).
Headless-Chromium check (CDP, real server, 0 JS errors, 25/25 checks):
no warning before the exam starts; warning modal live on the 1st switch
(exact text, timer keeps running, dismiss resumes the exam); 2nd switch
auto-submits + locked screen (exact text, exam gone); stored submission
carries tab_switches 2 + auto_locked true with the answered MCQ still
scored; teacher console shows the red banner (exact text) on that
submission. Lab smoke of the real exported STC-Lab.html: 26/26 PASS
(same warning + lock flow offline; exported JSON carries the flags; a
real lab-import of the exported file preserves them server-side).
Screenshots: v180-warning-modal.png, v180-locked-screen.png,
v180-teacher-banner.png in the project folder (not shipped in the ZIP).
Version bumped to 1.8.0.

## v1.9.0 (2026-11-16) — Auto-grading: FIB auto-check + theory keyword auto-grading, straight to Admin

Ordered by the user (09:09 PST): fill-in-the-blank answers auto-checked
like MCQs, and theory answers auto-graded — Admin writes the model answer
and the key words, and the answer is accepted if it is relative / the
same concept. The user's plan: keep BOTH systems — auto first; if the
auto theory marks look wrong, he will say so and theory goes back to the
teachers. If auto works, results go straight to Admin (teachers out of
the loop); only Admin + the USB worker remain.

How it works (server-side, ONE shared code path — `gradeSubmission` +
`autoGradeFields` — used by BOTH the online submit endpoint and the
lab-import endpoint, so identical answers get identical marks in both
paths):

- **FIB auto-check:** the 'Suggested answer' field in the builder is now
  the auto-check key (label changed from 'not auto-graded' to 'Correct
  answer (auto-checked — leave blank for teacher grading)'). Match is
  forgiving: case-insensitive, trimmed, internal whitespace collapsed.
  A matching answer scores full max_marks, anything else scores 0.
  A FIB question WITHOUT a suggested answer cannot be auto-checked —
  it stays teacher-graded, as before.
- **Theory keyword auto-grading:** a NEW comma-separated 'Key words'
  field per theory question (builder). At grading, the server counts
  how many key words appear in the student's answer (case-insensitive,
  whole words/phrases only — 'photo' never matches inside
  'photosynthesis'; punctuation is ignored) and marks =
  round(max_marks x matched / total). A theory question with NO key
  words is NOT auto-graded — it goes to the teacher, as before.
- **Routing:** when a submission is FULLY auto-graded (MCQ + FIB +
  every theory question auto-graded — an MCQ-only test is fully auto
  by definition), it goes STRAIGHT to Admin (status `sent_to_admin`,
  `graded_at` set) — the teacher is skipped. If ANY question is not
  auto-gradable, the submission goes to its teacher as before; the
  teacher grades ONLY the non-auto questions, with the auto marks
  shown read-only with a small 'Auto' tag (the grade endpoint also
  ignores any mark sent for an auto-graded question, like MCQ indexes
  — the server-assigned auto mark can never be overwritten). The
  teacher flow, grading console and 'Submit to Admin' stay FULLY
  INTACT as the fallback — no teacher code was deleted or disabled.
- **Admin visibility:** auto-graded marks carry a small 'Auto' tag in
  the Admin Results review (`.badge-auto`, indigo pill) so Admin can
  judge the auto-grading quality at a glance. Subtle — one small tag,
  no redesign.
- **No keys in the lab pack:** `stripAnswers` is a field whitelist, so
  FIB suggested answers, theory key words and model answers are all
  stripped from the pack exactly like MCQ keys already were (verified
  in the E2E suite and on the real exported pack file).

Honest limit: there is no AI offline — real concept understanding is
impossible. Keyword matching is the method and it is rough: it can
misjudge both ways (a good answer in different words scores low; an
answer that merely lists the key words scores high). That is why the
teacher flow stays as the fallback and why auto marks are tagged.

Tests: E2E 276 PASS, 0 FAIL (was 252; +24 — §20 FIB flow rewritten for
auto-grading (FIB auto 3/3 at submit, teacher re-mark ignored) + 1 new
check there, and new §25 with 23 checks: mixed routing to teacher, FIB
auto correct/wrong/case- + whitespace-tolerant, theory keyword
full/partial/none marks, teacher grades only non-auto, teacher cannot
overwrite auto marks, fully-auto straight to Admin + direct finalize,
anonymous fetch + lab-pack strip key words / suggested answers / model
answers, builder/teacher/admin UI wiring); e2e-sync-test.js 54 PASS,
0 FAIL (was 53; +1 — theory without key words NOT auto-graded at
import; totals updated honestly: the sync test's FIB is auto-graded 0
at import, so LAB001 6/12 and LAB002 10/12 after teacher grading).
Headless-Chromium check (CDP, real server, 0 JS errors, 21/21 checks):
Admin creates a test with FIB + theory key words via the UI (key-words
field + new FIB label verified live); student answers; mixed submission
routes to the teacher with auto marks (FIB 2 + theory 5, total 7/12);
fully-auto submission goes straight to Admin (10/10); teacher grading
shows auto marks read-only with 'Auto' tags (key words shown), grades
only the non-auto question (total 11/12) and sends to Admin; Admin
results show the 'Auto' tag on both rows. Lab smoke of the real
exported STC-Lab.html: 17/17 PASS (real file:// run + real Export
(Teacher) download + real import; imported lab submission has
IDENTICAL auto marks / MCQ / total / status to an online submission
with the same answers, and also goes straight to Admin).
Screenshots: v190-keywords-field.png, v190-teacher-auto-readonly.png,
v190-auto-tag.png in the project folder (not shipped in the ZIP).
Version bumped to 1.9.0.

## v1.10.0 (2026-11-16) — One student, one attempt per test + lab durability

Ordered by the user (09:28 PST): a student must not be able to take the
same test twice — including on two different laptops — and lab work must
survive the HTML file closing or a glitch until the evening USB import.

How it works:

- **One attempt, online:** when a student picks a test, the terminal
  fetches it with their roll number (GET /api/tests/:id?roll=) and the
  server blocks the start with 409 'You have already taken this test.'
  if that student already submitted this test — the exam never opens.
  A second submit is rejected the same way (backstop for races: two
  tabs, or the offline queue flushing after an online submit). The
  block is by SUBMITTED test only — an interrupted exam that was never
  submitted leaves no record, so it can restart. The 409 is a final
  rejection: the terminal never queues it, and the offline queue drops
  409s instead of retrying them forever.
- **One attempt, lab app:** before an exam starts, the lab app checks
  its own localStorage submissions — if this student already submitted
  this test on THIS laptop, the start is blocked with the same message.
- **Import dedupe:** when Admin imports USB submissions, a submission
  whose student + test already exists in the system is rejected — the
  FIRST submission is kept, the rest are counted as already_taken and
  reported per file and in the totals, so Admin sees them. The existing
  client_id dedupe (re-importing the same file) stays as well.
- **Lab durability:** saved submissions live in localStorage and
  already survive the file closing — verified by closing and reopening
  the file in a real browser (submission still there; Export does NOT
  wipe saved data — export and Clear stay separate). NEW: in-progress
  answers auto-save as a draft (answers + exam end time + tab-switch
  count), keyed by roll number + test. If the file closes or crashes
  mid-test, reopening and re-verifying with the SAME student + test
  restores the draft and the exam continues with the remaining time. A
  different student never sees another student's draft (the key
  includes the roll number). The draft is cleared on submit, and it is
  saved at exam start too — even with no answers yet — so the end time
  is locked in and closing before answering cannot reset the timer.

Honest limit: two unconnected offline laptops cannot know about each
other — a cross-laptop duplicate is caught at the evening USB import,
not live on the laptop. The exam timer is wall-clock, so time keeps
running while the file is closed: a draft whose time has run out is
submitted immediately on restore. A hard crash (power cut, browser
killed) may lose at most ~10s of the most recent writes — Chromium
flushes localStorage on a timer (a minimal experiment: a write survived
a SIGKILL only after a 12s wait, and always survived a graceful close).
A normal file-close never loses anything.

Tests: E2E 296 PASS, 0 FAIL (was 276; +1 in §24 — the three anti-cheat
flag submits now use three fresh students, since E2E-001 already
submitted dit in §7 and one-attempt blocks repeats — +19 in new §26:
second start blocked after submit (409 + exact message), second submit
rejected, interrupted (unsubmitted) exam can restart, unregistered roll
-> 404, fetch without roll unchanged, different student unaffected,
case-insensitive match, online/lab/admin UI wiring); e2e-sync-test.js
57 PASS, 0 FAIL (was 54; +3 in new §11 — a second-laptop import with
new client_ids is rejected as already_taken 2, the FIRST submission is
kept; re-import still dedupes by client_id). Headless-Chromium check
(CDP, real server, 0 JS errors, 22/22 checks): online double-attempt
blocked live with the exact message; lab draft auto-saved, restored
after a real browser close + reopen (MCQ + theory answers, timer still
running), cleared on submit; Export does not wipe saved data; the saved
submission survives close + reopen; same-laptop duplicate blocked; a
different student starts blank (no draft leak); the real exported file
imports and the online/lab duplicate is caught (already_taken 1).
Screenshots: v1100-already-taken.png, v1100-draft-restored.png in the
project folder (not shipped in the ZIP).
Version bumped to 1.10.0.

## v1.11.1 (2026-11-16) — Lab data is never deletable (Clear saved removed)

User order (20:13 PST): "data delete nahi honi chahiye, backup nahi
hai" — if the USB import glitches and someone then presses Clear saved
on a lab laptop, the students' answers are gone forever with no backup
and nobody on site to help. So the lab app now has NO way to delete
saved submissions at all.

What changed: the 'Clear saved' button is REMOVED from lab-template.html
entirely — the button, its PIN gate, its confirm dialog, and the
clearSaved() function (with its localStorage.removeItem call). The lab
template now contains NO localStorage.removeItem / localStorage.clear
anywhere: saved submissions are only ever read (getItem) and written
(setItem). The draft-clear-on-submit is KEPT — it is safe because the
submission is already saved at that point (it only drops the in-progress
draft, never a saved submission). Export (Teacher) stays exactly as in
v1.10.2 — PIN-gated on every click, still downloads ALL saved
submissions (re-exporting old data is harmless: the Admin import
dedupes by client_id). The teacher PIN now guards Export ONLY: the
Admin USB Lab Sync hint reads "Teachers need this PIN to Export on lab
laptops. Tell it to the teacher — students must not know it.", and the
lab PIN modal wording mentions only the Export download. Old packs
(without a hash) still work without a PIN — and also have no Clear
button once the template is updated.

Honest limit: submissions now accumulate in each laptop's local
storage — roughly 40–50 KB per laptop per day, so this is safe for many
months, and the Admin PC holds the main copy of everything imported.
If a laptop's storage ever runs low, the Admin must be told — do NOT
fix it by adding a delete button back.

Tests: E2E 342 PASS, 0 FAIL (was 334; +8 in new §29 — no btn-clear,
no clearSaved, no removeItem/clear on storage, get/set only,
draft-clear-on-submit kept, Export still PIN-gated, PIN modal wording
Export-only, Admin hint Export-only, export envelope version 1.11.1;
the §27 PIN-gate check now asserts Export-only). e2e-sync-test.js 62
PASS, 0 FAIL (unchanged — the lab loop is untouched). Headless-Chromium
check (CDP, real server, 0 JS errors, 29/29 checks): Admin PIN field +
Export-only hint + inline errors + pack download (hash in, plain PIN
out); lab topbar has Export and NO Clear button; Export PIN flow (wrong
denied, Cancel closes, correct downloads the saved submission, PIN
asked again on the next Export); the saved submission survives a real
browser close + reopen (still no Clear button); old pack (hash
stripped) exports directly with no PIN prompt and no Clear button. Lab
smoke of the real exported STC-Lab.html (file://, 0 JS errors, 13/13
checks — was 12, +1 no-Clear check): zero external refs, no answer
keys, PIN hash in / plain PIN out, no Clear button, wrong roll locks,
submit saves, result screen shows no scores, Export PIN flow, exported
JSON imports cleanly (FIB auto-graded, theory routed to teacher).
Screenshots: v1111-topbar-no-clear.png, v1111-export-pin.png in the
project folder (not shipped in the ZIP).
Version bumped to 1.11.1.

## v1.11.0 (2026-11-16) — Course-wise student feedback PDF (roll numbers only)

User order (09:28 PST, spec refined 19:47 PST): after grading, students
get proof of their result — the NEXT DAY (not right after the test). A
course-wise PDF showing, per student: ALL MCQs with right/wrong status
+ the correct answer for each, blanks with the student's answer +
correct answer, theory questions with the student's written answer +
the marks the teacher gave, and total marks. ROLL NUMBERS ONLY — no
names, no father names — so each student finds their own result by roll
number without identifying others. The management teacher posts the PDF
in the course WhatsApp group; the system only GENERATES it (no
distribution feature). This supersedes the old 'no result cards' rule —
the user explicitly ordered it.

How it works: new Admin console tab 'Student Feedback' (between
Results and Monthly Reports). Admin picks a course, then a test (or a
month, which lists only that month's monthly tests plus an 'All monthly
tests' whole-month option), and clicks 'Generate Feedback Sheet'. The
sheet renders one block per student, headed by ROLL NUMBER ONLY
('Roll No: 1001'): each MCQ (question, student's answer, ✓ Correct /
✗ Wrong, correct answer, marks with the small 'Auto' tag), each blank
(question, student's answer, correct answer, marks — 'Auto' tag when
auto-graded, '— Teacher' when teacher-graded), each theory question
(question, student's written answer, teacher's marks), and the total.
Marks shown are the FINAL marks (auto for MCQ/FIB + teacher for
theory). A 'Print / Save as PDF' button prints the sheet via the
existing printSheet pattern (browser print-to-PDF, no PDF library,
zero npm deps). Print CSS is clean black-on-white: each student block
starts on a fresh page, single questions never split across pages, and
the sidebar/nav/buttons are hidden in print.

Server: new Admin-only endpoint GET /api/feedback?course=&test_id=
(or month=). It reuses the existing submission/grading data — no new
storage. Only FINALIZED submissions (status 'final') appear, so
ungraded work can never leak into the sheet; if nothing is finalized
for the selection, the sheet says 'No finalized results for this
selection yet.' The endpoint NEVER returns student names (the response
carries roll_number only) — verified by grep + a test that scans the
raw JSON for student/father names. MCQ per-question marks are computed
from the stored key (only the total is stored); FIB/theory marks come
from the stored theory_marks. Submissions whose test was deleted are
skipped. Validation: 400 without a course, without test_id/month, with
a bad month, or when the test belongs to another course; 404 for an
unknown test; 403 for teacher/principal (Admin only), 401 anonymous.

Tests: E2E 334 PASS, 0 FAIL (was 309; +25 in new §28 — endpoint
returns roll numbers only (raw JSON scanned for names), only finalized
results included, MCQ right/wrong + correct answers present, theory
text + teacher marks present, FIB auto vs teacher-graded, month mode,
empty selection, validation 400/404, teacher/principal 403, anonymous
401, Admin console UI + sheet builder + print CSS). e2e-sync-test.js
62 PASS, 0 FAIL (unchanged — the lab loop is untouched).
Headless-Chromium check (CDP, real server, 0 JS errors, 20/20 checks):
Feedback tab + selectors + Generate + Print present, roll-numbers-only
+ next-day wording, inline error with no course/test, course lists the
tests, month filter + 'All monthly tests' option, whole-month sheet
shows the finalized block and excludes the unfinalized student,
single-test sheet (one block, roll only, no names, ✓/✗, correct
answers, FIB + Auto tag, theory text + teacher marks 4/5, total 9/12),
Print fills #print-area and calls window.print(), print view hides
nav/buttons (verified with emulated print media), empty state message
+ Print hidden. Lab smoke of the real exported STC-Lab.html (file://,
0 JS errors, 12/12 checks) — regression only, the lab app is
unchanged.
Screenshots: v1110-feedback-section.png, v1110-feedback-sheet.png in
the project folder (not shipped in the ZIP).
Version bumped to 1.11.0.

## v1.10.2 (2026-11-16) — Lab teacher PIN (students get no permissions)

User order (19:48 PST): students must get no permissions — in the lab
app the 'Export (Teacher)' and 'Clear saved' buttons were clickable by
any student sitting at the laptop. Now both ask for a teacher PIN first.

How it works: when Admin exports a lab pack (USB Lab Sync tab), a
Teacher PIN is required (new field, 4+ digits, numeric) with the hint
"Teachers need this PIN to Export or Clear on lab laptops. Tell it to
the teacher — students must not know it." Exporting without a valid PIN
shows an inline error at the form (v1.7.0 pattern). The server
(GET /api/lab-pack?pin=...) validates the PIN (400 without one) and
embeds ONLY its SHA-256 hash (node:crypto) in the pack — the plain PIN
never appears in the pack. In the lab app, clicking Export or Clear
opens a PIN modal; the entered PIN is hashed with a compact ES5 SHA-256
inside lab-template.html and compared with the pack's hash. Correct PIN
→ the action proceeds (Clear still shows its confirm dialog afterwards).
Wrong PIN → "Wrong PIN." and nothing happens. The PIN is checked on
EVERY click — nothing is remembered, so the next student at the laptop
inherits no access. Packs exported before v1.10.2 have no PIN hash and
work WITHOUT a PIN (backward compatible — old packs on laptops keep
working until the next export replaces them).

Honest limit: the PIN stops casual misuse by students clicking buttons;
a student who opens and edits the HTML file could bypass it — the lab
file itself cannot be made tamper-proof.

Tests: E2E 309 PASS, 0 FAIL (was 299; +10 in new §27 — pack without /
short / non-numeric PIN → 400, pack embeds the SHA-256 hash, plain PIN
never in the pack, Admin export UI + PIN field + hint + error slot,
lab SHA-256 + PIN modal + Wrong PIN + per-click gate, old packs work
without a PIN). e2e-sync-test.js 62 PASS, 0 FAIL (was 58; +4 in §3 —
no-PIN → 400, short PIN → 400, hash embedded, plain PIN absent).
Headless-Chromium check (CDP, real server, 0 JS errors, 26/26 checks):
Admin console PIN field + hint + inline error on empty/short PIN, no
download without a PIN, pack download with a PIN (hash embedded, plain
PIN absent); lab app: Export opens the PIN prompt, wrong PIN shows
"Wrong PIN." with no download, Cancel closes it, correct PIN downloads
the submissions JSON (holds the saved submission), PIN asked again on
the next Export, Clear asks for the PIN too, wrong PIN denied with the
submission still saved, correct PIN + confirm deletes; old pack (hash
stripped) exports directly with no PIN prompt. Lab smoke of the real
exported STC-Lab.html (file://, 0 JS errors, 12/12 checks): zero
external refs, no answer keys in the pack, PIN hash embedded / plain
PIN absent, wrong roll locks with the English message, submit saves to
localStorage, result screen shows no scores, Export PIN flow (wrong
denied, correct downloads), exported JSON imports cleanly with FIB
auto-graded and theory routed to the teacher.
Screenshots: v1102-pin-prompt.png, v1102-wrong-pin.png in the project
folder (not shipped in the ZIP).
Version bumped to 1.10.2.

## v1.10.1 (2026-11-16) — Three anti-cheat warnings + theory marking back to the teacher

Two user orders (19:39 and 19:40 PST).

(1) The anti-cheat warning now comes THREE times before the test locks:
1st, 2nd and 3rd tab switch each show a blocking warning modal that says
which warning it is — "Warning 1 of 3", "Warning 2 of 3", "Final
Warning" (the 3rd says it is the last: "Final warning: if you switch
again, your test will be locked."). The 4th switch auto-locks and
auto-submits, as before. The exam timer keeps running through every
warning. Same threshold in the online terminal and the lab app. The
teacher banner is unchanged — it shows the number of times the student
left the page (now 4 on an auto-locked test) plus "The test was
auto-locked."

(2) Theory marking is back with the teacher — the user's verdict on the
v1.9.0 auto-grading. MCQ + fill-in-the-blank stay auto-graded; theory
questions are ALWAYS teacher-graded. What changed: the server no longer
auto-marks theory at all (the keyword-matching code is removed —
parseKeyWords / normForMatch / keywordMatched deleted); stored key
words in existing v1.9.0 tests are IGNORED (no data migration — the
field is still accepted on save so old tests keep working, it just
does nothing). The 'Key words' field is removed from the test builder;
the Model answer field stays (the teacher sees it while grading, as
before v1.9.0) and the FIB 'Correct answer (auto-checked)' field stays.
Routing: any submission containing a theory question goes to the
teacher (who grades theory only — MCQ + FIB auto marks show read-only
with the 'Auto' tag and can never be overwritten); ONLY submissions
with NO theory questions (MCQ + FIB only) go straight to Admin. The
lab pack stripAnswers is unchanged (it already strips keys).

Tests: E2E 299 PASS, 0 FAIL (was 296; +1 in §24 — the three warning
texts + dynamic modal slot — +2 in §25: theory with stored key words
routes to the teacher even when everything else is auto-gradable, and
the teacher CAN re-grade a theory mark; §25 rewritten for the new
rule — mixed total at submit 5 not 9, fully-auto is MCQ + FIB only
5/5, builder has NO key_words field). e2e-sync-test.js 58 PASS,
0 FAIL (was 57; +1 — the lab pack has no theory key words; the sync
theory question now carries stored key words and is NOT auto-graded at
import; LAB001's auto-lock is now tab_switches 4). Headless-Chromium
check (CDP, real server, 0 JS errors, 35/35 checks): online warnings
1 of 3 / 2 of 3 / Final Warning with exact text, timer keeps running,
4th switch auto-locks (stored tab_switches 4 + auto_locked true,
routed to teacher, FIB auto only); teacher banner shows 4 switches +
auto-locked, theory has an editable marks input, FIB auto mark is
read-only with the Auto tag, grading theory 4/5 saves (total 9/10);
MCQ+FIB-only submission goes straight to Admin; builder theory card
has no Key words input and keeps the Model answer; lab app: same
3 warnings + lock on 4th offline, exported JSON + import carry the
flags. Lab smoke of the real exported STC-Lab.html (file://, 0 JS
errors, 15/15 checks): zero external refs, no answer keys in the
pack, wrong roll locks with the English message, submit saves to
localStorage, result screen shows no scores, Export downloads JSON,
Clear is confirm-guarded, the imported lab submission grades FIB auto
and routes theory to the teacher.
Screenshots: v1101-final-warning.png, v1101-teacher-theory-grading.png
in the project folder (not shipped in the ZIP).
Version bumped to 1.10.1.
