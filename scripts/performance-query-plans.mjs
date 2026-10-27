#!/usr/bin/env node
// Read-only diagnostics. Supply MONGODB_URI explicitly; never loads a deployment .env.
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../apps/api/package.json', import.meta.url));

export function summarizeExplain(explain) {
  const stages = new Set();
  const indexes = new Set();
  const stats = [];
  function walk(value) {
    if (!value || typeof value !== 'object') return;
    if (typeof value.stage === 'string') stages.add(value.stage);
    if (typeof value.indexName === 'string') indexes.add(value.indexName);
    if (value.executionStats) stats.push(value.executionStats);
    for (const [key, nested] of Object.entries(value)) {
      // Only winning/executed plans; rejected plans do not describe this execution.
      if (key !== 'rejectedPlans' && key !== 'allPlansExecution') walk(nested);
    }
  }
  walk(explain);
  const top = explain.executionStats;
  const measured = top ? [top] : stats;
  return {
    stages: [...stages].sort(), indexes: [...indexes].sort(),
    executionTimeMillis: measured.reduce((sum, item) => sum + (item.executionTimeMillis ?? 0), 0),
    totalDocsExamined: measured.reduce((sum, item) => sum + (item.totalDocsExamined ?? 0), 0),
    totalKeysExamined: measured.reduce((sum, item) => sum + (item.totalKeysExamined ?? 0), 0),
    nReturned: measured.reduce((sum, item) => sum + (item.nReturned ?? 0), 0),
  };
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI must be supplied explicitly');
  const mongoose = require('mongoose');
  if (process.env.PERF_STUDENT_ID && !/^[a-f\d]{24}$/i.test(process.env.PERF_STUDENT_ID)) {
    throw new Error('PERF_STUDENT_ID must be a MongoDB ObjectId');
  }
  const connection = await mongoose.createConnection(process.env.MONGODB_URI, {
    autoIndex: false, autoCreate: false, maxPoolSize: 2,
    serverSelectionTimeoutMS: 5000, socketTimeoutMS: 10000,
  }).asPromise();
  try {
    const db = connection.db;
    const sample = process.env.PERF_STUDENT_ID
      ? { _id: new mongoose.Types.ObjectId(process.env.PERF_STUDENT_ID) }
      : await db.collection('users').findOne({ role: 'student' }, { projection: { _id: 1 }, maxTimeMS: 5000 });
    const term = await db.collection('registration_terms').findOne(
      { isCurrent: true }, { sort: { updatedAt: -1, academicYear: -1 }, projection: { academicYear: 1, semester: 1 }, maxTimeMS: 5000 },
    );
    const find = (name, collection, filter, options = {}) => ({
      name, command: { find: collection, filter, ...options, maxTimeMS: 5000 },
    });
    const count = (name, filter) => ({ name, command: {
      aggregate: 'complaints', pipeline: [{ $match: filter }, { $group: { _id: 1, n: { $sum: 1 } } }],
      cursor: {}, maxTimeMS: 5000,
    } });
    const cases = [
      find('complaints.default-page', 'complaints', {}, { sort: { createdAt: -1, _id: -1 }, limit: 20 }),
      find('complaints.observed-100-page', 'complaints', {}, { sort: { createdAt: -1, _id: -1 }, skip: 0, limit: 100 }),
      find('complaints.deep-page', 'complaints', {}, { sort: { createdAt: -1, _id: -1 }, skip: 1000, limit: 20 }),
      find('complaints.open-page', 'complaints', { status: 'open' }, { sort: { createdAt: -1, _id: -1 }, limit: 20 }),
      count('complaints.exact-total', {}), count('complaints.open-total', { status: 'open' }),
      find('registration.current-terms', 'registration_terms', { isCurrent: true }, { sort: { updatedAt: -1, academicYear: -1 } }),
      find('registration.graduation-catalogue', 'courses', { isActive: true }, { projection: { code: 1, semester: 1 } }),
    ];
    // A diagnostic SID digest must be supplied explicitly; never sample or print sessions.
    if (process.env.PERF_SESSION_DIGEST) {
      if (!/^[a-f0-9]{64}$/.test(process.env.PERF_SESSION_DIGEST)) throw new Error('Invalid session digest');
      cases.push(find('auth.session-primary-key', 'auth_sessions', {
        _id: process.env.PERF_SESSION_DIGEST, revokedAt: null, expiresAt: { $gt: new Date() },
      }, { projection: { _id: 1 }, limit: 1 }));
    }
    if (sample) cases.push(find('auth.user-primary-key', 'users', { _id: sample._id }, {
      projection: { role: 1, tokenVersion: 1, isActive: 1, permissions: 1 }, limit: 1,
    }));
    if (sample) {
      cases.push(
        find('registration.academic-profile', 'student_academic_profiles', { studentId: sample._id }, { limit: 1 }),
        find('registration.student-context', 'student_profiles', { userId: sample._id }, { projection: { department: 1, academicWarnings: 1 }, limit: 1 }),
        find('registration.published-grades', 'grades', { studentId: sample._id, isPublished: true }, { projection: { courseCode: 1, examType: 1, grade: 1, maxGrade: 1, status: 1 } }),
      );
      if (term) cases.push(find('registration.existing', 'course_registrations', {
        studentId: sample._id, academicYear: term.academicYear, semester: term.semester,
      }, { projection: { _id: 1 }, limit: 1 }));
    }
    const collections = [...new Set(cases.map(({ command }) => command.find ?? command.aggregate))];
    const indexes = {};
    for (const name of collections) {
      // Index definitions only: never print documents, query values, credentials or server topology.
      indexes[name] = (await db.collection(name).listIndexes({ maxTimeMS: 5000 }).toArray())
        .map(({ name, key, unique }) => ({ name, key, unique: unique ?? false }));
    }
    const results = [];
    for (const { name, command } of cases) {
      const start = performance.now();
      try {
        const plan = await db.command({ explain: command, verbosity: 'executionStats' });
        results.push({ name, roundTripMs: Math.round(performance.now() - start), ...summarizeExplain(plan) });
      } catch (error) {
        results.push({ name, errorCode: error.code ?? 'explain_failed' });
      }
    }
    console.log(JSON.stringify({
      capturedAt: new Date().toISOString(), sampleStudentAvailable: Boolean(sample),
      sampleTermAvailable: Boolean(term), indexes, results,
      note: 'Read-only plans; not an HTTP p95 benchmark. Zero-result queries are not proof of good selectivity.',
    }, null, 2));
    if (results.some((result) => result.errorCode)) process.exitCode = 1;
  } finally {
    await connection.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(() => {
    // Driver messages can contain hostnames or credential-bearing connection strings.
    console.error('Query diagnostics failed. Check explicit configuration, connectivity and read permissions.');
    process.exitCode = 1;
  });
}
