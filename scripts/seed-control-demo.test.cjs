const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateUri } = require('./seed-control-demo.cjs');
test('Control demo seed refuses production, credentials and other databases', () => {
  assert.equal(validateUri('mongodb://127.0.0.1:27023/control-demo'), 'mongodb://127.0.0.1:27023/control-demo');
  for (const uri of ['mongodb+srv://example.test/control-demo', 'mongodb://example.test/control-demo', 'mongodb://user:password@localhost/control-demo', 'mongodb://localhost/production', 'mongodb://localhost/control-e2e', 'mongodb://localhost/control-demo?replicaSet=production']) assert.throws(() => validateUri(uri));
});
