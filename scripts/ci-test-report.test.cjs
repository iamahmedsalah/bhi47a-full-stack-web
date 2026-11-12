const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { generateReport } = require('./ci-test-report.cjs');

const passing = {
  success: true,
  numPassedTestSuites: 37, numFailedTestSuites: 0, numPendingTestSuites: 0, numTotalTestSuites: 37,
  numPassedTests: 146, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0, numTotalTests: 146,
  testResults: [],
};
const root = path.resolve(__dirname, '..');
function render(report = passing, outcome = 'success') {
  return generateReport({ root, steps: { 'api-unit': { outcome } }, read: () => JSON.stringify(report), status: 'success' });
}

test('renders actual Jest file/test totals without inventing counts for skipped steps', () => {
  const report = render();
  assert.match(report.markdown, /37 passes.*37 total/);
  assert.match(report.markdown, /146 passes.*146 total/);
  assert.match(report.markdown, /No completed test run/);
  assert.equal(report.invalid, false);
});

test('reports failures, skipped tests and todo tests and generates escaped file annotations', () => {
  const report = render({ ...passing, success: false,
    numPassedTestSuites: 0, numFailedTestSuites: 1, numTotalTestSuites: 1,
    numPassedTests: 0, numFailedTests: 1, numPendingTests: 1, numTodoTests: 1, numTotalTests: 3,
    testResults: [{ name: path.join(root, 'apps/api/example.spec.ts'), assertionResults: [
      { status: 'failed', fullName: 'bad <script>\n::warning::fake | [link]', location: { line: 29 } },
    ] }],
  }, 'failure');
  assert.equal(report.invalid, true);
  assert.match(report.markdown, /1 failures.*1 skipped.*1 todo.*3 total/);
  assert.doesNotMatch(report.markdown, /<script>/);
  assert.match(report.annotations[0], /^::error file=apps\/api\/example.spec.ts,line=29::/);
  assert.match(report.annotations[0], /%0A::warning/);
  assert.equal(report.annotations[0].split('\n').length, 1);
});

test('missing or malformed output cannot pass as a successful test run', () => {
  for (const read of [() => { throw new Error('missing'); }, () => '{', () => JSON.stringify({ ...passing, numPassedTests: -1 })]) {
    const result = generateReport({ root, steps: { 'api-unit': { outcome: 'success' } }, read });
    assert.equal(result.invalid, true);
    assert.match(result.markdown, /No valid Jest report/);
  }
});

test('early failures and cancellations are explicit and restored skipped reports are ignored', () => {
  const early = generateReport({ root, status: 'failure', steps: { lint: { outcome: 'failure' } }, read: () => { throw new Error('must not read'); } });
  assert.match(early.markdown, /Workspace lint \| ❌ failure/);
  assert.doesNotMatch(early.markdown, /146/);
  assert.match(render(passing, 'cancelled').markdown, /No completed test run/);
});

test('failure annotations are bounded and never reference paths outside the workspace', () => {
  const result = render({ ...passing, success: false, testResults: [{ name: path.resolve(root, '../outside.spec.ts'), assertionResults: Array.from({ length: 60 }, () => ({ status: 'failed', fullName: 'failure' })) }] });
  assert.equal(result.annotations.length, 50);
  assert.ok(result.annotations.every(line => line.startsWith('::error::')));
  assert.doesNotMatch(result.markdown, /outside.spec.ts/);
});

test('runtime failures before test assertions also produce a file annotation', () => {
  const result = render({ ...passing, success: false, testResults: [
    { name: path.join(root, 'apps/api/runtime.spec.ts'), status: 'failed', assertionResults: [] },
  ] }, 'failure');
  assert.equal(result.annotations.length, 1);
  assert.match(result.annotations[0], /^::error file=apps\/api\/runtime.spec.ts::/);
  assert.match(result.markdown, /Test suite could not complete/);
});

test('CLI appends a summary even after an earlier failed stage without dependencies', () => {
  const temporary = mkdtempSync(path.join(tmpdir(), 'portal-ci-report-'));
  try {
    const summary = path.join(temporary, 'summary.md');
    writeFileSync(summary, 'Existing summary\n');
    const result = spawnSync(process.execPath, [path.join(__dirname, 'ci-test-report.cjs')], {
      env: { ...process.env, GITHUB_STEP_SUMMARY: summary, CI_JOB_STATUS: 'failure', CI_STEPS_JSON: JSON.stringify({ lint: { outcome: 'failure' } }) }, encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(summary, 'utf8'), /^Existing summary\n# Jest Test Report/);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});

test('consumes real Jest JSON with passing, failing, skipped and todo tests', () => {
  const temporary = mkdtempSync(path.join(tmpdir(), 'portal-jest-contract-'));
  try {
    writeFileSync(path.join(temporary, 'fixture.test.cjs'), `
      test('passes', () => expect(1).toBe(1));
      test('fails', () => expect(1).toBe(2));
      test.skip('skips', () => {});
      test.todo('later');
    `);
    const output = path.join(temporary, 'jest.json');
    const result = spawnSync(process.execPath, [
      path.join(root, 'apps/api/node_modules/jest/bin/jest.js'),
      '--config', JSON.stringify({ rootDir: temporary, testEnvironment: 'node', testMatch: ['**/*.test.cjs'] }),
      '--runInBand', '--json', '--outputFile', output,
    ], { encoding: 'utf8', timeout: 60000 });
    assert.equal(result.status, 1, result.stderr);
    const report = render(JSON.parse(readFileSync(output, 'utf8')), 'failure');
    assert.equal(report.invalid, true);
    assert.match(report.markdown, /1 failures.*1 passes.*1 skipped.*1 todo.*4 total/);
    assert.equal(report.annotations.length, 1);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
