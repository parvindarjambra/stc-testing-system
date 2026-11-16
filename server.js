// STC Testing System — backend server (single file, zero npm dependencies).
// Super Sys-Tech Computers Centre, Umerkot — offline LAN exam/quiz/result system.
// Only Node.js built-in modules: http, fs, path, crypto.
// Data: node:sqlite when available, automatic fallback to file-backed JSON store.
// Serves static frontend from ./public and JSON API under /api. Binds 0.0.0.0.
// Portals are SEPARATE pages: / (landing), /student, /teacher, /admin,
// /principal. Staff consoles are served as authenticated fragments from
// ./fragments (never static), so no console content is visible without login.
// Students can only test with a roll number registered by Admin.
// USB SYNC (v1.4.0): offline labs with no network at all get a standalone
// lab app (GET /api/lab-pack, Admin only) — a single self-contained HTML
// file with students + tests but NO answer keys. Submissions come back on
// a USB stick and are imported via POST /api/lab-import (Admin only),
// which auto-grades MCQs server-side and dedupes by client_id.

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';
const VERSION = '1.5.0';
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const PUBLIC_DIR = path.join(ROOT, 'public');
const MAX_BODY = 5 * 1024 * 1024; // 5 MB (CSV imports)

const COLLECTIONS = ['users', 'students', 'courses', 'tests', 'submissions', 'consolidations'];

// The 11 shifts — exact labels from the contract; used everywhere.
const SHIFTS = [
  '07:00 AM - 08:00 AM', '08:00 AM - 09:00 AM', '09:00 AM - 10:00 AM',
  '10:00 AM - 11:00 AM', '11:00 AM - 12:00 PM', '12:00 PM - 01:00 PM',
  '02:00 PM - 03:00 PM', '03:00 PM - 04:00 PM', '04:00 PM - 05:00 PM',
  '05:00 PM - 06:00 PM', '06:00 PM - 07:00 PM',
];

// ---------------------------------------------------------------------------
// Password hashing — salted sha256 (salt:hash hex). LAN-demo grade.
// ---------------------------------------------------------------------------
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(salt + password).digest('hex');
  return salt + ':' + hash;
}
function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const idx = stored.indexOf(':');
  if (idx < 0) return false;
  const salt = stored.slice(0, idx);
  const want = stored.slice(idx + 1);
  const got = crypto.createHash('sha256').update(salt + password).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(got, 'hex'), Buffer.from(want, 'hex'));
}

// ---------------------------------------------------------------------------
// Store abstraction — one API, two backends (sqlite / JSON files).
// Methods: insert(coll, doc) / find(coll, pred?) / findOne(coll, pred)
//          update(coll, id, patch) / remove(coll, id) / upsert(coll, doc, uniqueKey)
// Docs are plain objects; every doc has a string `id`.
// ---------------------------------------------------------------------------
function createStore(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });

  // --- Backend 1: node:sqlite (one table per collection, JSON in `data`) ---
  try {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(path.join(dataDir, 'stc.sqlite'));
    for (const c of COLLECTIONS) {
      db.exec(`CREATE TABLE IF NOT EXISTS "${c}" (id TEXT PRIMARY KEY, data TEXT NOT NULL)`);
    }
    const stmts = {};
    for (const c of COLLECTIONS) {
      stmts[c] = {
        insert: db.prepare(`INSERT INTO "${c}" (id, data) VALUES (?, ?)`),
        replace: db.prepare(`INSERT OR REPLACE INTO "${c}" (id, data) VALUES (?, ?)`),
        get: db.prepare(`SELECT data FROM "${c}" WHERE id = ?`),
        all: db.prepare(`SELECT data FROM "${c}"`),
        del: db.prepare(`DELETE FROM "${c}" WHERE id = ?`),
      };
    }
    const parse = (row) => JSON.parse(row.data);
    return {
      type: 'sqlite',
      insert(coll, doc) { stmts[coll].insert.run(doc.id, JSON.stringify(doc)); return doc; },
      find(coll, pred) {
        const rows = stmts[coll].all.all().map(parse);
        return typeof pred === 'function' ? rows.filter(pred) : rows;
      },
      findOne(coll, pred) {
        if (typeof pred === 'string') { // by id
          const row = stmts[coll].get.get(pred);
          return row ? parse(row) : null;
        }
        return this.find(coll, pred)[0] || null;
      },
      update(coll, id, patch) {
        const cur = this.findOne(coll, id);
        if (!cur) return null;
        const next = Object.assign({}, cur, patch, { id });
        stmts[coll].replace.run(id, JSON.stringify(next));
        return next;
      },
      remove(coll, id) { stmts[coll].del.run(id); },
      upsert(coll, doc, uniqueKey) {
        const existing = uniqueKey ? this.findOne(coll, (d) => d[uniqueKey] === doc[uniqueKey]) : null;
        const id = existing ? existing.id : (doc.id || crypto.randomUUID());
        const next = Object.assign({}, existing || {}, doc, { id });
        stmts[coll].replace.run(id, JSON.stringify(next));
        return next;
      },
    };
  } catch (e) {
    // Fall through to JSON backend (node:sqlite unavailable on this Node build).
    console.log('[store] node:sqlite unavailable (' + e.message + ') — using JSON file store');
  }

  // --- Backend 2: file-backed JSON (one file per collection, sync write on every mutation) ---
  const cache = {};
  function fileFor(coll) { return path.join(dataDir, coll + '.json'); }
  function load(coll) {
    if (cache[coll]) return cache[coll];
    try {
      cache[coll] = JSON.parse(fs.readFileSync(fileFor(coll), 'utf8'));
      if (!Array.isArray(cache[coll])) cache[coll] = [];
    } catch (_) { cache[coll] = []; }
    return cache[coll];
  }
  function save(coll) {
    // Atomic-ish: write temp file then rename, so a crash never leaves a half-written file.
    const tmp = fileFor(coll) + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(cache[coll], null, 2), 'utf8');
    fs.renameSync(tmp, fileFor(coll));
  }
  return {
    type: 'json',
    insert(coll, doc) { load(coll).push(doc); save(coll); return doc; },
    find(coll, pred) {
      const rows = load(coll).slice();
      return typeof pred === 'function' ? rows.filter(pred) : rows;
    },
    findOne(coll, pred) {
      if (typeof pred === 'string') return load(coll).find((d) => d.id === pred) || null;
      return load(coll).find(pred) || null;
    },
    update(coll, id, patch) {
      const rows = load(coll);
      const i = rows.findIndex((d) => d.id === id);
      if (i < 0) return null;
      rows[i] = Object.assign({}, rows[i], patch, { id });
      save(coll);
      return rows[i];
    },
    remove(coll, id) {
      const rows = load(coll);
      const i = rows.findIndex((d) => d.id === id);
      if (i >= 0) { rows.splice(i, 1); save(coll); }
    },
    upsert(coll, doc, uniqueKey) {
      const rows = load(coll);
      const i = uniqueKey ? rows.findIndex((d) => d[uniqueKey] === doc[uniqueKey]) : -1;
      if (i >= 0) {
        rows[i] = Object.assign({}, rows[i], doc, { id: rows[i].id });
        save(coll);
        return rows[i];
      }
      const next = Object.assign({}, doc, { id: doc.id || crypto.randomUUID() });
      rows.push(next);
      save(coll);
      return next;
    },
  };
}

// Exported early (before requiring seed.js) so seed.js can use them standalone
// via require('./server.js') without starting the HTTP server.
module.exports = { createStore, hashPassword, verifyPassword, SHIFTS, VERSION };

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function todayStr(d) {
  d = d || new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}
function nowIso() { return new Date().toISOString(); }
function newId() { return crypto.randomUUID(); }
function isValidMonth(s) { return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s); }
function isValidDate(s) { return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s); }

// Public view of a user — NEVER include password_hash in any response.
function publicUser(u) {
  if (!u) return null;
  return { id: u.id, username: u.username, name: u.name, role: u.role, courses: u.courses || [] };
}

// CSV helpers ----------------------------------------------------------------
function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCsv(headers, rows) {
  const lines = [headers.map(csvEscape).join(',')];
  for (const r of rows) lines.push(r.map(csvEscape).join(','));
  return '\uFEFF' + lines.join('\r\n') + '\r\n'; // UTF-8 BOM so Excel opens Urdu/Unicode correctly
}

// CSV parser: strips BOM, handles quoted fields with commas/newlines and "" escapes.
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\r') {
      // ignore; \n follows
    } else if (ch === '\n') {
      row.push(field); field = ''; rows.push(row); row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  // Drop fully-empty trailing rows
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

// ---------------------------------------------------------------------------
// Application factory — builds the request handler over a store instance.
// ---------------------------------------------------------------------------
function createApp(store) {
  // Sessions live in memory only: token -> userId (restart = re-login, acceptable).
  const sessions = new Map();

  // --- auth helpers ---------------------------------------------------------
  function userFromRequest(req) {
    const h = req.headers['authorization'] || '';
    const m = /^Bearer\s+(.+)$/.exec(h);
    if (!m) return null;
    const userId = sessions.get(m[1]);
    if (!userId) return null;
    return store.findOne('users', userId);
  }
  // Returns the user, or sends 401/403 and returns null. roles: allowed roles or null (any auth).
  function requireAuth(req, res, roles) {
    const user = userFromRequest(req);
    if (!user) { sendJson(res, 401, { ok: false, error: 'unauthorized' }); return null; }
    if (roles && !roles.includes(user.role)) { sendJson(res, 403, { ok: false, error: 'forbidden' }); return null; }
    return user;
  }
  function teacherName(id) {
    const u = id ? store.findOne('users', id) : null;
    return u ? u.name : '';
  }

  // --- response helpers -----------------------------------------------------
  function sendJson(res, status, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(body);
  }
  function sendCsv(res, filename, csv) {
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="' + filename + '"',
    });
    res.end(csv);
  }
  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (!raw) return resolve({});
        try { resolve(JSON.parse(raw)); }
        catch (_) { reject(new Error('invalid JSON')); }
      });
      req.on('error', reject);
    });
  }

  // --- test helpers ---------------------------------------------------------
  function testSummary(t) {
    return {
      id: t.id, title: t.title, course: t.course, type: t.type, month: t.month || null,
      duration_minutes: t.duration_minutes, question_count: (t.questions || []).length,
      randomize: t.randomize ? 1 : 0,
    };
  }
  function stripAnswers(test) {
    // Student-facing view: questions WITHOUT correct answers / model answers /
    // suggested answers. FIB keeps only its text + marks (the blank itself).
    const copy = Object.assign({}, test);
    copy.questions = (test.questions || []).map((q) => {
      if (q.type === 'mcq') return { type: 'mcq', question: q.question, options: q.options, marks: q.marks };
      if (q.type === 'fib') return { type: 'fib', question: q.question, max_marks: q.max_marks };
      return { type: 'theory', question: q.question, max_marks: q.max_marks };
    });
    return copy;
  }
  function validateTestInput(b) {
    if (!b || typeof b.title !== 'string' || !b.title.trim()) return 'title is required';
    if (typeof b.course !== 'string' || !b.course.trim()) return 'course is required';
    if (b.type !== 'daily-quiz' && b.type !== 'monthly-test') return 'type must be daily-quiz or monthly-test';
    if (b.type === 'monthly-test') {
      if (!isValidMonth(b.month)) return 'month (YYYY-MM) is required for monthly-test';
    }
    if (!Number.isFinite(+b.duration_minutes) || +b.duration_minutes <= 0) return 'duration_minutes must be a positive number';
    if (!Array.isArray(b.questions) || b.questions.length === 0) return 'questions must be a non-empty array';
    for (let i = 0; i < b.questions.length; i++) {
      const q = b.questions[i];
      if (q.type === 'mcq') {
        if (typeof q.question !== 'string' || !q.question.trim()) return 'question ' + i + ': text required';
        if (!Array.isArray(q.options) || q.options.length !== 4) return 'question ' + i + ': mcq needs 4 options';
        if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3) return 'question ' + i + ': correct must be 0-3';
        if (!Number.isFinite(+q.marks) || +q.marks <= 0) return 'question ' + i + ': marks must be positive';
      } else if (q.type === 'theory') {
        if (typeof q.question !== 'string' || !q.question.trim()) return 'question ' + i + ': text required';
        if (!Number.isFinite(+q.max_marks) || +q.max_marks <= 0) return 'question ' + i + ': max_marks must be positive';
      } else if (q.type === 'fib') {
        // Fill-in-the-blank: teacher-graded like theory. suggested_answer is
        // shown to the teacher while grading; it is NEVER auto-graded.
        if (typeof q.question !== 'string' || !q.question.trim()) return 'question ' + i + ': text required';
        if (!Number.isFinite(+q.max_marks) || +q.max_marks <= 0) return 'question ' + i + ': max_marks must be positive';
        if (q.suggested_answer !== undefined && typeof q.suggested_answer !== 'string') return 'question ' + i + ': suggested_answer must be text';
      } else return 'question ' + i + ': type must be mcq, theory or fib';
    }
    return null;
  }

  // --- grading --------------------------------------------------------------
  // Auto-grade MCQs from the STORED test — never trust client-supplied scores.
  function gradeSubmission(test, answers) {
    const byQ = {};
    for (const a of (answers || [])) {
      if (a && Number.isInteger(a.q)) byQ[a.q] = a.answer;
    }
    let mcq_score = 0, mcq_max = 0, theory_max = 0;
    (test.questions || []).forEach((q, i) => {
      if (q.type === 'mcq') {
        mcq_max += +q.marks || 0;
        if (byQ[i] !== undefined && +byQ[i] === q.correct) mcq_score += +q.marks || 0;
      } else if (q.type === 'theory' || q.type === 'fib') {
        // Theory + fill-in-the-blank are both teacher-graded: their max marks
        // count in theory_max (the manual-marks bucket). FIB is never
        // auto-graded — the suggested answer is only a grading aid.
        theory_max += +q.max_marks || 0;
      }
    });
    return { mcq_score, mcq_max, theory_max, max_total: mcq_max + theory_max };
  }
  function theoryMarksTotal(sub) {
    return Object.values(sub.theory_marks || {}).reduce((s, v) => s + (+v || 0), 0);
  }

  // --- consolidation --------------------------------------------------------
  function runConsolidation(date) {
    const subs = store.find('submissions', (s) => s.date === date);
    const master = subs.map((s) => ({
      roll_number: s.student_roll, name: s.student_name, father_name: s.father_name,
      course: s.course, shift: s.shift, teacher_name: teacherName(s.teacher_id),
      test_title: s.test_title, mcq_score: s.mcq_score, mcq_max: s.mcq_max,
      theory_marks_total: theoryMarksTotal(s), theory_max: s.theory_max,
      total: s.total, max_total: s.max_total, status: s.status,
    }));
    // Lock that day's submissions so no further grading/send can change them.
    for (const s of subs) {
      if (!s.locked) store.update('submissions', s.id, { locked: 1 });
    }
    // Idempotent upsert by date — a re-run updates, never duplicates.
    store.upsert('consolidations', { date, master, locked: 1, created_at: nowIso() }, 'date');
    return { date, rows: master.length, locked: true };
  }

  // --- monthly report rows (shared by JSON + CSV export) --------------------
  function monthlyReportRows(month) {
    // Only submissions of MONTHLY tests whose test.month == requested month,
    // and only status sent_to_admin | final. Daily quizzes are excluded.
    const testsById = {};
    for (const t of store.find('tests')) testsById[t.id] = t;
    const subs = store.find('submissions', (s) => {
      if (s.status !== 'sent_to_admin' && s.status !== 'final') return false;
      const t = testsById[s.test_id];
      return t && t.type === 'monthly-test' && t.month === month;
    });
    const byRoll = {};
    for (const s of subs) {
      const key = s.student_roll;
      if (!byRoll[key]) {
        byRoll[key] = {
          roll_number: s.student_roll, name: s.student_name, father_name: s.father_name,
          course: s.course, shift: s.shift, teacher_name: teacherName(s.teacher_id),
          tests: [], total: 0, max: 0,
        };
      }
      byRoll[key].tests.push({ test_id: s.test_id, title: s.test_title, total: s.total, max: s.max_total });
      byRoll[key].total += s.total || 0;
      byRoll[key].max += s.max_total || 0;
    }
    return Object.values(byRoll).map((r) => {
      const percentage = r.max > 0 ? Math.round((r.total / r.max) * 1000) / 10 : 0;
      return Object.assign(r, { percentage, result: percentage >= 40 ? 'Pass' : 'Fail' });
    }).sort((a, b) => String(a.roll_number).localeCompare(String(b.roll_number)));
  }

  // =========================================================================
  // ROUTES
  // =========================================================================
  async function handleApi(req, res, pathname, query) {
    const method = req.method;
    const seg = pathname.split('/').filter(Boolean); // e.g. ['api','tests','123']

    // ---- health (public) ----
    if (method === 'GET' && pathname === '/api/health') {
      return sendJson(res, 200, { ok: true, time: nowIso(), db: store.type, version: VERSION });
    }

    // ---- auth ----
    if (method === 'POST' && pathname === '/api/auth/login') {
      const b = await readBody(req).catch(() => null);
      if (!b) return sendJson(res, 400, { ok: false, error: 'invalid JSON' });
      const user = store.findOne('users', (u) => u.username === b.username);
      if (!user || !verifyPassword(String(b.password || ''), user.password_hash)) {
        return sendJson(res, 401, { ok: false, error: 'invalid credentials' });
      }
      // Role enforcement: each portal page sends its own required role.
      // A valid login for the WRONG portal is rejected (no token is issued).
      if (b.role && ['teacher', 'admin', 'principal'].includes(b.role) && user.role !== b.role) {
        return sendJson(res, 403, { ok: false, error: 'wrong_role' });
      }
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, user.id);
      return sendJson(res, 200, { ok: true, token, user: publicUser(user) });
    }
    if (method === 'GET' && pathname === '/api/me') {
      const user = requireAuth(req, res, null);
      if (!user) return;
      return sendJson(res, 200, { ok: true, user: publicUser(user) });
    }

    // ---- shifts / courses (public reads) ----
    if (method === 'GET' && pathname === '/api/shifts') {
      return sendJson(res, 200, { ok: true, shifts: SHIFTS.map((label, i) => ({ id: i + 1, label })) });
    }
    if (method === 'GET' && pathname === '/api/courses') {
      return sendJson(res, 200, { ok: true, courses: store.find('courses').map((c) => ({ id: c.id, name: c.name })) });
    }
    if (method === 'POST' && pathname === '/api/courses') {
      if (!requireAuth(req, res, ['admin'])) return;
      const b = await readBody(req).catch(() => null);
      if (!b || typeof b.name !== 'string' || !b.name.trim()) return sendJson(res, 400, { ok: false, error: 'name is required' });
      if (store.findOne('courses', (c) => c.name.toLowerCase() === b.name.trim().toLowerCase())) {
        return sendJson(res, 400, { ok: false, error: 'course already exists' });
      }
      const c = store.insert('courses', { id: newId(), name: b.name.trim() });
      return sendJson(res, 201, { ok: true, course: c });
    }
    if ((method === 'PUT' || method === 'DELETE') && seg[0] === 'api' && seg[1] === 'courses' && seg[2]) {
      if (!requireAuth(req, res, ['admin'])) return;
      const c = store.findOne('courses', seg[2]);
      if (!c) return sendJson(res, 404, { ok: false, error: 'course not found' });
      if (method === 'DELETE') { store.remove('courses', c.id); return sendJson(res, 200, { ok: true }); }
      const b = await readBody(req).catch(() => null);
      if (!b || typeof b.name !== 'string' || !b.name.trim()) return sendJson(res, 400, { ok: false, error: 'name is required' });
      const updated = store.update('courses', c.id, { name: b.name.trim() });
      return sendJson(res, 200, { ok: true, course: updated });
    }

    // ---- teachers (public list for the student dropdown — no passwords) ----
    if (method === 'GET' && pathname === '/api/teachers') {
      const list = store.find('users', (u) => u.role === 'teacher')
        .map((u) => ({ id: u.id, name: u.name, courses: u.courses || [] }));
      return sendJson(res, 200, { ok: true, teachers: list });
    }

    // ---- users (admin) ----
    if (method === 'GET' && pathname === '/api/users') {
      if (!requireAuth(req, res, ['admin'])) return;
      let list = store.find('users');
      if (query.role) list = list.filter((u) => u.role === query.role);
      return sendJson(res, 200, { ok: true, users: list.map(publicUser) });
    }
    if (method === 'POST' && pathname === '/api/users') {
      if (!requireAuth(req, res, ['admin'])) return;
      const b = await readBody(req).catch(() => null);
      if (!b || typeof b.username !== 'string' || !b.username.trim()) return sendJson(res, 400, { ok: false, error: 'username is required' });
      if (typeof b.password !== 'string' || b.password.length < 4) return sendJson(res, 400, { ok: false, error: 'password must be at least 4 characters' });
      if (typeof b.name !== 'string' || !b.name.trim()) return sendJson(res, 400, { ok: false, error: 'name is required' });
      if (b.role !== 'teacher' && b.role !== 'admin') return sendJson(res, 400, { ok: false, error: 'role must be teacher or admin' });
      if (store.findOne('users', (u) => u.username === b.username.trim())) {
        return sendJson(res, 400, { ok: false, error: 'username already exists' });
      }
      const u = store.insert('users', {
        id: newId(), username: b.username.trim(), password_hash: hashPassword(b.password),
        name: b.name.trim(), role: b.role,
        courses: Array.isArray(b.courses) ? b.courses : [],
      });
      return sendJson(res, 201, { ok: true, user: publicUser(u) });
    }
    if (method === 'POST' && pathname === '/api/users/import') {
      if (!requireAuth(req, res, ['admin'])) return;
      const b = await readBody(req).catch(() => null);
      if (!b || typeof b.csv !== 'string') return sendJson(res, 400, { ok: false, error: 'csv is required' });
      const result = importTeachers(b.csv);
      return sendJson(res, 200, Object.assign({ ok: true }, result));
    }
    if ((method === 'PUT' || method === 'DELETE') && seg[0] === 'api' && seg[1] === 'users' && seg[2]) {
      const me = requireAuth(req, res, ['admin']);
      if (!me) return;
      const u = store.findOne('users', seg[2]);
      if (!u) return sendJson(res, 404, { ok: false, error: 'user not found' });
      if (method === 'DELETE') {
        if (u.id === me.id) return sendJson(res, 400, { ok: false, error: 'cannot delete yourself' });
        if (u.role === 'principal') return sendJson(res, 400, { ok: false, error: 'cannot delete the principal' });
        store.remove('users', u.id);
        return sendJson(res, 200, { ok: true });
      }
      const b = await readBody(req).catch(() => null);
      if (!b) return sendJson(res, 400, { ok: false, error: 'invalid JSON' });
      const patch = {};
      if (typeof b.name === 'string' && b.name.trim()) patch.name = b.name.trim();
      if (Array.isArray(b.courses)) patch.courses = b.courses;
      if (typeof b.password === 'string' && b.password.length >= 4) patch.password_hash = hashPassword(b.password);
      const updated = store.update('users', u.id, patch);
      return sendJson(res, 200, { ok: true, user: publicUser(updated) });
    }

    // ---- students ----
    if (method === 'GET' && pathname === '/api/students/lookup') {
      const roll = (query.roll || '').trim();
      if (!roll) return sendJson(res, 400, { ok: false, error: 'roll is required' });
      const s = store.findOne('students', (x) => x.roll_number.toLowerCase() === roll.toLowerCase());
      if (!s) return sendJson(res, 200, { ok: true, found: false });
      return sendJson(res, 200, { ok: true, found: true, student: Object.assign({}, s, { teacher_name: teacherName(s.teacher_id) }) });
    }
    if (method === 'GET' && pathname === '/api/students') {
      if (!requireAuth(req, res, ['admin', 'principal'])) return;
      let list = store.find('students');
      if (query.search) {
        const q = query.search.toLowerCase();
        list = list.filter((s) => (s.name + ' ' + s.roll_number + ' ' + (s.father_name || '')).toLowerCase().includes(q));
      }
      if (query.course) list = list.filter((s) => s.course === query.course);
      if (query.shift) list = list.filter((s) => s.shift === query.shift);
      return sendJson(res, 200, {
        ok: true,
        students: list.map((s) => Object.assign({}, s, { teacher_name: teacherName(s.teacher_id) })),
      });
    }
    if (method === 'POST' && pathname === '/api/students/import') {
      if (!requireAuth(req, res, ['admin'])) return;
      const b = await readBody(req).catch(() => null);
      if (!b || typeof b.csv !== 'string') return sendJson(res, 400, { ok: false, error: 'csv is required' });
      const result = importStudents(b.csv);
      return sendJson(res, 200, Object.assign({ ok: true }, result));
    }
    if (method === 'POST' && pathname === '/api/students') {
      if (!requireAuth(req, res, ['admin'])) return;
      const b = await readBody(req).catch(() => null);
      const err = validateStudentInput(b);
      if (err) return sendJson(res, 400, { ok: false, error: err });
      if (store.findOne('students', (s) => s.roll_number.toLowerCase() === b.roll_number.trim().toLowerCase())) {
        return sendJson(res, 400, { ok: false, error: 'roll_number already exists' });
      }
      const s = store.insert('students', {
        id: newId(), roll_number: b.roll_number.trim(), name: b.name.trim(),
        father_name: (b.father_name || '').trim(), course: b.course, shift: b.shift,
        teacher_id: b.teacher_id || null,
      });
      return sendJson(res, 201, { ok: true, student: s });
    }
    if ((method === 'PUT' || method === 'DELETE') && seg[0] === 'api' && seg[1] === 'students' && seg[2] && seg[2] !== 'import' && seg[2] !== 'lookup') {
      if (!requireAuth(req, res, ['admin'])) return;
      const s = store.findOne('students', seg[2]);
      if (!s) return sendJson(res, 404, { ok: false, error: 'student not found' });
      if (method === 'DELETE') { store.remove('students', s.id); return sendJson(res, 200, { ok: true }); }
      const b = await readBody(req).catch(() => null);
      if (!b) return sendJson(res, 400, { ok: false, error: 'invalid JSON' });
      const patch = {};
      for (const f of ['roll_number', 'name', 'father_name', 'course', 'shift', 'teacher_id']) {
        if (b[f] !== undefined) patch[f] = typeof b[f] === 'string' ? b[f].trim() : b[f];
      }
      if (patch.roll_number && patch.roll_number.toLowerCase() !== s.roll_number.toLowerCase() &&
          store.findOne('students', (x) => x.roll_number.toLowerCase() === patch.roll_number.toLowerCase())) {
        return sendJson(res, 400, { ok: false, error: 'roll_number already exists' });
      }
      const updated = store.update('students', s.id, patch);
      return sendJson(res, 200, { ok: true, student: updated });
    }

    // ---- tests ----
    if (method === 'GET' && pathname === '/api/tests') {
      let list = store.find('tests');
      if (query.course) list = list.filter((t) => t.course === query.course);
      if (query.type) list = list.filter((t) => t.type === query.type);
      if (query.month) list = list.filter((t) => t.month === query.month);
      return sendJson(res, 200, { ok: true, tests: list.map(testSummary) });
    }
    if (method === 'GET' && seg[0] === 'api' && seg[1] === 'tests' && seg[2]) {
      const t = store.findOne('tests', seg[2]);
      if (!t) return sendJson(res, 404, { ok: false, error: 'test not found' });
      // Staff (valid token) see answers; students / anonymous never do.
      const user = userFromRequest(req);
      const staff = user && ['teacher', 'admin', 'principal'].includes(user.role);
      return sendJson(res, 200, { ok: true, test: staff ? t : stripAnswers(t) });
    }
    if (method === 'POST' && pathname === '/api/tests') {
      if (!requireAuth(req, res, ['admin'])) return;
      const b = await readBody(req).catch(() => null);
      const err = validateTestInput(b);
      if (err) return sendJson(res, 400, { ok: false, error: err });
      const t = store.insert('tests', {
        id: newId(), title: b.title.trim(), course: b.course.trim(), type: b.type,
        month: b.type === 'monthly-test' ? b.month : null,
        duration_minutes: +b.duration_minutes, randomize: b.randomize ? 1 : 0,
        questions: b.questions, created_at: nowIso(),
      });
      return sendJson(res, 201, { ok: true, test: t });
    }
    if ((method === 'PUT' || method === 'DELETE') && seg[0] === 'api' && seg[1] === 'tests' && seg[2]) {
      if (!requireAuth(req, res, ['admin'])) return;
      const t = store.findOne('tests', seg[2]);
      if (!t) return sendJson(res, 404, { ok: false, error: 'test not found' });
      if (method === 'DELETE') { store.remove('tests', t.id); return sendJson(res, 200, { ok: true }); }
      const b = await readBody(req).catch(() => null);
      const err = validateTestInput(b);
      if (err) return sendJson(res, 400, { ok: false, error: err });
      const updated = store.update('tests', t.id, {
        title: b.title.trim(), course: b.course.trim(), type: b.type,
        month: b.type === 'monthly-test' ? b.month : null,
        duration_minutes: +b.duration_minutes, randomize: b.randomize ? 1 : 0,
        questions: b.questions,
      });
      return sendJson(res, 200, { ok: true, test: updated });
    }

    // ---- submissions ----
    if (method === 'POST' && pathname === '/api/submissions') {
      const b = await readBody(req).catch(() => null);
      if (!b || typeof b.client_id !== 'string' || !b.client_id.trim()) {
        return sendJson(res, 400, { ok: false, error: 'client_id is required' });
      }
      // Dedupe by client_id (offline queue may retry) — return the existing one.
      const existing = store.findOne('submissions', (s) => s.client_id === b.client_id);
      if (existing) {
        return sendJson(res, 200, { ok: true, deduped: true, submission: submissionSummary(existing) });
      }
      const test = b.test_id ? store.findOne('tests', b.test_id) : null;
      if (!test) return sendJson(res, 400, { ok: false, error: 'test_id is required and must exist' });
      const st = b.student || {};
      if (!st.roll_number) return sendJson(res, 400, { ok: false, error: 'student roll_number is required' });
      // STRICT roll validation: the roll number MUST be registered by Admin
      // (student list / CSV import). The registered record is the truth —
      // client-supplied name/course/shift/teacher are ignored, so a forged
      // payload can never invent a student or steal another teacher's queue.
      const registered = store.findOne('students', (x) =>
        x.roll_number.toLowerCase() === String(st.roll_number).trim().toLowerCase());
      if (!registered) return sendJson(res, 404, { ok: false, error: 'roll_not_registered' });
      if (!Array.isArray(b.answers)) return sendJson(res, 400, { ok: false, error: 'answers must be an array' });
      const g = gradeSubmission(test, b.answers);
      const sub = store.insert('submissions', {
        id: newId(), client_id: b.client_id, student_roll: registered.roll_number,
        student_name: registered.name, father_name: registered.father_name || '',
        course: registered.course, shift: registered.shift,
        teacher_id: registered.teacher_id || null, test_id: test.id, test_title: test.title,
        date: todayStr(), answers: b.answers,
        mcq_score: g.mcq_score, mcq_max: g.mcq_max, theory_marks: {}, theory_max: g.theory_max,
        total: g.mcq_score, max_total: g.max_total, status: 'submitted',
        submitted_at: nowIso(), graded_at: null, locked: 0,
      });
      return sendJson(res, 201, { ok: true, submission: submissionSummary(sub) });
    }
    if (method === 'GET' && pathname === '/api/submissions') {
      const user = requireAuth(req, res, null);
      if (!user) return;
      let list = store.find('submissions');
      // Teachers are FORCED to their own students, whatever the query says.
      const teacherId = user.role === 'teacher' ? user.id : (query.teacher_id || null);
      if (teacherId) list = list.filter((s) => s.teacher_id === teacherId);
      if (query.date) list = list.filter((s) => s.date === query.date);
      if (query.status) list = list.filter((s) => s.status === query.status);
      if (query.test_id) list = list.filter((s) => s.test_id === query.test_id);
      if (query.course) list = list.filter((s) => s.course === query.course);
      list.sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at)));
      return sendJson(res, 200, { ok: true, submissions: list });
    }
    if (method === 'POST' && pathname === '/api/submissions/bulk-send') {
      const user = requireAuth(req, res, ['teacher']);
      if (!user) return;
      const b = await readBody(req).catch(() => ({}));
      const date = (b && b.date && isValidDate(b.date)) ? b.date : todayStr();
      let sent = 0, skipped = 0;
      for (const s of store.find('submissions', (x) => x.teacher_id === user.id && x.date === date && x.status === 'graded')) {
        if (s.locked) { skipped++; continue; }
        if (theoryUnmarked(s)) { skipped++; continue; }
        store.update('submissions', s.id, { status: 'sent_to_admin' });
        sent++;
      }
      return sendJson(res, 200, { ok: true, date, sent, skipped });
    }
    if (method === 'GET' && seg[0] === 'api' && seg[1] === 'submissions' && seg[2]) {
      const user = requireAuth(req, res, null);
      if (!user) return;
      const s = store.findOne('submissions', seg[2]);
      if (!s) return sendJson(res, 404, { ok: false, error: 'submission not found' });
      if (user.role === 'teacher' && s.teacher_id !== user.id) return sendJson(res, 403, { ok: false, error: 'forbidden' });
      return sendJson(res, 200, { ok: true, submission: s });
    }
    if (method === 'POST' && seg[0] === 'api' && seg[1] === 'submissions' && seg[2] && seg[3] === 'grade') {
      const user = requireAuth(req, res, ['teacher', 'admin']);
      if (!user) return;
      const s = store.findOne('submissions', seg[2]);
      if (!s) return sendJson(res, 404, { ok: false, error: 'submission not found' });
      if (user.role === 'teacher' && s.teacher_id !== user.id) return sendJson(res, 403, { ok: false, error: 'forbidden' });
      if (s.locked) return sendJson(res, 403, { ok: false, error: 'submission is locked' });
      const b = await readBody(req).catch(() => null);
      if (!b || typeof b.theory_marks !== 'object' || Array.isArray(b.theory_marks)) {
        return sendJson(res, 400, { ok: false, error: 'theory_marks object is required' });
      }
      // Clamp each mark to [0, max_marks] of its theory/FIB question; ignore
      // MCQ indexes (MCQs are auto-graded from the Admin's key — a mark sent
      // for an MCQ index can never change the score).
      const test = store.findOne('tests', s.test_id);
      const marks = Object.assign({}, s.theory_marks || {});
      for (const [k, v] of Object.entries(b.theory_marks)) {
        const qi = parseInt(k, 10);
        const q = test && test.questions ? test.questions[qi] : null;
        if (!q || (q.type !== 'theory' && q.type !== 'fib')) continue;
        marks[qi] = Math.max(0, Math.min(+q.max_marks, +v || 0));
      }
      const theoryTotal = Object.values(marks).reduce((sum, v) => sum + (+v || 0), 0);
      const updated = store.update('submissions', s.id, {
        theory_marks: marks, total: s.mcq_score + theoryTotal,
        status: 'graded', graded_at: nowIso(),
      });
      return sendJson(res, 200, { ok: true, submission: updated });
    }
    if (method === 'POST' && seg[0] === 'api' && seg[1] === 'submissions' && seg[2] && seg[3] === 'send') {
      const user = requireAuth(req, res, ['teacher']);
      if (!user) return;
      const s = store.findOne('submissions', seg[2]);
      if (!s) return sendJson(res, 404, { ok: false, error: 'submission not found' });
      if (s.teacher_id !== user.id) return sendJson(res, 403, { ok: false, error: 'forbidden' });
      if (s.locked) return sendJson(res, 403, { ok: false, error: 'submission is locked' });
      if (s.status !== 'submitted' && s.status !== 'graded') {
        return sendJson(res, 400, { ok: false, error: 'only submitted or graded submissions can be sent' });
      }
      if (theoryUnmarked(s)) {
        return sendJson(res, 400, { ok: false, error: 'all theory questions must be marked before sending' });
      }
      const updated = store.update('submissions', s.id, { status: 'sent_to_admin' });
      return sendJson(res, 200, { ok: true, submission: updated });
    }
    if (method === 'POST' && seg[0] === 'api' && seg[1] === 'submissions' && seg[2] && seg[3] === 'finalize') {
      if (!requireAuth(req, res, ['admin'])) return;
      const s = store.findOne('submissions', seg[2]);
      if (!s) return sendJson(res, 404, { ok: false, error: 'submission not found' });
      if (s.status !== 'sent_to_admin') {
        return sendJson(res, 400, { ok: false, error: 'only sent_to_admin submissions can be finalized' });
      }
      const updated = store.update('submissions', s.id, { status: 'final' });
      return sendJson(res, 200, { ok: true, submission: updated });
    }

    // ---- USB lab sync (offline labs, no network) ----
    // Lab pack: every student + every test, with questions stripped of
    // answer keys (stripAnswers removes MCQ `correct` and FIB
    // suggested_answer). The pack is embedded into lab-template.html and
    // downloaded as STC-Lab.html — a single file the lab laptops open
    // with a double-click. Admin only: the pack holds the student list.
    if (method === 'GET' && pathname === '/api/lab-pack') {
      if (!requireAuth(req, res, ['admin'])) return;
      let template;
      try {
        template = fs.readFileSync(path.join(ROOT, 'lab-template.html'), 'utf8');
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: 'lab template missing' });
      }
      const marker = '/*__STC_LAB_PACK__*/ null';
      if (!template.includes(marker)) {
        return sendJson(res, 500, { ok: false, error: 'lab template is corrupt (pack marker missing)' });
      }
      const pack = {
        pack_id: newId(), generated_at: nowIso(), version: VERSION,
        students: store.find('students').map((s) => ({
          roll_number: s.roll_number, name: s.name, father_name: s.father_name || '',
          course: s.course, shift: s.shift,
          teacher_id: s.teacher_id || null, teacher_name: teacherName(s.teacher_id),
        })),
        tests: store.find('tests').map(stripAnswers),
      };
      // Escape '<' so no student/test text can break out of the <script> block.
      const html = template.replace(marker, JSON.stringify(pack).replace(/</g, '\\u003c'));
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': 'attachment; filename="STC-Lab.html"',
      });
      res.end(html);
    }
    // Lab import: submissions JSON exported from a lab laptop (USB stick).
    // Accepts the lab app's envelope { submissions: [...] } or a bare array.
    // Each submission is validated like an online submit (test must exist,
    // roll must be registered — the registered record is the truth), MCQs
    // are auto-graded from the server's key, and records are inserted with
    // the EXACT online submission schema (status 'submitted'), so teacher
    // grading, send-to-admin, finalize and the monthly report work unchanged.
    // Dedupe by client_id: re-importing the same USB file is safe.
    if (method === 'POST' && pathname === '/api/lab-import') {
      if (!requireAuth(req, res, ['admin'])) return;
      const b = await readBody(req).catch(() => null);
      const list = Array.isArray(b) ? b : (b && Array.isArray(b.submissions) ? b.submissions : null);
      if (!list) return sendJson(res, 400, { ok: false, error: 'submissions array is required' });
      let imported = 0, duplicates = 0;
      const errors = [];
      for (let i = 0; i < list.length; i++) {
        const item = list[i] || {};
        const label = 'submission ' + (i + 1) + (item.client_id ? ' (' + item.client_id + ')' : '');
        if (typeof item.client_id !== 'string' || !item.client_id.trim()) {
          errors.push({ index: i, error: label + ': client_id is required' }); continue;
        }
        if (store.findOne('submissions', (s) => s.client_id === item.client_id)) { duplicates++; continue; }
        const test = item.test_id ? store.findOne('tests', item.test_id) : null;
        if (!test) { errors.push({ index: i, client_id: item.client_id, error: label + ': test not found' }); continue; }
        const roll = item.student && item.student.roll_number;
        if (!roll) { errors.push({ index: i, client_id: item.client_id, error: label + ': student roll_number is required' }); continue; }
        const registered = store.findOne('students', (x) =>
          x.roll_number.toLowerCase() === String(roll).trim().toLowerCase());
        if (!registered) { errors.push({ index: i, client_id: item.client_id, error: label + ': roll_not_registered (' + roll + ')' }); continue; }
        if (!Array.isArray(item.answers)) { errors.push({ index: i, client_id: item.client_id, error: label + ': answers must be an array' }); continue; }
        const g = gradeSubmission(test, item.answers);
        // Date + submitted_at come from the lab record (when the student
        // actually took the test), so a Monday test counts on Monday even
        // if the USB import happens later. Fall back to today/now when
        // missing or invalid. (Tests run 7 AM–7 PM, so the UTC date in the
        // ISO timestamp always matches the local test date.)
        let submittedAt = nowIso();
        if (typeof item.submitted_at === 'string' && !isNaN(Date.parse(item.submitted_at))) {
          submittedAt = new Date(item.submitted_at).toISOString();
        }
        const date = isValidDate(submittedAt.slice(0, 10)) ? submittedAt.slice(0, 10) : todayStr();
        store.insert('submissions', {
          id: newId(), client_id: item.client_id, student_roll: registered.roll_number,
          student_name: registered.name, father_name: registered.father_name || '',
          course: registered.course, shift: registered.shift,
          teacher_id: registered.teacher_id || null, test_id: test.id, test_title: test.title,
          date, answers: item.answers,
          mcq_score: g.mcq_score, mcq_max: g.mcq_max, theory_marks: {}, theory_max: g.theory_max,
          total: g.mcq_score, max_total: g.max_total, status: 'submitted',
          submitted_at: submittedAt, graded_at: null, locked: 0,
        });
        imported++;
      }
      return sendJson(res, 200, { ok: true, imported, duplicates, errors });
    }

    // ---- monthly report ----
    if (method === 'GET' && pathname === '/api/reports/monthly') {
      if (!requireAuth(req, res, ['admin', 'principal'])) return;
      const month = query.month;
      if (!isValidMonth(month)) return sendJson(res, 400, { ok: false, error: 'month (YYYY-MM) is required' });
      return sendJson(res, 200, { ok: true, month, rows: monthlyReportRows(month) });
    }

    // ---- course-wise results (grouped by course) ----
    if (method === 'GET' && pathname === '/api/reports/course-wise') {
      if (!requireAuth(req, res, ['admin', 'principal'])) return;
      const month = query.month;
      if (!isValidMonth(month)) return sendJson(res, 400, { ok: false, error: 'month (YYYY-MM) is required' });
      const rows = resultsRows(month);
      const groups = [];
      const byCourse = {};
      for (const r of rows) {
        if (!byCourse[r.course]) { byCourse[r.course] = { course: r.course, rows: [] }; groups.push(byCourse[r.course]); }
        byCourse[r.course].rows.push(r);
      }
      return sendJson(res, 200, { ok: true, month, groups });
    }

    // ---- analytics ----
    if (method === 'GET' && pathname === '/api/analytics/day') {
      if (!requireAuth(req, res, ['admin', 'principal'])) return;
      const date = query.date && isValidDate(query.date) ? query.date : todayStr();
      const subs = store.find('submissions', (s) => s.date === date);
      const perShift = SHIFTS.map((shift) => {
        const inShift = subs.filter((s) => s.shift === shift);
        return {
          shift,
          submitted: inShift.filter((s) => s.status === 'submitted').length,
          graded: inShift.filter((s) => s.status === 'graded').length,
          sent: inShift.filter((s) => s.status === 'sent_to_admin').length,
          final: inShift.filter((s) => s.status === 'final').length,
          total: inShift.length,
        };
      });
      const courseCounts = {};
      for (const s of subs) courseCounts[s.course] = (courseCounts[s.course] || 0) + 1;
      const perCourse = Object.entries(courseCounts).map(([course, count]) => ({ course, count }));
      const byTeacher = {};
      for (const s of subs) {
        const key = s.teacher_id || '';
        if (!byTeacher[key]) {
          byTeacher[key] = { teacher_id: key, teacher_name: teacherName(key), submitted: 0, graded: 0, sent: 0, final: 0 };
        }
        if (s.status === 'submitted') byTeacher[key].submitted++;
        else if (s.status === 'graded') byTeacher[key].graded++;
        else if (s.status === 'sent_to_admin') byTeacher[key].sent++;
        else if (s.status === 'final') byTeacher[key].final++;
      }
      const totals = {
        submitted: subs.filter((s) => s.status === 'submitted').length,
        graded: subs.filter((s) => s.status === 'graded').length,
        sent: subs.filter((s) => s.status === 'sent_to_admin').length,
        final: subs.filter((s) => s.status === 'final').length,
        total: subs.length,
      };
      return sendJson(res, 200, { ok: true, date, perShift, perCourse, perTeacher: Object.values(byTeacher), totals });
    }
    if (method === 'GET' && pathname === '/api/analytics/month') {
      if (!requireAuth(req, res, ['admin', 'principal'])) return;
      const month = query.month;
      if (!isValidMonth(month)) return sendJson(res, 400, { ok: false, error: 'month (YYYY-MM) is required' });
      const subs = store.find('submissions', (s) => (s.date || '').startsWith(month));
      const byTeacher = {};
      for (const s of subs) {
        const key = s.teacher_id || '';
        if (!byTeacher[key]) {
          byTeacher[key] = { teacher_id: key, teacher_name: teacherName(key), sent_to_admin: 0, final: 0, pending: 0 };
        }
        if (s.status === 'sent_to_admin') byTeacher[key].sent_to_admin++;
        else if (s.status === 'final') byTeacher[key].final++;
        else byTeacher[key].pending++;
      }
      const byCourse = {};
      for (const s of subs) {
        const key = s.course || '';
        if (!byCourse[key]) byCourse[key] = { course: key, rolls: new Set(), pctSum: 0, pctN: 0 };
        byCourse[key].rolls.add(s.student_roll);
        if (s.max_total > 0) { byCourse[key].pctSum += (s.total / s.max_total) * 100; byCourse[key].pctN++; }
      }
      const perCourse = Object.values(byCourse).map((c) => ({
        course: c.course, students: c.rolls.size,
        avg_percentage: c.pctN ? Math.round((c.pctSum / c.pctN) * 10) / 10 : 0,
      }));
      const totals = {
        submissions: subs.length,
        students: new Set(subs.map((s) => s.student_roll)).size,
        sent_to_admin: subs.filter((s) => s.status === 'sent_to_admin').length,
        final: subs.filter((s) => s.status === 'final').length,
        pending: subs.filter((s) => s.status === 'submitted' || s.status === 'graded').length,
      };
      return sendJson(res, 200, { ok: true, month, perTeacher: Object.values(byTeacher), perCourse, totals });
    }

    // ---- consolidation ----
    if (method === 'POST' && pathname === '/api/consolidation/run') {
      if (!requireAuth(req, res, ['admin'])) return;
      const b = await readBody(req).catch(() => ({}));
      const date = (b && b.date && isValidDate(b.date)) ? b.date : todayStr();
      const result = runConsolidation(date);
      return sendJson(res, 200, Object.assign({ ok: true }, result));
    }
    if (method === 'GET' && pathname === '/api/consolidation') {
      if (!requireAuth(req, res, null)) return;
      const days = store.find('consolidations')
        .map((c) => ({ date: c.date, created_at: c.created_at, count: (c.master || []).length }))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
      return sendJson(res, 200, { ok: true, days });
    }
    if (method === 'GET' && seg[0] === 'api' && seg[1] === 'consolidation' && seg[2]) {
      const user = requireAuth(req, res, null);
      if (!user) return;
      const c = store.findOne('consolidations', (x) => x.date === seg[2]);
      if (!c) return sendJson(res, 404, { ok: false, error: 'no consolidation for that date' });
      let master = c.master || [];
      // Teachers see only their own students' rows in the per-day view.
      if (user.role === 'teacher') {
        const ownRolls = new Set(store.find('students', (s) => s.teacher_id === user.id).map((s) => s.roll_number));
        master = master.filter((r) => ownRolls.has(r.roll_number));
      }
      return sendJson(res, 200, { ok: true, date: c.date, master, locked: !!c.locked });
    }

    // ---- CSV exports (BOM + attachment) ----
    if (method === 'GET' && pathname === '/api/export/day.csv') {
      if (!requireAuth(req, res, ['admin', 'principal'])) return;
      const date = query.date && isValidDate(query.date) ? query.date : todayStr();
      const subs = store.find('submissions', (s) => s.date === date);
      const csv = toCsv(
        ['Roll Number', 'Student Name', "Father's Name", 'Course', 'Shift', 'Teacher', 'Test', 'MCQ Score', 'MCQ Max', 'Theory Marks', 'Theory Max', 'Total', 'Max Total', 'Status', 'Date'],
        subs.map((s) => [s.student_roll, s.student_name, s.father_name, s.course, s.shift, teacherName(s.teacher_id), s.test_title, s.mcq_score, s.mcq_max, theoryMarksTotal(s), s.theory_max, s.total, s.max_total, s.status, s.date]),
      );
      return sendCsv(res, 'day-' + date + '.csv', csv);
    }
    if (method === 'GET' && pathname === '/api/export/monthly.csv') {
      if (!requireAuth(req, res, ['admin', 'principal'])) return;
      const month = query.month;
      if (!isValidMonth(month)) return sendJson(res, 400, { ok: false, error: 'month (YYYY-MM) is required' });
      const rows = monthlyReportRows(month);
      const csv = toCsv(
        ['Roll Number', 'Student Name', "Father's Name", 'Course', 'Shift', 'Teacher', 'Tests', 'Total', 'Max', 'Percentage', 'Result'],
        rows.map((r) => [r.roll_number, r.name, r.father_name, r.course, r.shift, r.teacher_name,
          r.tests.map((t) => t.title + ' (' + t.total + '/' + t.max + ')').join('; '),
          r.total, r.max, r.percentage, r.result]),
      );
      return sendCsv(res, 'monthly-' + month + '.csv', csv);
    }
    if (method === 'GET' && pathname === '/api/export/results.csv') {
      if (!requireAuth(req, res, ['admin', 'principal'])) return;
      const month = query.month;
      if (!isValidMonth(month)) return sendJson(res, 400, { ok: false, error: 'month (YYYY-MM) is required' });
      const rows = resultsRows(month);
      const csv = toCsv(
        ['Roll Number', 'Student Name', "Father's Name", 'Course', 'Shift', 'Teacher', 'Test', 'MCQ Marks', 'Theory/FIB Marks', 'Total', 'Max', 'Percentage', 'Grade'],
        rows.map((r) => [r.roll_number, r.name, r.father_name, r.course, r.shift, r.teacher_name, r.test_title,
          r.mcq_score + ' / ' + r.mcq_max, r.theory_marks_total + ' / ' + r.theory_max,
          r.total, r.max_total, r.percentage, r.result]),
      );
      return sendCsv(res, 'results-' + month + '.csv', csv);
    }
    if (method === 'GET' && pathname === '/api/export/consolidation.csv') {
      if (!requireAuth(req, res, ['admin', 'principal'])) return;
      const date = query.date && isValidDate(query.date) ? query.date : todayStr();
      const c = store.findOne('consolidations', (x) => x.date === date);
      if (!c) return sendJson(res, 404, { ok: false, error: 'no consolidation for that date' });
      const csv = toCsv(
        ['Roll Number', 'Student Name', "Father's Name", 'Course', 'Shift', 'Teacher', 'Test', 'MCQ Score', 'MCQ Max', 'Theory Marks', 'Theory Max', 'Total', 'Max Total', 'Status'],
        (c.master || []).map((r) => [r.roll_number, r.name, r.father_name, r.course, r.shift, r.teacher_name, r.test_title, r.mcq_score, r.mcq_max, r.theory_marks_total, r.theory_max, r.total, r.max_total, r.status]),
      );
      return sendCsv(res, 'consolidation-' + date + '.csv', csv);
    }

    return sendJson(res, 404, { ok: false, error: 'not found' });
  }

  // --- submission helpers used by routes above ------------------------------
  function submissionSummary(s) {
    return {
      id: s.id, mcq_score: s.mcq_score, mcq_max: s.mcq_max, theory_max: s.theory_max,
      total: s.total, max_total: s.max_total, status: s.status,
    };
  }
  // True when the test has theory or fill-in-the-blank questions and any of
  // them has no mark yet (both are teacher-graded and must be marked first).
  function theoryUnmarked(sub) {
    const test = store.findOne('tests', sub.test_id);
    if (!test) return false;
    const marks = sub.theory_marks || {};
    return (test.questions || []).some((q, i) =>
      (q.type === 'theory' || q.type === 'fib') && marks[i] === undefined && marks[String(i)] === undefined);
  }
  function validateStudentInput(b) {
    if (!b) return 'invalid JSON';
    if (typeof b.roll_number !== 'string' || !b.roll_number.trim()) return 'roll_number is required';
    if (typeof b.name !== 'string' || !b.name.trim()) return 'name is required';
    if (typeof b.course !== 'string' || !b.course.trim()) return 'course is required';
    if (typeof b.shift !== 'string' || !SHIFTS.includes(b.shift)) return 'shift must be one of the 11 institute shifts';
    return null;
  }
  // CSV student import — header mapping is case-insensitive; teacher matched by name.
  function importStudents(csvText) {
    const rows = parseCsv(csvText);
    let imported = 0, skipped = 0;
    const errors = [];
    if (rows.length === 0) return { imported, skipped, errors: [{ row: 0, error: 'empty CSV' }] };
    const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const header = rows[0].map(norm);
    const col = (names) => {
      for (const n of names) {
        const i = header.indexOf(n);
        if (i >= 0) return i;
      }
      return -1;
    };
    const cRoll = col(['roll number', 'roll', 'roll_number', 'roll no']);
    const cName = col(['student name', 'name']);
    const cFather = col(["father's name", 'father name', 'father']);
    const cCourse = col(['course']);
    const cShift = col(['shift']);
    const cTeacher = col(['assigned teacher', 'teacher', 'teacher name']);
    if (cRoll < 0 || cName < 0) {
      return { imported, skipped, errors: [{ row: 1, error: 'header must include "Roll Number" and "Student Name"' }] };
    }
    const teachers = store.find('users', (u) => u.role === 'teacher');
    // Assigned Teacher matches by username OR full name (case-insensitive).
    // Forgiving: a leading honorific ("Sir ", "Mr. ", "Miss " ...) is ignored
    // and extra spaces are collapsed — "Sir Ashok Kumar" matches Ashok Kumar.
    const findTeacher = (val) => {
      if (!val) return null;
      const v = String(val).trim().toLowerCase().replace(/\s+/g, ' ')
        .replace(/^(sir|mr|mrs|miss|ms|madam|dr)\.?\s+/, '');
      const t = teachers.find((u) =>
        u.username.toLowerCase() === v || u.name.toLowerCase() === v);
      return t ? t.id : null;
    };
    // Shift values are normalized before matching: extra spaces collapsed,
    // en/em dashes treated as hyphens, single-digit hours zero-padded —
    // "9:00 AM - 10:00 AM" becomes the canonical "09:00 AM - 10:00 AM".
    // Anything that is not one of the 11 institute shifts still fails.
    const normalizeShift = (val) => {
      const s = String(val || '').trim().replace(/[\u2013\u2014\u2212]/g, '-').replace(/\s+/g, ' ');
      const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(s);
      if (!m) return s;
      const pad = (h) => String(h).padStart(2, '0');
      return pad(m[1]) + ':' + m[2] + ' ' + m[3].toUpperCase() + ' - ' +
        pad(m[4]) + ':' + m[5] + ' ' + m[6].toUpperCase();
    };
    // Course names are matched case-insensitively to the canonical course
    // list ("cit" -> "CIT"); unknown courses are kept as written.
    const courses = store.find('courses');
    const normalizeCourse = (val) => {
      const v = String(val || '').trim();
      const c = courses.find((x) => x.name.toLowerCase() === v.toLowerCase());
      return c ? c.name : v;
    };
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const roll = String(row[cRoll] || '').trim();
      const name = String(row[cName] || '').trim();
      const father = cFather >= 0 ? String(row[cFather] || '').trim() : '';
      const course = cCourse >= 0 ? normalizeCourse(row[cCourse]) : '';
      const shift = cShift >= 0 ? normalizeShift(row[cShift]) : '';
      const teacherNameVal = cTeacher >= 0 ? String(row[cTeacher] || '').trim() : '';
      if (!roll || !name) { errors.push({ row: r + 1, error: 'missing roll number or student name' }); continue; }
      if (store.findOne('students', (s) => s.roll_number.toLowerCase() === roll.toLowerCase())) { skipped++; continue; }
      if (!course) { errors.push({ row: r + 1, error: 'missing course' }); continue; }
      if (!SHIFTS.includes(shift)) { errors.push({ row: r + 1, error: 'invalid shift: ' + shift }); continue; }
      // A named teacher that does not exist rejects the row — silently
      // dropping the assignment would leave the student teacher-less.
      let teacherId = null;
      if (teacherNameVal) {
        teacherId = findTeacher(teacherNameVal);
        if (!teacherId) { errors.push({ row: r + 1, error: 'unknown teacher: ' + teacherNameVal }); continue; }
      }
      store.insert('students', {
        id: newId(), roll_number: roll, name, father_name: father, course, shift,
        teacher_id: teacherId,
      });
      imported++;
    }
    return { imported, skipped, errors };
  }

  // CSV teacher import — creates teacher accounts.
  // Columns: Teacher Name (required), Course (required, must exist; several
  // courses separated by ';'), Username (optional — auto from first name),
  // Password (optional — default teacher123). Duplicate usernames reject
  // the row with a clear error.
  function importTeachers(csvText) {
    const rows = parseCsv(csvText);
    let imported = 0, skipped = 0;
    const errors = [];
    if (rows.length === 0) return { imported, skipped, errors: [{ row: 0, error: 'empty CSV' }] };
    const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const header = rows[0].map(norm);
    const col = (names) => {
      for (const n of names) {
        const i = header.indexOf(n);
        if (i >= 0) return i;
      }
      return -1;
    };
    const cName = col(['teacher name', 'name', 'full name']);
    const cCourse = col(['course', 'courses', 'courses taught']);
    const cUsername = col(['username', 'user name']);
    const cPassword = col(['password']);
    if (cName < 0 || cCourse < 0) {
      return { imported, skipped, errors: [{ row: 1, error: 'header must include "Teacher Name" and "Course"' }] };
    }
    const courseNames = store.find('courses').map((c) => c.name);
    const matchCourse = (v) => {
      const found = courseNames.find((n) => n.toLowerCase() === String(v).trim().toLowerCase());
      return found || null;
    };
    const usernameTaken = (u) =>
      !!store.findOne('users', (x) => x.username.toLowerCase() === u.toLowerCase());
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const name = String(row[cName] || '').trim();
      const courseCell = String(row[cCourse] || '').trim();
      let username = cUsername >= 0 ? String(row[cUsername] || '').trim() : '';
      const password = cPassword >= 0 ? String(row[cPassword] || '').trim() : '';
      if (!name) { errors.push({ row: r + 1, error: 'missing teacher name' }); continue; }
      if (!courseCell) { errors.push({ row: r + 1, error: 'missing course' }); continue; }
      const courses = [];
      let badCourse = null;
      for (const part of courseCell.split(';')) {
        const m = matchCourse(part);
        if (!m) { badCourse = part.trim(); break; }
        if (!courses.includes(m)) courses.push(m);
      }
      if (badCourse) { errors.push({ row: r + 1, error: 'unknown course: ' + badCourse }); continue; }
      if (!username) {
        // Auto username from first name (lowercase, letters only); suffix a
        // number until it is unique so an auto name never blocks a row.
        const base = (name.split(/\s+/)[0] || 'teacher').toLowerCase().replace(/[^a-z0-9]/g, '') || 'teacher';
        username = base;
        let n = 2;
        while (usernameTaken(username)) { username = base + n; n++; }
      } else {
        if (usernameTaken(username)) { errors.push({ row: r + 1, error: 'duplicate username: ' + username }); continue; }
      }
      const pw = password || 'teacher123';
      if (pw.length < 4) { errors.push({ row: r + 1, error: 'password must be at least 4 characters' }); continue; }
      store.insert('users', {
        id: newId(), username, password_hash: hashPassword(pw),
        name, role: 'teacher', courses,
      });
      imported++;
    }
    return { imported, skipped, errors };
  }

  // Per-submission result rows for one month's monthly tests, for results
  // that teachers have sent to Admin (sent_to_admin) or Admin finalized.
  // Sorted by course, then roll number, then test title — the course-wise
  // order used by both the CSV export and the printable result sheet.
  function resultsRows(month) {
    const testsById = {};
    for (const t of store.find('tests')) testsById[t.id] = t;
    const subs = store.find('submissions', (s) => {
      if (s.status !== 'sent_to_admin' && s.status !== 'final') return false;
      const t = testsById[s.test_id];
      return t && t.type === 'monthly-test' && t.month === month;
    });
    const rows = subs.map((s) => {
      const theoryTotal = theoryMarksTotal(s);
      const percentage = s.max_total > 0 ? Math.round((s.total / s.max_total) * 1000) / 10 : 0;
      return {
        roll_number: s.student_roll, name: s.student_name, father_name: s.father_name,
        course: s.course, shift: s.shift, teacher_name: teacherName(s.teacher_id),
        test_title: s.test_title, date: s.date,
        mcq_score: s.mcq_score, mcq_max: s.mcq_max,
        theory_marks_total: theoryTotal, theory_max: s.theory_max,
        total: s.total, max_total: s.max_total,
        percentage, result: percentage >= 40 ? 'Pass' : 'Fail', status: s.status,
      };
    });
    rows.sort((a, b) =>
      String(a.course).localeCompare(String(b.course)) ||
      String(a.roll_number).localeCompare(String(b.roll_number)) ||
      String(a.test_title).localeCompare(String(b.test_title)));
    return rows;
  }

  // --- static file serving ---------------------------------------------------
  const MIME = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.csv': 'text/csv; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
  };
  function serveFile(res, filePath) {
    fs.readFile(filePath, (err, data) => {
      if (err) { sendJson(res, 404, { ok: false, error: 'not found' }); return; }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  }

  // --- main dispatcher -------------------------------------------------------
  async function handle(req, res) {
    try {
      const u = new URL(req.url, 'http://localhost');
      const pathname = u.pathname;
      const query = Object.fromEntries(u.searchParams.entries());

      if (pathname.startsWith('/api/')) {
        await handleApi(req, res, pathname, query);
        return;
      }
      // Portal pages — separate URLs, separate files (no shared navigation).
      const PORTAL_PAGES = {
        '/': 'index.html',
        '/student': 'student.html',
        '/teacher': 'teacher.html',
        '/admin': 'admin.html',
        '/principal': 'principal.html',
      };
      if (PORTAL_PAGES[pathname]) {
        return serveFile(res, path.join(PUBLIC_DIR, PORTAL_PAGES[pathname]));
      }
      // Authenticated console fragments (NOT in public/ — never served statically).
      // Each fragment requires a logged-in user of the matching role, so no
      // console content can ever be seen without a successful login.
      if (pathname.startsWith('/fragments/')) {
        const name = pathname.slice('/fragments/'.length);
        const FRAGMENTS = {
          'teacher-console.html': 'teacher',
          'admin-console.html': 'admin',
          'principal-console.html': 'principal',
        };
        const role = FRAGMENTS[name];
        if (!role) return sendJson(res, 404, { ok: false, error: 'not found' });
        if (!requireAuth(req, res, [role])) return;
        return serveFile(res, path.join(ROOT, 'fragments', name));
      }
      // Template CSVs served from the package root (frontend also keeps copies in public/).
      if (pathname === '/students_template.csv') {
        return serveFile(res, path.join(ROOT, 'students_template.csv'));
      }
      if (pathname === '/teachers_template.csv') {
        return serveFile(res, path.join(ROOT, 'teachers_template.csv'));
      }
      // Static frontend from ./public (path traversal guarded).
      let rel = decodeURIComponent(pathname).replace(/^\/+/, '');
      const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
      if (!filePath.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { ok: false, error: 'forbidden' });
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        return sendJson(res, 404, { ok: false, error: 'not found' });
      }
      return serveFile(res, filePath);
    } catch (e) {
      console.error('[server] error:', e);
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'internal error' });
    }
  }

  return { handle, runConsolidation, sessions };
}

module.exports.createApp = createApp;

// ---------------------------------------------------------------------------
// Startup (only when run directly: `node server.js`)
// ---------------------------------------------------------------------------
if (require.main === module) {
  const { seedDatabase } = require('./seed.js');
  const store = createStore(DATA_DIR);
  console.log('[stc] DB backend: ' + store.type + ' (' + DATA_DIR + ')');
  if (store.find('users').length === 0) {
    seedDatabase(store);
    console.log('[stc] Seed data loaded (users empty on startup).');
  }
  const app = createApp(store);
  const server = http.createServer((req, res) => app.handle(req, res));
  server.listen(PORT, HOST, () => {
    console.log('[stc] STC Testing System listening on http://' + HOST + ':' + PORT);
  });
}
