/* =====================================================================
   principal.js — Principal portal console (read-only).
   STC Testing System — Super Sys-Tech Computers Centre, Umerkot.
   Vanilla JS, no frameworks, no external requests.
   ===================================================================== */

'use strict';
function loadPrincipal() {
  $('principal-welcome').textContent = 'Welcome, ' + S.user.name + ' — Principal. This portal is view-only.';
  $('pa-date').value = todayISO();
  $('pm-month').value = currentMonth();
  $('pr-month').value = currentMonth();
  loadPrincipalDay();
  loadPrincipalMonth();
  loadMonthlyReport('principal');
  loadPrincipalDays();
}

async function loadPrincipalDay() {
  const date = $('pa-date').value || todayISO();
  try {
    const d = await api('/api/analytics/day?date=' + date);
    const t = d.totals || {};
    $('pa-totals').innerHTML =
      statBox('Total', t.total != null ? t.total : (d.perShift || []).reduce((a, s) => a + (s.total || 0), 0)) +
      statBox('Submitted', t.submitted != null ? t.submitted : '') +
      statBox('Graded', t.graded != null ? t.graded : '') +
      statBox('Sent to Admin', t.sent != null ? t.sent : '') +
      statBox('Final', t.final != null ? t.final : '');
    // Participation per shift as bars (7 AM – 7 PM).
    const shifts = d.perShift || [];
    const max = Math.max(1, ...shifts.map((s) => s.total || 0));
    $('pa-shifts').innerHTML = shifts.length ? shifts.map((s) =>
      '<div class="bar-row"><span class="bar-label">' + esc(s.shift) + '</span>' +
      '<span class="bar-track"><span class="bar-fill" style="width:' + Math.round((s.total || 0) / max * 100) + '%"></span></span>' +
      '<span class="bar-num">' + (s.total || 0) + '</span></div>').join('')
      : '<p class="muted">No submissions yet for this date.</p>';
    $('pa-courses').innerHTML = courseCountTable(d.perCourse || []);
    $('pa-teachers').innerHTML = teacherDayTable(d.perTeacher || []);
  } catch (e) { toast('Day analytics failed: ' + e.message, false); }
}

async function loadPrincipalMonth() {
  const month = $('pm-month').value || currentMonth();
  try {
    const d = await api('/api/analytics/month?month=' + month);
    const t = d.totals || {};
    $('pm-totals').innerHTML =
      statBox('Sent to Admin', t.sent_to_admin != null ? t.sent_to_admin : '') +
      statBox('Final', t.final != null ? t.final : '') +
      statBox('Pending', t.pending != null ? t.pending : '');
    const pt = d.perTeacher || [];
    $('pm-teachers').innerHTML = pt.length
      ? '<table><tr><th>Teacher</th><th>Sent to Admin</th><th>Final</th><th>Pending</th></tr>' +
        pt.map((x) => '<tr><td>' + esc(x.teacher_name) + '</td><td>' + x.sent_to_admin +
          '</td><td>' + x.final + '</td><td>' + x.pending + '</td></tr>').join('') + '</table>'
      : '<p class="muted">No teacher data for this month.</p>';
    const pc = d.perCourse || [];
    $('pm-courses').innerHTML = pc.length
      ? '<table><tr><th>Course</th><th>Students</th><th>Average %</th></tr>' +
        pc.map((x) => '<tr><td>' + esc(x.course) + '</td><td>' + x.students +
          '</td><td>' + x.avg_percentage + '%</td></tr>').join('') + '</table>'
      : '<p class="muted">No course data for this month.</p>';
  } catch (e) { toast('Month analytics failed: ' + e.message, false); }
}

async function loadPrincipalDays() {
  const box = $('pr-days');
  try {
    const d = await api('/api/consolidation');
    const days = d.days || [];
    if (!days.length) { box.innerHTML = '<p class="muted">No consolidation days yet.</p>'; return; }
    box.innerHTML = days.map((dy) =>
      '<button class="btn" type="button" data-pday="' + dy.date + '">' + dy.date + ' (' + dy.count + ' rows)</button>').join('');
    box.querySelectorAll('[data-pday]').forEach((b) => {
      b.addEventListener('click', () => loadPrincipalDaySheet(b.getAttribute('data-pday')));
    });
  } catch (e) { box.innerHTML = '<p>Could not load days: ' + esc(e.message) + '</p>'; }
}

async function loadPrincipalDaySheet(date) {
  S.principalSheetDate = date;
  const box = $('pr-daysheet');
  box.innerHTML = '<p class="muted">Loading...</p>';
  try {
    const d = await api('/api/consolidation/' + date);
    S.principalSheetRows = d.master || [];
    box.innerHTML = '<h4>Day Sheet — ' + date + (d.locked ? ' (Locked)' : '') + '</h4>' +
      consolidationTable(S.principalSheetRows);
    $('pr-sheet-export').classList.remove('hidden');
    $('pr-sheet-print').classList.remove('hidden');
  } catch (e) { box.innerHTML = '<p>Could not load day sheet: ' + esc(e.message) + '</p>'; }
}

function initPrincipal() {
  $('pa-refresh').addEventListener('click', loadPrincipalDay);
  $('pa-date').addEventListener('change', loadPrincipalDay);
  $('pa-export').addEventListener('click', () => {
    const dt = $('pa-date').value || todayISO();
    downloadCsv('/api/export/day.csv?date=' + dt, 'day-report-' + dt + '.csv');
  });
  $('pa-print').addEventListener('click', async () => {
    // Print the day sheet from the consolidation if one exists, else analytics.
    const dt = $('pa-date').value || todayISO();
    try {
      const d = await api('/api/consolidation/' + dt);
      printSheet('Day Sheet — ' + dt, consolidationTable(d.master || []));
    } catch (e) {
      printSheet('Day Analytics — ' + dt,
        '<p>Participation per shift for ' + dt + '.</p>' + $('pa-shifts').innerHTML);
    }
  });
  $('pm-refresh').addEventListener('click', loadPrincipalMonth);
  $('pm-month').addEventListener('change', loadPrincipalMonth);
  $('pr-load').addEventListener('click', () => loadMonthlyReport('principal'));
  $('pr-month').addEventListener('change', () => loadMonthlyReport('principal'));
  $('pr-export').addEventListener('click', () => {
    const m = $('pr-month').value || currentMonth();
    downloadCsv('/api/export/monthly.csv?month=' + m, 'monthly-report-' + m + '.csv');
  });
  $('pr-print').addEventListener('click', () => {
    printSheet('Monthly Report — ' + monthName($('pr-month').value || currentMonth()),
      monthlyReportPrintHtml(S.principalRows, $('pr-month').value || currentMonth()));
  });
  $('pr-sheet-export').addEventListener('click', () => {
    if (S.principalSheetDate) {
      downloadCsv('/api/export/consolidation.csv?date=' + S.principalSheetDate,
        'consolidation-' + S.principalSheetDate + '.csv');
    }
  });
  $('pr-sheet-print').addEventListener('click', () => {
    if (S.principalSheetDate) {
      printSheet('End-of-Day Consolidation Sheet — ' + S.principalSheetDate,
        consolidationTable(S.principalSheetRows));
    }
  });
}


/* ---------------- Principal page init ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  initPortal({
    role: 'principal', roleLabel: 'Principal', fragment: 'principal-console.html',
    onReady: async () => {
      initPrincipal();
      loadPrincipal();
    }
  });
});
