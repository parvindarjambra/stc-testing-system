# STC Testing System — Examination, Quiz & Result Management System

**Version 1.11.0** — **Course-wise student feedback (roll numbers only)**: after grading, Admin generates a per-student proof sheet for one test or one month (new **Student Feedback** tab) — every MCQ with right/wrong + the correct answer, every blank with the correct answer, every theory question with the student's written answer + the teacher's marks, and totals. **Roll numbers only — no names anywhere** (not in the sheet, the endpoint, or the print view), so each student finds their own result by roll number; the management teacher posts the PDF in the course WhatsApp group (the system only generates it — no distribution feature). Only FINALIZED results appear — ungraded work never leaks in; if nothing is finalized, the sheet says so. Print → browser print-to-PDF, one student per page. **Lab teacher PIN (v1.10.2)**: when Admin exports a lab pack, a teacher PIN (4+ digits) is required — the pack embeds only its SHA-256 hash, never the plain PIN, and the lab app asks for the PIN before Export (Teacher) or Clear saved, so students on the laptop cannot download or delete submissions (checked on every click, nothing remembered). Packs exported before v1.10.2 have no PIN hash and still work without a PIN. **Honest limit:** the PIN stops casual misuse by students clicking buttons; a student who opens and edits the HTML file could bypass it — the lab file itself cannot be made tamper-proof. **Three warnings + theory back to teacher (v1.10.1)**: the anti-cheat warning now comes three times before the test auto-locks on the 4th switch (each warning says which one it is — the third is the final warning), and theory questions are ALWAYS teacher-graded — the v1.9.0 keyword auto-grading was removed by user decision, so only MCQ + fill-in-the-blank auto-grade; a submission goes straight to Admin only when it has NO theory questions. **One attempt + lab durability (v1.10.0)**: one student can take a test only once — the server blocks a second start and a second submit, the lab app blocks a second attempt on the same laptop, and the USB import keeps only the first submission when a student tested on two laptops (the second is rejected and counted). Lab work is safe: saved submissions survive the file closing or a crash until the evening import, and an in-progress exam auto-saves a draft (answers + remaining time) that restores when the same student re-opens the test. **Honest limit:** two unconnected offline laptops cannot know about each other — a cross-laptop duplicate is caught at the evening USB import, not live on the laptop. **Auto-grading (v1.9.0, theory removed v1.10.1)**: fill-in-the-blank answers are auto-checked against the Admin's correct answer, and theory answers are ALWAYS teacher-graded. A submission with NO theory questions that is FULLY auto-graded goes straight to Admin — the teacher is skipped. Anything with a theory question, or a blank without a correct answer, goes to its teacher, who grades ONLY those questions with the auto marks shown read-only. Admin can judge quality from the small 'Auto' tag on auto-graded marks. **Anti-cheat (v1.8.0, warnings x3 in v1.10.1)**: during an exam, leaving the page (another tab or app) shows an automatic warning the first three times (each says which warning it is — the third is the final warning) and auto-locks + auto-submits the test the fourth time; the teacher sees a red warning banner on that student's result (the violation is stored on the submission as tab_switches / auto_locked). **Full-width consoles + inline errors + no student back/change (v1.7.0)**: the Admin/Teacher/Principal consoles now fill the whole screen width like Study Vault (layout only, no new features); test-builder and console-form validation errors show inline at the offending question/field and scroll into view instead of only in the top alert; and the student can no longer go back to change details after verification (forward-only: Confirm → test → submit → next student). **No credentials shown in the UI** (v1.6.1): the staff login pages no longer display any demo usernames or passwords — this is a real institute system, not a demo. **Four-field student verification** (v1.6.0): the student enters Name, Father's Name, Course and Roll Number (not roll number only); the system checks them in that order against Admin's list and names the first wrong field in English, and the teacher's name auto-fills from Admin's data. **Home page is the Student Terminal** (v1.5.1): `/` now shows ONLY the student roll-number terminal (same page as `/student`) — students never see the staff portals; staff log in from the single discreet **Staff / Faculty Login** menu at the top-right. **Modern redesign** (v1.5.0): deep-navy sidebar console with brand block + icon tabs, pill badges for teachers/courses/shifts, refreshed landing hero and dark login screens — same flows, no feature changes. The first wrong field is named in English ('Your Name is wrong.', 'Your Father's Name is wrong.', 'Your Course is wrong.', 'Your Roll Number is wrong.'), and the teacher button is 'Submit to Admin'. **Forgiving student CSV import** (v1.4.2, see §6): "Sir Ashok Kumar" now matches, unpadded "9:00 AM" shifts and lowercase courses ("cit" → "CIT") are accepted. **No fixed consolidation time** (v1.4.1): the 7:30 PM auto-consolidation is removed; Admin runs **Day Consolidation** any time — same evening or next morning — picking the date. **USB sync for offline labs** (v1.4.0): labs with no network at all get a standalone lab app (`STC-Lab.html`) — students test fully offline, and submissions come back on a USB stick for Admin to import (see §1c). Everything from v1.3.2 stays: the code lives on GitHub (https://github.com/parvindarjambra/stc-testing-system) with one-click updates (double-click `UPDATE.bat` on the Admin PC, no more ZIP downloads); laptops on the LAN need nothing installed — they just open the exam page in the browser (see §1b). Renamed to **STC Testing System**; the real STC logo in every header (local file, offline); a "Back to Home" button on every staff portal page (the Student Terminal IS home); teacher CSV import; fill-in-the-blank questions (auto-checked when the Admin sets a correct answer, otherwise teacher-graded, like theory); Admin course-wise results export to Excel (CSV) + printable course-wise result sheets. See TEST_REPORT.md for the full v1.11.0 note.

**Super Sys-Tech Computers Centre, Umerkot** (also known as Super City Computer Center)
*"Empowering Skills Since 1997"*

- **Established:** 1997 by Sham Kumar Lohana (Director)
- **Principal:** Ramesh Kumar
- **Admin / Exam Controller:** Danish Mustafa (Academic Administrator)
- **Address:** 1st Floor, Jameel Market, Umerkot, Sindh, Pakistan
- **Phones:** 0332-3350790, 0345-3279790 · **Email:** info@stc.edu.pk · **Website:** stc.edu.pk
- **Affiliations:** NAVTTC Islamabad, STEVTA Sindh, SBTE Sindh, TTB Sindh

A complete **offline-first** exam system for the centre's LAN. It runs on the main
Admin PC — no internet needed during classes. Students take daily quizzes and monthly
tests on shared laptops, teachers grade theory answers, and Admin compiles the official
monthly report. Whenever Admin is ready — same evening or next morning —
Admin runs **Day Consolidation**, which compiles the whole day's results
across all 11 shifts into one locked master sheet.

---

## 1. Quick start (Admin PC, Windows)

**One-time setup**

1. Install **Node.js LTS** (once): download from https://nodejs.org (the LTS `.msi`),
   run it, accept the defaults, restart the PC. No other software is needed —
   there are no npm packages to install.
2. Unzip this folder anywhere, e.g. `C:\STC-Exam-System\`.
3. Double-click **`START.bat`**.
   - It checks Node.js, starts the server, and shows this PC's IP addresses.
   - Leave the black window open all day. To stop the server, press `Ctrl+C` in it.

**Laptops / phones on the same Wi-Fi or LAN**

Open a browser and go to `http://<Admin-PC-IP>:3000`, e.g. `http://192.168.1.10:3000`.
On the Admin PC itself you can also use `http://localhost:3000`.

That address opens the Student Terminal — the roll-number check screen.
Staff reach their portals from the **Staff / Faculty Login** menu at the
top-right of the terminal. Each portal also has its own direct address —
bookmark the ones you need:

| Portal | Address | Login |
|---|---|---|
| Student Terminal (home) | `http://<IP>:3000/` | Name + Father's Name + Course + Roll Number (no password) |
| Student Exam | `http://<IP>:3000/student` | Same terminal page |
| Teacher | `http://<IP>:3000/teacher` | Teacher username + password |
| Admin / Exam Controller | `http://<IP>:3000/admin` | Admin username + password |
| Principal | `http://<IP>:3000/principal` | Principal username + password |

Each staff portal is separate: it has its own login screen, and inside a
portal there are no links to the other portals — only a **"← Back to Home"**
button that returns to the Student Terminal. The terminal itself shows no
portals at all — only the roll-number check and the staff menu. A teacher's
login will not open the Admin
portal (and vice versa) — each login screen only accepts its own role, and shows
a small hint with that portal's demo logins.

> **First run:** the system creates its database automatically in the `data/` folder
> and loads only the real institute data (Principal, Admin, 14 teachers,
> 7 courses). Students and tests start empty — Admin adds them (see §2).
> No setup step is needed.

---

## 1b. Daily use + updates (no more ZIP downloads)

**Daily use — laptops need nothing installed.**
Only the Admin PC runs the server: double-click `START.bat` once in the morning
and leave the black window open. Every other laptop just opens the browser and
goes to `http://<Admin-PC-IP>:3000` — no software, no START click, no ZIP on the
laptops. For one-click opening, copy the `STC-Testing-System.url` shortcut file
to each laptop's Desktop. Edit it once first: right-click → Properties →
replace `ADMIN-PC-IP` with the Admin PC's IP address (shown by `START.bat`),
and `:3000` with `:3001` if the server runs on port 3001. Double-clicking the
shortcut opens the exam page. (Your edited shortcut is never overwritten by
updates — keep it on the laptops.)

**Updating — one double-click, no ZIP downloads.**
The code lives on GitHub: https://github.com/parvindarjambra/stc-testing-system
(public repo). When a new version is ready:
1. Close the black server window on the Admin PC.
2. Double-click **`UPDATE.bat`** — it downloads the latest code from GitHub and
   copies it over this folder. Your `data/` folder (students, tests, results)
   is never touched.
3. Double-click **`START.bat`** again. Done — the footer shows the new version.

**First install on a new PC.**
Download the repo ZIP from the GitHub link above (Code → Download ZIP),
extract it, double-click `UPDATE.bat` once (it restores the logo image file),
then double-click `START.bat`.

**Security note — LAN only.**
This system is built for the centre's own Wi-Fi/LAN. The default demo logins
(`admin` / `admin123`, teachers firstname / `teacher123`) are in the public
repo, so never expose the server to the internet (no port forwarding, no public
hosting). Inside the centre's LAN it is safe.

**macOS / Linux:** run `./start.sh` instead of `START.bat`.

**Change the port:** set the `PORT` environment variable before starting
(e.g. `set PORT=8080` then run `START.bat`), or edit the `set PORT=3000` line in
`START.bat`. If port 3000 is already in use on the PC, `START.bat` detects it
automatically and falls back to port 3001 (all printed URLs then use 3001).

---

## 1c. Offline labs — USB sync (no network at all)

For labs whose laptops have **no Wi-Fi and no LAN** — they cannot reach the
Admin PC's server. Those laptops use a standalone lab app instead, and data
moves only on a USB stick.

**The daily USB loop**

1. **Admin exports the Lab Pack** (Admin portal → USB Lab Sync → Export Lab
   Pack). This downloads **`STC-Lab.html`** — one self-contained file with
   all students and all tests. Copy it to every lab laptop (USB stick).
   Export a fresh pack whenever students or tests change.
2. **Students test fully offline.** Double-click `STC-Lab.html` — no server,
   no Node.js, no Wi-Fi needed on the laptop. Name, Father's Name, Course
   and Roll Number are checked against the pack (the first wrong field is
   named, in English), the test runs with its timer,
   and each submit is saved on that laptop. The screen clears for the next
   student, exactly like the online portal.
3. **Evening — teacher exports from each laptop.** In the lab app, the
   teacher clicks **Export (Teacher)** and saves the JSON file
   (`STC-Lab-Submissions-<date>.json`) to the USB stick. One file per laptop.
4. **Admin imports.** Admin portal → USB Lab Sync → Import Lab Submissions:
   select all the USB files at once and import. MCQs and fill-in-the-blank
   answers with a correct answer are auto-graded on import (theory is
   always teacher-graded) — identical marks to an online submission with
   the same answers. Importing the same file twice is safe — already-imported
   submissions are counted as duplicates and skipped.
5. **Teachers grade on the Admin PC** (Teacher portal, their own students
   only): the fill-in-the-blank + theory answers that were NOT auto-graded,
   then **Send to Admin** — the same as online submissions. A fully
   auto-graded lab submission goes straight to Admin. Admin finalizes as
   usual; the monthly report includes imported results.

**Rules that keep it safe**

- The lab pack contains **no answer keys** — a student cannot find answers
  via view-source. MCQ and fill-in-the-blank marks are counted on the
  Admin PC at import time; theory is graded by the teacher.
- A test taken on Monday counts on Monday even if the USB import happens
  later (the submission keeps its own test date).
- Only clear a laptop's saved submissions (**Clear saved** button) AFTER
  Admin has confirmed the import worked — deleted submissions cannot be
  recovered.
- If you import after running the Day Consolidation for that date,
  re-run the consolidation for that date so the new rows join the day sheet
  (re-running is safe — it never duplicates rows).

---

## 2. Demo logins (change these in the Admin portal after setup)

| Role | Username | Password | Person |
|---|---|---|---|
| Principal | `principal` | `principal123` | Ramesh Kumar |
| Admin / Exam Controller | `admin` | `admin123` | Danish Mustafa |
| Teacher | `suneel` | `teacher123` | Suneel Kumar — Web Development |
| Teacher | `mukesh` | `teacher123` | Mukesh Kumar — Web Development |
| Teacher | `chatar` | `teacher123` | Chatar Khatri — Graphic Designing |
| Teacher | `kelash` | `teacher123` | Kelash Kumar — DIT, CIT, One Year Compulsory |
| Teacher | `ashok` | `teacher123` | Ashok Kumar — DIT, CIT, One Year Compulsory |
| Teacher | `mahaveer` | `teacher123` | Mahaveer Singh — DIT, CIT, One Year Compulsory |
| Teacher | `qurban` | `teacher123` | Qurban Ali — DIT, CIT, One Year Compulsory |
| Teacher | `ramchand` | `teacher123` | Ramchand Rathore — DIT, CIT, One Year Compulsory |
| Teacher | `sooraj` | `teacher123` | Sooraj Kumar — DIT, CIT, One Year Compulsory |
| Teacher | `afzal` | `teacher123` | Muhammad Afzal — DIT, CIT, One Year Compulsory |
| Teacher | `faiz` | `teacher123` | Faiz Muhammad — DIT, CIT, One Year Compulsory |
| Teacher | `ghansham` | `teacher123` | Ghansham Kachhi — DIT, CIT, One Year Compulsory |
| Teacher | `pawan` | `teacher123` | Pawan — DIT, CIT, One Year Compulsory |
| Teacher | `kapil` | `teacher123` | Kapil — DIT, CIT, One Year Compulsory |

Students do **not** log in — they type four fields on the Student Exam
screen (`/`, same as `/student`): **Name, Father's Name, Course and Roll
Number**. All four are checked **in that order** against Admin's student
list (see §6): if a field does not match, the student sees exactly which
one is wrong, in English — *"Your Name is wrong."*, *"Your Father's Name
is wrong."*, *"Your Course is wrong."* or *"Your Roll Number is wrong."* —
and cannot enter any test. If all four match, the registered details are
shown **read-only** (the student cannot change them) with the assigned
teacher's name auto-filled from Admin's data — the student confirms and
picks a test. **Import your real student lists first**
(Admin → Students → Import CSV), or students cannot take tests.
The system ships with **no students and no tests** — the Students and Tests
lists start empty, and Admin adds the real data. First-run flow: Admin logs
in → adds students (Add Student, or Import CSV with the provided template)
→ creates the month's test fresh (Tests → Create Test). There is no dummy
or demo data anywhere in the system.

**Notes on names (from the official STC website):**
- The website lists "Ghansham Kachhi" as Hardware Incharge — he is seeded here as
  Computer Instructor "Ghansham Kachhi" (very likely the same person now also
  teaching). If it is a different Ghansham, Admin can rename him in the portal.
- "Pawan" and "Kapil" were given without surnames — Admin can edit their full
  names later in the Admin → Teachers section.
- The STC website lists "Ramesh Kumar" twice (Principal AND Vice-Principal) and
  "Sooraj Kumar" twice (Computer Instructor AND Watchman) — this looks like a
  website data quirk. The system uses Principal Ramesh Kumar and Instructor
  Sooraj Kumar.
- Two former listings, Dileep Kumar and Nadir Ali, were removed at the centre's
  request and have no logins.

---

## 3. Daily routine

| Time | What happens |
|---|---|
| Before 7:00 AM | Admin starts the server (`START.bat`) and checks the dashboard. |
| 7:00 AM – 7:00 PM | 11 one-hour shifts run (see below). Students open the home page — the Student Terminal (`/`, same as `/student`), type their Name, Father's Name, Course and Roll Number (all four must match Admin's list), pick their test, and submit. After every submission the screen resets itself automatically, so the laptop is immediately ready for the next shift's student — no login conflicts. |
| During the day | Teachers log in at `/teacher`, grade theory and fill-in-the-blank answers, and click **Submit to Admin**. |
| Evening or next morning | Admin opens **Day Consolidation**, picks the date, and presses **Run Day Consolidation & Sync** — the system compiles the whole day's master record (all shifts, all laptops) and locks it. Running it again is safe, it never duplicates rows. The locked day sheet is then visible to Admin, Principal, and each teacher (their own students only). |
| End of month | Admin opens **Monthly Report**, picks the month, reviews the compiled results, and exports/prints the Official Monthly Test & Progress Report. |
| Next day (after grading) | Admin opens **Student Feedback**, picks the course + test (or a whole month), and prints the course-wise proof sheet to PDF — one block per student, **roll numbers only, no names** — so the management teacher can post it in the course WhatsApp group. Only finalized results appear. |

**Shifts (11):** 07:00–08:00, 08:00–09:00, 09:00–10:00, 10:00–11:00, 11:00–12:00,
12:00–13:00, 14:00–15:00, 15:00–16:00, 16:00–17:00, 17:00–18:00, 18:00–19:00.
(13:00–14:00 is lunch — no shift.)

**Courses (7):** DIT, CIT, One Year Compulsory, Web Development, E-commerce,
Graphic Designing, Digital Marketing. Admin can add or rename courses.

> **E-commerce & Digital Marketing currently have no assigned teacher.** Both
> courses stay in the system. If a student picks one of them, the teacher
> dropdown shows all Computer Instructors as a fallback (with a note), so the
> flow never dead-ends. Admin can assign a subject teacher anytime in
> Admin → Teachers.

---

## 4. The four portals

The home page is the **Student Terminal** — students see only the
roll-number check, never the staff portals. Each staff portal is a **separate
page with its own address and its own login screen**, reached from the
terminal's "Staff / Faculty Login" menu (top-right). Until login succeeds,
a portal shows *only* its login form — no console, no buttons, no data.
Each portal has only its own Logout, which returns to that portal's login
screen. There are no links between portals inside any portal — only a
"← Back to Home" button that returns to the Student Terminal (on the login
screen and inside the console).

**Student Exam Portal — `/` and `/student` (same terminal page; no login, four-field verification)**
Name + Father's Name + Course + Roll Number checked against Admin's list
(first wrong field named, in English) → registered details shown read-only
(teacher auto-filled) → confirm → test picker → exam screen with live
countdown timer, question palette, auto-submit on timeout. MCQs are
auto-graded from the Admin's answer key; fill-in-the-blank answers are
auto-checked when the Admin set a correct answer, and theory answers are
always teacher-graded. A submission with no theory questions that is fully
auto-graded goes straight to Admin. After submitting, the screen shows
the MCQ score, then clears the session immediately for the next student.
A student whose details do not match the list cannot enter any test
(see §2, §6).

**Teacher Portal — `/teacher` (login)**
Each teacher sees **only** their own assigned students (enforced by the
server). Side-by-side grading (student answer vs. model answer / suggested
answer + max marks) for the theory and fill-in-the-blank questions that
were NOT auto-graded; auto-graded questions show their mark read-only with
a small 'Auto' tag (the teacher cannot change them). Per-question marks,
auto-computed total, then **Submit to Admin**
(single or bulk for the day). Teachers can also view their own
Day Consolidation sheet.

**Admin / Exam Controller Portal — `/admin` (login)**
Sidebar: Dashboard, Students, Tests, Results, Student Feedback, Monthly
Reports, Day Consolidation, Courses, Teachers. Live shift monitor,
Students (add/edit +
Excel/CSV bulk import), Test & Quiz Builder (MCQs + Fill in the Blank +
Theory, timer, randomize order, **month** for monthly tests; FIB correct
answer for auto-grading — theory is always teacher-graded), review
teacher-submitted results (auto-graded marks carry a small 'Auto' tag),
Finalize, Monthly Report, course-wise results
export to Excel (CSV) + printable course-wise result sheets, and the Day
Consolidation button + history. Teachers can also be bulk-imported from CSV
(Admin → Teachers → Import CSV).

**Principal Portal — `/principal` (separate login, read-only)**
Full-day and monthly analytics across all shifts, courses and teachers;
participation per shift; teacher-submitted vs. final Admin results; export and
print official institute result sheets (with institute header, affiliations,
and signature lines for Director, Principal and Exam Controller).

---

## 5. Monthly tests — how the month works

Admin creates a **fresh test every month** in the Test Builder. Monthly tests
have a **Month** field (e.g. November 2026); daily quizzes do not. The Monthly
Report compiles by the selected month: it includes only that month's monthly
tests (status: sent to Admin or final) — daily quizzes are excluded. Pass mark
is 40%.

---

## 6. Students: import, per-student teacher, template

- **Bulk import:** Admin → Students → Import CSV. Use the downloadable
  `students_template.csv` (columns: Roll Number, Student Name, Father's Name,
  Course, Shift, Assigned Teacher). The importer handles quoted fields and
  commas, skips duplicate roll numbers, and reports every bad row.
  The Assigned Teacher column takes a teacher's **username or full name**
  (e.g. `kelash` or `Kelash Kumar`); a name that matches no teacher rejects
  that row with a clear error naming the row. The template now carries one
  demo row (`1001,Demo Student,Demo Father,CIT,08:00 AM - 09:00 AM,Ashok Kumar`)
  showing the exact format — delete that line before importing your own list.
  The importer is forgiving: a leading `Sir ` / `Mr. ` is ignored, `9:00 AM`
  works as `09:00 AM`, and lowercase courses are corrected to the official
  name (`cit` → `CIT`).
- **Teacher import:** Admin → Teachers → Import CSV. Use the downloadable
  `teachers_template.csv` (columns: Teacher Name, Course, Username, Password).
  Username is optional (auto from the first name) and Password is optional
  (default `teacher123`); several courses go in one cell separated by `;`.
  A username that already exists rejects that row.
- **Excel files:** the importer reads **CSV only**. In Excel, open your `.xlsx`
  and use **File → Save As → CSV UTF-8** first, then import the `.csv`.
- **Per-student teacher:** every student has their *own* assigned teacher (not
  one teacher per class). Four-field verification fills that teacher in
  automatically from the registered record; the details shown to the
  student are read-only — if anything is wrong, Admin corrects it in the
  student list (Admin → Students → Edit). A teacher's portal shows only
  their own students.
- **Only listed students can take tests.** A student whose Name, Father's
  Name, Course or Roll Number does not match the list is turned away at
  the Student Exam screen, told exactly which field is wrong (in English),
  and asked to contact Admin. Keep the list up to date: import the real
  class lists before the first test day.

---

## 7. Backup, moving PCs, and data safety

- **Backup:** copy the whole `data/` folder (e.g. to a USB stick) at the end of
  each day or week. That folder is the entire database.
- **Restore / move to another PC:** install Node.js on the new PC, unzip this
  system, copy your saved `data/` folder in, start `START.bat`. Everything
  (students, tests, submissions, results) comes back.
- Data is saved on every write and survives restarts and power cuts. The
  server re-seeds the real accounts (Principal, Admin, teachers, courses)
  **only** when the users collection is completely empty — it never deletes
  or overwrites your students, tests or results.

---

## 8. FAQ

**A laptop lost Wi-Fi during a test — is the result lost?**
No. If the submit cannot reach the server, the laptop saves the submission in
its browser ("Saved offline — will sync automatically") and retries every
15 seconds, plus a **Sync now** button. When Wi-Fi returns, queued submissions
upload automatically. Each submission has a unique id, so a retry can never
create a duplicate. Do not close the browser tab until it shows "Synced".

**A student submitted, but the next student sees the previous student's details?**
That should not happen — the screen clears itself after every submission. If it
ever does, press the browser's refresh (F5) — the start screen is always blank
after a refresh.

**How do I print / save a result sheet as PDF?**
Open the report or day sheet, click **Print**, and in the print dialog choose
"Save as PDF" (Chrome/Edge) or print to the printer. Print views include the
institute header (with the real STC logo) and signature lines. For results
grouped by course, use Admin → Monthly Report → **Print Course-wise Result
Sheet**; for Excel, use **Export Results to Excel (CSV)** in the same place
(or in Results, for the month of the selected date).

**I forgot the Admin password.**
Admin can reset teacher passwords in Admin → Teachers. If the Admin password
itself is lost, stop the server, delete the `data/` folder contents, and start
again — the system re-seeds with the demo logins above. **Warning: this erases
all students, tests and results**, so only do it if you have a `data/` backup
or are starting fresh.

**The server window says "port 3000 in use".**
Another copy of the server is already running (or another program uses port
3000). `START.bat` handles this automatically: it switches to port 3001 and
prints the 3001 addresses. If you start the server manually (`node server.js`),
use `set PORT=3001 && node server.js` instead (see §1).

**Laptops can't reach the page.**
Check: (1) the Admin PC and laptops are on the same Wi-Fi/LAN; (2) you typed
the Admin PC's current IP (shown by `START.bat` — it can change if the PC
reconnects); (3) Windows Firewall allows Node.js — the first time you run
`START.bat`, Windows may ask "Allow Node.js through the firewall?" — click
**Allow**. If it was blocked, open Windows Defender Firewall → Allow an app →
allow Node.js on Private networks.

**Can students open the system from home / the internet?**
No — by design. It only works on the centre's local network. That is what
makes it work with zero internet.

---

## 9. How it is built (for the technically curious)

- **Plain Node.js server, zero npm dependencies, no build step.** Only built-in
  modules (`http`, `fs`, `path`, `crypto`). We deliberately did **not** use
  Next.js: this system must start with a double-click on a Windows PC in a
  rural centre and run fully offline — a single-file server with no install
  step is the right call here.
- **Database:** SQLite via `node:sqlite` when available (Node 22.5+), with an
  automatic fallback to a file-backed JSON store (same interface) so it runs
  on any Node 18+ with no build tools. Both live in `data/`.
- **Frontend:** separate portal pages in `public/` (`index.html` landing,
  `student.html`, `teacher.html`, `admin.html`, `principal.html`) with shared
  `common.js` + one JS file per portal and one `style.css` — all CSS/JS/fonts
  inline or local, **zero external requests** (no CDNs, no Google Fonts).
  System font stack. The real STC logo (`public/stc-logo.webp`, a local
  file) is shown in every header and on print sheets. The staff consoles live
  in `fragments/` (outside `public/`) and are only sent to the browser after
  a successful login, with the matching role — so an unauthenticated visitor
  can never see console markup, even in the page source.
- **Seed data (real only):** the 16 real user accounts (Principal, Admin,
  14 teachers) and the 7 real courses. **No sample students and no sample
  tests** — both lists start empty on first run; Admin adds real students
  and creates each month's test fresh (see §2).

## 10. Honest limits

- **CSV import only** — `.xlsx` must be Saved-As CSV in Excel first (see §6).
- **PDF via browser print** — there is no built-in PDF generator; use the
  browser's Print → Save as PDF (see §8).
- **Passwords** use salted SHA-256 hashing — adequate for a LAN-only demo
  system, not bcrypt-grade. Keep the Admin PC itself physically secure and
  change the demo passwords after setup.
- **Plain HTTP on the LAN** (no HTTPS) — normal for a local-network system;
  never expose this server directly to the internet.
- **Login sessions live in server memory** — restarting the server logs
  everyone out (they just log in again; no data is lost).
- **Pass mark is fixed at 40%** and grading is per-submission (one test at a
  time); there is no automatic SMS/WhatsApp result delivery.

## 11. Files in this package

| File | What it is |
|---|---|
| `START.bat` / `start.sh` | Double-click launchers (Windows / macOS+Linux) |
| `server.js` | The whole server (single file, commented) |
| `seed.js` | Demo data (re-runnable, never duplicates) |
| `e2e-test.js` | End-to-end verification script (see TEST_REPORT.md) |
| `e2e-sync-test.js` | USB-sync verification: the full offline-lab loop (pack export → lab submissions → import → grading → send → finalize → monthly report) |
| `lab-template.html` | Template for the standalone offline lab app — Admin exports it filled with the lab pack as `STC-Lab.html` (see §1c). Not served directly; only via the Admin-only `/api/lab-pack` endpoint |
| `public/` | The web app: 5 portal pages (`index.html`, `student.html`, `teacher.html`, `admin.html`, `principal.html`), 6 JS files (`common.js` + one per portal), `style.css`, `stc-logo.webp` (real STC logo), `students_template.csv`, `teachers_template.csv` |
| `fragments/` | Staff console markup (teacher/admin/principal) — served only after login with the matching role |
| `students_template.csv` | Sample student import file (also downloadable in Admin) |
| `teachers_template.csv` | Sample teacher import file (also downloadable in Admin) |
| `data/` | The database (created on first run; back this up) |
| `README.md` | This file |
| `TEST_REPORT.md` | Verification results |

**Re-verify after any change:** stop the server, delete `data/stc.sqlite`
(or `data/*.json`), start on a test port (`PORT=3102 node server.js`), then
run `node e2e-test.js http://127.0.0.1:3102`. It should report 205 PASS, 0 FAIL.
Then wipe the test DB again and run `node e2e-sync-test.js
http://127.0.0.1:3102` for the USB-sync loop (see TEST_REPORT.md §v1.4.0).
