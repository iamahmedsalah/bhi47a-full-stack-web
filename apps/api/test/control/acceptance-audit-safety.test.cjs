const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateOptions } = require('./acceptance-audit.cjs');
test('live acceptance audit requires explicit read-only mode and a protected source config', () => {
  assert.throws(() => validateOptions([]));
  assert.throws(() =>
    validateOptions(['--source-env', '.env', '--output', 'report.json']),
  );
  assert.throws(() =>
    validateOptions(['--read-only', '--output', 'report.json']),
  );
  assert.ok(
    validateOptions([
      '--source-env',
      '.env',
      '--read-only',
      '--output',
      'outputs/report.json',
    ]).config,
  );
  assert.throws(() =>
    validateOptions([
      '--source-env',
      '.env',
      '--read-only',
      '--output',
      '.env',
    ]),
  );
});
