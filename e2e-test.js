// STC Testing System — end-to-end verification script (v1.10.2: lab
// teacher PIN — pack export requires a PIN, only its SHA-256 hash is
// embedded, the lab app asks for the PIN before Export / Clear saved;
// v1.10.1: three anti-cheat warnings before auto-lock (lock on the 4th
// switch); theory marking back to the teacher — MCQ + FIB auto-graded,
// theory ALWAYS teacher-graded (stored key words ignored); v1.10.0: one
// attempt per test (server blocks a second start + second submit; lab
// import dedupes by roll + test) + lab durability (draft auto-save, restore
// on reopen); auto-grading — FIB auto-check, fully-auto (MCQ + FIB only)
// submissions straight to Admin, teacher flow kept as fallback;
// anti-cheat tab-switch warnings + auto-lock + teacher flag; full-width
// consoles, inline validation errors, no student back/change; no demo hints
// in the UI; four-field student verification, real logo, back-to-home,
// teacher import, fill-in-the-blank, course-wise results).
// Usage: 1) wipe the test DB:  rm -f data/stc.sqlite data/*.json
//        2) start server:      PORT=3102 node server.js   (auto-seeds users/courses on first start)
//        3) run:               node e2e-test.js [baseUrl]
//        Defaults to http://127.0.0.1:3102. Exits 1 if any check fails.
//        MUST run against a freshly wiped DB: section [4] verifies the system
//        starts with ZERO students and ZERO tests, then creates its own E2E
//        students + tests via the Admin API (the suite is self-contained —
//        v1.2.0+ ships no sample students or sample tests). Section [20]
//        (v1.3.0) runs LAST so its extra students/teachers/tests cannot
//        disturb the count assertions in earlier sections.
// Covers: separate portal pages + login-only shells + authenticated fragments,
// role-enforced login, four-field student verification (server + client),
// unauthenticated API rejection, submission + MCQ auto-score, dedupe, teacher
// filtering, grading + send + finalize, monthly report (month field),
// consolidation lock, principal analytics, CSV import/export, offline-queue +
// fallback code checks, zero-external-requests check on served files,
// real logo serving, back-to-home links, teacher CSV import, fill-in-the-
// blank questions (teacher-graded), course-wise results export + report.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE = process.argv[2] || 'http://127.0.0.1:3102';
let pass = 0, fail = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; failures.push(name); console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}

async function req(method, p, body, token) {
  const r = await fetch(BASE + p, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json' },
      token ? { Authorization: 'Bearer ' + token } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* non-JSON (CSV/HTML) */ }
  return { status: r.status, json, text, headers: r.headers };
}

async function login(username, password, role) {
  const body = { username, password };
  if (role) body.role = role;
  const r = await req('POST', '/api/auth/login', body);
  return r.status === 200 ? r.json : null;
}

const TEACHERS = [
  ['suneel', 'Suneel Kumar'], ['mukesh', 'Mukesh Kumar'], ['chatar', 'Chatar Khatri'],
  ['kelash', 'Kelash Kumar'], ['ashok', 'Ashok Kumar'], ['mahaveer', 'Mahaveer Singh'],
  ['qurban', 'Qurban Ali'], ['ramchand', 'Ramchand Rathore'], ['sooraj', 'Sooraj Kumar'],
  ['afzal', 'Muhammad Afzal'], ['faiz', 'Faiz Muhammad'], ['ghansham', 'Ghansham Kachhi'],
  ['pawan', 'Pawan'], ['kapil', 'Kapil'],
];

async function main() {
  console.log('E2E — base ' + BASE);

  console.log('\n[1] Health + separate portal pages + static files');
  const h = await req('GET', '/api/health');
  check('health 200 + ok', h.status === 200 && h.json && h.json.ok === true, JSON.stringify(h.json));
  check('db backend reported', h.json && (h.json.db === 'sqlite' || h.json.db === 'json'), h.json && h.json.db);
  check('version is 1.10.2', h.json && h.json.version === '1.10.2', h.json && h.json.version);
  const home = await req('GET', '/');
  check('home is the Student Terminal (institute name + verify form + heading)',
    home.status === 200 && home.text.includes('Super Sys-Tech Computers Centre') &&
    home.text.includes('stu-verify-form') && home.text.includes('Candidate Identity Verification'));
  check('terminal has Staff / Faculty Login control with 3 portal links',
    home.text.includes('Staff / Faculty Login') &&
    ['/teacher', '/admin', '/principal'].every((p) => home.text.includes('href="' + p + '"')));
  check('terminal has NO portal cards',
    !home.text.includes('portal-card') && !home.text.includes('Choose your portal'));
  check('terminal has NO portal console content',
    !home.text.includes('teacher-queue') && !home.text.includes('tab-dashboard') && !home.text.includes('pa-totals'));
  const stuPage = await req('GET', '/student');
  check('student page serves (verify form, no login form)',
    stuPage.status === 200 && stuPage.text.includes('stu-verify-form') && !stuPage.text.includes('login-form'));
  const teaPage = await req('GET', '/teacher');
  check('teacher page serves login form only',
    teaPage.status === 200 && teaPage.text.includes('id="login-form"') && teaPage.text.includes('Teacher Login'));
  const admPage = await req('GET', '/admin');
  check('admin page serves login form only',
    admPage.status === 200 && admPage.text.includes('id="login-form"') && admPage.text.includes('Admin Login'));
  const priPage = await req('GET', '/principal');
  check('principal page serves login form only',
    priPage.status === 200 && priPage.text.includes('id="login-form"') && priPage.text.includes('Principal Login'));
  check('login pages show NO demo hints or passwords (v1.6.1)',
    [teaPage.text, admPage.text, priPage.text].every((t) =>
      !t.includes('demo-hint') && !t.includes('admin123') && !t.includes('teacher123') &&
      !t.includes('principal123') && !t.includes('Demo:')));
  check('portal pages are distinct',
    stuPage.text !== teaPage.text && teaPage.text !== admPage.text && admPage.text !== priPage.text);
  check('home (/) and /student serve the same terminal page', home.text === stuPage.text);
  for (const f of ['common.js', 'student.js', 'teacher.js', 'admin.js', 'principal.js']) {
    const r = await req('GET', '/' + f);
    check(f + ' serves', r.status === 200 && r.text.length > 500, f + ': ' + r.status);
  }
  const css = await req('GET', '/style.css');
  check('style.css serves + restyled theme (stc.edu.pk navy, terminal, sidebar)',
    css.status === 200 && css.text.includes('#0f172a') && css.text.includes('.terminal-card') && css.text.includes('.console-layout'));
  check('style.css has NO demo-hint rule (v1.6.1)', !css.text.includes('demo-hint'));
  const tpl = await req('GET', '/students_template.csv');
  check('students_template.csv serves', tpl.status === 200 && tpl.text.includes('Roll Number'));
  const idx = await req('GET', '/index.html');
  check('/index.html redirects to the terminal (no old landing)',
    idx.status === 200 && idx.text.includes('url=/') && !idx.text.includes('portal-card'));
  const unknown = await req('GET', '/no-such-page');
  check('unknown path -> 404 (no SPA fallback)', unknown.status === 404);

  console.log('\n[2] Logins — principal, admin, all 14 teachers + role enforcement');
  const admin = await login('admin', 'admin123');
  check('admin login (Danish Mustafa)', !!(admin && admin.user.name === 'Danish Mustafa' && admin.user.role === 'admin'));
  const principal = await login('principal', 'principal123');
  check('principal login (Ramesh Kumar)', !!(principal && principal.user.name === 'Ramesh Kumar' && principal.user.role === 'principal'));
  const bad = await req('POST', '/api/auth/login', { username: 'admin', password: 'wrong' });
  check('wrong password -> 401', bad.status === 401);
  const wrongRole1 = await req('POST', '/api/auth/login', { username: 'admin', password: 'admin123', role: 'teacher' });
  check('admin credentials on teacher portal -> 403 wrong_role',
    wrongRole1.status === 403 && wrongRole1.json && wrongRole1.json.error === 'wrong_role', JSON.stringify(wrongRole1.json));
  const wrongRole2 = await req('POST', '/api/auth/login', { username: 'suneel', password: 'teacher123', role: 'admin' });
  check('teacher credentials on admin portal -> 403 wrong_role', wrongRole2.status === 403);
  const wrongRole3 = await req('POST', '/api/auth/login', { username: 'principal', password: 'principal123', role: 'admin' });
  check('principal credentials on admin portal -> 403 wrong_role', wrongRole3.status === 403);
  const rightRole = await login('admin', 'admin123', 'admin');
  check('admin login with matching role param -> 200', !!(rightRole && rightRole.token));
  const tokens = {};
  for (const [u, name] of TEACHERS) {
    const t = await login(u, 'teacher123', 'teacher');
    check('teacher login ' + u + ' (' + name + ')', !!(t && t.user.name === name && t.user.role === 'teacher'));
    if (t) tokens[u] = { token: t.token, id: t.user.id, courses: t.user.courses };
  }
  const nadir = await req('POST', '/api/auth/login', { username: 'nadir', password: 'teacher123' });
  check('removed teacher nadir -> 401', nadir.status === 401);
  const dileep = await req('POST', '/api/auth/login', { username: 'dileep', password: 'teacher123' });
  check('removed teacher dileep -> 401', dileep.status === 401);

  console.log('\n[3] Reference data — teachers, courses, shifts');
  const tl = await req('GET', '/api/teachers');
  check('teachers list = 14', tl.json && tl.json.teachers && tl.json.teachers.length === 14, tl.json && tl.json.teachers && tl.json.teachers.length);
  check('teachers list leaks no password hash', tl.text.indexOf('password_hash') === -1);
  const ecoT = (tl.json.teachers || []).filter((t) => (t.courses || []).includes('E-commerce'));
  const dmT = (tl.json.teachers || []).filter((t) => (t.courses || []).includes('Digital Marketing'));
  check('E-commerce has no assigned teacher (expected)', ecoT.length === 0);
  check('Digital Marketing has no assigned teacher (expected)', dmT.length === 0);
  const ditT = (tl.json.teachers || []).filter((t) => (t.courses || []).includes('DIT'));
  check('11 Computer Instructors teach DIT (fallback pool)', ditT.length === 11, String(ditT.length));
  const cl = await req('GET', '/api/courses');
  const cnames = (cl.json.courses || []).map((c) => c.name);
  check('courses = 7 incl. Graphic Designing + Digital Marketing',
    cnames.length === 7 && cnames.includes('Graphic Designing') && cnames.includes('Digital Marketing'), cnames.join(', '));
  const sh = await req('GET', '/api/shifts');
  check('shifts = 11', sh.json && sh.json.shifts && sh.json.shifts.length === 11);

  console.log('\n[4] Clean start (no dummy data) + E2E setup via Admin API');
  // v1.2.0 ships with NO students and NO tests — verify the clean start first.
  const freshStudents = await req('GET', '/api/students', null, admin.token);
  check('fresh DB: students list starts empty (0 students)',
    freshStudents.json && (freshStudents.json.students || []).length === 0,
    'got ' + ((freshStudents.json.students || []).length));
  const freshTests = await req('GET', '/api/tests');
  check('fresh DB: tests list starts empty (0 tests)',
    freshTests.json && (freshTests.json.tests || []).length === 0,
    'got ' + ((freshTests.json.tests || []).length));
  // Self-contained setup: create the E2E students + tests this suite needs.
  // Rolls/names are clearly test data (E2E-xxx) — never shipped to users.
  const E2E_STUDENTS = [
    { roll_number: 'E2E-001', name: 'E2E Student One', father_name: 'E2E Father One', course: 'DIT', shift: '07:00 AM - 08:00 AM', teacher_id: tokens.kelash.id },
    { roll_number: 'E2E-002', name: 'E2E Student Two', father_name: 'E2E Father Two', course: 'CIT', shift: '08:00 AM - 09:00 AM', teacher_id: tokens.ashok.id },
    { roll_number: 'E2E-003', name: 'E2E Student Three', father_name: 'E2E Father Three', course: 'DIT', shift: '10:00 AM - 11:00 AM', teacher_id: tokens.qurban.id },
    { roll_number: 'E2E-004', name: 'E2E Student Four', father_name: 'E2E Father Four', course: 'CIT', shift: '09:00 AM - 10:00 AM', teacher_id: tokens.pawan.id },
  ];
  const createdStudents = [];
  for (const s of E2E_STUDENTS) {
    const r = await req('POST', '/api/students', s, admin.token);
    if (r.status === 201) createdStudents.push(r.json.student);
  }
  check('setup: 4 E2E students created via Admin API (all 201)',
    createdStudents.length === 4, 'created ' + createdStudents.length);
  const mcq = (n, correct) => ({ type: 'mcq', question: 'E2E question ' + n + '?', options: ['Option A', 'Option B', 'Option C', 'Option D'], correct, marks: 2 });
  const ditQuestions = [0, 1, 2, 3, 0, 1, 2, 3, 0, 1].map((c, i) => mcq(i + 1, c)).concat([
    { type: 'theory', question: 'E2E theory question 1.', max_marks: 10, model_answer: 'E2E model answer 1.' },
    { type: 'theory', question: 'E2E theory question 2.', max_marks: 10, model_answer: 'E2E model answer 2.' },
    { type: 'theory', question: 'E2E theory question 3.', max_marks: 10, model_answer: 'E2E model answer 3.' },
  ]);
  const ditCreate = await req('POST', '/api/tests', {
    title: 'DIT Monthly Test — November 2026', course: 'DIT', type: 'monthly-test', month: '2026-11',
    duration_minutes: 60, randomize: 1, questions: ditQuestions,
  }, admin.token);
  const quizCreate = await req('POST', '/api/tests', {
    title: 'CIT Daily Quiz', course: 'CIT', type: 'daily-quiz',
    duration_minutes: 15, randomize: 1, questions: [0, 1, 2, 3, 0].map((c, i) => mcq(i + 1, c)),
  }, admin.token);
  check('setup: DIT monthly test (2026-11, 13 questions) + CIT daily quiz created (both 201)',
    ditCreate.status === 201 && quizCreate.status === 201,
    'dit ' + ditCreate.status + ', quiz ' + quizCreate.status);

  console.log('\n[5] Four-field student verification (name/father/course/roll, teacher auto-fill)');
  const verify = (body) => req('POST', '/api/students/verify', body);
  const v1 = await verify({ name: 'E2E Student One', father_name: 'E2E Father One', course: 'DIT', roll: 'E2E-001' });
  check('verify E2E-001 full match (E2E Student One, DIT, kelash auto-filled)',
    v1.json && v1.json.verified && v1.json.student.name === 'E2E Student One' && v1.json.student.course === 'DIT' &&
    v1.json.student.teacher_id === tokens.kelash.id && v1.json.student.teacher_name === 'Kelash Kumar', JSON.stringify(v1.json));
  const vCase = await verify({ name: 'e2e student one', father_name: 'e2e  father  one', course: 'dit', roll: 'e2e-001' });
  check('verify is case-insensitive + whitespace-tolerant (lowercase "dit" matches "DIT")',
    vCase.json && vCase.json.verified === true, JSON.stringify(vCase.json));
  const v4 = await verify({ name: 'E2E Student Four', father_name: 'E2E Father Four', course: 'CIT', roll: 'E2E-004' });
  check('verify E2E-004 -> pawan', v4.json && v4.json.verified && v4.json.student.teacher_id === tokens.pawan.id);
  const v2 = await verify({ name: 'E2E Student Two', father_name: 'E2E Father Two', course: 'CIT', roll: 'E2E-002' });
  check('verify E2E-002 -> ashok', v2.json && v2.json.verified && v2.json.student.teacher_id === tokens.ashok.id);
  const vName = await verify({ name: 'No Such Student', father_name: 'E2E Father One', course: 'DIT', roll: 'E2E-001' });
  check('wrong name -> name_wrong + "Your Name is wrong."',
    vName.json && vName.json.verified === false && vName.json.errorCode === 'name_wrong' && vName.json.error === 'Your Name is wrong.', JSON.stringify(vName.json));
  const vFather = await verify({ name: 'E2E Student One', father_name: 'Wrong Father', course: 'DIT', roll: 'E2E-001' });
  check('right name + wrong father -> father_wrong + "Your Father\'s Name is wrong."',
    vFather.json && vFather.json.verified === false && vFather.json.errorCode === 'father_wrong' && vFather.json.error === "Your Father's Name is wrong.", JSON.stringify(vFather.json));
  const vCourse = await verify({ name: 'E2E Student One', father_name: 'E2E Father One', course: 'CIT', roll: 'E2E-001' });
  check('right name/father + wrong course -> course_wrong + "Your Course is wrong."',
    vCourse.json && vCourse.json.verified === false && vCourse.json.errorCode === 'course_wrong' && vCourse.json.error === 'Your Course is wrong.', JSON.stringify(vCourse.json));
  const vRoll = await verify({ name: 'E2E Student One', father_name: 'E2E Father One', course: 'DIT', roll: 'E2E-999' });
  check('right name/father/course + wrong roll -> roll_wrong + "Your Roll Number is wrong."',
    vRoll.json && vRoll.json.verified === false && vRoll.json.errorCode === 'roll_wrong' && vRoll.json.error === 'Your Roll Number is wrong.', JSON.stringify(vRoll.json));
  const vEmpty = await verify({ name: 'E2E Student One', father_name: '', course: 'DIT', roll: 'E2E-001' });
  check('missing field -> 400 fields_required',
    vEmpty.status === 400 && vEmpty.json && vEmpty.json.errorCode === 'fields_required', JSON.stringify(vEmpty.json));
  const lOld = await req('GET', '/api/students/lookup?roll=E2E-001');
  check('old roll-only GET /api/students/lookup is retired (404)', lOld.status === 404, 'got ' + lOld.status);
  // the 4 created students are listed, each with its own assigned teacher
  const sl = await req('GET', '/api/students', null, admin.token);
  const byTeacher = {};
  (sl.json.students || []).forEach((s) => { byTeacher[s.teacher_id] = (byTeacher[s.teacher_id] || 0) + 1; });
  check('students list has the 4 created students, each with its own teacher',
    (sl.json.students || []).length === 4 &&
    byTeacher[tokens.kelash.id] === 1 && byTeacher[tokens.ashok.id] === 1 &&
    byTeacher[tokens.qurban.id] === 1 && byTeacher[tokens.pawan.id] === 1,
    'got ' + ((sl.json.students || []).length) + ' students');

  console.log('\n[6] Tests — month field + answer stripping');
  const tests = await req('GET', '/api/tests?course=DIT');
  const dit = (tests.json.tests || []).find((t) => t.type === 'monthly-test');
  check('DIT monthly test listed with month 2026-11', !!(dit && dit.month === '2026-11'), JSON.stringify(dit));
  check('DIT test has 13 questions', !!(dit && dit.question_count === 13), dit && dit.question_count);
  const anon = await req('GET', '/api/tests/' + dit.id);
  check('anonymous test fetch strips correct/model_answer',
    anon.text.indexOf('"correct"') === -1 && anon.text.indexOf('model_answer') === -1);
  const withAns = await req('GET', '/api/tests/' + dit.id, null, tokens.kelash.token);
  check('teacher test fetch includes answers', withAns.text.indexOf('"correct"') !== -1);
  const byMonth = await req('GET', '/api/tests?month=2026-11');
  check('?month=2026-11 filter returns only monthly test',
    byMonth.json && byMonth.json.tests && byMonth.json.tests.length === 1 && byMonth.json.tests[0].id === dit.id);
  const citQ = await req('GET', '/api/tests?course=CIT');
  const quiz = (citQ.json.tests || []).find((t) => t.type === 'daily-quiz');
  check('CIT daily quiz month is null', !!(quiz && quiz.month === null));

  console.log('\n[7] Student submission + MCQ auto-score + dedupe');
  const qs = withAns.json.test.questions;
  const answers = qs.map((q, i) => q.type === 'mcq'
    ? { q: i, answer: i < 8 ? q.correct : (q.correct + 1) % 4 }   // 8 right, 2 wrong
    : { q: i, answer: 'Sample theory answer ' + (i - 9) });
  const clientId = 'e2e-' + Date.now();
  const sub1 = await req('POST', '/api/submissions', {
    client_id: clientId,
    student: { roll_number: 'E2E-001', name: 'E2E Student One', father_name: 'E2E Father One', course: 'DIT', shift: '07:00 AM - 08:00 AM', teacher_id: tokens.kelash.id },
    test_id: dit.id, answers,
  });
  const s1 = sub1.json && sub1.json.submission;
  check('DIT submit 200/201 + status submitted', (sub1.status === 200 || sub1.status === 201) && s1 && s1.status === 'submitted', JSON.stringify(sub1.json));
  check('MCQ auto-score 16/20 (8 of 10 correct x 2 marks)', s1 && s1.mcq_score === 16 && s1.mcq_max === 20, s1 && (s1.mcq_score + '/' + s1.mcq_max));
  check('theory_max 30, total 16, max_total 50', s1 && s1.theory_max === 30 && s1.total === 16 && s1.max_total === 50);
  const dup = await req('POST', '/api/submissions', {
    client_id: clientId,
    student: { roll_number: 'E2E-001', name: 'E2E Student One', father_name: 'E2E Father One', course: 'DIT', shift: '07:00 AM - 08:00 AM', teacher_id: tokens.kelash.id },
    test_id: dit.id, answers,
  });
  check('same client_id deduped (no duplicate submission)', dup.json && dup.json.deduped === true && dup.json.submission.id === s1.id);
  // second DIT submission for a different teacher (qurban) + CIT quiz for ashok
  const sub2 = await req('POST', '/api/submissions', {
    client_id: 'e2e-q-' + Date.now(),
    student: { roll_number: 'E2E-003', name: 'E2E Student Three', father_name: 'E2E Father Three', course: 'DIT', shift: '10:00 AM - 11:00 AM', teacher_id: tokens.qurban.id },
    test_id: dit.id, answers,
  });
  check('second DIT submission (qurban student) 200/201', sub2.status === 200 || sub2.status === 201);
  const quizFull = await req('GET', '/api/tests/' + quiz.id, null, tokens.ashok.token);
  const qAns = quizFull.json.test.questions.map((q, i) => ({ q: i, answer: q.correct }));
  const sub3 = await req('POST', '/api/submissions', {
    client_id: 'e2e-c-' + Date.now(),
    student: { roll_number: 'E2E-002', name: 'E2E Student Two', father_name: 'E2E Father Two', course: 'CIT', shift: '08:00 AM - 09:00 AM', teacher_id: tokens.ashok.id },
    test_id: quiz.id, answers: qAns,
  });
  const s3 = sub3.json && sub3.json.submission;
  check('CIT quiz 5/5 -> 10/10', s3 && s3.mcq_score === 10 && s3.mcq_max === 10);

  console.log('\n[8] Teacher queue filtering (strict per teacher)');
  const kq = await req('GET', '/api/submissions', null, tokens.kelash.token);
  const kRows = kq.json.submissions || [];
  check('kelash sees only own submissions (1)', kRows.length === 1 && kRows[0].teacher_id === tokens.kelash.id, 'got ' + kRows.length);
  const spoof = await req('GET', '/api/submissions?teacher_id=' + tokens.qurban.id, null, tokens.kelash.token);
  const spoofRows = spoof.json.submissions || [];
  check('kelash cannot spoof teacher_id param', spoofRows.every((r) => r.teacher_id === tokens.kelash.id));
  const qq = await req('GET', '/api/submissions', null, tokens.qurban.token);
  check('qurban sees only own submissions (1)', (qq.json.submissions || []).length === 1);
  const cross = await req('GET', '/api/submissions/' + s1.id, null, tokens.qurban.token);
  check("qurban reading kelash's submission -> 403", cross.status === 403);
  const aq = await req('GET', '/api/submissions', null, admin.token);
  check('admin sees all 3 submissions', (aq.json.submissions || []).length === 3);

  console.log('\n[9] Grading -> send -> finalize');
  const early = await req('POST', '/api/submissions/' + s1.id + '/send', {}, tokens.kelash.token);
  check('send before grading -> 400 (theory unmarked)', early.status === 400);
  const grade = await req('POST', '/api/submissions/' + s1.id + '/grade', { theory_marks: { 10: 8, 11: 7, 12: 9 } }, tokens.kelash.token);
  const g = grade.json && grade.json.submission;
  check('grade theory 8+7+9 -> total 40/50, status graded',
    g && g.total === 40 && g.status === 'graded', g && (g.total + '/' + g.max_total + ' ' + g.status));
  const send = await req('POST', '/api/submissions/' + s1.id + '/send', {}, tokens.kelash.token);
  check('send to admin -> sent_to_admin', send.json && send.json.submission && send.json.submission.status === 'sent_to_admin');
  const fin = await req('POST', '/api/submissions/' + s1.id + '/finalize', {}, admin.token);
  check('admin finalize -> final', fin.json && fin.json.submission && fin.json.submission.status === 'final');

  console.log('\n[10] Monthly report (month field) + exports');
  const rep = await req('GET', '/api/reports/monthly?month=2026-11', null, admin.token);
  const row = (rep.json.rows || []).find((r) => r.roll_number === 'E2E-001');
  check('monthly report 2026-11 has E2E-001: 40/50, 80%, Pass',
    !!(row && row.total === 40 && row.max === 50 && row.percentage === 80 && row.result === 'Pass'), JSON.stringify(row));
  check('CIT daily quiz excluded from monthly report',
    (rep.json.rows || []).every((r) => r.roll_number !== 'E2E-002'));
  const repEmpty = await req('GET', '/api/reports/monthly?month=2026-10', null, admin.token);
  check('monthly report 2026-10 empty', repEmpty.json && repEmpty.json.rows && repEmpty.json.rows.length === 0);
  // CSV checks use raw bytes: fetch text() strips the UTF-8 BOM, so check the buffer.
  async function csvCheck(p, token) {
    const r = await fetch(BASE + p, { headers: { Authorization: 'Bearer ' + token } });
    const buf = Buffer.from(await r.arrayBuffer());
    const hasBom = buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
    return { status: r.status, hasBom, text: buf.toString('utf8') };
  }
  const mCsv = await csvCheck('/api/export/monthly.csv?month=2026-11', admin.token);
  check('monthly CSV export 200 + BOM + contains roll no',
    mCsv.status === 200 && mCsv.hasBom && mCsv.text.includes('E2E-001'));
  const dCsv = await csvCheck('/api/export/day.csv?date=' + new Date().toISOString().slice(0, 10), principal.token);
  check('day CSV export 200 + BOM', dCsv.status === 200 && dCsv.hasBom);

  console.log('\n[11] Principal analytics');
  const today = new Date().toISOString().slice(0, 10);
  const dayA = await req('GET', '/api/analytics/day?date=' + today, null, principal.token);
  check('principal day analytics load (3 total, 1 final)',
    dayA.json && dayA.json.totals && dayA.json.totals.total === 3 && dayA.json.totals.final === 1, JSON.stringify(dayA.json && dayA.json.totals));
  check('day analytics has per-shift breakdown', dayA.json && Array.isArray(dayA.json.perShift) && dayA.json.perShift.length > 0);
  const monA = await req('GET', '/api/analytics/month?month=2026-11', null, principal.token);
  check('principal month analytics load', monA.status === 200 && !!monA.json.perTeacher);

  console.log('\n[12] Day Consolidation (manual trigger) + lock');
  const con1 = await req('POST', '/api/consolidation/run', { date: today }, admin.token);
  check('consolidation run -> 3 rows, locked', con1.json && con1.json.rows === 3 && con1.json.locked === true, JSON.stringify(con1.json));
  const con2 = await req('POST', '/api/consolidation/run', { date: today }, admin.token);
  check('consolidation re-run idempotent (still 3 rows)', con2.json && con2.json.rows === 3);
  const conList = await req('GET', '/api/consolidation', null, admin.token);
  check('consolidation history lists today once',
    conList.json && (conList.json.days || []).filter((d) => d.date === today).length === 1);
  const conDay = await req('GET', '/api/consolidation/' + today, null, principal.token);
  check('principal sees consolidated day sheet (3 rows)', conDay.json && (conDay.json.master || []).length === 3 && conDay.json.locked === true);
  const conK = await req('GET', '/api/consolidation/' + today, null, tokens.kelash.token);
  check("kelash day sheet filtered to own students (1 row)",
    conK.json && (conK.json.master || []).length === 1, 'got ' + ((conK.json.master || []).length));
  const lockedGrade = await req('POST', '/api/submissions/' + s1.id + '/grade', { theory_marks: { 10: 1 } }, tokens.kelash.token);
  check('grading a locked submission -> 403', lockedGrade.status === 403);
  const cCsv = await csvCheck('/api/export/consolidation.csv?date=' + today, admin.token);
  check('consolidation CSV export 200 + BOM', cCsv.status === 200 && cCsv.hasBom);

  console.log('\n[13] CSV import (template)');
  const csv = 'Roll Number,Student Name,Father\'s Name,Course,Shift,Assigned Teacher\n' +
    'STC-2026-101,Test One,Test Father,DIT,07:00 AM - 08:00 AM,Kelash Kumar\n' +
    'STC-2026-102,"Comma, Test",Test Father,CIT,08:00 AM - 09:00 AM,Ashok Kumar\n' +
    'STC-2026-103,Bad Shift,Test Father,DIT,25:00 PM - 26:00 PM,Kelash Kumar\n';
  const imp1 = await req('POST', '/api/students/import', { csv }, admin.token);
  check('import: 2 imported, 1 row error (bad shift)',
    imp1.json && imp1.json.imported === 2 && (imp1.json.errors || []).length === 1, JSON.stringify(imp1.json));
  const impL = await verify({ name: 'Comma, Test', father_name: 'Test Father', course: 'CIT', roll: 'STC-2026-102' });
  check('imported quoted-comma name verifies (full match)', impL.json && impL.json.verified && impL.json.student.name === 'Comma, Test');
  const imp2 = await req('POST', '/api/students/import', { csv }, admin.token);
  check('re-import skips duplicates (2 skipped)', imp2.json && imp2.json.skipped === 2, JSON.stringify(imp2.json));
  // v1.4.2: forgiving import — "Sir " prefix, unpadded hour, lowercase course.
  const csvF = 'Roll Number,Student Name,Father\'s Name,Course,Shift,Assigned Teacher\n' +
    'STC-2026-104,Forgiving Test,Test Father,cit,9:00 AM - 10:00 AM,Sir Ashok Kumar\n';
  const impF = await req('POST', '/api/students/import', { csv: csvF }, admin.token);
  check('forgiving import: Sir prefix + 9:00 AM + lowercase cit -> 1 imported, 0 errors',
    impF.json && impF.json.imported === 1 && (impF.json.errors || []).length === 0, JSON.stringify(impF.json));
  const impFL = await verify({ name: 'Forgiving Test', father_name: 'Test Father', course: 'CIT', roll: 'STC-2026-104' });
  check('forgiving import stored canonical values (CIT, 09:00 AM - 10:00 AM, Ashok Kumar)',
    impFL.json && impFL.json.verified && impFL.json.student.course === 'CIT' &&
    impFL.json.student.shift === '09:00 AM - 10:00 AM' &&
    impFL.json.student.teacher_name === 'Ashok Kumar', JSON.stringify(impFL.json && impFL.json.student));
  const tplCsv = await req('GET', '/students_template.csv');
  check('students template has a demo row (Demo Student, Ashok Kumar)',
    tplCsv.status === 200 && tplCsv.text.includes('Demo Student') && tplCsv.text.includes('08:00 AM - 09:00 AM'));

  console.log('\n[14] Test builder — month validation');
  const noMonth = await req('POST', '/api/tests', {
    title: 'No Month Test', course: 'DIT', type: 'monthly-test', duration_minutes: 30, randomize: 0,
    questions: [{ type: 'mcq', question: 'Q?', options: ['a', 'b', 'c', 'd'], correct: 0, marks: 1 }],
  }, admin.token);
  check('monthly test without month -> 400', noMonth.status === 400);
  const withMonth = await req('POST', '/api/tests', {
    title: 'DIT Monthly Test — December 2026', course: 'DIT', type: 'monthly-test', month: '2026-12',
    duration_minutes: 30, randomize: 0,
    questions: [{ type: 'mcq', question: 'Q?', options: ['a', 'b', 'c', 'd'], correct: 0, marks: 1 }],
  }, admin.token);
  check('monthly test with month -> 201', withMonth.status === 201, JSON.stringify(withMonth.json));
  const teacherCreate = await req('POST', '/api/tests', {
    title: 'X', course: 'DIT', type: 'daily-quiz', duration_minutes: 5, randomize: 0, questions: [],
  }, tokens.kelash.token);
  check('teacher creating a test -> 403', teacherCreate.status === 403);

  console.log('\n[15] Strict roll validation (server-side)');
  const badRoll = await req('POST', '/api/submissions', {
    client_id: 'e2e-badroll-' + Date.now(),
    student: { roll_number: 'STC-9999-999', name: 'Nobody Here' },
    test_id: dit.id, answers,
  });
  check('submit with unknown roll -> 404 roll_not_registered',
    badRoll.status === 404 && badRoll.json && badRoll.json.error === 'roll_not_registered', JSON.stringify(badRoll.json));
  // Tampered payload: real roll, forged name/course/teacher — registered record must win.
  const tampered = await req('POST', '/api/submissions', {
    client_id: 'e2e-tamper-' + Date.now(),
    student: { roll_number: 'E2E-004', name: 'Hacker', father_name: 'Forged', course: 'DIT', shift: '07:00 AM - 08:00 AM', teacher_id: tokens.kelash.id },
    test_id: quiz.id, answers: qAns,
  });
  const tamperedId = tampered.json && tampered.json.submission && tampered.json.submission.id;
  check('tampered submit accepted (roll is registered)', tampered.status === 201 && !!tamperedId, JSON.stringify(tampered.json));
  const stored = await req('GET', '/api/submissions/' + tamperedId, null, admin.token);
  const st = stored.json && stored.json.submission;
  check('stored submission uses REGISTERED details (E2E Student Four, CIT, pawan) — forgery ignored',
    !!(st && st.student_name === 'E2E Student Four' && st.course === 'CIT' && st.teacher_id === tokens.pawan.id),
    st && (st.student_name + ' / ' + st.course + ' / ' + st.teacher_id));

  console.log('\n[16] Unauthenticated staff API access -> 401');
  const unauthed = [
    ['GET', '/api/me'], ['GET', '/api/students'], ['GET', '/api/submissions'],
    ['GET', '/api/users'], ['GET', '/api/analytics/day'],
    ['GET', '/api/analytics/month?month=2026-11'],
    ['GET', '/api/reports/monthly?month=2026-11'],
    ['GET', '/api/consolidation'], ['GET', '/api/export/day.csv'],
    ['POST', '/api/tests'], ['POST', '/api/consolidation/run'],
  ];
  for (const [m, p] of unauthed) {
    const r = await req(m, p, m === 'POST' ? {} : undefined);
    check(m + ' ' + p + ' without token -> 401', r.status === 401, 'got ' + r.status);
  }

  console.log('\n[17] Portal separation + authenticated fragments');
  check('teacher shell has NO console markup (empty console container only)',
    !teaPage.text.includes('teacher-queue') && !teaPage.text.includes('grade-panel') &&
    teaPage.text.includes('id="console"'));
  check('admin shell has NO console markup',
    !admPage.text.includes('tab-dashboard') && !admPage.text.includes('student-list') && !admPage.text.includes('con-run'));
  check('principal shell has NO console markup',
    !priPage.text.includes('pa-totals') && !priPage.text.includes('pr-daysheet') && !priPage.text.includes('pm-teachers'));
  const portalHrefs = ['href="/student"', 'href="/teacher"', 'href="/admin"', 'href="/principal"'];
  for (const [name, page] of [['teacher', teaPage], ['admin', admPage], ['principal', priPage]]) {
    check(name + ' page has NO links to other portals',
      portalHrefs.every((h) => !page.text.includes(h)));
  }
  check('terminal page links to staff portals ONLY via the Staff menu (one link each)',
    ['href="/teacher"', 'href="/admin"', 'href="/principal"'].every((h) =>
      stuPage.text.split(h).length === 2) && !stuPage.text.includes('href="/student"'));
  const fragNoAuth = await req('GET', '/fragments/admin-console.html');
  check('fragment without token -> 401', fragNoAuth.status === 401);
  const fragWrongRole = await req('GET', '/fragments/admin-console.html', null, tokens.kelash.token);
  check('admin fragment with teacher token -> 403', fragWrongRole.status === 403);
  const fragAdmin = await req('GET', '/fragments/admin-console.html', null, admin.token);
  check('admin fragment with admin token -> 200 + console markup',
    fragAdmin.status === 200 && fragAdmin.text.includes('tab-dashboard') && fragAdmin.text.includes('Day Consolidation'));
  check('admin fragment shows NO password value in help text (v1.6.1)',
    !fragAdmin.text.includes('teacher123') && !fragAdmin.text.includes('admin123') && !fragAdmin.text.includes('principal123'));
  const fragTeacher = await req('GET', '/fragments/teacher-console.html', null, tokens.kelash.token);
  check('teacher fragment with teacher token -> 200 + queue markup',
    fragTeacher.status === 200 && fragTeacher.text.includes('teacher-queue'));
  const fragPrincipal = await req('GET', '/fragments/principal-console.html', null, principal.token);
  check('principal fragment with principal token -> 200 + analytics markup',
    fragPrincipal.status === 200 && fragPrincipal.text.includes('pa-totals'));
  const fragUnknown = await req('GET', '/fragments/nope.html', null, admin.token);
  check('unknown fragment -> 404', fragUnknown.status === 404);
  const fragStatic = await req('GET', '/teacher-console.html', null, admin.token);
  check('fragment NOT served as a static file -> 404', fragStatic.status === 404);

  console.log('\n[18] Offline queue + session-clear + fallback + strict UI (code-level)');
  const stuSrc = fs.readFileSync(path.join(__dirname, 'public', 'student.js'), 'utf8');
  const comSrc = fs.readFileSync(path.join(__dirname, 'public', 'common.js'), 'utf8');
  const srvSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const labSrc = fs.readFileSync(path.join(__dirname, 'lab-template.html'), 'utf8');
  const stuHtml = fs.readFileSync(path.join(__dirname, 'public', 'student.html'), 'utf8');
  const teaHtml = fs.readFileSync(path.join(__dirname, 'public', 'teacher.html'), 'utf8');
  const admFrag = fs.readFileSync(path.join(__dirname, 'fragments', 'admin-console.html'), 'utf8');
  const teaFrag = fs.readFileSync(path.join(__dirname, 'fragments', 'teacher-console.html'), 'utf8');
  check('offline queue key stc_offline_queue present (student.js)', stuSrc.includes('stc_offline_queue'));
  check('queue retry every 15s (15000ms)', stuSrc.includes('15000'));
  check('offline message "Saved offline" present', stuSrc.includes('Saved offline'));
  check('"Sync now" control present', /sync-now/i.test(stuSrc) || /sync-now/i.test(stuHtml));
  check('client-generated client_id for dedupe', stuSrc.includes('client_id'));
  check('session cleared after submit (sessionStorage.clear)', stuSrc.includes('sessionStorage.clear'));
  check('exam state reset to blank start screen', stuSrc.includes('resetStudent'));
  check('four-field verify messages are English (all four exact messages in server.js)',
    srvSrc.includes('Your Name is wrong.') && srvSrc.includes("Your Father's Name is wrong.") &&
    srvSrc.includes('Your Course is wrong.') && srvSrc.includes('Your Roll Number is wrong.'));
  check('lab app has the SAME four English messages',
    labSrc.includes('Your Name is wrong.') && labSrc.includes("Your Father's Name is wrong.") &&
    labSrc.includes('Your Course is wrong.') && labSrc.includes('Your Roll Number is wrong.'));
  check('student.js posts to /api/students/verify and shows the server message',
    stuSrc.includes('/api/students/verify') && stuSrc.includes('d.error'));
  check('no Roman Urdu verify message remains (student.js + lab template)',
    !stuSrc.includes('Aapka Roll Number ghalat hai.') && !labSrc.includes('Aapka Roll Number ghalat hai.'));
  check('student page HAS the four verify fields (stu-name/stu-father/stu-course/stu-roll)',
    stuHtml.includes('id="stu-name"') && stuHtml.includes('id="stu-father"') &&
    stuHtml.includes('id="stu-course"') && stuHtml.includes('id="stu-roll"'));
  check('course is a free-text input, not a dropdown',
    /id="stu-course"[^>]*type="text"/.test(stuHtml));
  check('lab app HAS the same four verify fields',
    labSrc.includes('id="stu-name"') && labSrc.includes('id="stu-father"') &&
    labSrc.includes('id="stu-course"') && labSrc.includes('id="stu-roll"'));
  check('student page has verify + read-only details flow',
    stuHtml.includes('stu-verify-form') && stuHtml.includes('stu-details-body') && stuHtml.includes('stu-confirm'));
  check('teacher fallback logic present (teachersForCourse + DIT fallback)',
    comSrc.includes('teachersForCourse') && comSrc.includes("indexOf('DIT')"));
  check('fallback note text present', comSrc.includes('showing Computer Instructors'));
  check('fallback note element in admin fragment', admFrag.includes('st-teacher-note'));
  check('teacher login page lists NO teacher usernames (v1.6.1: hints removed)',
    !teaHtml.includes('demo-hint') && !teaHtml.includes('ghansham') && !teaHtml.includes('pawan') &&
    !teaHtml.includes('kapil') && !teaHtml.includes('suneel') && !teaHtml.includes('teacher123') &&
    !teaHtml.includes('nadir') && !teaHtml.includes('dileep'));
  check('admin console has sidebar with Day Consolidation',
    admFrag.includes('class="sidebar"') && admFrag.includes('Day Consolidation') && admFrag.includes('data-tab="consolidation"'));
  check('teacher console has sidebar (queue / day sheet)',
    teaFrag.includes('class="sidebar"') && teaFrag.includes('data-tpanel="queue"') && teaFrag.includes('data-tpanel="days"'));
  check('role-enforced login in common.js (wrong_role message)',
    comSrc.includes('wrong_role') && comSrc.includes('ke liye hai'));
  check('401 session-expiry handling in common.js', comSrc.includes('Session expired'));

  console.log('\n[19] Zero external network requests in served files');
  let extHits = [];
  const pubDir = path.join(__dirname, 'public');
  const fragDir = path.join(__dirname, 'fragments');
  const files = fs.readdirSync(pubDir).filter((f) => /\.(html|js|css)$/.test(f)).map((f) => path.join(pubDir, f))
    .concat(fs.readdirSync(fragDir).filter((f) => f.endsWith('.html')).map((f) => path.join(fragDir, f)));
  for (const fp of files) {
    const src = fs.readFileSync(fp, 'utf8');
    const m = src.match(/https?:\/\/[^\s"'<>]+/g) || [];
    if (m.length) extHits.push(path.basename(fp) + ': ' + m.join(', '));
    if (/cdn|googleapis|unpkg|jsdelivr/i.test(src)) extHits.push(path.basename(fp) + ': CDN keyword');
  }
  check('no http(s) URLs or CDN references in public/ + fragments/ (' + files.length + ' files)',
    extHits.length === 0, extHits.join(' | '));

  console.log('\n[20] v1.3.0 — real logo, back-to-home, teacher import, FIB, course-wise results');
  // --- 1. Real STC logo (local file, served on every page) ---
  const logo = await req('GET', '/stc-logo.webp');
  check('logo served locally (GET /stc-logo.webp 200)', logo.status === 200, 'got ' + logo.status);
  check('logo content-type is image/webp',
    String(logo.headers.get('content-type') || '').includes('image/webp'), logo.headers.get('content-type'));
  const logoBuf = Buffer.from(await (await fetch(BASE + '/stc-logo.webp')).arrayBuffer());
  check('logo file is a real WebP (RIFF/WEBP header)',
    logoBuf.slice(0, 4).toString() === 'RIFF' && logoBuf.slice(8, 12).toString() === 'WEBP');
  for (const [name, page] of [['terminal', home], ['student', stuPage], ['teacher', teaPage], ['admin', admPage], ['principal', priPage]]) {
    check(name + ' page uses the real logo (stc-logo.webp in a white chip)',
      page.text.includes('stc-logo.webp') && page.text.includes('header-logo-chip'));
  }
  check('no page still uses the old green STC text badge',
    [home, stuPage, teaPage, admPage, priPage].every((p) => !p.text.includes('header-logo">STC')));

  // --- 2. Back to Home (login shell + console share the topbar) ---
  for (const [name, page] of [['teacher', teaPage], ['admin', admPage], ['principal', priPage]]) {
    check(name + ' page has a Back to Home link to /',
      page.text.includes('Back to Home') && page.text.includes('href="/"'));
  }
  check('terminal page has no Back to Home link (it IS home)', !home.text.includes('Back to Home'));
  check('staff portal pages still have NO portal-to-portal links (only /)',
    [teaPage, admPage, priPage].every((p) =>
      ['href="/student"', 'href="/teacher"', 'href="/admin"', 'href="/principal"'].every((h) => !p.text.includes(h))));

  // --- 3a. Student CSV import: teacher by username OR name; unknown teacher rejects the row ---
  check('students template has an Assigned Teacher column', tpl.text.includes('Assigned Teacher'));
  const impCsv = 'Roll Number,Student Name,Father\'s Name,Course,Shift,Assigned Teacher\n' +
    'STC-2026-201,Import By Username,Imp Father,DIT,07:00 AM - 08:00 AM,kelash\n' +
    'STC-2026-202,Import Bad Teacher,Imp Father,DIT,07:00 AM - 08:00 AM,No Such Teacher\n' +
    'STC-2026-203,Import By Name,Imp Father,CIT,08:00 AM - 09:00 AM,Ashok Kumar\n';
  const imp3 = await req('POST', '/api/students/import', { csv: impCsv }, admin.token);
  check('import with teacher column: 2 imported, 1 row error',
    imp3.json && imp3.json.imported === 2 && (imp3.json.errors || []).length === 1, JSON.stringify(imp3.json));
  check('unknown-teacher error names row 3 + the teacher name',
    (imp3.json.errors || []).some((e) => e.row === 3 && /No Such Teacher/.test(e.error)), JSON.stringify(imp3.json.errors));
  const l201 = await verify({ name: 'Import By Username', father_name: 'Imp Father', course: 'DIT', roll: 'STC-2026-201' });
  check('teacher matched by USERNAME (kelash) assigns that teacher',
    l201.json && l201.json.verified && l201.json.student.teacher_id === tokens.kelash.id, JSON.stringify(l201.json));
  const l203 = await verify({ name: 'Import By Name', father_name: 'Imp Father', course: 'CIT', roll: 'STC-2026-203' });
  check('teacher matched by FULL NAME (Ashok Kumar) assigns that teacher',
    l203.json && l203.json.verified && l203.json.student.teacher_id === tokens.ashok.id, JSON.stringify(l203.json));
  const l202 = await verify({ name: 'Import Bad Teacher', father_name: 'Imp Father', course: 'DIT', roll: 'STC-2026-202' });
  check('unknown-teacher row was NOT imported', l202.json && l202.json.verified === false && l202.json.errorCode === 'name_wrong');

  // --- 3b. Teacher CSV import (auto username, default password, duplicate rejection) ---
  const tTpl = await req('GET', '/teachers_template.csv');
  check('teachers_template.csv serves with Teacher Name + Course columns',
    tTpl.status === 200 && tTpl.text.includes('Teacher Name') && tTpl.text.includes('Course'));
  const tCsv = 'Teacher Name,Course,Username,Password\n' +
    'Test Teacher One,DIT,,\n' +
    'Test Teacher Two,CIT,teachertwo,secret99\n' +
    'Test Teacher Three,DIT,teachertwo,\n' +
    'Test Teacher Four,NoSuchCourse,,\n';
  const timp = await req('POST', '/api/users/import', { csv: tCsv }, admin.token);
  check('teacher import: 2 imported, 2 row errors',
    timp.json && timp.json.imported === 2 && (timp.json.errors || []).length === 2, JSON.stringify(timp.json));
  check('duplicate-username error names row 4',
    (timp.json.errors || []).some((e) => e.row === 4 && /duplicate username: teachertwo/.test(e.error)), JSON.stringify(timp.json.errors));
  check('unknown-course error names row 5',
    (timp.json.errors || []).some((e) => e.row === 5 && /unknown course: NoSuchCourse/.test(e.error)), JSON.stringify(timp.json.errors));
  const tLogin1 = await login('test', 'teacher123', 'teacher');
  check('auto-username teacher logs in (test / teacher123)',
    !!(tLogin1 && tLogin1.user.name === 'Test Teacher One' && tLogin1.user.role === 'teacher'));
  const tLogin2 = await login('teachertwo', 'secret99', 'teacher');
  check('explicit teacher logs in (teachertwo / secret99)',
    !!(tLogin2 && tLogin2.user.name === 'Test Teacher Two'));
  const tList = await req('GET', '/api/teachers');
  check('teachers list now 16 (14 + 2 imported)',
    tList.json && (tList.json.teachers || []).length === 16, tList.json && (tList.json.teachers || []).length);

  // --- 4. Fill-in-the-blank: create -> student answers -> teacher grades -> Admin ---
  const fibTest = await req('POST', '/api/tests', {
    title: 'CIT Monthly Test — November 2026', course: 'CIT', type: 'monthly-test', month: '2026-11',
    duration_minutes: 30, randomize: 0,
    questions: [
      { type: 'mcq', question: 'FIB flow MCQ?', options: ['a', 'b', 'c', 'd'], correct: 1, marks: 2 },
      { type: 'fib', question: 'The capital of Pakistan is ___.', suggested_answer: 'Islamabad', max_marks: 3 },
      { type: 'theory', question: 'FIB flow theory.', max_marks: 5, model_answer: 'FIB flow model.' },
    ],
  }, admin.token);
  check('test with MCQ + FIB + theory created (201)', fibTest.status === 201, JSON.stringify(fibTest.json));
  const fibId = fibTest.json && fibTest.json.test && fibTest.json.test.id;
  const fibAnon = await req('GET', '/api/tests/' + fibId);
  check('anonymous FIB test fetch strips suggested_answer + correct + answer value',
    fibAnon.text.indexOf('suggested_answer') === -1 && fibAnon.text.indexOf('"correct"') === -1 && fibAnon.text.indexOf('Islamabad') === -1);
  check('anonymous FIB test fetch keeps the blank + fib type',
    fibAnon.text.indexOf('"fib"') !== -1 && fibAnon.text.indexOf('___') !== -1);
  const fibStaff = await req('GET', '/api/tests/' + fibId, null, tokens.ashok.token);
  check('teacher FIB test fetch includes suggested_answer (grading aid)',
    fibStaff.text.indexOf('Islamabad') !== -1);
  const fibSub = await req('POST', '/api/submissions', {
    client_id: 'e2e-fib-' + Date.now(),
    student: { roll_number: 'E2E-002' },
    test_id: fibId,
    answers: [
      { q: 0, answer: 1 },              // MCQ correct (Admin key)
      { q: 1, answer: 'Islamabad' },    // FIB text answer
      { q: 2, answer: 'Theory answer text.' },
    ],
  });
  const fs1 = fibSub.json && fibSub.json.submission;
  check('FIB test submit 201', fibSub.status === 201, JSON.stringify(fibSub.json));
  check('MCQ auto-graded from Admin key (2/2)', fs1 && fs1.mcq_score === 2 && fs1.mcq_max === 2, fs1 && (fs1.mcq_score + '/' + fs1.mcq_max));
  // v1.9.0: the FIB answer 'Islamabad' matches the suggested answer, so it is
  // auto-graded 3/3 at submit — total is 5 (MCQ 2 + auto FIB 3), not 2.
  check('FIB auto-graded 3/3 at submit (total 5 = MCQ 2 + auto FIB 3); theory_max 8; max 10',
    fs1 && fs1.theory_max === 8 && fs1.total === 5 && fs1.max_total === 10, fs1 && (fs1.theory_max + '/' + fs1.total + '/' + fs1.max_total));
  const fsFull = await req('GET', '/api/submissions/' + fs1.id, null, admin.token);
  const fsF = fsFull.json && fsFull.json.submission;
  check('auto FIB recorded: theory_marks[1] = 3 and auto_marks[1] = 3',
    fsF && fsF.theory_marks && fsF.theory_marks['1'] === 3 && fsF.auto_marks && fsF.auto_marks['1'] === 3,
    JSON.stringify(fsF && { tm: fsF.theory_marks, am: fsF.auto_marks }));
  const fibSendEarly = await req('POST', '/api/submissions/' + fs1.id + '/send', {}, tokens.ashok.token);
  check('send before FIB/theory grading -> 400 (unmarked)', fibSendEarly.status === 400);
  const gradeFib = await req('POST', '/api/submissions/' + fs1.id + '/grade', { theory_marks: { 0: 5, 1: 3 } }, tokens.ashok.token);
  const gf = gradeFib.json && gradeFib.json.submission;
  // v1.9.0: the teacher's re-mark of the auto-graded FIB is ignored (like the
  // MCQ-index mark) — the auto mark 3/3 stands and the total stays 5.
  check('teacher re-mark of auto FIB + MCQ-index mark ignored (total stays 5)',
    gf && gf.total === 5 && gf.theory_marks && gf.theory_marks['1'] === 3, gf && gf.total);
  const fibSendEarly2 = await req('POST', '/api/submissions/' + fs1.id + '/send', {}, tokens.ashok.token);
  check('send with theory still unmarked -> 400', fibSendEarly2.status === 400);
  const gradeTheory = await req('POST', '/api/submissions/' + fs1.id + '/grade', { theory_marks: { 2: 4 } }, tokens.ashok.token);
  const gt = gradeTheory.json && gradeTheory.json.submission;
  check('grade theory 4/5 -> total 9/10, status graded',
    gt && gt.total === 9 && gt.max_total === 10 && gt.status === 'graded', gt && (gt.total + '/' + gt.max_total + ' ' + gt.status));
  const sendFib = await req('POST', '/api/submissions/' + fs1.id + '/send', {}, tokens.ashok.token);
  check('FIB result sent to Admin -> sent_to_admin',
    sendFib.json && sendFib.json.submission && sendFib.json.submission.status === 'sent_to_admin');

  // --- 5. Course-wise results: CSV export + grouped report + print view ---
  const rCsv = await csvCheck('/api/export/results.csv?month=2026-11', admin.token);
  check('results CSV export 200 + BOM + Theory/FIB Marks header',
    rCsv.status === 200 && rCsv.hasBom && rCsv.text.includes('Theory/FIB Marks'), 'status ' + rCsv.status);
  check('results CSV contains both courses\' results',
    rCsv.text.includes('E2E-001') && rCsv.text.includes('E2E-002'));
  check('results CSV sorted by course (CIT row before DIT row)',
    rCsv.text.indexOf('E2E-002') !== -1 && rCsv.text.indexOf('E2E-002') < rCsv.text.indexOf('E2E-001'));
  check('results CSV has the FIB row marks (Theory/FIB 7 / 8)',
    rCsv.text.includes('7 / 8'));
  const cw = await req('GET', '/api/reports/course-wise?month=2026-11', null, admin.token);
  check('course-wise report groups: CIT first, DIT second',
    cw.json && (cw.json.groups || []).length === 2 &&
    cw.json.groups[0].course === 'CIT' && cw.json.groups[1].course === 'DIT',
    JSON.stringify(cw.json && cw.json.groups && cw.json.groups.map((g) => g.course)));
  const citRow = cw.json && cw.json.groups && (cw.json.groups[0].rows || []).find((r) => r.roll_number === 'E2E-002');
  check('course-wise CIT row: E2E-002 9/10, 90%, Pass',
    !!(citRow && citRow.total === 9 && citRow.max_total === 10 && citRow.percentage === 90 && citRow.result === 'Pass'),
    JSON.stringify(citRow));
  // Code-level: print view + FIB UI wiring.
  const admJs13 = fs.readFileSync(path.join(__dirname, 'public', 'admin.js'), 'utf8');
  const teaJs13 = fs.readFileSync(path.join(__dirname, 'public', 'teacher.js'), 'utf8');
  check('courseWisePrintHtml helper exists (common.js)', comSrc.includes('courseWisePrintHtml'));
  check('print header uses the real local logo', comSrc.includes('stc-logo.webp'));
  check('admin wires course-wise export + print buttons',
    admJs13.includes('mr-export-results') && admJs13.includes('mr-print-coursewise') && admJs13.includes('/api/export/results.csv'));
  check('admin fragment has FIB button + teacher import + export/print buttons',
    admFrag.includes('tb-add-fib') && admFrag.includes('tc-csv-import') &&
    admFrag.includes('mr-export-results') && admFrag.includes('mr-print-coursewise'));
  check('student UI renders FIB as a text input', stuSrc.includes("q.type === 'fib'"));
  check('teacher grading includes FIB questions', teaJs13.includes("x.q.type === 'fib'"));
  check('test builder supports FIB questions', admJs13.includes('newFib'));
  // New endpoints require auth.
  for (const [m, p] of [['GET', '/api/reports/course-wise?month=2026-11'],
                        ['GET', '/api/export/results.csv?month=2026-11'],
                        ['POST', '/api/users/import']]) {
    const r = await req(m, p, m === 'POST' ? { csv: '' } : undefined);
    check(m + ' ' + p + ' without token -> 401', r.status === 401, 'got ' + r.status);
  }

  console.log('\n[23] v1.7.0 — full-width consoles, inline errors, no student back/change');
  check('full-width console: style.css has console-mode rules (no narrow container)',
    css.text.includes('body.console-mode main') && css.text.includes('max-width: none'));
  check('common.js toggles console-mode on login/logout (v1.7.0)',
    comSrc.includes("classList.add('console-mode')") && comSrc.includes("classList.remove('console-mode')"));
  check('inline-error styles present (.form-error, .qb-error, .has-error)',
    css.text.includes('.form-error') && css.text.includes('.qb-error') && css.text.includes('.qb-card.has-error'));
  check('shared showFormError/hideFormError helpers in common.js (v1.7.0)',
    comSrc.includes('function showFormError') && comSrc.includes('function hideFormError') &&
    comSrc.includes('scrollIntoView'));
  check('test builder shows question errors inline under the card + scrolls (v1.7.0)',
    admJs13.includes('showBuilderQuestionError') && admJs13.includes('qb-error') &&
    admJs13.includes('has-error') && admJs13.includes('scrollIntoView'));
  check('test builder shows form errors inline above Save (v1.7.0)',
    admJs13.includes('showBuilderFormError') && admFrag.includes('tb-form-error'));
  check('admin fragment has inline error slots for student/teacher/course forms (v1.7.0)',
    admFrag.includes('st-form-error') && admFrag.includes('tc-form-error') && admFrag.includes('course-form-error'));
  check('teacher fragment has inline grade error slot (v1.7.0)',
    teaFrag.includes('grade-form-error'));
  check('student page has NO change-details button (v1.7.0)',
    !stuHtml.includes('stu-change-roll') && !stuHtml.includes('Change details'));
  check('student page has NO back-to-change link in test picker (v1.7.0)',
    !stuHtml.includes('stu-tests-back') && !stuHtml.includes('Back — change details'));
  check('student.js has NO change/back handlers (v1.7.0)',
    !stuSrc.includes('stu-change-roll') && !stuSrc.includes('stu-tests-back'));
  check('lab app has NO change-details button or back link (v1.7.0)',
    !labSrc.includes('stu-change-roll') && !labSrc.includes('stu-tests-back') &&
    !labSrc.includes('Change details'));
  check('student forward-only flow kept: Confirm + submit + reset for next student (v1.7.0)',
    stuSrc.includes('stu-confirm') && stuSrc.includes('resetStudent') && stuSrc.includes('submitExam'));
  check('lab forward-only flow kept: Confirm + submit + reset (v1.7.0)',
    labSrc.includes('stu-confirm') && labSrc.includes('resetStudent') && labSrc.includes('submitExam'));
  check('dead .btn-link CSS removed (only used by the back link) (v1.7.0)',
    !css.text.includes('.btn-link'));

  console.log('\n[24] v1.8.0/v1.10.1 — anti-cheat: 3 warnings, auto-lock on 4th switch, teacher flag');
  // v1.10.0: one student, one attempt — E2E-001 already submitted dit in §7,
  // so the three flag checks need three fresh students (all DIT, kelash).
  const acStudents = [];
  for (const roll of ['E2E-AC1', 'E2E-AC2', 'E2E-AC3']) {
    const r = await req('POST', '/api/students', { roll_number: roll, name: 'E2E Anti-Cheat ' + roll, father_name: 'E2E Father AC', course: 'DIT', shift: '07:00 AM - 08:00 AM', teacher_id: tokens.kelash.id }, admin.token);
    if (r.status === 201) acStudents.push(r.json.student);
  }
  check('setup: 3 fresh anti-cheat students created (all 201)', acStudents.length === 3, 'created ' + acStudents.length);
  // Live: a submission WITH anti-cheat flags stores them (online submit).
  const acSub = await req('POST', '/api/submissions', {
    client_id: 'e2e-ac1-' + Date.now(),
    student: { roll_number: 'E2E-AC1' },
    test_id: dit.id, answers, tab_switches: 2, auto_locked: true,
  });
  const ac1 = acSub.json && acSub.json.submission;
  check('submit with tab_switches 2 + auto_locked true accepted',
    (acSub.status === 200 || acSub.status === 201) && !!(ac1 && ac1.id), JSON.stringify(acSub.json));
  const acStored = ac1 ? await req('GET', '/api/submissions/' + ac1.id, null, admin.token) : null;
  const acS = acStored && acStored.json && acStored.json.submission;
  check('flagged submission stores tab_switches 2 + auto_locked true',
    !!(acS && acS.tab_switches === 2 && acS.auto_locked === true),
    JSON.stringify(acS && { t: acS.tab_switches, l: acS.auto_locked }));
  // Live: a submission WITHOUT flags defaults to 0 / false.
  const plainSub = await req('POST', '/api/submissions', {
    client_id: 'e2e-ac2-' + Date.now(),
    student: { roll_number: 'E2E-AC2' },
    test_id: dit.id, answers,
  });
  const pl1 = plainSub.json && plainSub.json.submission;
  const plStored = pl1 ? await req('GET', '/api/submissions/' + pl1.id, null, admin.token) : null;
  const plS = plStored && plStored.json && plStored.json.submission;
  check('plain submission defaults tab_switches 0 + auto_locked false',
    !!(plS && plS.tab_switches === 0 && plS.auto_locked === false),
    JSON.stringify(plS && { t: plS.tab_switches, l: plS.auto_locked }));
  // Live: forged flag values are sanitized (junk count -> 0, string lock -> false).
  const junkSub = await req('POST', '/api/submissions', {
    client_id: 'e2e-ac3-' + Date.now(),
    student: { roll_number: 'E2E-AC3' },
    test_id: dit.id, answers, tab_switches: 'junk', auto_locked: 'yes',
  });
  const jk1 = junkSub.json && junkSub.json.submission;
  const jkStored = jk1 ? await req('GET', '/api/submissions/' + jk1.id, null, admin.token) : null;
  const jkS = jkStored && jkStored.json && jkStored.json.submission;
  check('forged flags sanitized (junk -> 0, "yes" -> false)',
    !!(jkS && jkS.tab_switches === 0 && jkS.auto_locked === false),
    JSON.stringify(jkS && { t: jkS.tab_switches, l: jkS.auto_locked }));
  // Live: the teacher-facing list fetch returns the flags.
  const kq2 = await req('GET', '/api/submissions', null, tokens.kelash.token);
  const flagged = ((kq2.json && kq2.json.submissions) || []).find((s) => s.id === ac1.id);
  check('teacher queue fetch returns the flag fields',
    !!(flagged && flagged.tab_switches === 2 && flagged.auto_locked === true));
  // Code: online terminal detection + warning + lock.
  check('student.js listens to visibilitychange + blur during the exam (v1.8.0)',
    stuSrc.includes("addEventListener('visibilitychange'") && stuSrc.includes("addEventListener('blur'"));
  check('student.js warns on 1st/2nd/3rd switch, locks + auto-submits on 4th (v1.10.1)',
    stuSrc.includes('showAcWarning') && stuSrc.includes('S.tabSwitches <= 3') &&
    stuSrc.includes('Your test has been locked because you left the exam page') &&
    stuSrc.includes('lockExam') && stuSrc.includes('startAntiCheat'));
  check('student.js carries the 3 warning texts (1 of 3, 2 of 3, Final warning) (v1.10.1)',
    stuSrc.includes('Warning 1 of 3: Do not leave the exam page') &&
    stuSrc.includes('Warning 2 of 3: Do not leave the exam page') &&
    stuSrc.includes('Final warning: if you switch again, your test will be locked.'));
  check('student modal has a dynamic text slot (ac-modal-text) (v1.10.1)',
    stuHtml.includes('id="ac-modal-text"') && stuHtml.includes('id="ac-modal-title"'));
  check('student payload carries tab_switches + auto_locked (v1.8.0)',
    stuSrc.includes('tab_switches: S.tabSwitches') && stuSrc.includes('auto_locked: S.examLocked'));
  check('student modal markup present (ac-modal + Continue button) (v1.8.0)',
    stuHtml.includes('id="ac-modal"') && stuHtml.includes('id="ac-continue"'));
  check('modal + grade-flag styles present (v1.8.0)',
    css.text.includes('.modal-overlay') && css.text.includes('.modal-card') && css.text.includes('.grade-flag'));
  // Code: teacher banner.
  check('teacher fragment has the grade-flag slot (v1.8.0)',
    teaFrag.includes('grade-flag'));
  check('teacher.js shows the tab-switch banner in the grading view (v1.8.0)',
    teaJs13.includes('grade-flag') && teaJs13.includes('left the exam page') && teaJs13.includes('auto-locked'));
  // Code: lab app mirrors the online flow.
  check('lab app has the same detection + 3 warnings + lock on 4th (v1.10.1)',
    labSrc.includes("addEventListener('visibilitychange'") && labSrc.includes("addEventListener('blur'") &&
    labSrc.includes('showAcWarning') && labSrc.includes('S.tabSwitches <= 3') &&
    labSrc.includes('Warning 1 of 3: Do not leave the exam page') &&
    labSrc.includes('Final warning: if you switch again, your test will be locked.') &&
    labSrc.includes('Your test has been locked because you left the exam page'));
  check('lab payload carries tab_switches + auto_locked (v1.8.0)',
    labSrc.includes('tab_switches: S.tabSwitches') && labSrc.includes('auto_locked: S.examLocked'));

  console.log('\n[25] v1.9.0/v1.10.1 — auto-grading: MCQ + FIB auto, theory always teacher-graded');
  // Mixed test: MCQ + FIB with key + FIB without key + theory WITH stored
  // key words + theory without key words (v1.10.1: the stored key words
  // are IGNORED — theory is never auto-graded). Fully-auto test: MCQ +
  // FIB with key only (NO theory) — the only kind that goes straight to
  // Admin. Theory test: MCQ + FIB with key + theory with key words — it
  // routes to the teacher ONLY because of the theory question.
  const autoA = await req('POST', '/api/tests', {
    title: 'DIT Auto-Grade Test', course: 'DIT', type: 'daily-quiz',
    duration_minutes: 30, randomize: 0,
    questions: [
      { type: 'mcq', question: 'Auto MCQ?', options: ['a', 'b', 'c', 'd'], correct: 1, marks: 2 },
      { type: 'fib', question: 'The capital of France is ___.', suggested_answer: 'Paris', max_marks: 3 },
      { type: 'fib', question: 'Water is ___.', max_marks: 2 },
      { type: 'theory', question: 'Explain photosynthesis.', max_marks: 8,
        model_answer: 'MODEL-ANSWER-PHOTOSYNTHESIS-SECRET',
        key_words: 'sunlight, chlorophyll, KEYWORD-PHOTO-SECRET, oxygen' },
      { type: 'theory', question: 'What is a computer?', max_marks: 5,
        model_answer: 'MODEL-ANSWER-COMPUTER-SECRET' },
    ],
  }, admin.token);
  const autoB = await req('POST', '/api/tests', {
    title: 'CIT Auto-Grade Test', course: 'CIT', type: 'daily-quiz',
    duration_minutes: 30, randomize: 0,
    questions: [
      { type: 'mcq', question: 'Auto MCQ 2?', options: ['a', 'b', 'c', 'd'], correct: 0, marks: 2 },
      { type: 'fib', question: 'The capital of Pakistan is ___.', suggested_answer: 'Islamabad', max_marks: 3 },
    ],
  }, admin.token);
  const autoC = await req('POST', '/api/tests', {
    title: 'CIT Theory-Routes Test', course: 'CIT', type: 'daily-quiz',
    duration_minutes: 30, randomize: 0,
    questions: [
      { type: 'mcq', question: 'Auto MCQ 3?', options: ['a', 'b', 'c', 'd'], correct: 0, marks: 2 },
      { type: 'fib', question: 'The capital of Sindh is ___.', suggested_answer: 'Karachi', max_marks: 3 },
      { type: 'theory', question: 'Explain the water cycle.', max_marks: 6,
        model_answer: 'MODEL-ANSWER-WATER-SECRET',
        key_words: 'evaporation, condensation, precipitation' },
    ],
  }, admin.token);
  check('setup: mixed + fully-auto + theory-routes tests created (all 201)',
    autoA.status === 201 && autoB.status === 201 && autoC.status === 201,
    'A ' + autoA.status + ', B ' + autoB.status + ', C ' + autoC.status);
  const autoAId = autoA.json && autoA.json.test && autoA.json.test.id;
  const autoBId = autoB.json && autoB.json.test && autoB.json.test.id;
  const autoCId = autoC.json && autoC.json.test && autoC.json.test.id;
  // Mixed submission (E2E-001, kelash): MCQ right; FIB 'paris' (lowercase);
  // theory with 2 of 4 key words (sunlight + chlorophyll).
  const mixSub = await req('POST', '/api/submissions', {
    client_id: 'e2e-ag1-' + Date.now(),
    student: { roll_number: 'E2E-001' }, test_id: autoAId,
    answers: [
      { q: 0, answer: 1 },
      { q: 1, answer: 'paris' },
      { q: 2, answer: 'wet' },
      { q: 3, answer: 'Plants use sunlight and chlorophyll to make food.' },
      { q: 4, answer: 'A computer is a machine.' },
    ],
  });
  const mix1 = mixSub.json && mixSub.json.submission;
  const mixFull = mix1 ? await req('GET', '/api/submissions/' + mix1.id, null, admin.token) : null;
  const mixF = mixFull && mixFull.json && mixFull.json.submission;
  check('mixed submit routes to teacher (FIB2 + both theory questions not auto-gradable)',
    mix1 && mix1.status === 'submitted', JSON.stringify(mix1 && mix1.status));
  check('FIB auto correct + case-tolerant: auto_marks[1] = 3',
    mixF && mixF.auto_marks && mixF.auto_marks['1'] === 3, JSON.stringify(mixF && mixF.auto_marks));
  check('theory with stored key words NOT auto-graded (no auto_marks[3], v1.10.1)',
    mixF && mixF.auto_marks && mixF.auto_marks['3'] === undefined, JSON.stringify(mixF && mixF.auto_marks));
  check('total at submit = 5 (MCQ 2 + auto FIB 3; theory unmarked)',
    mix1 && mix1.total === 5, mix1 && mix1.total);
  const gradeMix = await req('POST', '/api/submissions/' + mix1.id + '/grade',
    { theory_marks: { 2: 2, 3: 4, 4: 5 } }, tokens.kelash.token);
  const gm = gradeMix.json && gradeMix.json.submission;
  check('teacher grades non-auto {2:2, 3:4, 4:5} -> total 16/20, status graded',
    gm && gm.total === 16 && gm.status === 'graded', gm && (gm.total + '/' + gm.max_total + ' ' + gm.status));
  const overWrite = await req('POST', '/api/submissions/' + mix1.id + '/grade',
    { theory_marks: { 1: 0 } }, tokens.kelash.token);
  const ow = overWrite.json && overWrite.json.submission;
  check('teacher cannot overwrite auto FIB mark (re-mark 0 ignored, total stays 16)',
    ow && ow.total === 16 && ow.theory_marks && ow.theory_marks['1'] === 3,
    JSON.stringify(ow && { t: ow.total, tm: ow.theory_marks }));
  const reGrade = await req('POST', '/api/submissions/' + mix1.id + '/grade',
    { theory_marks: { 3: 0 } }, tokens.kelash.token);
  const rg = reGrade.json && reGrade.json.submission;
  check('teacher CAN re-grade a theory mark (3: 4 -> 0, total 16 -> 12)',
    rg && rg.total === 12 && rg.theory_marks && rg.theory_marks['3'] === 0,
    JSON.stringify(rg && { t: rg.total, tm: rg.theory_marks }));
  const sendMix = await req('POST', '/api/submissions/' + mix1.id + '/send', {}, tokens.kelash.token);
  check('mixed result sent to Admin -> sent_to_admin (teacher flow intact)',
    sendMix.json && sendMix.json.submission && sendMix.json.submission.status === 'sent_to_admin');
  const finMix = await req('POST', '/api/submissions/' + mix1.id + '/finalize', {}, admin.token);
  check('mixed result finalized by Admin -> final',
    finMix.json && finMix.json.submission && finMix.json.submission.status === 'final');
  // Fully-auto submission (E2E-002, ashok): MCQ + FIB only, no theory.
  const fullSub = await req('POST', '/api/submissions', {
    client_id: 'e2e-ag2-' + Date.now(),
    student: { roll_number: 'E2E-002' }, test_id: autoBId,
    answers: [
      { q: 0, answer: 0 },
      { q: 1, answer: '  ISLAMABAD  ' },
    ],
  });
  const full1 = fullSub.json && fullSub.json.submission;
  const fullFull = full1 ? await req('GET', '/api/submissions/' + full1.id, null, admin.token) : null;
  const fullF = fullFull && fullFull.json && fullFull.json.submission;
  check('fully-auto (MCQ + FIB only) submit goes straight to Admin (sent_to_admin, no teacher step)',
    full1 && full1.status === 'sent_to_admin', JSON.stringify(full1 && full1.status));
  check('FIB whitespace + case tolerant: auto_marks[1] = 3',
    fullF && fullF.auto_marks && fullF.auto_marks['1'] === 3, JSON.stringify(fullF && fullF.auto_marks));
  check('fully-auto total 5/5 + graded_at set',
    full1 && full1.total === 5 && full1.max_total === 5 && !!(fullF && fullF.graded_at),
    JSON.stringify(full1 && { t: full1.total, m: full1.max_total, g: fullF && fullF.graded_at }));
  const finFull = await req('POST', '/api/submissions/' + full1.id + '/finalize', {}, admin.token);
  check('admin finalizes fully-auto result directly -> final',
    finFull.json && finFull.json.submission && finFull.json.submission.status === 'final');
  // Theory-routes submission (E2E-004, pawan): MCQ + FIB are auto-gradable
  // but the theory question (with stored key words) forces teacher routing.
  const thSub = await req('POST', '/api/submissions', {
    client_id: 'e2e-ag4-' + Date.now(),
    student: { roll_number: 'E2E-004' }, test_id: autoCId,
    answers: [
      { q: 0, answer: 0 },
      { q: 1, answer: 'Karachi' },
      { q: 2, answer: 'Evaporation lifts water up, condensation forms clouds, precipitation falls as rain.' },
    ],
  });
  const th1 = thSub.json && thSub.json.submission;
  const thFull = th1 ? await req('GET', '/api/submissions/' + th1.id, null, admin.token) : null;
  const thF = thFull && thFull.json && thFull.json.submission;
  check('theory question routes to teacher even with stored key words (submitted, v1.10.1)',
    th1 && th1.status === 'submitted', JSON.stringify(th1 && th1.status));
  check('theory-routes: FIB auto 3, theory NOT auto (no auto_marks[2]), total 5',
    thF && thF.auto_marks && thF.auto_marks['1'] === 3 && thF.auto_marks['2'] === undefined &&
    th1 && th1.total === 5, JSON.stringify(thF && { am: thF.auto_marks, t: th1 && th1.total }));
  // Wrong answers (E2E-003, qurban): FIB wrong -> 0, theory never auto (no auto mark).
  const wrongSub = await req('POST', '/api/submissions', {
    client_id: 'e2e-ag3-' + Date.now(),
    student: { roll_number: 'E2E-003' }, test_id: autoAId,
    answers: [
      { q: 0, answer: 0 },
      { q: 1, answer: 'London' },
      { q: 2, answer: 'wet' },
      { q: 3, answer: 'Plants are green.' },
      { q: 4, answer: 'A machine.' },
    ],
  });
  const wrong1 = wrongSub.json && wrongSub.json.submission;
  const wrongFull = wrong1 ? await req('GET', '/api/submissions/' + wrong1.id, null, admin.token) : null;
  const wrongF = wrongFull && wrongFull.json && wrongFull.json.submission;
  check('FIB auto wrong -> 0',
    wrongF && wrongF.auto_marks && wrongF.auto_marks['1'] === 0, JSON.stringify(wrongF && wrongF.auto_marks));
  check('theory never auto-graded (no auto_marks[3] even with stored key words)',
    wrongF && wrongF.auto_marks && wrongF.auto_marks['3'] === undefined, JSON.stringify(wrongF && wrongF.auto_marks));
  check('wrong-answer mixed submission still routes to teacher (submitted, total 0)',
    wrong1 && wrong1.status === 'submitted' && wrong1.total === 0, JSON.stringify(wrong1 && { s: wrong1.status, t: wrong1.total }));
  // Answer keys never leak to students or into the lab pack.
  const anonA = await req('GET', '/api/tests/' + autoAId);
  check('anonymous fetch strips key_words + suggested_answer + model_answer values',
    anonA.text.indexOf('key_words') === -1 && anonA.text.indexOf('KEYWORD-PHOTO-SECRET') === -1 &&
    anonA.text.indexOf('Paris') === -1 && anonA.text.indexOf('MODEL-ANSWER-PHOTOSYNTHESIS-SECRET') === -1);
  const staffA = await req('GET', '/api/tests/' + autoAId, null, tokens.kelash.token);
  check('teacher fetch still returns stored key_words (ignored, not auto-graded)',
    staffA.text.indexOf('key_words') !== -1 && staffA.text.indexOf('KEYWORD-PHOTO-SECRET') !== -1);
  const packA = await req('GET', '/api/lab-pack?pin=9876', null, admin.token);
  check('lab-pack has NO key_words key, NO keyword values, NO model answers',
    packA.text.indexOf('"key_words"') === -1 && packA.text.indexOf('KEYWORD-PHOTO-SECRET') === -1 &&
    packA.text.indexOf('evaporation') === -1 && packA.text.indexOf('MODEL-ANSWER-PHOTOSYNTHESIS-SECRET') === -1 &&
    packA.text.indexOf('Paris') === -1 && packA.text.includes('DIT Auto-Grade Test'));
  // Code-level: builder + teacher + admin UI wiring.
  check('builder has NO theory key_words field; FIB label still auto-checked; Model answer stays (v1.10.1)',
    !admJs13.includes('data-field="key_words"') && !admJs13.includes("key_words: ''") &&
    admJs13.includes('Correct answer (auto-checked') && admJs13.includes('data-field="model_answer"'));
  check('teacher grading renders auto marks read-only with Auto tag',
    teaJs13.includes('sub.auto_marks') && teaJs13.includes('badge-auto') && teaJs13.includes('auto-mark'));
  check('admin results show Auto tag (badge-auto in admin.js + style.css)',
    admJs13.includes('badge-auto') && admJs13.includes('auto_marks') && css.text.includes('.badge-auto'));

  console.log('\n[26] v1.10.0 — one student, one attempt per test + lab durability');
  // A fresh student + fresh test: the full attempt lifecycle.
  const s1100 = await req('POST', '/api/students', { roll_number: 'E2E-1100', name: 'E2E Student Eleven', father_name: 'E2E Father Eleven', course: 'DIT', shift: '07:00 AM - 08:00 AM', teacher_id: tokens.kelash.id }, admin.token);
  check('setup: E2E-1100 student created (201)', s1100.status === 201, JSON.stringify(s1100.json));
  const t1100 = await req('POST', '/api/tests', {
    title: 'DIT One-Attempt Test', course: 'DIT', type: 'daily-quiz',
    duration_minutes: 30, questions: [mcq(1, 0), mcq(2, 1)],
  }, admin.token);
  const t1100Id = t1100.json && t1100.json.test && t1100.json.test.id;
  check('setup: one-attempt test created (201)', t1100.status === 201, JSON.stringify(t1100.json));
  // Interrupted (unsubmitted) exam can restart: starting twice is fine —
  // starting creates no submission, so nothing blocks the second start.
  const start1 = await req('GET', '/api/tests/' + t1100Id + '?roll=E2E-1100');
  check('first start allowed (200, no submission yet)', start1.status === 200, 'got ' + start1.status);
  const start2 = await req('GET', '/api/tests/' + t1100Id + '?roll=E2E-1100');
  check('second start still allowed — starting creates no submission (200)', start2.status === 200, 'got ' + start2.status);
  const startBad = await req('GET', '/api/tests/' + t1100Id + '?roll=NOPE-999');
  check('start with unregistered roll -> 404 roll_not_registered',
    startBad.status === 404 && startBad.json && startBad.json.error === 'roll_not_registered', JSON.stringify(startBad.json));
  const startNoRoll = await req('GET', '/api/tests/' + t1100Id);
  check('fetch without roll param still works (200, no check — staff flows unchanged)',
    startNoRoll.status === 200, 'got ' + startNoRoll.status);
  const a1100 = [{ q: 0, answer: 0 }, { q: 1, answer: 1 }];
  const sub1100 = await req('POST', '/api/submissions', {
    client_id: 'e2e-1100-' + Date.now(),
    student: { roll_number: 'E2E-1100' }, test_id: t1100Id, answers: a1100,
  });
  check('first submit accepted (201)', sub1100.status === 201, JSON.stringify(sub1100.json));
  const startAfter = await req('GET', '/api/tests/' + t1100Id + '?roll=E2E-1100');
  check('second start blocked after submit (409 already_taken + exact message)',
    startAfter.status === 409 && startAfter.json && startAfter.json.errorCode === 'already_taken' &&
    startAfter.json.error === 'You have already taken this test.', JSON.stringify(startAfter.json));
  const subAgain = await req('POST', '/api/submissions', {
    client_id: 'e2e-1100b-' + Date.now(),
    student: { roll_number: 'E2E-1100' }, test_id: t1100Id, answers: a1100,
  });
  check('second submit rejected (409 already_taken, new client_id)',
    subAgain.status === 409 && subAgain.json && subAgain.json.errorCode === 'already_taken', JSON.stringify(subAgain.json));
  const startOther = await req('GET', '/api/tests/' + t1100Id + '?roll=E2E-001');
  check('a different student can still start the same test (200)', startOther.status === 200, 'got ' + startOther.status);
  const startLower = await req('GET', '/api/tests/' + t1100Id + '?roll=e2e-1100');
  check('start check is case-insensitive (lowercase roll -> 409)',
    startLower.status === 409, 'got ' + startLower.status);
  const startOld = await req('GET', '/api/tests/' + dit.id + '?roll=E2E-001');
  check('E2E-001 cannot re-start dit (submitted in §7) -> 409', startOld.status === 409, 'got ' + startOld.status);
  // Code-level: online terminal wiring.
  check('student.js sends roll on start + shows the exact already-taken message',
    stuSrc.includes("?roll=' + encodeURIComponent(S.student.roll_number)") && stuSrc.includes("e.message === 'You have already taken this test.'"));
  check('student.js handles 409 already_taken on submit (showAlreadyTaken, no queue)',
    stuSrc.includes('already_taken') && stuSrc.includes('showAlreadyTaken'));
  check('offline queue drops 409s instead of retrying forever',
    stuSrc.includes('res.status === 409'));
  // Code-level: lab app wiring.
  check('lab app checks its own saved submissions before starting (one attempt)',
    labSrc.includes('You have already taken this test.') && labSrc.includes('getSaved().some'));
  check('lab app auto-saves drafts keyed by roll+test + restores them',
    labSrc.includes('stc_lab_drafts_v1') && labSrc.includes('saveDraft()') &&
    labSrc.includes('restoreAnswerInputs') && labSrc.includes('clearDraft'));
  check('lab draft is cleared on submit',
    labSrc.includes('clearDraft(S.student.roll_number, S.test.id)'));
  // Code-level: admin import shows second attempts rejected.
  check('admin import reports second attempts rejected (already_taken)',
    admJs13.includes('already_taken') && admJs13.includes('second attempts rejected'));

  console.log('\n[27] v1.10.2 — lab teacher PIN: pack requires a PIN, hash only, lab asks first');
  const packNoPin = await req('GET', '/api/lab-pack', null, admin.token);
  check('lab-pack without PIN -> 400', packNoPin.status === 400, 'got ' + packNoPin.status);
  const packShortPin = await req('GET', '/api/lab-pack?pin=12', null, admin.token);
  check('lab-pack with short PIN (12) -> 400', packShortPin.status === 400, 'got ' + packShortPin.status);
  const packBadPin = await req('GET', '/api/lab-pack?pin=abcd', null, admin.token);
  check('lab-pack with non-numeric PIN (abcd) -> 400', packBadPin.status === 400, 'got ' + packBadPin.status);
  const pinHash9876 = crypto.createHash('sha256').update('9876', 'utf8').digest('hex');
  check('lab-pack with PIN embeds the SHA-256 hash of the PIN (not the PIN)',
    packA.status === 200 && packA.text.includes('"pin_hash":"' + pinHash9876 + '"'),
    'status ' + packA.status + ' hash-present=' + packA.text.includes(pinHash9876));
  check('lab-pack NEVER contains the plain PIN',
    !packA.text.includes('9876'), 'plain PIN leaked into the pack');
  // Code-level: Admin export UI.
  check('admin lab export validates the PIN + passes it as a query param',
    admJs13.includes("lab-pin") && admJs13.includes('/api/lab-pack?pin=') &&
    admJs13.includes("showFormError('lab-form-error'"));
  check('admin console has the Teacher PIN field + hint + inline error slot',
    admFrag.includes('id="lab-pin"') && admFrag.includes('students must not know it') &&
    admFrag.includes('id="lab-form-error"'));
  // Code-level: lab app PIN gate.
  check('lab app has a SHA-256 + PIN modal + Wrong PIN message',
    labSrc.includes('function sha256Hex') && labSrc.includes('id="pin-modal"') &&
    labSrc.includes('Wrong PIN.'));
  check('lab app gates Export + Clear on the PIN, checked every click',
    labSrc.includes("requirePin('export')") && labSrc.includes("requirePin('clear')") &&
    labSrc.includes('sha256Hex(entered) === LAB_PACK.pin_hash'));
  check('lab app works without a PIN when the pack has no hash (old packs)',
    labSrc.includes('!LAB_PACK.pin_hash'));

  console.log('\n========================================');
  console.log('E2E RESULT: ' + pass + ' PASS, ' + fail + ' FAIL');
  if (failures.length) console.log('Failures:\n - ' + failures.join('\n - '));
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('E2E CRASH:', e); process.exit(1); });
