const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateUri } = require('./run.cjs');
test('Control runner only accepts its isolated credential-free localhost database', () => {
  assert.equal(validateUri('mongodb://127.0.0.1:27019/control-e2e'), 'mongodb://127.0.0.1:27019/control-e2e');
  for (const uri of ['mongodb://example.com/control-e2e', 'mongodb://localhost/production', 'mongodb://user:pass@localhost/control-e2e', 'mongodb+srv://localhost/control-e2e', 'mongodb://localhost/control-e2e?tls=true']) assert.throws(() => validateUri(uri));
});
