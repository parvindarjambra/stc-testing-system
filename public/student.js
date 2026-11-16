/* =====================================================================
   student.js — Student Exam portal (strict roll validation, no login).
   STC Testing System — Super Sys-Tech Computers Centre, Umerkot.
   Vanilla JS, no frameworks, no external requests.
   ===================================================================== */

'use strict';
/* ---------------- Offline queue (localStorage) ---------------- */
const QUEUE_KEY = 'stc_offline_queue';
function getQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch (e) { return []; }
}
function setQueue(q) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  updateQueueBadge();
}
function updateQueueBadge() {
  const n = getQueue().length;
  const badge = $('queue-badge');
  badge.textContent = n ? (n + ' offline — waiting to sync') : '';
  badge.classList.toggle('hidden', n === 0);
  $('btn-sync-now').classList.toggle('hidden', n === 0);
}

/* Retry the whole queue; remove each payload once the server accepts it. */
async function flushQueue() {
  const q = getQueue();
  if (!q.length) return;
  let remaining = [];
  let synced = 0;
  for (const payload of q) {
    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const d = await res.json().catch(() => null);
      if (res.ok && d && d.ok) { synced++; continue; }
      if (res.status === 400 || res.status === 404) {
        // Deterministic rejection (e.g. roll number no longer registered):
        // retrying can never succeed, so drop it instead of queueing forever.
        continue;
      }
      remaining.push(payload);                       // server error: keep for later
    } catch (e) {
      remaining.push(payload);                       // still offline
      break;                                         // no point trying the rest now
    }
  }
  if (synced) {
    setQueue(remaining);
    toast(synced + ' offline submission(s) synced.', true);
  } else if (remaining.length !== q.length) {
    setQueue(remaining);
  }
}
setInterval(flushQueue, 15000);   // retry every 15 seconds

/* Four-field identity verification (v1.6.0): the student enters Name,
   Father's Name, Course and Roll Number; the server checks them IN ORDER
   against Admin's registered list (student list / CSV import) and names
   the first wrong field, in English. On a full match the registered
   details are shown read-only and the server re-validates the roll
   number on submit. */
function initStudent() {
  const form = $('stu-verify-form');
  const msg = $('stu-verify-msg');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('stu-name').value.trim();
    const father = $('stu-father').value.trim();
    const course = $('stu-course').value.trim();
    const roll = $('stu-roll').value.trim();
    if (!name || !father || !course || !roll) {
      msg.textContent = 'Please fill in all four fields: Name, Father\'s Name, Course and Roll Number.';
      msg.className = 'lookup-msg err';
      return;
    }
    msg.textContent = 'Checking your details...';
    msg.className = 'lookup-msg';
    try {
      const d = await api('/api/students/verify', {
        method: 'POST', noAuth: true,
        body: { name: name, father_name: father, course: course, roll: roll }
      });
      if (!d.verified || !d.student) {
        // The server names the first wrong field, in English.
        msg.textContent = d.error || 'Your details could not be verified.';
        msg.className = 'lookup-msg err';
        return;
      }
      // Registered details are read-only: the server record is the truth.
      const st = d.student;
      S.student = {
        roll_number: st.roll_number,
        name: st.name,
        father_name: st.father_name || '',
        course: st.course,
        shift: st.shift,
        teacher_id: st.teacher_id || null,
        teacher_name: st.teacher_name || ''
      };
      $('stu-details-body').innerHTML =
        '<table><tr><th>Roll Number</th><td>' + esc(S.student.roll_number) + '</td></tr>' +
        '<tr><th>Student Name</th><td>' + esc(S.student.name) + '</td></tr>' +
        '<tr><th>Father\'s Name</th><td>' + esc(S.student.father_name) + '</td></tr>' +
        '<tr><th>Course</th><td>' + esc(S.student.course) + '</td></tr>' +
        '<tr><th>Shift</th><td>' + esc(S.student.shift) + '</td></tr>' +
        '<tr><th>Teacher</th><td>' + esc(S.student.teacher_name || '—') + '</td></tr></table>';
      $('stu-start').classList.add('hidden');
      $('stu-details').classList.remove('hidden');
    } catch (err) {
      msg.textContent = 'Could not verify your details: ' + err.message + ' — please try again.';
      msg.className = 'lookup-msg err';
    }
  });

  $('stu-confirm').addEventListener('click', () => loadTestPicker());
  // No back / change-details control here by design (v1.7.0): once
  // verified, the student can only go forward (Confirm -> test picker
  // -> exam -> submit -> reset for the next student). Details come from
  // Admin's list and cannot be changed at the terminal.

  $('exam-submit').addEventListener('click', () => submitExam(false));
  $('stu-result-done').addEventListener('click', resetStudent);
}

/* Step 2: tests for the student's course. */
async function loadTestPicker() {
  $('stu-start').classList.add('hidden');
  $('stu-details').classList.add('hidden');
  $('stu-tests').classList.remove('hidden');
  $('stu-tests-who').textContent = S.student.name + ' (' + S.student.roll_number + ') — ' + S.student.course + ', ' + S.student.shift;
  const list = $('stu-test-list');
  list.innerHTML = '<p class="muted">Loading tests...</p>';
  try {
    const d = await api('/api/tests?course=' + encodeURIComponent(S.student.course), { noAuth: true });
    const tests = d.tests || [];
    if (!tests.length) {
      list.innerHTML = '<p>No tests found for ' + esc(S.student.course) + '. Please ask your teacher.</p>';
      return;
    }
    list.innerHTML = tests.map((t) => {
      const badge = t.type === 'monthly-test'
        ? '<span class="badge badge-monthly">Monthly Test' + (t.month ? ' — ' + monthName(t.month) : '') + '</span>'
        : '<span class="badge badge-daily">Daily Quiz</span>';
      return '<div class="test-card"><h3>' + esc(testLabel(t)) + '</h3>' + badge +
        '<span class="test-meta">' + esc(t.course) + ' &nbsp;|&nbsp; ' + t.duration_minutes + ' minutes &nbsp;|&nbsp; ' +
        t.question_count + ' questions</span>' +
        '<button class="btn btn-primary" type="button" data-start-test="' + t.id + '">Start Exam</button></div>';
    }).join('');
    list.querySelectorAll('[data-start-test]').forEach((btn) => {
      btn.addEventListener('click', () => startExam(btn.getAttribute('data-start-test')));
    });
  } catch (e) {
    list.innerHTML = '<p>Could not load tests: ' + esc(e.message) + '</p>';
  }
}

/* Step 3: exam screen. Fetched WITHOUT auth so answer keys are stripped. */
async function startExam(testId) {
  try {
    const d = await api('/api/tests/' + testId, { noAuth: true });
    const test = d.test || d;
    if (!test || !test.questions) throw new Error('Test not found.');
    S.test = test;
    S.answers = {};
    S.currentQ = 0;
    $('stu-tests').classList.add('hidden');
    $('stu-exam').classList.remove('hidden');
    $('exam-title').textContent = testLabel(test);
    $('exam-meta').textContent = test.course + ' — ' + (test.type === 'monthly-test' ? 'Monthly Test' : 'Daily Quiz') +
      ' — ' + test.questions.length + ' questions — ' + test.duration_minutes + ' minutes';
    renderQuestions();
    renderPalette();
    startTimer(test.duration_minutes * 60);
    window.scrollTo(0, 0);
  } catch (e) { toast('Could not start exam: ' + e.message, false); }
}

function renderQuestions() {
  const box = $('exam-questions');
  box.innerHTML = S.test.questions.map((q, i) => {
    let body = '';
    if (q.type === 'mcq') {
      body = (q.options || []).map((opt, oi) =>
        '<label class="opt"><input type="radio" name="q' + i + '" value="' + oi + '"> <span>' + esc(opt) + '</span></label>'
      ).join('');
    } else if (q.type === 'fib') {
      // Fill in the blank: a short text input for the missing word(s).
      // Teacher-graded (like theory) — never auto-graded.
      body = '<input type="text" name="q' + i + '" placeholder="Type the missing word(s)..." autocomplete="off">';
    } else {
      body = '<textarea name="q' + i + '" rows="4" placeholder="Write your answer here..."></textarea>';
    }
    const marks = q.type === 'mcq' ? (q.marks || 1) : (q.max_marks || 0);
    return '<div class="question-block" id="qb-' + i + '" data-q="' + i + '">' +
      '<div class="q-head"><span class="q-marks">' + marks + ' mark' + (marks === 1 ? '' : 's') + '</span>' +
      'Q' + (i + 1) + '. ' + esc(q.question) + '</div>' + body + '</div>';
  }).join('');

  box.querySelectorAll('input[type="radio"]').forEach((r) => {
    r.addEventListener('change', () => {
      const i = parseInt(r.name.slice(1), 10);
      S.answers[i] = parseInt(r.value, 10);
      setCurrentQ(i);
      renderPalette();
    });
  });
  box.querySelectorAll('textarea').forEach((ta) => {
    ta.addEventListener('input', () => {
      const i = parseInt(ta.name.slice(1), 10);
      const v = ta.value.trim();
      if (v) S.answers[i] = ta.value;
      else delete S.answers[i];
      setCurrentQ(i);
      renderPalette();
    });
  });
  // Fill-in-the-blank text inputs (same handling as theory textareas).
  box.querySelectorAll('.question-block input[type="text"]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const i = parseInt(inp.name.slice(1), 10);
      const v = inp.value.trim();
      if (v) S.answers[i] = inp.value;
      else delete S.answers[i];
      setCurrentQ(i);
      renderPalette();
    });
  });
  box.querySelectorAll('.question-block').forEach((el) => {
    el.addEventListener('click', () => setCurrentQ(parseInt(el.getAttribute('data-q'), 10)));
  });
  setCurrentQ(0);
}

function isAnswered(i) {
  const a = S.answers[i];
  return a !== undefined && a !== null && String(a).trim() !== '';
}

function renderPalette() {
  const pal = $('exam-palette');
  pal.innerHTML = S.test.questions.map((q, i) =>
    '<button type="button" class="pal-dot' + (isAnswered(i) ? ' answered' : '') + (i === S.currentQ ? ' current' : '') +
    '" data-pal="' + i + '">' + (i + 1) + '</button>').join('') +
    '<span class="muted" style="align-self:center;margin-left:8px">Green = answered. Click a number to jump.</span>';
  pal.querySelectorAll('[data-pal]').forEach((b) => {
    b.addEventListener('click', () => {
      const i = parseInt(b.getAttribute('data-pal'), 10);
      setCurrentQ(i);
      const el = $('qb-' + i);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      renderPalette();
    });
  });
}

function setCurrentQ(i) {
  S.currentQ = i;
  document.querySelectorAll('.question-block').forEach((el) => {
    el.classList.toggle('current', parseInt(el.getAttribute('data-q'), 10) === i);
  });
  document.querySelectorAll('.pal-dot').forEach((el) => {
    el.classList.toggle('current', parseInt(el.getAttribute('data-pal'), 10) === i);
  });
}

/* Countdown timer — auto-submits at zero. */
function startTimer(totalSeconds) {
  stopTimer();
  S.endsAt = Date.now() + totalSeconds * 1000;
  const tick = () => {
    const left = Math.max(0, Math.round((S.endsAt - Date.now()) / 1000));
    const mm = String(Math.floor(left / 60)).padStart(2, '0');
    const ss = String(left % 60).padStart(2, '0');
    const el = $('exam-timer');
    el.textContent = mm + ':' + ss;
    el.classList.toggle('danger', left <= 300 && left > 0);
    if (left <= 0) { stopTimer(); submitExam(true); }
  };
  tick();
  S.timerId = setInterval(tick, 1000);
}
function stopTimer() {
  if (S.timerId) { clearInterval(S.timerId); S.timerId = null; }
}

function buildSubmissionPayload() {
  const answers = S.test.questions.map((q, i) => ({
    q: i,
    answer: isAnswered(i) ? S.answers[i] : (q.type === 'mcq' ? null : '')
  }));
  return {
    client_id: 'c-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    student: S.student,
    test_id: S.test.id,
    answers: answers
  };
}

async function submitExam(auto) {
  if (!S.test) return;
  if (!auto && !confirm('Submit your answers now? You cannot change them after submit.')) return;
  stopTimer();
  $('exam-submit').disabled = true;
  const payload = buildSubmissionPayload();
  try {
    const res = await fetch('/api/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const d = await res.json().catch(() => null);
    if (!res.ok || !d || !d.ok) throw new Error((d && d.error) || ('Submit failed (' + res.status + ')'));
    showResult(d.submission, false);
  } catch (e) {
    // Offline (or server unreachable): queue it and sync later.
    const q = getQueue();
    q.push(payload);
    setQueue(q);
    showResult(null, true);
  }
}

/* Result summary, then IMMEDIATE session clear per contract. */
function showResult(sub, offline) {
  $('stu-exam').classList.add('hidden');
  $('stu-result').classList.remove('hidden');
  const body = $('stu-result-body');
  if (offline) {
    body.innerHTML = '<p><strong>Saved offline — will sync automatically.</strong></p>' +
      '<p>Your answers are stored on this laptop and will be sent to the server as soon as the network returns. ' +
      'Your teacher will see the result after sync.</p>';
  } else {
    body.innerHTML = '<table><tr><th>Test</th><td>' + esc(testLabel(S.test)) + '</td></tr>' +
      '<tr><th>Student</th><td>' + esc(S.student.name) + ' (' + esc(S.student.roll_number) + ')</td></tr>' +
      '<tr><th>MCQ Score</th><td><strong>' + sub.mcq_score + ' / ' + sub.mcq_max + '</strong></td></tr>' +
      (sub.theory_max > 0
        ? '<tr><th>Theory / Fill in the Blank</th><td>Pending teacher grading (max ' + sub.theory_max + ' marks)</td></tr>'
        : '') +
      '<tr><th>Total so far</th><td><strong>' + sub.total + ' / ' + sub.max_total + '</strong></td></tr></table>' +
      (sub.theory_max > 0 ? '<p class="muted">Theory and fill-in-the-blank answers are graded by your teacher. The final total will appear after grading.</p>' : '');
  }
  // Clear the session immediately so the next student starts blank.
  sessionStorage.clear();
  S.token = null; S.user = null;
  S.test = null; S.answers = {}; S.student = null;
}

function resetStudent() {
  $('stu-result').classList.add('hidden');
  $('stu-tests').classList.add('hidden');
  $('stu-exam').classList.add('hidden');
  $('stu-details').classList.add('hidden');
  $('stu-name').value = '';
  $('stu-father').value = '';
  $('stu-course').value = '';
  $('stu-roll').value = '';
  $('stu-verify-msg').textContent = '';
  $('stu-verify-msg').className = 'lookup-msg';
  $('stu-details-body').innerHTML = '';
  $('exam-submit').disabled = false;
  S.student = null; S.test = null; S.answers = {};
  $('stu-start').classList.remove('hidden');
  $('stu-name').focus();
  window.scrollTo(0, 0);
}


/* ---------------- Student page init ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  initStudent();
  initStaffMenu();
  initTerminalVersion();
  $('btn-sync-now').addEventListener('click', () => flushQueue());
  updateQueueBadge();
  flushQueue();   // try to sync any queued submissions right away
});

/* Staff / Faculty Login dropdown (terminal header, top-right). The only
   staff entry point on this page: Teacher, Admin, Principal. */
function initStaffMenu() {
  const btn = $('staff-menu-btn');
  const menu = $('staff-menu-list');
  if (!btn || !menu) return;
  const close = () => {
    menu.classList.add('hidden');
    btn.setAttribute('aria-expanded', 'false');
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = menu.classList.toggle('hidden');
    btn.setAttribute('aria-expanded', String(!isHidden));
  });
  document.addEventListener('click', (e) => {
    if (!menu.classList.contains('hidden') && !menu.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

/* Tiny footer version line, filled from the server health endpoint. */
function initTerminalVersion() {
  const el = $('terminal-version');
  if (!el) return;
  fetch('/api/health')
    .then((r) => r.json())
    .then((h) => { el.textContent = 'STC Testing System v' + (h.version || ''); })
    .catch(() => { /* leave the static fallback text */ });
}
