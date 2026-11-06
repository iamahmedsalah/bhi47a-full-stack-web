const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateFixtureUri } = require('./restore-rehearsal.cjs');
test('restore rehearsal refuses live targets, credentials and arbitrary local databases', () => {
  assert.equal(
    validateFixtureUri('mongodb://127.0.0.1:27023/control-recovery-e2e')
      .hostname,
    '127.0.0.1',
  );
  for (const uri of [
    'mongodb+srv://example.test/control-recovery-e2e',
    'mongodb://example.test/control-recovery-e2e',
    'mongodb://user:password@localhost/control-recovery-e2e',
    'mongodb://localhost/control-demo',
    'mongodb://localhost/production',
    'mongodb://localhost/control-recovery-e2e?replicaSet=production',
  ])
    assert.throws(() => validateFixtureUri(uri));
});
