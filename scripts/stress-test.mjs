#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Student Portal - High-Concurrency Stress & Load Testing Harness
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Runs locally or against any deployed remote environment (Staging / Production).
 * Requires NO third-party packages (uses native Node.js 18+ fetch and performance hooks).
 *
 * Usage:
 *   # 1. Quick local health/ping stress test (100 concurrent users for 10s)
 *   node scripts/stress-test.mjs --concurrency 100 --duration 10
 *
 *   # 2. Test a deployed cloud instance
 *   node scripts/stress-test.mjs --url https://api.yourdomain.com/api --concurrency 200 --duration 30
 *  * 
 *
 *   # 3. Test student login & authenticated endpoints
 *   node scripts/stress-test.mjs --mode auth --identifier 20240001 --password MySecretPassword
 *
 *   # 4. Run through pnpm script
 *   pnpm run test:stress -- --concurrency 150 --duration 15
 */

import { performance } from 'node:perf_hooks';

// ─── CLI Argument Parser ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(keys, defaultValue) {
  for (let i = 0; i < args.length; i++) {
    for (const key of keys) {
      if (args[i] === key && args[i + 1]) return args[i + 1];
      if (args[i].startsWith(`${key}=`)) return args[i].split('=')[1];
    }
  }
  return defaultValue;
}

const TARGET_URL = (getArg(['--url', '--target', '-u'], process.env.TARGET_URL || 'http://localhost:4000/api')).replace(/\/$/, '');
const CUSTOM_PATH = getArg(['--path', '-p'], '');
const CONCURRENCY = parseInt(getArg(['--concurrency', '-c'], process.env.CONCURRENCY || '50'), 10);
const DURATION_SEC = parseInt(getArg(['--duration', '-d'], process.env.DURATION || '10'), 10);
const MODE = getArg(['--mode', '-m'], process.env.TEST_MODE || 'health'); // 'health' | 'auth' | 'all'
const IDENTIFIER = getArg(['--identifier', '--student-code'], process.env.STUDENT_IDENTIFIER || '20240001');
const PASSWORD = getArg(['--password'], process.env.STUDENT_PASSWORD || 'Password@123');

// ─── Metrics Collector ────────────────────────────────────────────────────────
class LoadTestMetrics {
  constructor(name) {
    this.name = name;
    this.latencies = [];
    this.statusCodes = {};
    this.errors = 0;
    this.totalRequests = 0;
    this.startTime = 0;
    this.endTime = 0;
  }

  start() {
    this.startTime = performance.now();
  }

  record(latencyMs, statusCode, isError = false) {
    this.totalRequests++;
    this.latencies.push(latencyMs);
    this.statusCodes[statusCode] = (this.statusCodes[statusCode] || 0) + 1;
    if (isError || statusCode >= 400) {
      this.errors++;
    }
  }

  stop() {
    this.endTime = performance.now();
  }

  getStats() {
    const totalDurationSec = (this.endTime - this.startTime) / 1000;
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const count = sorted.length;

    const getPercentile = (p) => {
      if (count === 0) return 0;
      const idx = Math.min(Math.floor((p / 100) * count), count - 1);
      return sorted[idx].toFixed(1);
    };

    const sum = sorted.reduce((a, b) => a + b, 0);
    const avg = count > 0 ? (sum / count).toFixed(1) : 0;
    const rps = totalDurationSec > 0 ? (this.totalRequests / totalDurationSec).toFixed(1) : 0;
    const errorRate = this.totalRequests > 0 ? ((this.errors / this.totalRequests) * 100).toFixed(2) : 0;

    return {
      name: this.name,
      totalRequests: this.totalRequests,
      durationSec: totalDurationSec.toFixed(2),
      rps,
      avgMs: avg,
      minMs: count > 0 ? sorted[0].toFixed(1) : 0,
      maxMs: count > 0 ? sorted[count - 1].toFixed(1) : 0,
      p50: getPercentile(50),
      p90: getPercentile(90),
      p95: getPercentile(95),
      p99: getPercentile(99),
      errors: this.errors,
      errorRate: `${errorRate}%`,
      statusCodes: this.statusCodes,
    };
  }
}

// ─── Scenario Workers ─────────────────────────────────────────────────────────

async function runConcurrentScenario(name, concurrency, durationSec, executeWorker) {
  const metrics = new LoadTestMetrics(name);
  metrics.start();

  const stopTime = performance.now() + durationSec * 1000;
  let activeWorkers = 0;

  async function workerLoop(workerId) {
    while (performance.now() < stopTime) {
      const t0 = performance.now();
      try {
        const { status, isError } = await executeWorker(workerId);
        const t1 = performance.now();
        metrics.record(t1 - t0, status, isError);
      } catch (err) {
        const t1 = performance.now();
        metrics.record(t1 - t0, 500, true);
      }
    }
  }

  console.log(`\n▶ Starting Scenario: [${name}]`);
  console.log(`  Target:       ${TARGET_URL}`);
  console.log(`  Concurrency:  ${concurrency} concurrent workers`);
  console.log(`  Duration:     ${durationSec} seconds`);

  const workers = Array.from({ length: concurrency }, (_, id) => workerLoop(id));
  await Promise.all(workers);

  metrics.stop();
  return metrics.getStats();
}

// ─── Print Formatted Summary ──────────────────────────────────────────────────
function printStatsTable(statsList) {
  console.log('\n' + '═'.repeat(78));
  console.log('                 PERFORMANCE & STRESS TEST RESULTS');
  console.log('═'.repeat(78));

  for (const s of statsList) {
    console.log(`\n📊 Scenario: ${s.name}`);
    console.log(`  ├─ Total Requests:   ${s.totalRequests.toLocaleString()}`);
    console.log(`  ├─ Test Duration:    ${s.durationSec}s`);
    console.log(`  ├─ Throughput:       ${s.rps} req/sec`);
    console.log(`  ├─ Latency (Min):    ${s.minMs} ms`);
    console.log(`  ├─ Latency (Avg):    ${s.avgMs} ms`);
    console.log(`  ├─ Latency (p50):    ${s.p50} ms`);
    console.log(`  ├─ Latency (p90):    ${s.p90} ms`);
    console.log(`  ├─ Latency (p95):    ${s.p95} ms`);
    console.log(`  ├─ Latency (p99):    ${s.p99} ms`);
    console.log(`  ├─ Latency (Max):    ${s.maxMs} ms`);
    console.log(`  ├─ Errors:           ${s.errors} (${s.errorRate})`);
    console.log(`  └─ Status Codes:     ${JSON.stringify(s.statusCodes)}`);

    const p95Num = parseFloat(s.p95);
    const errRateNum = parseFloat(s.errorRate);

    if (errRateNum < 1.0 && p95Num < 500) {
      console.log(`  🎉 Status: EXCELLENT (p95 < 500ms, Error < 1%)`);
    } else if (errRateNum < 2.0 && p95Num < 1500) {
      console.log(`  ⚠️ Status: ACCEPTABLE (p95 < 1500ms)`);
    } else {
      console.log(`  ❌ Status: DEGRADED / FAILED (p95 > 1500ms or high error rate)`);
    }
  }
  console.log('\n' + '═'.repeat(78));
}

// ─── Main Execution ───────────────────────────────────────────────────────────
async function main() {
  console.log(`
┌──────────────────────────────────────────────────────────────────────────┐
│                   STUDENT PORTAL STRESS TEST HARNESS                     │
└──────────────────────────────────────────────────────────────────────────┘
Target URL:  ${TARGET_URL}
Concurrency: ${CONCURRENCY} VUs
Duration:    ${DURATION_SEC}s
Mode:        ${MODE.toUpperCase()}
`);

  const isDirectUrl = Boolean(CUSTOM_PATH || TARGET_URL.includes('/en/') || TARGET_URL.includes('/ar/') || TARGET_URL.endsWith('/health'));
  const testUrl = CUSTOM_PATH ? `${TARGET_URL}${CUSTOM_PATH}` : (isDirectUrl ? TARGET_URL : `${TARGET_URL}/health`);

  // Connectivity probe
  try {
    const probe = await fetch(testUrl, { signal: AbortSignal.timeout(5000) });
    console.log(`✅ Target is reachable: [HTTP ${probe.status}] at ${testUrl}`);
  } catch (err) {
    console.error(`\n❌ Error: Cannot connect to target "${testUrl}".`);
    console.error(`   Cause: ${err?.cause?.code || err.code || err.message}`);
    console.error(`\n💡 Quick Fix:`);
    console.error(`   • For Local Testing: Ensure backend is running in another terminal:`);
    console.error(`       pnpm run dev:api   (or pnpm run dev)`);
    console.error(`   • For Remote Testing: Pass the remote URL:`);
    console.error(`       node scripts/stress-test.mjs --url https://your-server.com/api\n`);
    process.exit(1);
  }

  const results = [];

  // Scenario 1: Health & Public Route Throughput
  if (MODE === 'health' || MODE === 'all' || isDirectUrl) {
    const healthStats = await runConcurrentScenario(
      `GET ${testUrl}`,
      CONCURRENCY,
      DURATION_SEC,
      async () => {
        const res = await fetch(testUrl);
        return { status: res.status, isError: !res.ok };
      }
    );
    results.push(healthStats);
  }

  // Scenario 2: Student Login & JWT Issuance Under Heavy Load
  let authToken = null;
  if (MODE === 'auth' || MODE === 'all') {
    const loginStats = await runConcurrentScenario(
      'Authentication (POST /auth/login)',
      Math.min(CONCURRENCY, 30), // Login uses bcrypt hashing which is CPU heavy
      DURATION_SEC,
      async () => {
        const res = await fetch(`${TARGET_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: IDENTIFIER,
            password: PASSWORD,
          }),
        });

        if (res.ok && !authToken) {
          try {
            const body = await res.json();
            authToken = body.accessToken || body.token;
          } catch {}
        }

        return { status: res.status, isError: !res.ok };
      }
    );
    results.push(loginStats);
  }

  // Scenario 3: Database Read Stress (Courses & Collections)
  if (MODE === 'db' || MODE === 'all') {
    const dbStats = await runConcurrentScenario(
      'Database Reads (GET /courses)',
      CONCURRENCY,
      DURATION_SEC,
      async () => {
        const res = await fetch(`${TARGET_URL}/courses`);
        return { status: res.status, isError: !res.ok };
      }
    );
    results.push(dbStats);

    const metricsStats = await runConcurrentScenario(
      'Prometheus Metrics (GET /metrics)',
      Math.min(CONCURRENCY, 30),
      DURATION_SEC,
      async () => {
        const res = await fetch(`${TARGET_URL}/metrics`);
        return { status: res.status, isError: !res.ok };
      }
    );
    results.push(metricsStats);
  }

  // Scenario 4: Authenticated Quizzes & Draft Writes
  if ((MODE === 'quiz' || MODE === 'all') && authToken) {
    const quizStats = await runConcurrentScenario(
      'Authenticated Student Quizzes (GET /quizzes/student)',
      CONCURRENCY,
      DURATION_SEC,
      async () => {
        const res = await fetch(`${TARGET_URL}/quizzes/student`, {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });
        return { status: res.status, isError: !res.ok };
      }
    );
    results.push(quizStats);
  }

  printStatsTable(results);

  // Exit with failure code if any test exceeded 5% errors
  const failed = results.some((r) => parseFloat(r.errorRate) > 5.0);
  if (failed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal load test error:', err);
  process.exit(1);
});
