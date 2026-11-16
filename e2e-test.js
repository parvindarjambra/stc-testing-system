// STC Testing System — end-to-end verification script (v1.3.2: real logo,
// back-to-home, teacher import, fill-in-the-blank, course-wise results).
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
// role-enforced login, strict roll validation (server + client), unauthenticated
// API rejection, roll lookup, submission + MCQ auto-score, dedupe, teacher
// filtering, grading + send + finalize, monthly report (month field),
// consolidation lock, principal analytics, CSV import/export, offline-queue +
// fallback code checks, zero-external-requests check on served files,
// real logo serving, back-to-home links, teacher CSV import, fill-in-the-
// blank questions (teacher-graded), course-wise results export + report.
'use strict';

const fs = require('fs');
const path = require('path');

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
  check('version is 1.3.2', h.json && h.json.version === '1.3.2', h.json && h.json.version);
  const home = await req('GET', '/');
  check('landing page serves institute name', home.status === 200 && home.text.includes('Super Sys-Tech Computers Centre'));
  check('landing page serves Principal name', home.text.includes('Ramesh Kumar'));
  check('landing has 4 portal entry links',
    ['/student', '/teacher', '/admin', '/principal'].every((p) => home.text.includes('href="' + p + '"')));
  check('landing has NO portal console content',
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
  check('portal pages are distinct',
    stuPage.text !== teaPage.text && teaPage.text !== admPage.text && admPage.text !== priPage.text);
  for (const f of ['common.js', 'student.js', 'teacher.js', 'admin.js', 'principal.js', 'landing.js']) {
    const r = await req('GET', '/' + f);
    check(f + ' serves', r.status === 200 && r.text.length > 500, f + ': ' + r.status);
  }
  const css = await req('GET', '/style.css');
  check('style.css serves + restyled theme (stc.edu.pk navy, hero, sidebar)',
    css.status === 200 && css.text.includes('#0f172a') && css.text.includes('.hero') && css.text.includes('.console-layout'));
  const tpl = await req('GET', '/students_template.csv');
  check('students_template.csv serves', tpl.status === 200 && tpl.text.includes('Roll Number'));
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

  console.log('\n[5] Roll lookup auto-fill (per-student teacher)');
  const l1 = await req('GET', '/api/students/lookup?roll=E2E-001');
  check('lookup E2E-001 found (E2E Student One, DIT, kelash)',
    l1.json && l1.json.found && l1.json.student.name === 'E2E Student One' && l1.json.student.course === 'DIT' &&
    l1.json.student.teacher_id === tokens.kelash.id, JSON.stringify(l1.json));
  const l4 = await req('GET', '/api/students/lookup?roll=E2E-004');
  check('lookup E2E-004 -> pawan', l4.json && l4.json.found && l4.json.student.teacher_id === tokens.pawan.id);
  const l2 = await req('GET', '/api/students/lookup?roll=E2E-002');
  check('lookup E2E-002 -> ashok', l2.json && l2.json.found && l2.json.student.teacher_id === tokens.ashok.id);
  const lX = await req('GET', '/api/students/lookup?roll=STC-9999-999');
  check('lookup unknown roll -> found:false', lX.json && lX.json.found === false);
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

  console.log('\n[12] 7:30 PM consolidation (manual trigger) + lock');
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
  const impL = await req('GET', '/api/students/lookup?roll=STC-2026-102');
  check('imported quoted-comma name found via lookup', impL.json && impL.json.found && impL.json.student.name === 'Comma, Test');
  const imp2 = await req('POST', '/api/students/import', { csv }, admin.token);
  check('re-import skips duplicates (2 skipped)', imp2.json && imp2.json.skipped === 2, JSON.stringify(imp2.json));

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
  for (const [name, page] of [['student', stuPage], ['teacher', teaPage], ['admin', admPage], ['principal', priPage]]) {
    check(name + ' page has NO links to other portals',
      portalHrefs.every((h) => !page.text.includes(h)));
  }
  const fragNoAuth = await req('GET', '/fragments/admin-console.html');
  check('fragment without token -> 401', fragNoAuth.status === 401);
  const fragWrongRole = await req('GET', '/fragments/admin-console.html', null, tokens.kelash.token);
  check('admin fragment with teacher token -> 403', fragWrongRole.status === 403);
  const fragAdmin = await req('GET', '/fragments/admin-console.html', null, admin.token);
  check('admin fragment with admin token -> 200 + console markup',
    fragAdmin.status === 200 && fragAdmin.text.includes('tab-dashboard') && fragAdmin.text.includes('7:30 PM Consolidation'));
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
  check('strict roll error message present (Roman Urdu)',
    stuSrc.includes('Ye roll number list mein nahi hai'));
  check('student page has NO manual-entry inputs (no stu-name/stu-course fields)',
    !stuHtml.includes('id="stu-name"') && !stuHtml.includes('id="stu-course"') && !stuHtml.includes('id="stu-teacher"'));
  check('student page has verify + read-only details flow',
    stuHtml.includes('stu-verify-form') && stuHtml.includes('stu-details-body') && stuHtml.includes('stu-confirm'));
  check('teacher fallback logic present (teachersForCourse + DIT fallback)',
    comSrc.includes('teachersForCourse') && comSrc.includes("indexOf('DIT')"));
  check('fallback note text present', comSrc.includes('showing Computer Instructors'));
  check('fallback note element in admin fragment', admFrag.includes('st-teacher-note'));
  check('teacher login hint lists all 14 teachers, no nadir/dileep',
    teaHtml.includes('ghansham') && teaHtml.includes('pawan') && teaHtml.includes('kapil') &&
    !teaHtml.includes('nadir') && !teaHtml.includes('dileep'));
  check('admin console has sidebar with 7:30 PM Consolidation',
    admFrag.includes('class="sidebar"') && admFrag.includes('7:30 PM Consolidation') && admFrag.includes('data-tab="consolidation"'));
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
  for (const [name, page] of [['landing', home], ['student', stuPage], ['teacher', teaPage], ['admin', admPage], ['principal', priPage]]) {
    check(name + ' page uses the real logo (stc-logo.webp in a white chip)',
      page.text.includes('stc-logo.webp') && page.text.includes('header-logo-chip'));
  }
  check('no page still uses the old green STC text badge',
    [home, stuPage, teaPage, admPage, priPage].every((p) => !p.text.includes('header-logo">STC')));

  // --- 2. Back to Home (login shell + console share the topbar) ---
  for (const [name, page] of [['student', stuPage], ['teacher', teaPage], ['admin', admPage], ['principal', priPage]]) {
    check(name + ' page has a Back to Home link to /',
      page.text.includes('Back to Home') && page.text.includes('href="/"'));
  }
  check('landing page has no Back to Home link (it IS home)', !home.text.includes('Back to Home'));
  check('portal pages still have NO portal-to-portal links (only /)',
    [stuPage, teaPage, admPage, priPage].every((p) =>
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
  const l201 = await req('GET', '/api/students/lookup?roll=STC-2026-201');
  check('teacher matched by USERNAME (kelash) assigns that teacher',
    l201.json && l201.json.found && l201.json.student.teacher_id === tokens.kelash.id, JSON.stringify(l201.json));
  const l203 = await req('GET', '/api/students/lookup?roll=STC-2026-203');
  check('teacher matched by FULL NAME (Ashok Kumar) assigns that teacher',
    l203.json && l203.json.found && l203.json.student.teacher_id === tokens.ashok.id, JSON.stringify(l203.json));
  const l202 = await req('GET', '/api/students/lookup?roll=STC-2026-202');
  check('unknown-teacher row was NOT imported', l202.json && l202.json.found === false);

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
  check('FIB + theory max (3+5=8) in theory_max; total 2; max 10',
    fs1 && fs1.theory_max === 8 && fs1.total === 2 && fs1.max_total === 10, fs1 && (fs1.theory_max + '/' + fs1.total + '/' + fs1.max_total));
  const fibSendEarly = await req('POST', '/api/submissions/' + fs1.id + '/send', {}, tokens.ashok.token);
  check('send before FIB/theory grading -> 400 (unmarked)', fibSendEarly.status === 400);
  const gradeFib = await req('POST', '/api/submissions/' + fs1.id + '/grade', { theory_marks: { 0: 5, 1: 3 } }, tokens.ashok.token);
  const gf = gradeFib.json && gradeFib.json.submission;
  check('grade FIB 3/3; MCQ-index mark ignored (total 5, not 10)',
    gf && gf.total === 5, gf && gf.total);
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

  console.log('\n========================================');
  console.log('E2E RESULT: ' + pass + ' PASS, ' + fail + ' FAIL');
  if (failures.length) console.log('Failures:\n - ' + failures.join('\n - '));
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('E2E CRASH:', e); process.exit(1); });
