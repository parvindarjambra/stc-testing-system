/* =====================================================================
   teacher.js — Teacher portal console (own students only).
   STC Testing System — Super Sys-Tech Computers Centre, Umerkot.
   Vanilla JS, no frameworks, no external requests.
   ===================================================================== */

'use strict';
function loadTeacher() {
  $('teacher-welcome').textContent = 'Welcome, ' + S.user.name +
    (S.user.courses && S.user.courses.length ? ' — Courses: ' + S.user.courses.join(', ') : '');
  $('tq-date').value = todayISO();
  $('grade-panel').classList.add('hidden');
  S.grading = null;
  loadTeacherQueue();
  loadTeacherDays();
}

async function loadTeacherQueue() {
  const box = $('teacher-queue');
  box.innerHTML = '<p class="muted">Loading...</p>';
  const params = new URLSearchParams();
  if ($('tq-date').value) params.set('date', $('tq-date').value);
  if ($('tq-status').value) params.set('status', $('tq-status').value);
  try {
    const d = await api('/api/submissions?' + params.toString());
    const subs = d.submissions || [];
    if (!subs.length) { box.innerHTML = '<p>No submissions found for this filter.</p>'; return; }
    let html = '<table><tr><th>Roll No</th><th>Name</th><th>Father\'s Name</th><th>Course</th>' +
      '<th>Shift</th><th>Test</th><th>Date</th><th>MCQ</th><th>Status</th><th></th></tr>';
    subs.forEach((s) => {
      html += '<tr class="clickable" data-grade="' + s.id + '">' +
        '<td>' + esc(s.student_roll) + '</td><td>' + esc(s.student_name) + '</td>' +
        '<td>' + esc(s.father_name) + '</td><td>' + pillCourse(s.course) + '</td>' +
        '<td>' + pillShift(s.shift) + '</td><td>' + esc(s.test_title) + '</td>' +
        '<td>' + fmtDate(s.date) + '</td><td>' + s.mcq_score + ' / ' + s.mcq_max + '</td>' +
        '<td><span class="status status-' + s.status + '">' + esc(s.status.replace(/_/g, ' ')) + '</span></td>' +
        '<td><button class="btn btn-small" type="button">Open</button></td></tr>';
    });
    box.innerHTML = html + '</table>';
    box.querySelectorAll('[data-grade]').forEach((row) => {
      row.addEventListener('click', () => openGrading(row.getAttribute('data-grade')));
    });
  } catch (e) { box.innerHTML = '<p>Could not load submissions: ' + esc(e.message) + '</p>'; }
}

/* Side-by-side theory grading: student answer left, model answer + marks right. */
async function openGrading(subId) {
  try {
    const sd = await api('/api/submissions/' + subId);
    const sub = sd.submission || sd;
    const td = await api('/api/tests/' + sub.test_id);   // authed: full questions incl. model answers
    const test = td.test || td;
    S.grading = { submission: sub, test: test };
    $('grade-title').textContent = 'Grade — ' + sub.student_name + ' (' + sub.student_roll + ')';
    $('grade-meta').textContent = testLabel(test) + ' — ' + sub.course + ', ' + sub.shift +
      ' — MCQ ' + sub.mcq_score + ' / ' + sub.mcq_max + ' — Status: ' + sub.status +
      (sub.locked ? ' — LOCKED (consolidated, cannot change)' : '');
    // Anti-cheat flag (v1.8.0): this banner IS the message to the teacher —
    // the submission records how many times the student left the exam page
    // and whether the test was auto-locked on the 2nd switch.
    const flagEl = $('grade-flag');
    const switches = sub.tab_switches || 0;
    if (switches > 0) {
      flagEl.textContent = '⚠️ This student left the exam page ' + switches +
        ' time' + (switches === 1 ? '' : 's') + ' during the test.' +
        (sub.auto_locked ? ' The test was auto-locked.' : '');
      flagEl.classList.remove('hidden');
    } else {
      flagEl.classList.add('hidden');
      flagEl.textContent = '';
    }
    const answersByQ = {};
    (sub.answers || []).forEach((a) => { answersByQ[a.q] = a.answer; });
    // Theory AND fill-in-the-blank are both teacher-graded (MCQs are auto-graded).
    const theoryQs = test.questions.map((q, i) => ({ q: q, i: i }))
      .filter((x) => x.q.type === 'theory' || x.q.type === 'fib');
    const body = $('grade-body');
    if (!theoryQs.length) {
      body.innerHTML = '<p>This test has no theory or fill-in-the-blank questions. MCQ score is already final: <strong>' +
        sub.mcq_score + ' / ' + sub.mcq_max + '</strong>.</p>';
    } else {
      body.innerHTML = theoryQs.map((x) => {
        const saved = (sub.theory_marks && sub.theory_marks[x.i] != null) ? sub.theory_marks[x.i] : '';
        const stuAns = answersByQ[x.i];
        const isFib = x.q.type === 'fib';
        const refLabel = isFib ? 'Suggested Answer' : 'Model Answer';
        const refText = isFib ? x.q.suggested_answer : x.q.model_answer;
        const typeLabel = isFib ? 'Fill in the Blank' : 'Theory';
        return '<div class="grade-q"><div class="q-head">Q' + (x.i + 1) + ' — ' + typeLabel + '. ' + esc(x.q.question) +
          ' <span class="q-marks">Max ' + x.q.max_marks + ' marks</span></div>' +
          '<div class="grade-cols"><div class="grade-col"><h5>Student Answer</h5>' +
          '<div class="answer-box">' + esc(stuAns == null || stuAns === '' ? '(no answer given)' : stuAns) + '</div></div>' +
          '<div class="grade-col"><h5>' + refLabel + '</h5>' +
          '<div class="answer-box">' + esc(refText || '(no ' + refLabel.toLowerCase() + ')') + '</div>' +
          '<label style="margin-top:10px">Marks (0–' + x.q.max_marks + ') ' +
          '<input class="marks-input" type="number" min="0" max="' + x.q.max_marks + '" data-marks-for="' + x.i +
          '" value="' + saved + '"' + (sub.locked ? ' disabled' : '') + '></label></div></div></div>';
      }).join('');
      body.querySelectorAll('[data-marks-for]').forEach((inp) => {
        inp.addEventListener('input', updateGradeTotal);
      });
    }
    hideFormError('grade-form-error');
    $('grade-save').disabled = !!sub.locked;
    $('grade-send').disabled = !!sub.locked;
    updateGradeTotal();
    $('grade-panel').classList.remove('hidden');
    $('grade-panel').scrollIntoView({ behavior: 'smooth' });
  } catch (e) { toast('Could not open submission: ' + e.message, false); }
}

function collectTheoryMarks() {
  const marks = {};
  document.querySelectorAll('[data-marks-for]').forEach((inp) => {
    const v = inp.value === '' ? null : Number(inp.value);
    if (v !== null && !isNaN(v)) marks[inp.getAttribute('data-marks-for')] = v;
  });
  return marks;
}

function updateGradeTotal() {
  if (!S.grading) return;
  const sub = S.grading.submission;
  const marks = collectTheoryMarks();
  let theory = 0;
  Object.keys(marks).forEach((k) => { theory += marks[k]; });
  $('grade-total-text').textContent = (sub.mcq_score + theory) + ' / ' + sub.max_total +
    '  (MCQ ' + sub.mcq_score + ' + Theory / FIB ' + theory + ' of ' + sub.theory_max + ')';
}

async function saveGrades() {
  if (!S.grading) return;
  try {
    const d = await api('/api/submissions/' + S.grading.submission.id + '/grade', {
      method: 'POST', body: { theory_marks: collectTheoryMarks() }
    });
    S.grading.submission = d.submission || S.grading.submission;
    toast('Grades saved. Total: ' + S.grading.submission.total + ' / ' + S.grading.submission.max_total, true);
    loadTeacherQueue();
  } catch (e) { showFormError('grade-form-error', 'Could not save grades: ' + e.message); }
}

async function sendToAdmin() {
  if (!S.grading) return;
  try {
    // Save any marks first, then send.
    await api('/api/submissions/' + S.grading.submission.id + '/grade', {
      method: 'POST', body: { theory_marks: collectTheoryMarks() }
    });
    const d = await api('/api/submissions/' + S.grading.submission.id + '/send', { method: 'POST' });
    S.grading.submission = d.submission || S.grading.submission;
    toast('Result sent to Admin.', true);
    $('grade-panel').classList.add('hidden');
    S.grading = null;
    loadTeacherQueue();
  } catch (e) { showFormError('grade-form-error', 'Could not send: ' + e.message); }
}

async function bulkSendToday() {
  if (!confirm('Send ALL your graded results for today to Admin?')) return;
  try {
    const d = await api('/api/submissions/bulk-send', { method: 'POST', body: { date: todayISO() } });
    toast('Sent ' + (d.sent != null ? d.sent : 'all graded') + ' result(s) to Admin.', true);
    loadTeacherQueue();
  } catch (e) { toast('Bulk send failed: ' + e.message, false); }
}

/* Teacher day sheets (day consolidation, filtered to own students). */
async function loadTeacherDays() {
  const box = $('teacher-days');
  try {
    const d = await api('/api/consolidation');
    const days = d.days || [];
    if (!days.length) { box.innerHTML = '<p class="muted">No consolidation days yet.</p>'; return; }
    box.innerHTML = days.map((dy) =>
      '<button class="btn" type="button" data-tday="' + dy.date + '">' + dy.date + ' (' + dy.count + ' rows)</button>').join('');
    box.querySelectorAll('[data-tday]').forEach((b) => {
      b.addEventListener('click', () => loadTeacherDaySheet(b.getAttribute('data-tday')));
    });
  } catch (e) { box.innerHTML = '<p>Could not load days: ' + esc(e.message) + '</p>'; }
}

async function loadTeacherDaySheet(date) {
  S.teacherDay = date;
  const box = $('teacher-daysheet');
  box.innerHTML = '<p class="muted">Loading...</p>';
  try {
    const d = await api('/api/consolidation/' + date);
    box.innerHTML = '<h4>Day Sheet — ' + date + (d.locked ? ' (Locked)' : '') + '</h4>' +
      consolidationTable(d.master || []);
  } catch (e) { box.innerHTML = '<p>Could not load day sheet: ' + esc(e.message) + '</p>'; }
}

function initTeacher() {
  $('tq-refresh').addEventListener('click', loadTeacherQueue);
  $('tq-date').addEventListener('change', loadTeacherQueue);
  $('tq-status').addEventListener('change', loadTeacherQueue);
  $('tq-bulk-send').addEventListener('click', bulkSendToday);
  $('grade-save').addEventListener('click', saveGrades);
  $('grade-send').addEventListener('click', sendToAdmin);
  $('grade-close').addEventListener('click', () => {
    $('grade-panel').classList.add('hidden');
    S.grading = null;
  });
}


/* Teacher sidebar panels: grading queue / day sheet (teacher-internal only). */
function switchTeacherPanel(panel) {
  document.querySelectorAll('[data-tpanel]').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-tpanel') === panel);
  });
  $('t-panel-queue').classList.toggle('hidden', panel !== 'queue');
  $('t-panel-days').classList.toggle('hidden', panel !== 'days');
}


/* ---------------- Teacher page init ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  initPortal({
    role: 'teacher', roleLabel: 'Teacher', fragment: 'teacher-console.html',
    onReady: async () => {
      initTeacher();
      document.querySelectorAll('[data-tpanel]').forEach((b) => {
        b.addEventListener('click', () => switchTeacherPanel(b.getAttribute('data-tpanel')));
      });
      loadTeacher();
    }
  });
});
