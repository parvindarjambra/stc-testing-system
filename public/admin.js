/* =====================================================================
   admin.js — Admin / Exam Controller portal console.
   STC Testing System — Super Sys-Tech Computers Centre, Umerkot.
   Vanilla JS, no frameworks, no external requests.
   ===================================================================== */

'use strict';
function loadAdmin() {
  $('admin-welcome').textContent = 'Welcome, ' + S.user.name + ' — Academic Administrator / Exam Controller';
  $('dash-date').value = todayISO();
  $('res-date').value = todayISO();
  $('con-date').value = todayISO();
  $('mr-month').value = currentMonth();
  switchAdminTab('dashboard');
}

function switchAdminTab(tab) {
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.getAttribute('data-tab') === tab);
  });
  document.querySelectorAll('.tab-panel').forEach((p) => {
    p.classList.toggle('hidden', p.id !== 'tab-' + tab);
  });
  if (tab === 'dashboard') loadDashboard();
  if (tab === 'courses') loadCourses();
  if (tab === 'students') { fillStudentFilters(); loadStudents(); }
  if (tab === 'tests') { fillTestBuilderSelects(); loadTests(); }
  if (tab === 'results') loadResultsReview();
  if (tab === 'feedback') fillFeedbackFilters();
  if (tab === 'monthly') loadMonthlyReport('admin');
  if (tab === 'consolidation') loadConsolidationDays();
  if (tab === 'teachers') { fillTeacherCourseChecks(); loadTeachersAdmin(); }
}

/* ----- Dashboard: live shift monitor ----- */
async function loadDashboard() {
  const date = $('dash-date').value || todayISO();
  try {
    const d = await api('/api/analytics/day?date=' + date);
    const t = d.totals || {};
    $('dash-totals').innerHTML =
      statBox('Total', t.total != null ? t.total : (d.perShift || []).reduce((a, s) => a + (s.total || 0), 0)) +
      statBox('Submitted', t.submitted != null ? t.submitted : '') +
      statBox('Graded', t.graded != null ? t.graded : '') +
      statBox('Sent to Admin', t.sent != null ? t.sent : '') +
      statBox('Pending Grading', t.pending != null ? t.pending : pendingCount(d));
    $('dash-shifts').innerHTML = shiftTable(d.perShift || []);
    $('dash-courses').innerHTML = courseCountTable(d.perCourse || []);
    $('dash-teachers').innerHTML = teacherDayTable(d.perTeacher || []);
  } catch (e) { toast('Dashboard failed: ' + e.message, false); }
}
/* ----- Courses CRUD ----- */
async function loadCourses() {
  try {
    const d = await api('/api/courses');
    S.courses = d.courses || [];
    const box = $('course-list');
    if (!S.courses.length) { box.innerHTML = '<p>No courses yet.</p>'; return; }
    let html = '<table><tr><th>Course</th><th></th></tr>';
    S.courses.forEach((c) => {
      html += '<tr><td>' + esc(c.name) + '</td><td>' +
        '<button class="btn btn-small" type="button" data-course-edit="' + c.id + '">Rename</button> ' +
        '<button class="btn btn-small btn-danger" type="button" data-course-del="' + c.id + '">Delete</button></td></tr>';
    });
    box.innerHTML = html + '</table>';
    box.querySelectorAll('[data-course-edit]').forEach((b) => {
      b.addEventListener('click', () => {
        const c = S.courses.find((x) => String(x.id) === b.getAttribute('data-course-edit'));
        S.editingCourseId = c.id;
        $('course-name').value = c.name;
        $('course-submit').textContent = 'Save Rename';
        $('course-cancel').classList.remove('hidden');
        $('course-name').focus();
      });
    });
    box.querySelectorAll('[data-course-del]').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!confirm('Delete this course? Students and tests using it will be affected.')) return;
        try {
          await api('/api/courses/' + b.getAttribute('data-course-del'), { method: 'DELETE' });
          toast('Course deleted.', true);
          loadCourses(); loadReference();
        } catch (e) { toast('Delete failed: ' + e.message, false); }
      });
    });
  } catch (e) { toast('Could not load courses: ' + e.message, false); }
}

async function saveCourse(e) {
  e.preventDefault();
  hideFormError('course-form-error');
  const name = $('course-name').value.trim();
  if (!name) return;
  try {
    if (S.editingCourseId) {
      await api('/api/courses/' + S.editingCourseId, { method: 'PUT', body: { name: name } });
      toast('Course renamed.', true);
    } else {
      await api('/api/courses', { method: 'POST', body: { name: name } });
      toast('Course added.', true);
    }
    S.editingCourseId = null;
    $('course-form').reset();
    $('course-submit').textContent = 'Add Course';
    $('course-cancel').classList.add('hidden');
    loadCourses(); loadReference();
  } catch (err) { showFormError('course-form-error', 'Save failed: ' + err.message); }
}

/* ----- Students: list / add / edit / delete / CSV import ----- */
function fillStudentFilters() {
  $('st-course-filter').innerHTML = '<option value="">All courses</option>' +
    S.courses.map((c) => '<option value="' + esc(c.name) + '">' + esc(c.name) + '</option>').join('');
  $('st-shift-filter').innerHTML = '<option value="">All shifts</option>' +
    S.shifts.map((s) => '<option value="' + esc(s.label) + '">' + esc(s.label) + '</option>').join('');
  $('st-course').innerHTML = courseOptions('');
  $('st-shift').innerHTML = shiftOptions('');
  $('st-teacher').innerHTML = teacherOptions('', null);
  $('st-course').onchange = () => {
    $('st-teacher').innerHTML = teacherOptions($('st-course').value, null);
    $('st-teacher-note').textContent = teacherFallbackNote($('st-course').value);
  };
}

async function loadStudents() {
  const box = $('student-list');
  box.innerHTML = '<p class="muted">Loading...</p>';
  const params = new URLSearchParams();
  if ($('st-search').value.trim()) params.set('search', $('st-search').value.trim());
  if ($('st-course-filter').value) params.set('course', $('st-course-filter').value);
  if ($('st-shift-filter').value) params.set('shift', $('st-shift-filter').value);
  try {
    const d = await api('/api/students?' + params.toString());
    const list = d.students || [];
    if (!list.length) { box.innerHTML = '<p>No students found.</p>'; return; }
    let html = '<table><tr><th>Roll No</th><th>Name</th><th>Father\'s Name</th><th>Course</th>' +
      '<th>Shift</th><th>Teacher</th><th></th></tr>';
    list.forEach((s) => {
      html += '<tr><td>' + esc(s.roll_number) + '</td><td>' + esc(s.name) + '</td><td>' + esc(s.father_name) +
        '</td><td>' + pillCourse(s.course) + '</td><td>' + pillShift(s.shift) + '</td><td>' + pillTeacher(s.teacher_name || '') +
        '</td><td><button class="btn btn-small" type="button" data-st-edit="' + s.id + '">Edit</button> ' +
        '<button class="btn btn-small btn-danger" type="button" data-st-del="' + s.id + '">Delete</button></td></tr>';
    });
    box.innerHTML = html + '</table>';
    box.querySelectorAll('[data-st-edit]').forEach((b) => {
      b.addEventListener('click', () => {
        const s = list.find((x) => String(x.id) === b.getAttribute('data-st-edit'));
        openStudentForm(s);
      });
    });
    box.querySelectorAll('[data-st-del]').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!confirm('Delete this student?')) return;
        try {
          await api('/api/students/' + b.getAttribute('data-st-del'), { method: 'DELETE' });
          toast('Student deleted.', true);
          loadStudents();
        } catch (err) { toast('Delete failed: ' + err.message, false); }
      });
    });
  } catch (e) { box.innerHTML = '<p>Could not load students: ' + esc(e.message) + '</p>'; }
}

function openStudentForm(s) {
  S.editingStudentId = s ? s.id : null;
  $('student-form-title').textContent = s ? 'Edit Student' : 'Add Student';
  $('st-roll').value = s ? s.roll_number : '';
  $('st-name').value = s ? s.name : '';
  $('st-father').value = s ? s.father_name : '';
  $('st-course').value = s ? s.course : '';
  $('st-shift').value = s ? s.shift : '';
  $('st-teacher').innerHTML = teacherOptions(s ? s.course : '', s ? s.teacher_id : null);
  $('st-teacher-note').textContent = teacherFallbackNote(s ? s.course : '');
  hideFormError('st-form-error');
  $('student-form-card').classList.remove('hidden');
  $('student-form-card').scrollIntoView({ behavior: 'smooth' });
}

async function saveStudent(e) {
  e.preventDefault();
  hideFormError('st-form-error');
  const teacherId = $('st-teacher').value;
  const body = {
    roll_number: $('st-roll').value.trim(),
    name: $('st-name').value.trim(),
    father_name: $('st-father').value.trim(),
    course: $('st-course').value,
    shift: $('st-shift').value,
    teacher_id: teacherId ? (isNaN(Number(teacherId)) ? teacherId : Number(teacherId)) : null
  };
  try {
    if (S.editingStudentId) {
      await api('/api/students/' + S.editingStudentId, { method: 'PUT', body: body });
      toast('Student updated.', true);
    } else {
      await api('/api/students', { method: 'POST', body: body });
      toast('Student added.', true);
    }
    $('student-form-card').classList.add('hidden');
    $('student-form').reset();
    S.editingStudentId = null;
    loadStudents();
  } catch (err) { showFormError('st-form-error', 'Save failed: ' + err.message); }
}

function importStudentsCsv() {
  const file = $('st-csv-file').files[0];
  if (!file) { toast('Choose a .csv file first.', false); return; }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const d = await api('/api/students/import', { method: 'POST', body: { csv: String(reader.result) } });
      let html = '<p><strong>Imported:</strong> ' + d.imported + ' &nbsp; <strong>Skipped:</strong> ' + d.skipped + '</p>';
      if (d.errors && d.errors.length) {
        html += '<p class="err">Errors:</p><ul>' + d.errors.map((er) =>
          '<li class="err">Row ' + er.row + ': ' + esc(er.error) + '</li>').join('') + '</ul>';
      }
      $('st-csv-result').innerHTML = html;
      toast('Import done: ' + d.imported + ' imported, ' + d.skipped + ' skipped.', true);
      loadStudents();
    } catch (err) { toast('Import failed: ' + err.message, false); }
  };
  reader.readAsText(file);
}

/* ----- Test Builder ----- */
function fillTestBuilderSelects() {
  $('tb-course').innerHTML = courseOptions('');
  $('tb-filter-course').innerHTML = '<option value="">All courses</option>' +
    S.courses.map((c) => '<option value="' + esc(c.name) + '">' + esc(c.name) + '</option>').join('');
}

/* Show the Month picker only for monthly tests. */
function syncMonthPicker() {
  const isMonthly = $('tb-type').value === 'monthly-test';
  $('tb-month-wrap').classList.toggle('hidden', !isMonthly);
  $('tb-month').required = isMonthly;
  if (!isMonthly) $('tb-month').value = '';
}

function newMcq() {
  return { type: 'mcq', question: '', options: ['', '', '', ''], correct: 0, marks: 1 };
}
function newFib() {
  return { type: 'fib', question: '', suggested_answer: '', max_marks: 2 };
}
function newTheory() {
  return { type: 'theory', question: '', max_marks: 5, model_answer: '' };
}
function questionTypeLabel(type) {
  if (type === 'mcq') return 'MCQ';
  if (type === 'fib') return 'Fill in the Blank';
  return 'Theory';
}

function renderBuilderQuestions() {
  const box = $('tb-questions');
  if (!S.builderQuestions.length) {
    box.innerHTML = '<p class="muted">No questions yet. Add an MCQ, a Fill in the Blank, or a Theory question.</p>';
    return;
  }
  box.innerHTML = S.builderQuestions.map((q, i) => {
    let inner = '<h5>Q' + (i + 1) + ' — ' + questionTypeLabel(q.type) + '</h5>' +
      '<label>Question' + (q.type === 'fib' ? ' (use ___ for the blank)' : '') +
      ' <textarea data-bq="' + i + '" data-field="question" rows="2">' + esc(q.question) + '</textarea></label>';
    if (q.type === 'mcq') {
      inner += '<div class="qb-opts">' + q.options.map((opt, oi) =>
        '<label>Option ' + (oi + 1) + ' <input type="text" data-bq="' + i + '" data-field="option" data-opt="' + oi +
        '" value="' + esc(opt) + '"></label>').join('') + '</div>' +
        '<div class="qb-row"><label>Correct answer <select data-bq="' + i + '" data-field="correct">' +
        q.options.map((o, oi) => '<option value="' + oi + '"' + (q.correct === oi ? ' selected' : '') + '>Option ' + (oi + 1) + '</option>').join('') +
        '</select></label><label>Marks <input type="number" min="1" data-bq="' + i + '" data-field="marks" value="' + q.marks + '"></label></div>';
    } else if (q.type === 'fib') {
      // Fill in the blank (v1.9.0): the correct answer IS the auto-check key —
      // a matching student answer scores full marks automatically (case does
      // not matter). Leave it blank and the question stays teacher-graded.
      inner += '<div class="qb-row"><label>Max marks <input type="number" min="1" data-bq="' + i + '" data-field="max_marks" value="' + q.max_marks + '"></label></div>' +
        '<label>Correct answer (auto-checked — leave blank for teacher grading) ' +
        '<input type="text" data-bq="' + i + '" data-field="suggested_answer" value="' + esc(q.suggested_answer || '') + '" placeholder="e.g. Islamabad"></label>';
    } else {
      // Theory (v1.10.1): ALWAYS teacher-graded — the model answer is
      // shown to the teacher while grading. (v1.9.0 keyword auto-grading
      // removed by user decision; stored key words are ignored.)
      inner += '<div class="qb-row"><label>Max marks <input type="number" min="1" data-bq="' + i + '" data-field="max_marks" value="' + q.max_marks + '"></label></div>' +
        '<label>Model answer <textarea data-bq="' + i + '" data-field="model_answer" rows="3">' + esc(q.model_answer) + '</textarea></label>';
    }
    inner += '<button class="btn btn-small btn-danger" type="button" data-bq-del="' + i + '">Remove question</button>';
    return '<div class="qb-card">' + inner + '</div>';
  }).join('');

  box.querySelectorAll('[data-bq]').forEach((el) => {
    el.addEventListener('input', () => { syncBuilderField(el); clearBuilderCardError(el); });
    el.addEventListener('change', () => { syncBuilderField(el); clearBuilderCardError(el); });
  });
  box.querySelectorAll('[data-bq-del]').forEach((b) => {
    b.addEventListener('click', () => {
      S.builderQuestions.splice(parseInt(b.getAttribute('data-bq-del'), 10), 1);
      renderBuilderQuestions();
    });
  });
}

function syncBuilderField(el) {
  const i = parseInt(el.getAttribute('data-bq'), 10);
  const field = el.getAttribute('data-field');
  const q = S.builderQuestions[i];
  if (!q) return;
  if (field === 'option') q.options[parseInt(el.getAttribute('data-opt'), 10)] = el.value;
  else if (field === 'correct') q.correct = parseInt(el.value, 10);
  else if (field === 'marks' || field === 'max_marks') q[field] = Math.max(1, parseInt(el.value, 10) || 1);
  else q[field] = el.value;
}

/* Inline builder errors (v1.7.0): the error shows UNDER the offending
   question card (red border + red message) and scrolls it into view, so
   an Admin scrolled down the Questions list sees it at once. Form-level
   errors (title/course/duration/month, no questions) show in the
   #tb-form-error slot above the Save button, also scrolled into view.
   The top toast still shows too — the inline error is the one that
   matters. Validation rules are unchanged; only where errors appear. */
function clearBuilderErrors() {
  document.querySelectorAll('#tb-questions .qb-error').forEach((el) => el.remove());
  document.querySelectorAll('#tb-questions .qb-card.has-error').forEach((el) => el.classList.remove('has-error'));
  hideFormError('tb-form-error');
}
function clearBuilderCardError(el) {
  const card = el.closest('.qb-card');
  if (!card) return;
  card.classList.remove('has-error');
  const err = card.querySelector('.qb-error');
  if (err) err.remove();
}
function showBuilderQuestionError(index, msg) {
  clearBuilderErrors();
  const cards = document.querySelectorAll('#tb-questions .qb-card');
  const card = cards[index];
  if (card) {
    card.classList.add('has-error');
    const p = document.createElement('p');
    p.className = 'qb-error';
    p.textContent = msg;
    card.appendChild(p);
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  toast(msg, false);
}
function showBuilderFormError(msg) {
  clearBuilderErrors();
  showFormError('tb-form-error', msg);
}

function resetTestBuilder() {
  S.editingTestId = null;
  S.builderQuestions = [];
  $('test-builder-title').textContent = 'Create Test';
  $('tb-title').value = '';
  $('tb-course').value = '';
  $('tb-type').value = 'daily-quiz';
  $('tb-month').value = '';
  $('tb-duration').value = 30;
  $('tb-randomize').checked = true;
  $('tb-cancel').classList.add('hidden');
  clearBuilderErrors();
  syncMonthPicker();
  renderBuilderQuestions();
}

async function saveTest() {
  const title = $('tb-title').value.trim();
  const course = $('tb-course').value;
  const type = $('tb-type').value;
  const month = $('tb-month').value;
  const duration = parseInt($('tb-duration').value, 10);
  if (!title || !course || !duration || duration < 1) { showBuilderFormError('Fill in title, course and duration.'); return; }
  if (type === 'monthly-test' && !/^\d{4}-\d{2}$/.test(month)) {
    showBuilderFormError('Monthly tests need a Month (YYYY-MM).'); return;
  }
  if (!S.builderQuestions.length) { showBuilderFormError('Add at least one question.'); return; }
  for (let i = 0; i < S.builderQuestions.length; i++) {
    const q = S.builderQuestions[i];
    if (!q.question.trim()) { showBuilderQuestionError(i, 'Question ' + (i + 1) + ' has no text.'); return; }
    if (q.type === 'mcq' && q.options.some((o) => !String(o).trim())) {
      showBuilderQuestionError(i, 'Question ' + (i + 1) + ': fill in all 4 options.'); return;
    }
    if (q.type === 'fib' && q.question.indexOf('___') === -1) {
      showBuilderQuestionError(i, 'Question ' + (i + 1) + ': a fill-in-the-blank question needs ___ for the blank.'); return;
    }
  }
  const body = {
    title: title, course: course, type: type,
    month: type === 'monthly-test' ? month : null,
    duration_minutes: duration,
    randomize: $('tb-randomize').checked ? 1 : 0,
    questions: S.builderQuestions
  };
  try {
    if (S.editingTestId) {
      await api('/api/tests/' + S.editingTestId, { method: 'PUT', body: body });
      toast('Test updated.', true);
    } else {
      await api('/api/tests', { method: 'POST', body: body });
      toast('Test created.', true);
    }
    resetTestBuilder();
    loadTests();
  } catch (e) { showBuilderFormError('Save failed: ' + e.message); }
}

async function loadTests() {
  const box = $('test-list');
  box.innerHTML = '<p class="muted">Loading...</p>';
  const params = new URLSearchParams();
  if ($('tb-filter-course').value) params.set('course', $('tb-filter-course').value);
  if ($('tb-filter-type').value) params.set('type', $('tb-filter-type').value);
  try {
    const d = await api('/api/tests?' + params.toString());
    const tests = d.tests || [];
    if (!tests.length) { box.innerHTML = '<p>No tests found.</p>'; return; }
    let html = '<table><tr><th>Title</th><th>Course</th><th>Type</th><th>Month</th><th>Duration</th><th>Questions</th><th></th></tr>';
    tests.forEach((t) => {
      html += '<tr><td>' + esc(testLabel(t)) + '</td><td>' + pillCourse(t.course) + '</td><td>' +
        (t.type === 'monthly-test' ? '<span class="badge badge-monthly">Monthly Test</span>' : '<span class="badge badge-daily">Daily Quiz</span>') + '</td><td>' +
        (t.month ? monthName(t.month) : '—') + '</td><td>' + t.duration_minutes + ' min</td><td>' +
        t.question_count + '</td><td>' +
        '<button class="btn btn-small" type="button" data-test-edit="' + t.id + '">Edit</button> ' +
        '<button class="btn btn-small btn-danger" type="button" data-test-del="' + t.id + '">Delete</button></td></tr>';
    });
    box.innerHTML = html + '</table>';
    box.querySelectorAll('[data-test-edit]').forEach((b) => {
      b.addEventListener('click', () => editTest(b.getAttribute('data-test-edit')));
    });
    box.querySelectorAll('[data-test-del]').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!confirm('Delete this test?')) return;
        try {
          await api('/api/tests/' + b.getAttribute('data-test-del'), { method: 'DELETE' });
          toast('Test deleted.', true);
          loadTests();
        } catch (err) { toast('Delete failed: ' + err.message, false); }
      });
    });
  } catch (e) { box.innerHTML = '<p>Could not load tests: ' + esc(e.message) + '</p>'; }
}

async function editTest(testId) {
  try {
    const d = await api('/api/tests/' + testId);   // authed: full questions incl. answers
    const t = d.test || d;
    S.editingTestId = t.id;
    S.builderQuestions = JSON.parse(JSON.stringify(t.questions || []));
    $('test-builder-title').textContent = 'Edit Test';
    $('tb-title').value = t.title;
    $('tb-course').value = t.course;
    $('tb-type').value = t.type;
    $('tb-month').value = t.month || '';
    $('tb-duration').value = t.duration_minutes;
    $('tb-randomize').checked = !!t.randomize;
    $('tb-cancel').classList.remove('hidden');
    syncMonthPicker();
    renderBuilderQuestions();
    window.scrollTo(0, 0);
  } catch (e) { toast('Could not load test: ' + e.message, false); }
}

/* ----- Results review (finalize) ----- */
async function loadResultsReview() {
  const box = $('results-list');
  box.innerHTML = '<p class="muted">Loading...</p>';
  const params = new URLSearchParams({ status: 'sent_to_admin' });
  if ($('res-date').value) params.set('date', $('res-date').value);
  try {
    const d = await api('/api/submissions?' + params.toString());
    const subs = d.submissions || [];
    if (!subs.length) { box.innerHTML = '<p>No results waiting for finalization.</p>'; return; }
    let html = '<table><tr><th>Roll No</th><th>Name</th><th>Course</th><th>Shift</th><th>Test</th>' +
      '<th>MCQ</th><th>Theory / FIB</th><th>Total</th><th>Date</th><th></th></tr>';
    subs.forEach((s) => {
      const theory = Object.keys(s.theory_marks || {}).reduce((a, k) => a + (s.theory_marks[k] || 0), 0);
      // v1.9.0/v1.10.1: a small 'Auto' tag when any FIB mark was auto-graded,
      // so Admin can judge the auto-grading quality at a glance.
      const autoTag = (s.auto_marks && Object.keys(s.auto_marks).length)
        ? ' <span class="badge badge-auto">Auto</span>' : '';
      html += '<tr><td>' + esc(s.student_roll) + '</td><td>' + esc(s.student_name) + '</td><td>' + pillCourse(s.course) +
        '</td><td>' + pillShift(s.shift) + '</td><td>' + esc(s.test_title) + '</td><td>' + s.mcq_score + ' / ' + s.mcq_max +
        '</td><td>' + theory + ' / ' + s.theory_max + autoTag + '</td><td><strong>' + s.total + ' / ' + s.max_total +
        '</strong></td><td>' + fmtDate(s.date) + '</td><td>' +
        '<button class="btn btn-small btn-emerald" type="button" data-finalize="' + s.id + '">Finalize</button></td></tr>';
    });
    box.innerHTML = html + '</table>';
    box.querySelectorAll('[data-finalize]').forEach((b) => {
      b.addEventListener('click', async () => {
        try {
          await api('/api/submissions/' + b.getAttribute('data-finalize') + '/finalize', { method: 'POST' });
          toast('Result finalized.', true);
          loadResultsReview();
        } catch (err) { toast('Finalize failed: ' + err.message, false); }
      });
    });
  } catch (e) { box.innerHTML = '<p>Could not load results: ' + esc(e.message) + '</p>'; }
}

/* ----- Consolidation ----- */
async function runConsolidation() {
  const date = $('con-date').value || todayISO();
  if (!confirm('Run end-of-day consolidation for ' + date + '? Submissions for that day will be locked.')) return;
  $('con-run-result').textContent = 'Running...';
  try {
    const d = await api('/api/consolidation/run', { method: 'POST', body: { date: date } });
    $('con-run-result').textContent = 'Done: ' + d.rows + ' row(s) compiled for ' + d.date + '. Sheet is locked.';
    toast('Consolidation done: ' + d.rows + ' rows for ' + d.date + '.', true);
    loadConsolidationDays();
  } catch (e) {
    $('con-run-result').textContent = '';
    toast('Consolidation failed: ' + e.message, false);
  }
}

async function loadConsolidationDays() {
  const box = $('con-days');
  try {
    const d = await api('/api/consolidation');
    const days = d.days || [];
    if (!days.length) { box.innerHTML = '<p class="muted">No consolidation days yet.</p>'; return; }
    box.innerHTML = days.map((dy) =>
      '<button class="btn" type="button" data-cday="' + dy.date + '">' + dy.date + ' (' + dy.count + ' rows)</button>').join('');
    box.querySelectorAll('[data-cday]').forEach((b) => {
      b.addEventListener('click', () => loadConsolidationDay(b.getAttribute('data-cday')));
    });
  } catch (e) { box.innerHTML = '<p>Could not load history: ' + esc(e.message) + '</p>'; }
}

async function loadConsolidationDay(date) {
  S.conDay = date;
  const box = $('con-day-view');
  box.innerHTML = '<p class="muted">Loading...</p>';
  try {
    const d = await api('/api/consolidation/' + date);
    S.conRows = d.master || [];
    box.innerHTML = '<h4>Day Sheet — ' + date + (d.locked ? ' (Locked)' : '') + '</h4>' +
      consolidationTable(S.conRows);
    $('con-export').classList.remove('hidden');
    $('con-print').classList.remove('hidden');
  } catch (e) { box.innerHTML = '<p>Could not load day sheet: ' + esc(e.message) + '</p>'; }
}

/* ----- Teachers management ----- */
function fillTeacherCourseChecks() {
  $('tc-courses').innerHTML = S.courses.map((c) =>
    '<label><input type="checkbox" value="' + esc(c.name) + '"> ' + esc(c.name) + '</label>').join('');
}

async function loadTeachersAdmin() {
  const box = $('teacher-list');
  box.innerHTML = '<p class="muted">Loading...</p>';
  try {
    const d = await api('/api/users?role=teacher');
    const list = d.users || d.teachers || [];
    if (!list.length) { box.innerHTML = '<p>No teachers found.</p>'; return; }
    let html = '<table><tr><th>Username</th><th>Name</th><th>Courses</th><th></th></tr>';
    list.forEach((u) => {
      html += '<tr><td>' + esc(u.username) + '</td><td>' + esc(u.name) + '</td><td>' +
        (u.courses || []).map((c) => pillCourse(c)).join(' ') + '</td><td>' +
        '<button class="btn btn-small" type="button" data-user-edit="' + u.id + '">Edit</button> ' +
        '<button class="btn btn-small btn-danger" type="button" data-user-del="' + u.id + '">Delete</button></td></tr>';
    });
    box.innerHTML = html + '</table>';
    box.querySelectorAll('[data-user-edit]').forEach((b) => {
      b.addEventListener('click', () => {
        const u = list.find((x) => String(x.id) === b.getAttribute('data-user-edit'));
        openTeacherForm(u);
      });
    });
    box.querySelectorAll('[data-user-del]').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!confirm('Delete this teacher?')) return;
        try {
          await api('/api/users/' + b.getAttribute('data-user-del'), { method: 'DELETE' });
          toast('Teacher deleted.', true);
          loadTeachersAdmin(); loadReference();
        } catch (err) { toast('Delete failed: ' + err.message, false); }
      });
    });
  } catch (e) { box.innerHTML = '<p>Could not load teachers: ' + esc(e.message) + '</p>'; }
}

function importTeachersCsv() {
  const file = $('tc-csv-file').files[0];
  if (!file) { toast('Choose a .csv file first.', false); return; }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const d = await api('/api/users/import', { method: 'POST', body: { csv: String(reader.result) } });
      let html = '<p><strong>Imported:</strong> ' + d.imported + ' &nbsp; <strong>Skipped:</strong> ' + d.skipped + '</p>';
      if (d.errors && d.errors.length) {
        html += '<p class="err">Errors:</p><ul>' + d.errors.map((er) =>
          '<li class="err">Row ' + er.row + ': ' + esc(er.error) + '</li>').join('') + '</ul>';
      }
      $('tc-csv-result').innerHTML = html;
      toast('Import done: ' + d.imported + ' imported, ' + d.skipped + ' skipped.', true);
      loadTeachersAdmin(); loadReference();
    } catch (err) { toast('Import failed: ' + err.message, false); }
  };
  reader.readAsText(file);
}

/* ----- USB Lab Sync (offline labs, no network) ----- */
/* Lab Pack download: the server embeds students + tests (no answer keys)
   into the standalone lab app and serves it as STC-Lab.html.
   v1.10.2: a teacher PIN is required — the server embeds only its SHA-256
   hash, and the lab app asks for the PIN before Export (Teacher)
   (v1.11.1: Export is the only PIN-gated action — Clear saved was
   removed), so students on the laptop cannot use that button. */
function downloadLabPack() {
  const pin = ($('lab-pin').value || '').trim();
  if (!/^\d{4,}$/.test(pin)) {
    showFormError('lab-form-error', 'Teacher PIN is required — 4 or more digits.');
    return;
  }
  hideFormError('lab-form-error');
  downloadCsv('/api/lab-pack?pin=' + encodeURIComponent(pin), 'STC-Lab.html');
}

/* Import one or more lab submission files from a USB stick. Each file is
   posted separately so the summary can show per-file results. */
async function importLabFiles() {
  const files = $('lab-files').files;
  if (!files || !files.length) { toast('Choose one or more lab submission (.json) files first.', false); return; }
  const box = $('lab-import-result');
  box.innerHTML = '<p class="muted">Importing ' + files.length + ' file(s)...</p>';
  let totalImported = 0, totalDupes = 0, totalAlreadyTaken = 0;
  let html = '';
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const text = await file.text();
      let envelope;
      try { envelope = JSON.parse(text); }
      catch (e) { throw new Error('not a valid JSON file'); }
      const d = await api('/api/lab-import', { method: 'POST', body: envelope });
      totalImported += d.imported || 0;
      totalDupes += d.duplicates || 0;
      totalAlreadyTaken += d.already_taken || 0;
      html += '<p><strong>' + esc(file.name) + ':</strong> imported ' + (d.imported || 0) +
        ', duplicates ' + (d.duplicates || 0) +
        // v1.10.0: a student who took the same test on two laptops is
        // counted once — the second attempt is rejected and reported.
        ', second attempts rejected ' + (d.already_taken || 0) +
        ', errors ' + ((d.errors || []).length) + '</p>';
      if (d.errors && d.errors.length) {
        html += '<ul>' + d.errors.map((er) => '<li class="err">' + esc(er.error) + '</li>').join('') + '</ul>';
      }
    } catch (err) {
      html += '<p><strong>' + esc(file.name) + ':</strong> <span class="err">failed — ' + esc(err.message) + '</span></p>';
    }
  }
  html = '<p><strong>Total imported:</strong> ' + totalImported + ' &nbsp; <strong>Duplicates skipped:</strong> ' + totalDupes +
    ' &nbsp; <strong>Second attempts rejected:</strong> ' + totalAlreadyTaken + '</p>' + html;
  box.innerHTML = html;
  toast('Lab import done: ' + totalImported + ' imported, ' + totalDupes + ' duplicates' +
    (totalAlreadyTaken ? ', ' + totalAlreadyTaken + ' second attempts rejected' : '') + '.', true);
}

/* Course-wise result sheet (print): grouped by course, institute header
   with the real logo + signature lines (via printSheet). */
async function printCourseWiseSheet() {
  const m = $('mr-month').value || currentMonth();
  try {
    const d = await api('/api/reports/course-wise?month=' + m);
    printSheet('Course-wise Result Sheet — ' + monthName(m), courseWisePrintHtml(d.groups || [], m));
  } catch (e) { toast('Could not load course-wise results: ' + e.message, false); }
}

/* ----- Student Feedback (v1.11.0) -----
   Course-wise proof sheet for students, generated the NEXT DAY after
   grading. ROLL NUMBERS ONLY — the sheet (and the /api/feedback
   endpoint behind it) never carries student names, so each student
   finds their own result by roll number without identifying others.
   Only finalized results appear. Admin prints it to PDF; the
   management teacher posts the PDF in the course WhatsApp group. */
function fillFeedbackFilters() {
  $('fb-course').innerHTML = courseOptions('');
  $('fb-month').value = '';
  $('fb-test').innerHTML = '<option value="">-- Select test --</option>';
  $('fb-print').classList.add('hidden');
  hideFormError('fb-form-error');
  $('feedback-sheet').innerHTML = '';
  S.feedbackSheetHtml = null;
  S.feedbackSheetTitle = null;
}

async function fillFeedbackTests() {
  const course = $('fb-course').value;
  const month = $('fb-month').value;
  const sel = $('fb-test');
  if (!course) {
    sel.innerHTML = '<option value="">-- Select test --</option>';
    return;
  }
  const params = new URLSearchParams({ course: course });
  if (/^\d{4}-\d{2}$/.test(month)) params.set('month', month);
  try {
    const d = await api('/api/tests?' + params.toString());
    let html = '<option value="">-- Select test --</option>';
    // Whole-month mode: all monthly tests of the picked month at once.
    if (/^\d{4}-\d{2}$/.test(month)) {
      html += '<option value="__month__">All monthly tests — ' + esc(monthName(month)) + '</option>';
    }
    (d.tests || []).forEach((t) => {
      html += '<option value="' + t.id + '">' + esc(testLabel(t)) +
        (t.type === 'daily-quiz' ? ' (Daily Quiz)' : '') + '</option>';
    });
    sel.innerHTML = html;
  } catch (e) {
    sel.innerHTML = '<option value="">-- Select test --</option>';
    toast('Could not load tests: ' + e.message, false);
  }
}

async function generateFeedback() {
  const course = $('fb-course').value;
  const testVal = $('fb-test').value;
  const month = $('fb-month').value;
  hideFormError('fb-form-error');
  if (!course) { showFormError('fb-form-error', 'Pick a course first.'); return; }
  if (!testVal) { showFormError('fb-form-error', 'Pick a test (or "All monthly tests" for a month).'); return; }
  const box = $('feedback-sheet');
  box.innerHTML = '<p class="muted">Loading...</p>';
  $('fb-print').classList.add('hidden');
  try {
    const params = new URLSearchParams({ course: course });
    let title;
    if (testVal === '__month__') {
      params.set('month', month);
      title = 'Student Feedback — ' + course + ' — ' + monthName(month);
    } else {
      params.set('test_id', testVal);
      const t = $('fb-test').options[$('fb-test').selectedIndex];
      title = 'Student Feedback — ' + course + ' — ' + (t ? t.text : '');
    }
    const d = await api('/api/feedback?' + params.toString());
    const students = d.students || [];
    if (!students.length) {
      box.innerHTML = '<p>No finalized results for this selection yet.</p>';
      S.feedbackSheetHtml = null;
      S.feedbackSheetTitle = null;
      return;
    }
    const html = feedbackSheetHtml(d);
    box.innerHTML = html;
    S.feedbackSheetHtml = html;
    S.feedbackSheetTitle = title;
    $('fb-print').classList.remove('hidden');
  } catch (e) {
    box.innerHTML = '<p>Could not load feedback: ' + esc(e.message) + '</p>';
  }
}

/* One block per student, headed by ROLL NUMBER ONLY. Every MCQ shows
   the student's answer, right/wrong, and the correct answer; every
   blank shows the student's answer + correct answer; every theory
   question shows the student's written answer + the teacher's marks.
   Auto marks carry the small 'Auto' tag (existing pattern). */
function feedbackSheetHtml(d) {
  const students = d.students || [];
  const head = d.test
    ? esc(d.test.title)
    : 'Monthly Tests — ' + esc(monthName(d.month));
  let html = '<h4>' + esc(d.course) + ' — ' + head + ' (' + students.length +
    ' student' + (students.length === 1 ? '' : 's') + ')</h4>';
  students.forEach((s) => {
    html += '<div class="fb-student"><h5>Roll No: ' + esc(s.roll_number) + '</h5>';
    if (!d.test) html += '<p class="muted">Test: ' + esc(s.test_title) + ' &nbsp;|&nbsp; Date: ' + esc(fmtDate(s.date)) + '</p>';
    (s.questions || []).forEach((q) => {
      html += '<div class="fb-q"><p><strong>Q' + q.n + ' — ' +
        (q.type === 'mcq' ? 'MCQ' : q.type === 'fib' ? 'Fill in the Blank' : 'Theory') +
        '.</strong> ' + esc(q.question) + '</p>';
      if (q.type === 'mcq') {
        const verdict = q.correct
          ? '<span class="fb-right">✓ Correct</span>'
          : '<span class="fb-wrong">✗ Wrong</span>';
        html += '<p>Your answer: ' + (q.student_answer_text != null ? '<strong>' + esc(q.student_answer_text) + '</strong>' : '<em>(no answer given)</em>') + ' ' + verdict + '</p>' +
          '<p>Correct answer: ' + esc(q.correct_answer_text != null ? q.correct_answer_text : '—') + '</p>' +
          '<p>Marks: ' + q.marks + ' / ' + q.max_marks + ' <span class="badge badge-auto">Auto</span></p>';
      } else if (q.type === 'fib') {
        html += '<p>Your answer: ' + (q.student_answer != null && String(q.student_answer).trim() !== '' ? '<strong>' + esc(q.student_answer) + '</strong>' : '<em>(no answer given)</em>') + '</p>';
        if (q.correct_answer != null) {
          const verdict = q.correct
            ? '<span class="fb-right">✓ Correct</span>'
            : '<span class="fb-wrong">✗ Wrong</span>';
          html += '<p>Correct answer: ' + esc(q.correct_answer) + ' ' + verdict + '</p>';
        }
        html += '<p>Marks: ' + q.marks + ' / ' + q.max_marks +
          (q.auto ? ' <span class="badge badge-auto">Auto</span>' : ' — Teacher') + '</p>';
      } else {
        html += '<p>Your answer: ' + (q.student_answer != null && String(q.student_answer).trim() !== '' ? esc(q.student_answer) : '<em>(no answer given)</em>') + '</p>' +
          '<p>Marks: ' + q.marks + ' / ' + q.max_marks + ' — Teacher</p>';
      }
      html += '</div>';
    });
    html += '<p class="fb-total"><strong>Total: ' + s.total + ' / ' + s.max_total + '</strong></p></div>';
  });
  return html;
}

function printFeedback() {
  if (!S.feedbackSheetHtml) return;
  printSheet(S.feedbackSheetTitle || 'Student Feedback', S.feedbackSheetHtml);
}

function openTeacherForm(u) {
  S.editingUserId = u ? u.id : null;
  hideFormError('tc-form-error');
  $('teacher-form-title').textContent = u ? 'Edit Teacher' : 'Add Teacher';
  $('tc-username').value = u ? u.username : '';
  $('tc-username').disabled = !!u;
  $('tc-password').value = '';
  $('tc-password').required = !u;
  $('tc-name').value = u ? u.name : '';
  document.querySelectorAll('#tc-courses input[type="checkbox"]').forEach((cb) => {
    cb.checked = u ? (u.courses || []).indexOf(cb.value) !== -1 : false;
  });
  $('tc-submit').textContent = u ? 'Save Changes' : 'Save Teacher';
  $('tc-cancel').classList.toggle('hidden', !u);
}

async function saveTeacher(e) {
  e.preventDefault();
  const courses = Array.prototype.slice.call(document.querySelectorAll('#tc-courses input[type="checkbox"]:checked'))
    .map((cb) => cb.value);
  try {
    if (S.editingUserId) {
      const body = { name: $('tc-name').value.trim(), courses: courses };
      if ($('tc-password').value) body.password = $('tc-password').value;
      await api('/api/users/' + S.editingUserId, { method: 'PUT', body: body });
      toast('Teacher updated.', true);
    } else {
      await api('/api/users', {
        method: 'POST',
        body: {
          username: $('tc-username').value.trim(),
          password: $('tc-password').value,
          name: $('tc-name').value.trim(),
          role: 'teacher',
          courses: courses
        }
      });
      toast('Teacher added.', true);
    }
    openTeacherForm(null);
    $('teacher-form').reset();
    loadTeachersAdmin(); loadReference();
  } catch (err) { showFormError('tc-form-error', 'Save failed: ' + err.message); }
}

function initAdmin() {
  document.querySelectorAll('.tab').forEach((t) => {
    t.addEventListener('click', () => switchAdminTab(t.getAttribute('data-tab')));
  });
  $('dash-refresh').addEventListener('click', loadDashboard);
  $('dash-date').addEventListener('change', loadDashboard);

  $('course-form').addEventListener('submit', saveCourse);
  $('course-cancel').addEventListener('click', () => {
    S.editingCourseId = null;
    $('course-form').reset();
    $('course-submit').textContent = 'Add Course';
    $('course-cancel').classList.add('hidden');
  });

  $('st-refresh').addEventListener('click', loadStudents);
  $('st-search').addEventListener('input', () => { clearTimeout(initAdmin._st); initAdmin._st = setTimeout(loadStudents, 500); });
  $('st-course-filter').addEventListener('change', loadStudents);
  $('st-shift-filter').addEventListener('change', loadStudents);
  $('st-add-btn').addEventListener('click', () => openStudentForm(null));
  $('student-form').addEventListener('submit', saveStudent);
  $('student-form-cancel').addEventListener('click', () => {
    $('student-form-card').classList.add('hidden');
    $('student-form').reset();
    S.editingStudentId = null;
  });
  $('st-csv-import').addEventListener('click', importStudentsCsv);

  $('tb-type').addEventListener('change', syncMonthPicker);
  $('tb-add-mcq').addEventListener('click', () => { S.builderQuestions.push(newMcq()); renderBuilderQuestions(); });
  $('tb-add-fib').addEventListener('click', () => { S.builderQuestions.push(newFib()); renderBuilderQuestions(); });
  $('tb-add-theory').addEventListener('click', () => { S.builderQuestions.push(newTheory()); renderBuilderQuestions(); });
  $('tb-save').addEventListener('click', saveTest);
  $('tb-cancel').addEventListener('click', resetTestBuilder);
  $('tb-filter-refresh').addEventListener('click', loadTests);
  $('tb-filter-course').addEventListener('change', loadTests);
  $('tb-filter-type').addEventListener('change', loadTests);

  $('res-refresh').addEventListener('click', loadResultsReview);
  $('res-date').addEventListener('change', loadResultsReview);
  $('res-export').addEventListener('click', () => {
    const m = ($('res-date').value || todayISO()).slice(0, 7);
    downloadCsv('/api/export/results.csv?month=' + m, 'results-' + m + '.csv');
  });

  $('mr-load').addEventListener('click', () => loadMonthlyReport('admin'));
  $('mr-month').addEventListener('change', () => loadMonthlyReport('admin'));
  $('mr-export').addEventListener('click', () => {
    const m = $('mr-month').value || currentMonth();
    downloadCsv('/api/export/monthly.csv?month=' + m, 'monthly-report-' + m + '.csv');
  });
  $('mr-print').addEventListener('click', () => {
    printSheet('Monthly Report — ' + monthName($('mr-month').value || currentMonth()),
      monthlyReportPrintHtml(S.monthlyRows, $('mr-month').value || currentMonth()));
  });
  $('mr-export-results').addEventListener('click', () => {
    const m = $('mr-month').value || currentMonth();
    downloadCsv('/api/export/results.csv?month=' + m, 'results-' + m + '.csv');
  });
  $('mr-print-coursewise').addEventListener('click', printCourseWiseSheet);

  // Student Feedback (v1.11.0)
  $('fb-course').addEventListener('change', fillFeedbackTests);
  $('fb-month').addEventListener('change', fillFeedbackTests);
  $('fb-generate').addEventListener('click', generateFeedback);
  $('fb-print').addEventListener('click', printFeedback);

  $('con-run').addEventListener('click', runConsolidation);
  $('con-export').addEventListener('click', () => {
    if (S.conDay) downloadCsv('/api/export/consolidation.csv?date=' + S.conDay, 'consolidation-' + S.conDay + '.csv');
  });
  $('con-print').addEventListener('click', () => {
    if (S.conDay) printSheet('End-of-Day Consolidation Sheet — ' + S.conDay, consolidationTable(S.conRows));
  });

  $('teacher-form').addEventListener('submit', saveTeacher);
  $('tc-cancel').addEventListener('click', () => { openTeacherForm(null); $('teacher-form').reset(); });
  $('tc-csv-import').addEventListener('click', importTeachersCsv);

  $('lab-export').addEventListener('click', downloadLabPack);
  $('lab-import-btn').addEventListener('click', importLabFiles);
}


/* ---------------- Admin page init ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  initPortal({
    role: 'admin', roleLabel: 'Admin', fragment: 'admin-console.html',
    onReady: async () => {
      initAdmin();
      await loadReference();
      loadAdmin();
    }
  });
});
