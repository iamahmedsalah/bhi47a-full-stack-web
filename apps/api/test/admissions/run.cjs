const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');

function validateUri(uri) {
  const parsed = new URL(uri);
  if (parsed.protocol !== 'mongodb:' || !['localhost', '127.0.0.1'].includes(parsed.hostname) || parsed.username || parsed.password || !/\/student-codes-(?:test|e2e)$/.test(parsed.pathname) || parsed.search !== '?replicaSet=admissions-test') throw new Error('Admission tests require the isolated localhost student-codes-test/e2e database and admissions-test replica set.');
  return uri;
}
async function main() {
  const uri = validateUri(process.env.ADMISSIONS_TEST_MONGODB_URI || 'mongodb://127.0.0.1:27021/student-codes-e2e?replicaSet=admissions-test');
  const { MongoClient } = require('mongodb');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, maxPoolSize: 1 });
  try {
    await client.connect();
    const hello = await client.db().admin().command({ hello: 1 });
    if (hello.setName !== 'admissions-test') throw new Error('Wrong replica set.');
  } finally { await client.close(); }
  const api = path.resolve(__dirname, '../..');
  const shared = spawnSync(process.execPath, [path.join(api, 'node_modules/typescript/bin/tsc'), '-p', path.resolve(api, '../../packages/shared/tsconfig.json')], { stdio: 'inherit' });
  if (shared.status !== 0) throw new Error('Shared build failed.');
  const env = { ...process.env, NODE_ENV: 'test', MONGODB_URI: uri, REDIS_URL: 'redis://127.0.0.1:63792', CLIENT_URL: 'http://localhost:3000', JWT_SECRET: 'synthetic-admissions-tests-only-at-least-32-bytes', MONGODB_MAX_POOL_SIZE: '30', MONGODB_MIN_POOL_SIZE: '1', QUEUE_WORKERS_ENABLED: 'false', RUN_STARTUP_TASKS: 'false', QUEUE_REQUIRED: 'false', DNS_SERVERS: '', FIREBASE_PROJECT_ID: '', FIREBASE_CLIENT_EMAIL: '', FIREBASE_PRIVATE_KEY: '', RESEND_API_KEY: '', SMTP_USER: '', SMTP_PASS: '', COOKIE_DOMAIN: '', COOKIE_SAME_SITE: 'lax' };
  const child = spawn(process.execPath, ['--experimental-vm-modules', '--no-warnings', path.join(api, 'node_modules/jest/bin/jest.js'), '--config', path.join(__dirname, 'jest.config.cjs'), '--runInBand', ...process.argv.slice(2).filter((arg) => arg !== '--' && arg !== '--runInBand')], { stdio: 'inherit', env });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('error', () => { process.exitCode = 1; });
  child.on('exit', (code) => { process.exitCode = code ?? 1; });
}
module.exports = { validateUri };
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
