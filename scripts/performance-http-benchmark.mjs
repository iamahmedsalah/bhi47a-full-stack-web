// Controlled read-only HTTP samples. No credentials, response documents or URLs are printed.
import { performance } from 'node:perf_hooks';

const target = process.env.PERF_BASE_URL;
if (!target || !process.env.PERF_COOKIE) throw new Error('Supply PERF_BASE_URL and PERF_COOKIE explicitly.');
const base = new URL(target);
if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('Invalid benchmark base URL');
if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) && process.env.PERF_ENVIRONMENT !== 'staging') {
  throw new Error('Remote benchmarks require an explicitly identified staging target. Do not use this script against production.');
}
const samples = Number(process.env.PERF_SAMPLES ?? 30);
if (!Number.isInteger(samples) || samples < 5 || samples > 200) throw new Error('PERF_SAMPLES must be between 5 and 200');
const cases = [
  ['complaints.page20', '/admin/complaints?page=1&limit=20'],
  ['complaints.page100', '/admin/complaints?page=1&limit=100'],
  ['complaints.open', '/admin/complaints?page=1&limit=20&status=open'],
];
const results = [];
let failed = false;
for (const [name, path] of cases) {
  const durations = [];
  const bytes = [];
  const statuses = {};
  for (let i = 0; i < samples + 3; i++) {
    const start = performance.now();
    let response;
    try {
      response = await fetch(`${base.href.replace(/\/$/, '')}${path}`, {
        headers: { Cookie: process.env.PERF_COOKIE }, redirect: 'error', signal: AbortSignal.timeout(10000),
      });
      const body = await response.arrayBuffer();
      if (i >= 3) {
        durations.push(performance.now() - start);
        bytes.push(body.byteLength);
        statuses[response.status] = (statuses[response.status] ?? 0) + 1;
      }
    } catch {
      console.error(`${name}: request failed; details omitted to protect credentials.`);
      failed = true;
      break;
    }
    if (!response.ok) { failed = true; break; }
  }
  durations.sort((a, b) => a - b);
  const percentile = (q) => durations.length ? Math.round(durations[Math.ceil(q * durations.length) - 1] * 10) / 10 : null;
  results.push({ name, samples: durations.length, statuses, p50Ms: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99), meanBytes: bytes.length ? Math.round(bytes.reduce((a, b) => a + b, 0) / bytes.length) : null });
  if (failed) break;
}
console.log(JSON.stringify({ capturedAt: new Date().toISOString(), warmupPerCase: 3, concurrency: 1, results,
  note: 'Sequential samples, not a representative load test. Compare same dataset, identity, filters, pool and infrastructure; measure DB/pool stages with Prometheus concurrently.' }, null, 2));
if (failed) process.exitCode = 1;
