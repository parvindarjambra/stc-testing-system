// STC Testing System — USB-sync verification script (v1.10.1: theory always
// teacher-graded — stored key words ignored at import; auto-lock on the
// 4th tab switch; v1.10.0: offline labs, import dedupes by (roll, test) —
// the first submission is kept, later attempts rejected and counted;
// auto-grading via the shared server path — FIB auto-checked).
// Tests the full offline-lab loop WITHOUT a browser:
//   seed students + a monthly test via the Admin API -> export the lab pack
//   (GET /api/lab-pack) -> build lab submissions EXACTLY in the format the
//   lab app produces -> import them (POST /api/lab-import) -> verify MCQ
//   auto-grading, teacher grading of FIB/theory, send-to-admin, finalize,
//   monthly report -> verify re-import dedupes.
// Usage: 1) wipe the test DB:  rm -f data/stc.sqlite data/*.json
//        2) start server:      PORT=3102 node server.js
//        3) run:               node e2e-sync-test.js [baseUrl]
//        Defaults to http://127.0.0.1:3102. Exits 1 if any check fails.
//        MUST run against a freshly wiped DB (it creates its own students
//        and test; fixed roll numbers LAB001/LAB002 would clash on a re-run).
// The REAL lab app (STC-Lab.html in a browser) is covered separately by a
// headless-Chromium smoke test — see TEST_REPORT.md §v1.4.0.
'use strict';

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
  try { json = JSON.parse(text); } catch (e) { /* non-JSON (HTML) */ }
  return { status: r.status, json, text, headers: r.headers };
}

async function login(username, password, role) {
  const body = { username, password };
  if (role) body.role = role;
  const r = await req('POST', '/api/auth/login', body);
  return r.status === 200 ? r.json : null;
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function currentMonth() { return todayStr().slice(0, 7); }

async function main() {
  console.log('E2E SYNC (USB offline labs) — base ' + BASE);

  console.log('\n[1] Health + admin login');
  const h = await req('GET', '/api/health');
  check('health 200 + version 1.10.1', h.status === 200 && h.json && h.json.version === '1.10.1', h.json && h.json.version);
  const admin = await login('admin', 'admin123', 'admin');
  check('admin login', !!(admin && admin.token));
  if (!admin) { console.log('FATAL: admin login failed'); process.exit(1); }

  console.log('\n[2] Seed: 2 students (2 teachers) + monthly test via Admin API');
  const users = await req('GET', '/api/users?role=teacher', null, admin.token);
  const teachers = (users.json && users.json.users) || [];
  const kelash = teachers.find((u) => u.username === 'kelash');
  const ashok = teachers.find((u) => u.username === 'ashok');
  check('seeded teachers kelash + ashok exist', !!(kelash && ashok));
  const SHIFT = '07:00 AM - 08:00 AM';
  const s1 = await req('POST', '/api/students', {
    roll_number: 'LAB001', name: 'Sync Student One', father_name: 'Sync Father One',
    course: 'DIT', shift: SHIFT, teacher_id: kelash.id,
  }, admin.token);
  check('student LAB001 created (teacher kelash)', s1.status === 201, s1.status + ' ' + s1.text.slice(0, 120));
  const s2 = await req('POST', '/api/students', {
    roll_number: 'LAB002', name: 'Sync Student Two', father_name: 'Sync Father Two',
    course: 'DIT', shift: SHIFT, teacher_id: ashok.id,
  }, admin.token);
  check('student LAB002 created (teacher ashok)', s2.status === 201, s2.status + ' ' + s2.text.slice(0, 120));
  const month = currentMonth();
  const t = await req('POST', '/api/tests', {
    title: 'DIT USB Sync Test', course: 'DIT', type: 'monthly-test', month,
    duration_minutes: 30, randomize: 0,
    questions: [
      { type: 'mcq', question: 'What is 2 + 2?', options: ['3', '4', '5', '6'], correct: 1, marks: 2 },
      { type: 'mcq', question: 'Capital of Pakistan?', options: ['Lahore', 'Karachi', 'Islamabad', 'Quetta'], correct: 2, marks: 3 },
      { type: 'fib', question: 'The chemical symbol for water is ___.', max_marks: 2, suggested_answer: 'H2O-SUGGESTED-ONLY' },
      { type: 'theory', question: 'Explain photosynthesis.', max_marks: 5,
        model_answer: 'MODEL-ANSWER-SYNC-SECRET', key_words: 'sunlight, chlorophyll, SYNC-KEYWORD-SECRET' },
    ],
  }, admin.token);
  check('monthly test created', t.status === 201, t.status + ' ' + t.text.slice(0, 120));
  const testId = t.json && t.json.test && t.json.test.id;
  if (!testId) { console.log('FATAL: test not created'); process.exit(1); }

  console.log('\n[3] Lab pack export — auth + NO answer keys in the pack');
  const packNoAuth = await req('GET', '/api/lab-pack');
  check('lab-pack without token -> 401', packNoAuth.status === 401);
  const kelashLogin = await login('kelash', 'teacher123', 'teacher');
  check('teacher kelash login', !!(kelashLogin && kelashLogin.token));
  const packTeacher = await req('GET', '/api/lab-pack', null, kelashLogin.token);
  check('lab-pack with teacher token -> 403', packTeacher.status === 403);
  const pack = await req('GET', '/api/lab-pack', null, admin.token);
  check('lab-pack with admin token -> 200 HTML', pack.status === 200 && pack.text.includes('<!DOCTYPE html>'),
    pack.status + ' len=' + pack.text.length);
  check('lab-pack served as download STC-Lab.html',
    (pack.headers.get('content-disposition') || '').includes('STC-Lab.html'));
  check('pack contains both students', pack.text.includes('LAB001') && pack.text.includes('LAB002'));
  check('pack contains the test', pack.text.includes('DIT USB Sync Test'));
  check('pack has NO mcq answer key ("correct" key absent)',
    !pack.text.includes('"correct"'), 'leaked "correct" into the pack');
  check('pack has NO fib suggested answer (value + key absent)',
    !pack.text.includes('H2O-SUGGESTED-ONLY') && !pack.text.includes('suggested_answer'));
  check('pack has NO theory key words (value + key absent)',
    !pack.text.includes('SYNC-KEYWORD-SECRET') && !pack.text.includes('key_words') &&
    !pack.text.includes('MODEL-ANSWER-SYNC-SECRET'));
  check('pack has NO fetch / network calls',
    !pack.text.includes('fetch(') && !pack.text.includes('XMLHttpRequest'));
  const packIdMatch = /"pack_id"\s*:\s*"([^"]+)"/.exec(pack.text);
  check('pack has a pack_id', !!packIdMatch);
  const packId = packIdMatch ? packIdMatch[1] : null;

  console.log('\n[4] Lab submissions (exact lab-app format) -> import');
  // Built EXACTLY as lab-template.html buildSubmissionPayload() builds them:
  // { client_id, student: { roll_number }, test_id, answers: [{q, answer}],
  //   submitted_at }, wrapped in the export envelope.
  const nowIso = new Date().toISOString();
  const envelope = {
    format: 'stc-lab-submissions', version: '1.10.1', pack_id: packId,
    exported_at: nowIso,
    submissions: [
      {
        client_id: 'c-sync-001', student: { roll_number: 'LAB001' }, test_id: testId,
        answers: [
          { q: 0, answer: 1 }, { q: 1, answer: 0 },
          { q: 2, answer: 'H2O' }, { q: 3, answer: 'Plants make food using sunlight.' },
        ],
        submitted_at: nowIso,
        // v1.8.0/v1.10.1: LAB001 was auto-locked for tab-switching in the lab app (4th switch).
        tab_switches: 4, auto_locked: true,
      },
      {
        client_id: 'c-sync-002', student: { roll_number: 'LAB002' }, test_id: testId,
        answers: [
          { q: 0, answer: 1 }, { q: 1, answer: 2 },
          { q: 2, answer: 'H2O' }, { q: 3, answer: 'Photosynthesis is how plants make food.' },
        ],
        submitted_at: nowIso,
      },
    ],
  };
  const impNoAuth = await req('POST', '/api/lab-import', envelope);
  check('lab-import without token -> 401', impNoAuth.status === 401);
  const impTeacher = await req('POST', '/api/lab-import', envelope, kelashLogin.token);
  check('lab-import with teacher token -> 403', impTeacher.status === 403);
  const imp = await req('POST', '/api/lab-import', envelope, admin.token);
  check('lab-import 200', imp.status === 200, imp.status + ' ' + imp.text.slice(0, 200));
  check('imported 2, duplicates 0, already_taken 0, errors 0',
    imp.json && imp.json.imported === 2 && imp.json.duplicates === 0 && imp.json.already_taken === 0 &&
    (imp.json.errors || []).length === 0,
    JSON.stringify(imp.json));

  console.log('\n[5] Imported submissions — server-side MCQ auto-grade + schema');
  const subs = await req('GET', '/api/submissions?test_id=' + testId, null, admin.token);
  const list = (subs.json && subs.json.submissions) || [];
  check('2 submissions stored for the test', list.length === 2, 'got ' + list.length);
  const sub1 = list.find((s) => s.student_roll === 'LAB001');
  const sub2 = list.find((s) => s.student_roll === 'LAB002');
  check('LAB001 submission found', !!sub1);
  check('LAB002 submission found', !!sub2);
  if (sub1 && sub2) {
    check('LAB001 mcq auto-graded 2/5 (q0 right, q1 wrong)',
      sub1.mcq_score === 2 && sub1.mcq_max === 5, JSON.stringify({ s: sub1.mcq_score, m: sub1.mcq_max }));
    check('LAB002 mcq auto-graded 5/5 (both right)',
      sub2.mcq_score === 5 && sub2.mcq_max === 5, JSON.stringify({ s: sub2.mcq_score, m: sub2.mcq_max }));
    check('theory_max 7 (fib 2 + theory 5) on both',
      sub1.theory_max === 7 && sub2.theory_max === 7);
    check('max_total 12 on both', sub1.max_total === 12 && sub2.max_total === 12);
    check('total = mcq_score before grading', sub1.total === 2 && sub2.total === 5);
    // v1.9.0/v1.10.1: the FIB 'H2O' does not match the key 'H2O-SUGGESTED-ONLY', so
    // it is auto-graded 0 at import (theory_marks {2: 0}, auto_marks {2: 0});
    // the theory question is ALWAYS teacher-graded (v1.10.1 — its stored
    // key words are ignored), so the submission routes to the teacher.
    check('status submitted + auto FIB 0 in theory_marks + not locked',
      sub1.status === 'submitted' && sub2.status === 'submitted' &&
      sub1.theory_marks && sub1.theory_marks['2'] === 0 &&
      sub1.auto_marks && sub1.auto_marks['2'] === 0 && !sub1.locked,
      JSON.stringify(sub1 && { tm: sub1.theory_marks, am: sub1.auto_marks }));
    check('theory with stored key words NOT auto-graded at import (no auto_marks[3])',
      sub1.auto_marks && sub1.auto_marks['3'] === undefined &&
      sub2.auto_marks && sub2.auto_marks['3'] === undefined);
    check('teacher routed from registered record (kelash / ashok)',
      sub1.teacher_id === kelash.id && sub2.teacher_id === ashok.id);
    check('date = today (lab test date kept)',
      sub1.date === todayStr() && sub2.date === todayStr(), sub1.date + ' vs ' + todayStr());
    check('student details rebuilt from register (name/course/shift)',
      sub1.student_name === 'Sync Student One' && sub1.course === 'DIT' && sub1.shift === SHIFT);
    check('answers stored as submitted', Array.isArray(sub1.answers) && sub1.answers.length === 4);
    check('LAB001 keeps anti-cheat flags from the lab file (tab_switches 4, auto_locked true)',
      sub1.tab_switches === 4 && sub1.auto_locked === true,
      JSON.stringify({ t: sub1.tab_switches, l: sub1.auto_locked }));
    check('LAB002 defaults tab_switches 0 + auto_locked false',
      sub2.tab_switches === 0 && sub2.auto_locked === false,
      JSON.stringify({ t: sub2.tab_switches, l: sub2.auto_locked }));
  }

  console.log('\n[6] Re-import dedupes (same USB file twice is safe)');
  const imp2 = await req('POST', '/api/lab-import', envelope, admin.token);
  check('re-import: imported 0, duplicates 2, already_taken 0, errors 0 (client_id dedupe wins)',
    imp2.json && imp2.json.imported === 0 && imp2.json.duplicates === 2 && imp2.json.already_taken === 0 &&
    (imp2.json.errors || []).length === 0,
    JSON.stringify(imp2.json));
  const subs2 = await req('GET', '/api/submissions?test_id=' + testId, null, admin.token);
  check('still exactly 2 submissions after re-import',
    ((subs2.json && subs2.json.submissions) || []).length === 2);

  console.log('\n[7] Bad import rows are rejected with clear errors');
  const bad = await req('POST', '/api/lab-import', {
    format: 'stc-lab-submissions', version: '1.7.0', submissions: [
      { client_id: 'c-sync-bad1', student: { roll_number: 'NOPE999' }, test_id: testId, answers: [], submitted_at: nowIso },
      { client_id: 'c-sync-bad2', student: { roll_number: 'LAB001' }, test_id: 'no-such-test', answers: [], submitted_at: nowIso },
      { client_id: 'c-sync-bad3', student: { roll_number: 'LAB001' }, test_id: testId, submitted_at: nowIso },
    ],
  }, admin.token);
  check('bad import: imported 0, errors 3',
    bad.json && bad.json.imported === 0 && (bad.json.errors || []).length === 3, JSON.stringify(bad.json));
  check('unknown roll error names roll_not_registered',
    (bad.json.errors || []).some((e) => String(e.error).includes('roll_not_registered')));
  const badBody = await req('POST', '/api/lab-import', { nope: true }, admin.token);
  check('lab-import with no submissions array -> 400', badBody.status === 400);

  console.log('\n[8] Teacher grades FIB/theory on the Admin PC (own students only)');
  const ashokLogin = await login('ashok', 'teacher123', 'teacher');
  check('teacher ashok login', !!(ashokLogin && ashokLogin.token));
  const kelashSubs = await req('GET', '/api/submissions', null, kelashLogin.token);
  const kList = (kelashSubs.json && kelashSubs.json.submissions) || [];
  check('kelash sees only his own student (LAB001)',
    kList.length === 1 && kList[0].student_roll === 'LAB001', 'got ' + kList.length);
  // v1.9.0: the FIB is auto-graded (0 — wrong answer), so the teacher's
  // mark for it is ignored; only the theory mark counts.
  const g1 = await req('POST', '/api/submissions/' + sub1.id + '/grade',
    { theory_marks: { 2: 2, 3: 4 } }, kelashLogin.token);
  check('kelash grades LAB001 theory 4 (FIB mark ignored — auto-graded 0)',
    g1.status === 200 && g1.json && g1.json.submission && g1.json.submission.status === 'graded',
    g1.status + ' ' + g1.text.slice(0, 160));
  check('LAB001 total now 6/12 (mcq 2 + auto FIB 0 + theory 4)',
    g1.json && g1.json.submission && g1.json.submission.total === 6, JSON.stringify(g1.json && g1.json.submission));
  const g2 = await req('POST', '/api/submissions/' + sub2.id + '/grade',
    { theory_marks: { 2: 1, 3: 5 } }, ashokLogin.token);
  check('ashok grades LAB002 theory 5 (FIB mark ignored — auto-graded 0)',
    g2.status === 200 && g2.json && g2.json.submission && g2.json.submission.total === 10,
    g2.status + ' ' + g2.text.slice(0, 160));

  console.log('\n[9] Send to Admin + finalize');
  const send1 = await req('POST', '/api/submissions/' + sub1.id + '/send', {}, kelashLogin.token);
  check('kelash sends LAB001 to admin',
    send1.status === 200 && send1.json.submission.status === 'sent_to_admin', send1.status + ' ' + send1.text.slice(0, 120));
  const send2 = await req('POST', '/api/submissions/' + sub2.id + '/send', {}, ashokLogin.token);
  check('ashok sends LAB002 to admin',
    send2.status === 200 && send2.json.submission.status === 'sent_to_admin', send2.status + ' ' + send2.text.slice(0, 120));
  const fin1 = await req('POST', '/api/submissions/' + sub1.id + '/finalize', {}, admin.token);
  check('admin finalizes LAB001',
    fin1.status === 200 && fin1.json.submission.status === 'final', fin1.status + ' ' + fin1.text.slice(0, 120));

  console.log('\n[10] Monthly report includes imported results');
  const mr = await req('GET', '/api/reports/monthly?month=' + month, null, admin.token);
  const rows = (mr.json && mr.json.rows) || [];
  const row1 = rows.find((r) => r.roll_number === 'LAB001');
  const row2 = rows.find((r) => r.roll_number === 'LAB002');
  check('monthly report has LAB001 (final)', !!row1, 'rows: ' + rows.map((r) => r.roll_number).join(','));
  check('monthly report has LAB002 (sent_to_admin)', !!row2);
  if (row1 && row2) {
    check('LAB001 report total 6/12', row1.total === 6 && row1.max === 12, JSON.stringify(row1));
    check('LAB002 report total 10/12', row2.total === 10 && row2.max === 12, JSON.stringify(row2));
  }

  console.log('\n[11] v1.10.0 — import dedupes by (roll, test): second-laptop attempt rejected');
  // LAB001 and LAB002 each took the same test on a SECOND laptop (new
  // client_ids, different answers) — the Admin PC already has their first
  // submissions, so the second attempts are rejected and counted, not stored.
  // (Their first submissions are now final / sent_to_admin — the block
  // applies whatever the grading status.)
  const dupEnvelope = {
    format: 'stc-lab-submissions', version: '1.10.1', pack_id: packId,
    exported_at: nowIso,
    submissions: [
      {
        client_id: 'c-sync-dup1', student: { roll_number: 'LAB001' }, test_id: testId,
        answers: [
          { q: 0, answer: 0 }, { q: 1, answer: 1 },
          { q: 2, answer: 'Different' }, { q: 3, answer: 'Second attempt text.' },
        ],
        submitted_at: nowIso,
      },
      {
        client_id: 'c-sync-dup2', student: { roll_number: 'LAB002' }, test_id: testId,
        answers: [
          { q: 0, answer: 0 }, { q: 1, answer: 0 },
          { q: 2, answer: 'Different' }, { q: 3, answer: 'Second attempt text.' },
        ],
        submitted_at: nowIso,
      },
    ],
  };
  const impDup = await req('POST', '/api/lab-import', dupEnvelope, admin.token);
  check('second-laptop import: imported 0, already_taken 2, duplicates 0, errors 0',
    impDup.json && impDup.json.imported === 0 && impDup.json.already_taken === 2 &&
    impDup.json.duplicates === 0 && (impDup.json.errors || []).length === 0,
    JSON.stringify(impDup.json));
  const subs3 = await req('GET', '/api/submissions?test_id=' + testId, null, admin.token);
  const list3 = (subs3.json && subs3.json.submissions) || [];
  check('still exactly 2 submissions after duplicate import', list3.length === 2, 'got ' + list3.length);
  const kept1 = list3.find((s) => s.student_roll === 'LAB001');
  check('FIRST submission kept (original client_id c-sync-001, total still 6)',
    kept1 && kept1.client_id === 'c-sync-001' && kept1.total === 6,
    JSON.stringify(kept1 && { c: kept1.client_id, t: kept1.total }));

  console.log('\n========================================');
  console.log('E2E SYNC RESULT: ' + pass + ' PASS, ' + fail + ' FAIL');
  if (fail) { console.log('Failures: ' + failures.join(' | ')); process.exit(1); }
}

main().catch((e) => { console.error('E2E SYNC CRASH:', e); process.exit(1); });
