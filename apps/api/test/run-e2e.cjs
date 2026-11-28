// Fail before importing AppModule: tests must never inherit a live Atlas URI.
const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');

async function main() {
  const uri =
    process.env.MONGODB_URI || 'mongodb://127.0.0.1:27019/student-portal-e2e';
  const parsed = new URL(uri);
  if (
    parsed.protocol !== 'mongodb:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) ||
    !/\/(?:[\w-]*[-_])?(?:test|e2e)$/.test(parsed.pathname) ||
    parsed.username ||
    parsed.password ||
    parsed.search
  ) {
    throw new Error(
      'E2E requires a credential-free localhost MongoDB URI ending in -test or -e2e; production connections are prohibited.',
    );
  }
  const { MongoClient } = require('mongodb');
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 3000,
    connectTimeoutMS: 3000,
    maxPoolSize: 1,
  });
  try {
    await client.connect();
    await client.db().command({ ping: 1 }, { timeoutMS: 3000 });
  } catch {
    throw new Error(
      'Local E2E MongoDB is unavailable. Run pnpm test:services, then pnpm test:e2e. No application or production connection was started.',
    );
  } finally {
    await client.close();
  }
  // Preserve the old workspace dependency: test the current shared source,
  // including after local edits made since the last install/build.
  const shared = spawnSync(
    process.execPath,
    [
      path.resolve(__dirname, '../node_modules/typescript/bin/tsc'),
      '--project',
      path.resolve(__dirname, '../../../packages/shared/tsconfig.json'),
    ],
    { stdio: 'inherit' },
  );
  if (shared.status !== 0)
    throw new Error('Shared package build failed; E2E tests were not started.');
  console.log('E2E localhost database ping passed. Starting serial Jest.');
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    MONGODB_URI: uri,
    JWT_SECRET: 'isolated-e2e-only-secret-at-least-32-bytes',
    REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:63791',
    CLIENT_URL: 'http://localhost:3000',
    DNS_SERVERS: '',
    COOKIE_SAME_SITE: 'lax',
    COOKIE_DOMAIN: '',
    PASSKEYS_ENABLED: 'true',
    PASSKEY_RP_ID: 'localhost',
    PASSKEY_ORIGINS: 'http://localhost:3000',
    MONGODB_MIN_POOL_SIZE: '1',
    MONGODB_MAX_POOL_SIZE: '5',
    QUEUE_REQUIRED: 'false',
    QUEUE_WORKERS_ENABLED: 'false',
    RUN_STARTUP_TASKS: 'false',
    FIREBASE_PROJECT_ID: '',
    FIREBASE_CLIENT_EMAIL: '',
    FIREBASE_PRIVATE_KEY: '',
    SMTP_USER: '',
    SMTP_PASS: '',
    RESEND_API_KEY: '',
    COMPLAINT_REPLY_EMAILS_ENABLED: 'false',
  };
  const args = [
    '--experimental-vm-modules',
    '--no-warnings',
    path.resolve(__dirname, '../node_modules/jest/bin/jest.js'),
    '--config',
    path.resolve(__dirname, 'jest-e2e.config.cjs'),
    '--runInBand',
    ...process.argv
      .slice(2)
      .filter((arg) => arg !== '--runInBand' && arg !== '--'),
  ];
  // Root and filtered workspace invocations must resolve fixtures and output
  // paths from the API package, rather than writing outside the repository.
  const child = spawn(process.execPath, args, {
    stdio: 'inherit',
    env,
    cwd: path.resolve(__dirname, '..'),
  });
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => child.kill(signal));
  child.on('error', () => {
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    process.exitCode = code ?? 1;
  });
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
