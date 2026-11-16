/* =====================================================================
   common.js — shared helpers, API, reference data, portal auth.
   STC Testing System — Super Sys-Tech Computers Centre, Umerkot.
   Vanilla JS, no frameworks, no external requests.
   ===================================================================== */

'use strict';
/* ---------------- Helpers ---------------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const todayISO = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
const currentMonth = () => todayISO().slice(0, 7);

/* 'YYYY-MM' -> 'November 2026' */
function monthName(ym) {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return '';
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  const y = ym.slice(0, 4), m = parseInt(ym.slice(5, 7), 10);
  return names[m - 1] ? names[m - 1] + ' ' + y : ym;
}

/* Display label for a test: monthly tests show their month name. */
function testLabel(t) {
  if (t.type === 'monthly-test' && t.month) {
    if (t.title.indexOf(monthName(t.month)) !== -1) return t.title;
    return t.title + ' — ' + monthName(t.month);
  }
  return t.title;
}

function fmtDate(d) { return d ? String(d).slice(0, 10) : ''; }

function toast(msg, ok) {
  const el = $('toast');
  el.textContent = msg;
  el.className = 'toast ' + (ok ? 'ok' : 'err');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.className = 'toast hidden'; }, 6000);
}

/* ---------------- App state ---------------- */
const S = {
  token: null, user: null,
  courses: [], shifts: [], teachers: [],           // reference data
  student: null,                                    // student start-form data
  test: null,                                       // full test object for the exam
  answers: {},                                      // qIndex -> answer (MCQ: option index, Theory: text)
  timerId: null, endsAt: 0, currentQ: 0,
  grading: null,                                    // { submission, test }
  editingCourseId: null, editingStudentId: null, editingUserId: null,
  editingTestId: null, builderQuestions: [],
  monthlyRows: [], principalRows: [], conDay: null, conRows: [],
  principalSheetDate: null, principalSheetRows: [],
  teacherDay: null
};

/* ---------------- API wrapper ----------------
   opts.noAuth: skip the Authorization header (public endpoints and the
   student exam fetch, which must never receive answer keys). */
async function api(path, opts) {
  opts = opts || {};
  const headers = { 'Content-Type': 'application/json' };
  if (S.token && !opts.noAuth) headers['Authorization'] = 'Bearer ' + S.token;
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* empty body */ }
  if (res.status === 401) {
    if (S.token && !opts.noAuth) {
      // An authenticated call failed: the session expired (or the server restarted).
      if (sessionExpiredHandler) sessionExpiredHandler();
      throw new Error('Session expired — please login again.');
    }
    // No token was sent (a login attempt): report the server's own error.
    throw new Error((data && data.error) || 'Login failed (401)');
  }
  if (!res.ok || !data || data.ok === false) {
    throw new Error((data && data.error) || ('Request failed (' + res.status + ')'));
  }
  return data;
}

/* Download a CSV export through the authenticated API as a blob. */
async function downloadCsv(path, filename) {
  try {
    const headers = {};
    if (S.token) headers['Authorization'] = 'Bearer ' + S.token;
    const res = await fetch(path, { headers: headers });
    if (!res.ok) throw new Error('Export failed (' + res.status + ')');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (e) { toast(e.message, false); }
}

/* ---------------- Reference data (courses / shifts / teachers) ---------------- */
async function loadReference() {
  try {
    const [c, s, t] = await Promise.all([
      api('/api/courses', { noAuth: true }),
      api('/api/shifts', { noAuth: true }),
      api('/api/teachers', { noAuth: true })
    ]);
    S.courses = c.courses || [];
    S.shifts = s.shifts || [];
    S.teachers = t.teachers || t.users || [];
  } catch (e) {
    toast('Could not load courses/shifts/teachers: ' + e.message, false);
  }
}

function courseOptions(selected) {
  return '<option value="">-- Select course --</option>' + S.courses.map((c) =>
    '<option value="' + esc(c.name) + '"' + (c.name === selected ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('');
}
function shiftOptions(selected) {
  return '<option value="">-- Select shift --</option>' + S.shifts.map((s) =>
    '<option value="' + esc(s.label) + '"' + (s.label === selected ? ' selected' : '') + '>' + esc(s.label) + '</option>').join('');
}
/* Teachers filtered to those who teach the given course.
   Fallback: if no teacher teaches the course (currently E-commerce and
   Digital Marketing have no assigned teacher), show all Computer
   Instructors (teachers of DIT) so the form never dead-ends. */
function teachersForCourse(course) {
  if (!course) return S.teachers;
  const direct = S.teachers.filter((t) => (t.courses || []).indexOf(course) !== -1);
  if (direct.length) return direct;
  return S.teachers.filter((t) => (t.courses || []).indexOf('DIT') !== -1);
}
/* Note shown when the fallback list is in use ('' when a subject teacher exists). */
function teacherFallbackNote(course) {
  if (!course) return '';
  const direct = S.teachers.filter((t) => (t.courses || []).indexOf(course) !== -1);
  return direct.length ? '' : 'No subject teacher assigned for ' + course + ' yet — showing Computer Instructors. Admin can assign a subject teacher anytime.';
}
function teacherOptions(course, selectedId) {
  const list = teachersForCourse(course);
  let html = '<option value="">-- Select teacher --</option>';
  list.forEach((t) => {
    html += '<option value="' + t.id + '"' + (String(t.id) === String(selectedId) ? ' selected' : '') + '>' + esc(t.name) + '</option>';
  });
  return html;
}

function consolidationTable(rows) {
  if (!rows.length) return '<p>No rows in this sheet.</p>';
  let html = '<table><tr><th>Roll No</th><th>Name</th><th>Father\'s Name</th><th>Course</th><th>Shift</th>' +
    '<th>Teacher</th><th>Test</th><th>MCQ</th><th>Theory / FIB</th><th>Total</th><th>Status</th></tr>';
  rows.forEach((r) => {
    html += '<tr><td>' + esc(r.roll_number) + '</td><td>' + esc(r.name) + '</td><td>' + esc(r.father_name) +
      '</td><td>' + esc(r.course) + '</td><td>' + esc(r.shift) + '</td><td>' + esc(r.teacher_name) +
      '</td><td>' + esc(r.test_title) + '</td><td>' + r.mcq_score + ' / ' + r.mcq_max +
      '</td><td>' + r.theory_marks_total + ' / ' + r.theory_max +
      '</td><td><strong>' + r.total + ' / ' + r.max_total + '</strong></td>' +
      '<td>' + esc(String(r.status).replace(/_/g, ' ')) + '</td></tr>';
  });
  return html + '</table>';
}

function statBox(label, value) {
  return '<div class="stat"><div class="stat-num">' + esc(value === '' || value == null ? '—' : value) +
    '</div><div class="stat-label">' + esc(label) + '</div></div>';
}
function pendingCount(d) {
  return (d.perShift || []).reduce((a, s) => a + (s.submitted || 0), 0);
}
function shiftTable(perShift) {
  if (!perShift.length) return '<p class="muted">No submissions yet for this date.</p>';
  let html = '<table><tr><th>Shift</th><th>Submitted</th><th>Graded</th><th>Sent</th><th>Total</th></tr>';
  perShift.forEach((s) => {
    html += '<tr><td>' + esc(s.shift) + '</td><td>' + s.submitted + '</td><td>' + s.graded +
      '</td><td>' + s.sent + '</td><td><strong>' + s.total + '</strong></td></tr>';
  });
  return html + '</table>';
}
function courseCountTable(perCourse) {
  if (!perCourse.length) return '<p class="muted">No submissions yet.</p>';
  let html = '<table><tr><th>Course</th><th>Submissions</th></tr>';
  perCourse.forEach((c) => { html += '<tr><td>' + esc(c.course) + '</td><td>' + c.count + '</td></tr>'; });
  return html + '</table>';
}
function teacherDayTable(perTeacher) {
  if (!perTeacher.length) return '<p class="muted">No teacher activity yet.</p>';
  let html = '<table><tr><th>Teacher</th><th>Submitted</th><th>Graded</th><th>Sent</th><th>Final</th></tr>';
  perTeacher.forEach((t) => {
    html += '<tr><td>' + esc(t.teacher_name) + '</td><td>' + t.submitted + '</td><td>' + t.graded +
      '</td><td>' + t.sent + '</td><td>' + t.final + '</td></tr>';
  });
  return html + '</table>';
}

/* ----- Monthly report (shared by admin + principal) ----- */
async function loadMonthlyReport(who) {
  const month = who === 'admin' ? $('mr-month').value : $('pr-month').value;
  const box = who === 'admin' ? $('monthly-report') : $('principal-report');
  if (!/^\d{4}-\d{2}$/.test(month)) { box.innerHTML = '<p>Pick a month first.</p>'; return; }
  box.innerHTML = '<p class="muted">Loading...</p>';
  try {
    const d = await api('/api/reports/monthly?month=' + month);
    const rows = d.rows || [];
    if (who === 'admin') S.monthlyRows = rows; else S.principalRows = rows;
    if (!rows.length) { box.innerHTML = '<p>No monthly-test results for ' + monthName(month) + '.</p>'; return; }
    let html = '<table><tr><th>Roll No</th><th>Name</th><th>Father\'s Name</th><th>Course</th><th>Shift</th>' +
      '<th>Teacher</th><th>Tests</th><th>Total</th><th>%</th><th>Result</th></tr>';
    rows.forEach((r) => {
      const tests = (r.tests || []).map((t) => esc(t.title) + ': ' + t.total + '/' + t.max).join('<br>');
      html += '<tr><td>' + esc(r.roll_number) + '</td><td>' + esc(r.name) + '</td><td>' + esc(r.father_name) +
        '</td><td>' + esc(r.course) + '</td><td>' + esc(r.shift) + '</td><td>' + esc(r.teacher_name) +
        '</td><td>' + tests + '</td><td><strong>' + r.total + ' / ' + r.max + '</strong></td>' +
        '<td>' + r.percentage + '%</td><td class="' + (r.result === 'Pass' ? 'pass' : 'fail') + '">' + r.result + '</td></tr>';
    });
    box.innerHTML = html + '</table>';
  } catch (e) { box.innerHTML = '<p>Could not load report: ' + esc(e.message) + '</p>'; }
}

function monthlyReportPrintHtml(rows, month) {
  let html = '<h3>Monthly Report — ' + monthName(month) + '</h3>';
  html += '<table><tr><th>Roll No</th><th>Name</th><th>Course</th><th>Tests</th><th>Total</th><th>%</th><th>Result</th></tr>';
  rows.forEach((r) => {
    const tests = (r.tests || []).map((t) => esc(t.title) + ': ' + t.total + '/' + t.max).join('<br>');
    html += '<tr><td>' + esc(r.roll_number) + '</td><td>' + esc(r.name) + '</td><td>' + esc(r.course) +
      '</td><td>' + tests + '</td><td>' + r.total + ' / ' + r.max + '</td><td>' + r.percentage + '%</td><td>' + r.result + '</td></tr>';
  });
  return html + '</table>';
}

/* =====================================================================
   PRINT — institute header block + signature lines
   ===================================================================== */
/* Course-wise result sheet (print): one section per course, rows sorted by
   roll number. Groups come from /api/reports/course-wise. */
function courseWisePrintHtml(groups, month) {
  if (!groups || !groups.length) return '<p>No monthly-test results for ' + monthName(month) + '.</p>';
  let html = '<p>Course-wise result sheet — ' + monthName(month) + '</p>';
  groups.forEach((g) => {
    html += '<h4>Course: ' + esc(g.course) + ' (' + g.rows.length + ' result' + (g.rows.length === 1 ? '' : 's') + ')</h4>';
    html += '<table><tr><th>Roll No</th><th>Name</th><th>Father\'s Name</th><th>Shift</th>' +
      '<th>Teacher</th><th>Test</th><th>MCQ</th><th>Theory / FIB</th><th>Total</th><th>%</th><th>Result</th></tr>';
    g.rows.forEach((r) => {
      html += '<tr><td>' + esc(r.roll_number) + '</td><td>' + esc(r.name) + '</td><td>' + esc(r.father_name) +
        '</td><td>' + esc(r.shift) + '</td><td>' + esc(r.teacher_name) +
        '</td><td>' + esc(r.test_title) + '</td><td>' + r.mcq_score + ' / ' + r.mcq_max +
        '</td><td>' + r.theory_marks_total + ' / ' + r.theory_max +
        '</td><td><strong>' + r.total + ' / ' + r.max_total + '</strong></td>' +
        '<td>' + r.percentage + '%</td><td>' + r.result + '</td></tr>';
    });
    html += '</table>';
  });
  return html;
}

function printSheet(title, bodyHtml) {
  $('print-area').innerHTML =
    '<div class="print-head">' +
    '<img src="/stc-logo.webp" alt="STC logo" class="print-logo">' +
    '<h2>Super Sys-Tech Computers Centre</h2>' +
    '<p>Empowering Skills Since 1997 &nbsp;|&nbsp; Est. 1997, Umerkot</p>' +
    '<p>1st Floor, Jameel Market, Umerkot, Sindh, Pakistan &nbsp;|&nbsp; 0332-3350790 &nbsp;|&nbsp; 0345-3279790 &nbsp;|&nbsp; info@stc.edu.pk</p>' +
    '<p>Affiliated with: NAVTTC Islamabad | STEVTA Sindh | SBTE Sindh | TTB Sindh</p>' +
    '<p><strong>Director:</strong> Sham Kumar Lohana &nbsp;|&nbsp; <strong>Principal:</strong> Ramesh Kumar &nbsp;|&nbsp; <strong>Admin / Exam Controller:</strong> Danish Mustafa</p>' +
    '</div>' +
    '<h3>' + esc(title) + '</h3>' +
    bodyHtml +
    '<div class="print-sign">' +
    '<div>Director<br><strong>Sham Kumar Lohana</strong></div>' +
    '<div>Principal (Signature)<br><strong>Ramesh Kumar</strong></div>' +
    '<div>Admin / Exam Controller<br><strong>Danish Mustafa</strong></div>' +
    '</div>';
  window.print();
}


/* ---------------- Portal auth ----------------
   Each staff portal page (teacher / admin / principal) has its OWN login
   screen and its OWN role. The console is NEVER in the served HTML: it is
   fetched as an authenticated fragment only after a successful login. */

let sessionExpiredHandler = null;
function setSessionExpiredHandler(fn) { sessionExpiredHandler = fn; }

/* Login for one portal role. The server enforces the role (wrong role -> 403
   'wrong_role'; bad password -> 401 'invalid credentials'). */
async function login(username, password, role) {
  const d = await api('/api/auth/login', {
    method: 'POST', noAuth: true, body: { username: username, password: password, role: role }
  });
  S.token = d.token; S.user = d.user;
  sessionStorage.setItem('stc_token', d.token);
  sessionStorage.setItem('stc_user', JSON.stringify(d.user));
  return d.user;
}

function logout(silent) {
  S.token = null; S.user = null;
  sessionStorage.clear();
  if (typeof stopTimer === 'function') stopTimer();
  showPortalLogin();
  if (!silent) toast('Logged out.', true);
}

/* Restore a saved session after reload. Returns the user or null.
   A wrong-role token (e.g. a teacher token on the admin page) is rejected. */
async function restoreSession(role) {
  const t = sessionStorage.getItem('stc_token');
  const u = sessionStorage.getItem('stc_user');
  if (!t || !u) return null;
  S.token = t;
  try {
    const d = await api('/api/me');
    if (role && d.user.role !== role) throw new Error('wrong_role');
    S.user = d.user;
    sessionStorage.setItem('stc_user', JSON.stringify(d.user));
    return d.user;
  } catch (e) {
    S.token = null; S.user = null;
    sessionStorage.clear();
    return null;
  }
}

/* Show ONLY the login form (console hidden and emptied, no data visible). */
function showPortalLogin() {
  const c = $('view-console'); if (c) c.classList.add('hidden');
  const l = $('view-login'); if (l) l.classList.remove('hidden');
  const chip = $('user-chip'); if (chip) chip.textContent = '';
  const lo = $('btn-logout'); if (lo) lo.classList.add('hidden');
  const con = $('console'); if (con) con.innerHTML = '';
}

/* Fetch the authenticated console fragment and inject it, then init it. */
async function enterConsole(fragment, onReady) {
  const res = await fetch('/fragments/' + fragment, {
    headers: { 'Authorization': 'Bearer ' + S.token }
  });
  if (res.status === 401) throw new Error('Session expired — please login again.');
  if (!res.ok) throw new Error('Could not load console (' + res.status + ')');
  $('console').innerHTML = await res.text();
  $('view-login').classList.add('hidden');
  $('view-console').classList.remove('hidden');
  $('user-chip').textContent = S.user.name + ' (' + S.user.role + ')';
  $('btn-logout').classList.remove('hidden');
  if (onReady) await onReady();
}

/* Wire one portal page: login form, logout, session restore.
   cfg: { role, roleLabel, fragment, onReady } */
function initPortal(cfg) {
  const form = $('login-form');
  const errBox = $('login-error');
  function showLoginError(msg) {
    if (errBox) { errBox.textContent = msg; errBox.classList.remove('hidden'); }
    toast(msg, false);
  }
  setSessionExpiredHandler(() => {
    S.token = null; S.user = null;
    sessionStorage.clear();
    showPortalLogin();
    toast('Session expired — please login again.', false);
  });
  $('btn-logout').addEventListener('click', () => logout(false));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errBox) errBox.classList.add('hidden');
    try {
      const user = await login($('login-username').value.trim(), $('login-password').value, cfg.role);
      toast('Welcome, ' + user.name, true);
      await enterConsole(cfg.fragment, cfg.onReady);
    } catch (err) {
      const m = err.message || '';
      if (m.indexOf('wrong_role') !== -1) {
        showLoginError('Ye login sirf ' + cfg.roleLabel + ' ke liye hai / This login is for ' + cfg.roleLabel + ' only.');
      } else if (m.indexOf('invalid credentials') !== -1 || m.indexOf('401') !== -1) {
        showLoginError('Ghalat username ya password / Incorrect username or password.');
      } else {
        showLoginError('Login failed: ' + m);
      }
      // A failed login must never leave a half-logged-in state.
      S.token = null; S.user = null;
      sessionStorage.clear();
    }
  });
  // First load: restore a saved session for THIS role, else show login only.
  (async () => {
    const user = await restoreSession(cfg.role);
    if (user) {
      try { await enterConsole(cfg.fragment, cfg.onReady); return; }
      catch (e) {
        S.token = null; S.user = null;
        sessionStorage.clear();
      }
    }
    showPortalLogin();
  })();
}
