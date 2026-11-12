const fs = require('node:fs');
const path = require('node:path');

const suites = [
  ['api-unit', 'API unit tests'],
  ['admissions', 'Admissions transactions'],
  ['control', 'Control integration'],
  ['api-e2e', 'API end-to-end and passkeys'],
];
const checks = [
  ['lint', 'Workspace lint'],
  ['typecheck', 'Workspace typecheck'],
  ['build', 'Production build'],
  ['control-browser', 'Control browser acceptance'],
];
const icons = { success: '✅', failure: '❌', skipped: '⏭️', cancelled: '⚪' };
const escapeText = value => String(value).replace(/[&<>|`*_[\]\r\n]/g, char => `&#${char.charCodeAt(0)};`);
const commandText = value => String(value).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const propertyText = value => commandText(value).replace(/:/g, '%3A').replace(/,/g, '%2C');

function counts(report, suffix) {
  const keys = [`numPassed${suffix}`, `numFailed${suffix}`, `numPending${suffix}`, `numTotal${suffix}`];
  const values = keys.map(key => report[key]);
  if (values.some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error('Invalid Jest counts');
  const [passed, failed, pending, total] = values;
  const todo = suffix === 'Tests' ? (report.numTodoTests ?? 0) : 0;
  if (!Number.isSafeInteger(todo) || todo < 0 || passed + failed + pending + todo !== total) throw new Error('Inconsistent Jest counts');
  return `${failed ? `❌ ${failed} failures · ` : ''}✅ ${passed} passes · ${pending} skipped${todo ? ` · ${todo} todo` : ''} · **${total} total**`;
}

function generateReport({ root, steps = {}, status = 'unknown', read = file => fs.readFileSync(file, 'utf8') }) {
  const lines = ['# Jest Test Report', '', `Job result: ${escapeText(status)}`, '', '| Check | Result |', '| --- | --- |'];
  for (const [id, name] of checks) {
    const outcome = steps[id]?.outcome || 'skipped';
    lines.push(`| ${name} | ${icons[outcome] || '⚪'} ${escapeText(outcome)} |`);
  }
  lines.push('', 'Counts below cover Jest suites. Node.js checks and other browser tests remain in their individual job steps.', '');
  const annotations = [];
  let invalid = false;
  for (const [id, name] of suites) {
    const outcome = steps[id]?.outcome || 'skipped';
    lines.push(`## ${name}`, '', `Step: ${icons[outcome] || '⚪'} ${escapeText(outcome)}`, '');
    // Ignore restored/stale output for steps that never ran in this job.
    if (outcome === 'skipped' || outcome === 'cancelled') {
      lines.push('No completed test run.', '');
      continue;
    }
    let report;
    try {
      report = JSON.parse(read(path.join(root, 'apps/api/coverage', `ci-${id}.json`)));
      const files = counts(report, 'TestSuites');
      const tests = counts(report, 'Tests');
      if (!Array.isArray(report.testResults) || typeof report.success !== 'boolean') throw new Error('Invalid Jest report');
      lines.push(`- **Test Files:** ${files}`, `- **Test Results:** ${tests}`, '');
      if (!report.success || report.numFailedTests || report.numFailedTestSuites) {
        lines.push('❌ Jest reported failures or runtime errors. See the test step log for full diagnostics.', '');
        invalid = true;
      }
    } catch {
      lines.push('⚠️ No valid Jest report was produced. The step may have failed before Jest completed; inspect its log.', '');
      if (outcome === 'success') invalid = true;
      continue;
    }
    const failures = [];
    for (const file of report.testResults) {
      const relative = path.relative(root, String(file.name || ''));
      const safePath = relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative.split(path.sep).join('/') : undefined;
      const failedAssertions = (file.assertionResults || []).filter(assertion => assertion.status === 'failed');
      if (file.status === 'failed' && !failedAssertions.length) {
        failures.push(`- ${escapeText(safePath || 'Test file')} — Test suite could not complete; see the step log.`);
        if (annotations.length < 50) annotations.push(`::error${safePath ? ` file=${propertyText(safePath)}` : ''}::${commandText(`${name}: test suite could not complete; see the step log.`)}`);
      }
      for (const assertion of failedAssertions) {
        const title = String(assertion.fullName || assertion.title || 'Test failure').slice(0, 500);
        failures.push(`- ${escapeText(safePath || 'Test file')} — ${escapeText(title)}`);
        if (annotations.length < 50) {
          const location = Number.isSafeInteger(assertion.location?.line) && assertion.location.line > 0 ? `,line=${assertion.location.line}` : '';
          const properties = safePath ? ` file=${propertyText(safePath)}${location}` : '';
          annotations.push(`::error${properties}::${commandText(title)}`);
        }
      }
    }
    if (failures.length) lines.push('### Failed tests', '', ...failures.slice(0, 30), ...(failures.length > 30 ? ['- Additional failures are available in the test logs.'] : []), '');
  }
  return { markdown: `${lines.join('\n')}\n`, annotations, invalid };
}

function main() {
  const result = generateReport({
    root: process.env.GITHUB_WORKSPACE || path.resolve(__dirname, '..'),
    steps: JSON.parse(process.env.CI_STEPS_JSON || '{}'),
    status: process.env.CI_JOB_STATUS,
  });
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, result.markdown);
  else process.stdout.write(result.markdown);
  for (const annotation of result.annotations) console.log(annotation);
  if (result.invalid) process.exitCode = 1;
}

module.exports = { generateReport };
if (require.main === module) main();
