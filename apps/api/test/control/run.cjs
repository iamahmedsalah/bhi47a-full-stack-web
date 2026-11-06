const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');

function validateUri(uri) {
  const url = new URL(uri);
  if (url.protocol !== 'mongodb:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.username || url.password || url.search || url.pathname !== '/control-e2e') throw new Error('Control integration requires credential-free localhost /control-e2e; production connections are prohibited');
  return uri;
}
async function main() {
  const uri = validateUri(process.env.CONTROL_TEST_MONGODB_URI || 'mongodb://127.0.0.1:27023/control-e2e');
  const { MongoClient } = require('mongodb');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 3000, maxPoolSize: 1 });
  try {
    await client.connect();
    const hello = await client.db().admin().command({ hello: 1 });
    if (!hello.setName) throw new Error('Control tests require a local MongoDB replica set; no test or application has started');
  } finally { await client.close(); }
  const api = path.resolve(__dirname, '../..');
  const shared = spawnSync(process.execPath, [path.join(api, 'node_modules/typescript/bin/tsc'), '-p', path.resolve(api, '../../packages/shared/tsconfig.json')], { stdio: 'inherit' });
  if (shared.status !== 0) throw new Error('Shared build failed');
  const child = spawn(process.execPath, ['--experimental-vm-modules', '--no-warnings', path.join(api, 'node_modules/jest/bin/jest.js'), '--config', path.join(__dirname, 'jest.config.cjs'), '--runInBand', ...process.argv.slice(2).filter(a => a !== '--' && a !== '--runInBand')], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test', MONGODB_URI: uri, QUEUE_WORKERS_ENABLED: 'false', RUN_STARTUP_TASKS: 'false' } });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('error', () => { process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
}
module.exports = { validateUri };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
