const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
for (const uri of ['mongodb+srv://example.invalid/live', 'mongodb://example.invalid/portal-e2e', 'mongodb://127.0.0.1:27019/live', 'mongodb://user:secret@localhost:27019/portal-e2e']) {
  test('E2E runner rejects an unsafe database target before application import: ' + new URL(uri).hostname, () => {
    const result = spawnSync(process.execPath, [path.resolve(__dirname, '../apps/api/test/run-e2e.cjs')], { env: { ...process.env, MONGODB_URI: uri }, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /production connections are prohibited/);
    assert.doesNotMatch(result.stdout, /Starting serial Jest/);
    assert.doesNotMatch(result.stderr, /user:secret/);
  });
}
