const test = require('node:test');
const assert = require('node:assert/strict');
const { validateUri } = require('./run.cjs');
test('permits only the explicitly isolated replica-set fixture', () => {
  const good = 'mongodb://127.0.0.1:27021/student-codes-e2e?replicaSet=admissions-test';
  assert.equal(validateUri(good), good);
  for (const uri of ['mongodb://example.com/student-codes-e2e?replicaSet=admissions-test', 'mongodb://localhost:27021/production?replicaSet=admissions-test', 'mongodb://localhost:27021/student-codes-e2e', 'mongodb://localhost:27021/student-codes-e2e?replicaSet=production', 'mongodb://user:pass@localhost:27021/student-codes-e2e?replicaSet=admissions-test', `${good}&tls=true`]) assert.throws(() => validateUri(uri));
});
