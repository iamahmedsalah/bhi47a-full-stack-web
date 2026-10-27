/* Synthetic local benchmark only. Never connects to MongoDB or reads user data. */
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { performance } = require('node:perf_hooks');
const apiRequire = createRequire(resolve(__dirname, '../apps/api/package.json'));
const bcrypt = apiRequire('bcrypt');
const policy = { algorithm: 'bcrypt', rounds: 12 };
const candidate = 'SyntheticBenchmarkPassword123!';
async function measure(name, work, count = 12) {
  const durations = [];
  const before = process.memoryUsage().rss;
  let peakRss = before;
  const sample = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 5);
  const started = performance.now();
  try { for (let index = 0; index < count; index++) { const start = performance.now(); await work(); durations.push(performance.now() - start); } }
  finally { clearInterval(sample); }
  durations.sort((a, b) => a - b);
  return { name, operations: count, elapsedMs: Math.round(performance.now() - started), p50Ms: Math.round(durations[Math.floor(count * .5)]), p95Ms: Math.round(durations[Math.min(count - 1, Math.floor(count * .95))]), rssBeforeMiB: +(before / 1048576).toFixed(1), peakProcessRssMiB: +(peakRss / 1048576).toFixed(1) };
}
(async () => {
  const encoded = await bcrypt.hash(candidate, policy.rounds);
  const legacy = await bcrypt.hash(candidate, 10);
  const results = [];
  results.push(await measure('bcrypt12-new-write', () => bcrypt.hash(candidate, policy.rounds)));
  results.push(await measure('bcrypt12-verify', () => bcrypt.compare(candidate, encoded)));
  results.push(await measure('existing-bcrypt10-verify-without-write', () => bcrypt.compare(candidate, legacy)));
  results.push(await measure('two-concurrent-bcrypt12-writes', () => Promise.all([bcrypt.hash(candidate, policy.rounds), bcrypt.hash(candidate, policy.rounds)]), 6));
  console.log(JSON.stringify({ measuredAt: new Date().toISOString(), scope: 'local synthetic native crypto; not production CPU/RAM or endpoint load', platform: process.platform, arch: process.arch, node: process.version, policy, results }, null, 2));
})().catch(() => { console.error('Synthetic benchmark failed'); process.exitCode = 1; });
