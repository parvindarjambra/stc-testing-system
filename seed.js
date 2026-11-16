// STC Testing System — seed data (idempotent: re-runnable, never creates duplicates).
// Run standalone:  node seed.js
// Also run automatically by server.js on startup when the users collection is empty.
//
// Seeds ONLY real institute data: the Principal, Admin and all 14 real teachers
// (accounts), the 7 real courses and the 11 shifts.
// NO students and NO tests are seeded — the system starts CLEAN. Admin adds the
// real students (Add Student / CSV import) and creates each month's test fresh.
// (v1.2.0: the old 17 sample students and 2 sample tests were removed at the
// centre's request — no dummy data ships in the system.)
//
// Real faculty of Super Sys-Tech Computers Centre, Umerkot.
// Principal: Ramesh Kumar. Admin / Exam Controller: Danish Mustafa.
// All 14 teachers share password teacher123 (LAN-demo grade).

'use strict';

const { createStore, hashPassword } = require('./server.js');
const crypto = require('crypto');
const path = require('path');

function newId() { return crypto.randomUUID(); }

const SHIFTS = [
  '07:00 AM - 08:00 AM', '08:00 AM - 09:00 AM', '09:00 AM - 10:00 AM',
  '10:00 AM - 11:00 AM', '11:00 AM - 12:00 PM', '12:00 PM - 01:00 PM',
  '02:00 PM - 03:00 PM', '03:00 PM - 04:00 PM', '04:00 PM - 05:00 PM',
  '05:00 PM - 06:00 PM', '06:00 PM - 07:00 PM',
];

const COURSES = [
  'DIT', 'CIT', 'One Year Compulsory', 'Web Development',
  'E-commerce', 'Graphic Designing', 'Digital Marketing',
];

// username, name, role, password, courses
const USERS = [
  ['principal', 'Ramesh Kumar', 'principal', 'principal123', []],
  ['admin', 'Danish Mustafa', 'admin', 'admin123', []],
  ['suneel', 'Suneel Kumar', 'teacher', 'teacher123', ['Web Development']],
  ['mukesh', 'Mukesh Kumar', 'teacher', 'teacher123', ['Web Development']],
  ['chatar', 'Chatar Khatri', 'teacher', 'teacher123', ['Graphic Designing']],
  ['kelash', 'Kelash Kumar', 'teacher', 'teacher123', ['DIT', 'CIT', 'One Year Compulsory']],
  ['ashok', 'Ashok Kumar', 'teacher', 'teacher123', ['DIT', 'CIT', 'One Year Compulsory']],
  ['mahaveer', 'Mahaveer Singh', 'teacher', 'teacher123', ['DIT', 'CIT', 'One Year Compulsory']],
  ['qurban', 'Qurban Ali', 'teacher', 'teacher123', ['DIT', 'CIT', 'One Year Compulsory']],
  ['ramchand', 'Ramchand Rathore', 'teacher', 'teacher123', ['DIT', 'CIT', 'One Year Compulsory']],
  ['sooraj', 'Sooraj Kumar', 'teacher', 'teacher123', ['DIT', 'CIT', 'One Year Compulsory']],
  ['afzal', 'Muhammad Afzal', 'teacher', 'teacher123', ['DIT', 'CIT', 'One Year Compulsory']],
  ['faiz', 'Faiz Muhammad', 'teacher', 'teacher123', ['DIT', 'CIT', 'One Year Compulsory']],
  ['ghansham', 'Ghansham Kachhi', 'teacher', 'teacher123', ['DIT', 'CIT', 'One Year Compulsory']],
  ['pawan', 'Pawan', 'teacher', 'teacher123', ['DIT', 'CIT', 'One Year Compulsory']],
  ['kapil', 'Kapil', 'teacher', 'teacher123', ['DIT', 'CIT', 'One Year Compulsory']],
];

function seedDatabase(store) {
  const counts = { users: 0, courses: 0 };

  // Users — dedupe by username.
  for (const [username, name, role, password, courses] of USERS) {
    if (!store.findOne('users', (x) => x.username === username)) {
      store.insert('users', {
        id: newId(), username, password_hash: hashPassword(password),
        name, role, courses: courses || [],
      });
      counts.users++;
    }
  }

  // Courses — dedupe by name.
  for (const name of COURSES) {
    if (!store.findOne('courses', (c) => c.name === name)) {
      store.insert('courses', { id: newId(), name });
      counts.courses++;
    }
  }

  // NOTE: no students and no tests are seeded. The Students and Tests lists
  // start empty; Admin adds real students and creates each month's test.
  return counts;
}

module.exports = { seedDatabase, USERS, COURSES, SHIFTS };

// Standalone: node seed.js
if (require.main === module) {
  const store = createStore(path.join(__dirname, 'data'));
  const counts = seedDatabase(store);
  console.log('[seed] DB backend: ' + store.type);
  console.log('[seed] Inserted: ' + JSON.stringify(counts) + ' (0 = already present, idempotent)');
  console.log('[seed] Students and tests are NOT seeded — Admin adds them in the portal.');
}
