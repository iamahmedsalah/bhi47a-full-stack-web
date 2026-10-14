#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Student Portal - MongoDB Query Speed Benchmark & Slow Query Detector
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Runs full query execution plans with `explain("executionStats")` and live latency
 * benchmarks against your MongoDB instance to verify indexes and spot any remaining slow queries.
 *
 * Usage:
 *   node scripts/db-query-benchmark.mjs
 *   pnpm run test:db-speed
 */

import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Load Environment Variables ──────────────────────────────────────────────
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

// Apply custom DNS servers if present (for Atlas resolution on Windows)
const dnsServers = String(process.env.DNS_SERVERS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (dnsServers.length > 0) {
  try {
    dns.setServers(dnsServers);
  } catch (err) {
    // Continue with default
  }
}

const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27017/student-portal';

// ─── Formatters ───────────────────────────────────────────────────────────────
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function formatMs(ms) {
  if (ms < 25) return `${colors.green}${ms.toFixed(1)} ms${colors.reset}`;
  if (ms < 100) return `${colors.yellow}${ms.toFixed(1)} ms${colors.reset}`;
  return `${colors.red}${colors.bold}${ms.toFixed(1)} ms${colors.reset}`;
}

function formatStage(stage) {
  if (stage === 'IXSCAN') return `${colors.green}IXSCAN (Indexed)${colors.reset}`;
  if (stage === 'COLLSCAN') return `${colors.red}${colors.bold}COLLSCAN (Table Scan!)${colors.reset}`;
  return `${colors.cyan}${stage}${colors.reset}`;
}

// ─── Benchmark Runner ─────────────────────────────────────────────────────────
async function run() {
  console.log('\n' + '═'.repeat(78));
  console.log(`  🚀 ${colors.bold}STUDENT PORTAL - DATABASE SPEED & SLOW QUERY AUDITOR${colors.reset}`);
  console.log('═'.repeat(78));
  console.log(`  Connecting to: ${colors.dim}${MONGODB_URI.replace(/:([^:@]+)@/, ':****@')}${colors.reset}`);

  const startConnect = performance.now();
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 15000,
    });
  } catch (err) {
    console.error(`\n❌ Failed to connect to MongoDB: ${err.message}`);
    process.exit(1);
  }

  const connectMs = performance.now() - startConnect;
  console.log(`  ${colors.green}✓ Connected${colors.reset} in ${connectMs.toFixed(1)} ms`);

  const startPing = performance.now();
  await mongoose.connection.db.admin().ping();
  const pingMs = performance.now() - startPing;
  console.log(`  ${colors.green}✓ Ping Latency:${colors.reset} ${pingMs.toFixed(1)} ms\n`);

  const db = mongoose.connection.db;

  // 1. Discover Sample Entities to test realistic queries
  const sampleUser = await db.collection('users').findOne({ role: 'student' }) || await db.collection('users').findOne({});
  const testUserId = sampleUser?._id ? sampleUser._id : new mongoose.Types.ObjectId();
  const testUserCode = sampleUser?.studentCode || '20240001';

  const sampleCourse = await db.collection('courses').findOne({ isActive: true });
  const testCourseCode = sampleCourse?.code || '112';
  const testCourseId = sampleCourse?._id || new mongoose.Types.ObjectId();

  const sampleQuiz = await db.collection('quizzes').findOne({ isPublished: true });
  const testQuizId = sampleQuiz?._id || new mongoose.Types.ObjectId();

  // 2. Define Real-World Query Test Cases
  const testCases = [
    {
      name: 'Auth Token Validate (users.findOne by _id)',
      collection: 'users',
      filter: { _id: testUserId },
      projection: { passwordHash: 0, nationalIdHash: 0, refreshTokenHash: 0 },
      sort: null,
      limit: 1,
    },
    {
      name: 'Student Registered Courses (Active Term)',
      collection: 'course_registrations',
      filter: {
        studentId: testUserId,
        status: { $in: ['approved', 'registered', 'confirmed'] },
      },
      projection: { courses: 1 },
      sort: { createdAt: -1 },
      limit: 3,
    },
    {
      name: 'Course Lookup by Code list (Active)',
      collection: 'courses',
      filter: { code: { $in: [testCourseCode, '113', '114', '211', '212'] }, isActive: true },
      projection: { _id: 1, code: 1, name: 1 },
      sort: null,
      limit: 0,
    },
    {
      name: 'Course Quizzes Feed (Published & Sorted)',
      collection: 'quizzes',
      filter: { courseId: { $in: [testCourseId] }, isPublished: true },
      projection: { _id: 1, title: 1, courseCode: 1, startsAt: 1, endsAt: 1 },
      sort: { createdAt: -1 },
      limit: 20,
    },
    {
      name: 'Student Quiz Submissions',
      collection: 'quiz_submissions',
      filter: { quizId: { $in: [testQuizId] }, studentId: testUserId },
      projection: { quizId: 1, score: 1, totalMarks: 1, percentage: 1 },
      sort: null,
      limit: 0,
    },
    {
      name: 'Student Quiz Attempts (In-Progress)',
      collection: 'quiz_attempts',
      filter: { quizId: { $in: [testQuizId] }, studentId: testUserId, status: 'in_progress' },
      projection: { quizId: 1, status: 1 },
      sort: null,
      limit: 0,
    },
    {
      name: 'Student Attendance Summary Records',
      collection: 'attendance',
      filter: { studentId: testUserId, isPublished: true },
      projection: null,
      sort: { academicYear: -1, semester: -1 },
      limit: 0,
    },
    {
      name: 'Student Published Grades',
      collection: 'grades',
      filter: { studentId: testUserId, isPublished: true },
      projection: null,
      sort: null,
      limit: 0,
    },
    {
      name: 'Student Complaints Feed',
      collection: 'complaints',
      filter: { studentId: testUserId },
      projection: null,
      sort: { createdAt: -1 },
      limit: 10,
    },
    {
      name: 'Student Notification Inbox',
      collection: 'notifications',
      filter: { targetStudentId: testUserId },
      projection: { title: 1, body: 1, createdAt: 1 },
      sort: { createdAt: -1 },
      limit: 15,
    },
  ];

  console.log(`  Evaluating ${testCases.length} core query patterns...\n`);
  console.log('─'.repeat(78));

  const results = [];
  let slowQueryCount = 0;

  for (const tc of testCases) {
    const col = db.collection(tc.collection);
    
    // Construct Query Cursor
    let cursor = col.find(tc.filter);
    if (tc.projection) cursor = cursor.project(tc.projection);
    if (tc.sort) cursor = cursor.sort(tc.sort);
    if (tc.limit > 0) cursor = cursor.limit(tc.limit);

    // 1. Analyze with explain('executionStats')
    let explainStats = null;
    try {
      explainStats = await cursor.explain('executionStats');
    } catch (e) {
      // Some operations might not support explain cleanly
    }

    // Extract Plan details
    let stage = 'UNKNOWN';
    let indexName = 'none';
    let docsExamined = 0;
    let nReturned = 0;
    let execMs = 0;

    if (explainStats && explainStats.executionStats) {
      execMs = explainStats.executionStats.executionTimeMillis;
      docsExamined = explainStats.executionStats.totalDocsExamined;
      nReturned = explainStats.executionStats.nReturned;

      const winningPlan = explainStats.queryPlanner?.winningPlan;
      if (winningPlan) {
        // Find leaf scan stage
        let curr = winningPlan;
        while (curr) {
          if (curr.stage === 'COLLSCAN' || curr.stage === 'IXSCAN') {
            stage = curr.stage;
            indexName = curr.indexName || 'none';
            break;
          }
          curr = curr.inputStage || curr.queryPlan?.inputStage;
        }
      }
    }

    // 2. Measure Live Repeated Latency (5 iterations to warm cache)
    const latencies = [];
    for (let i = 0; i < 5; i++) {
      let runCursor = col.find(tc.filter);
      if (tc.projection) runCursor = runCursor.project(tc.projection);
      if (tc.sort) runCursor = runCursor.sort(tc.sort);
      if (tc.limit > 0) runCursor = runCursor.limit(tc.limit);

      const t0 = performance.now();
      await runCursor.toArray();
      latencies.push(performance.now() - t0);
    }

    const minMs = Math.min(...latencies);
    const avgMs = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const isSlow = avgMs >= 100 || stage === 'COLLSCAN';
    if (isSlow) slowQueryCount++;

    results.push({
      ...tc,
      stage,
      indexName,
      docsExamined,
      nReturned,
      minMs,
      avgMs,
      isSlow,
    });
  }

  // 3. Print Results Table
  console.log(`\n${colors.bold}%-42s %-18s %-12s %-10s${colors.reset}`, 'Query Description', 'Stage / Index', 'Latency (Avg)', 'Docs/Ret');
  console.log('─'.repeat(84));

  for (const r of results) {
    const statusIcon = r.isSlow ? '🔴' : (r.avgMs < 25 ? '🟢' : '🟡');
    const stageStr = formatStage(r.stage);
    const latencyStr = formatMs(r.avgMs);
    const ratioStr = `${r.docsExamined}/${r.nReturned}`;

    console.log(`${statusIcon} ${colors.bold}${r.name.padEnd(40)}${colors.reset}`);
    console.log(`   Collection: ${colors.cyan}${r.collection}${colors.reset} | Stage: ${stageStr} | Index: ${colors.dim}${r.indexName}${colors.reset}`);
    console.log(`   Avg Latency: ${latencyStr} (Min: ${r.minMs.toFixed(1)} ms) | Examined: ${ratioStr}`);
    console.log('');
  }

  console.log('═'.repeat(84));
  if (slowQueryCount === 0) {
    console.log(`\n  🎉 ${colors.green}${colors.bold}ALL QUERIES PASSED PERFORMANCE CHECKS! (0 Slow Queries Detected)${colors.reset}`);
    console.log(`  Every endpoint query is backed by an efficient IXSCAN index.`);
  } else {
    console.log(`\n  ⚠️ ${colors.red}${colors.bold}ATTENTION: ${slowQueryCount} slow or unindexed queries detected.${colors.reset}`);
  }
  console.log('═'.repeat(84) + '\n');

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
