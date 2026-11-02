const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const workflow = readFileSync(`${__dirname}/../.github/workflows/ci-cd.yml`, 'utf8').replace(/\r\n/g, '\n');
const job = workflow.slice(workflow.indexOf('\n  deploy-vps:\n'));
const condition = job.match(/^    if: >-\n((?:      [^\n]+\n)+)/m)?.[1].trim();
assert.ok(condition, 'VPS deployment condition must be present');

test('VPS deploy policy allows main pushes and manual VPS runs, excluding PRs, tags and other targets', () => {
  for (const [event_name, ref, target, expected] of [
    ['push', 'refs/heads/main', undefined, true],
    ['push', 'refs/heads/staging', undefined, false],
    ['push', 'refs/heads/release/1.0', undefined, false],
    ['push', 'refs/tags/v1.0.0', undefined, false],
    ['pull_request', 'refs/heads/main', undefined, false],
    ['pull_request', 'refs/pull/1/merge', undefined, false],
    ['workflow_dispatch', 'refs/heads/main', 'vps', true],
    ['workflow_dispatch', 'refs/heads/staging', 'vps', false],
    ['workflow_dispatch', 'refs/heads/main', 'validate', false],
    ['workflow_dispatch', 'refs/heads/main', 'vercel', false],
  ]) {
    const actual = vm.runInNewContext(condition, { github: { event_name, ref }, inputs: { deployment_target: target } });
    assert.equal(actual, expected, `${event_name} / ${ref} / ${target}`);
  }
});

test('automatic VPS deployment retains both validation dependencies', () => {
  assert.match(job, /^    needs: \[validate, docker-validate\]$/m);
});

test('workflow is VPS-only and contains no Vercel deployment or credentials', () => {
  assert.doesNotMatch(workflow, /vercel/i);
  const jobs = [...workflow.slice(workflow.indexOf('\njobs:\n')).matchAll(/^  ([\w-]+):\n/gm)].map(match => match[1]);
  assert.deepEqual(jobs, ['validate', 'docker-validate', 'deploy-vps']);
});
