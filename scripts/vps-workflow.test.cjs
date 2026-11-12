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

test('Jest reports are collected from every Jest stage without masking failures', () => {
  const prepare = workflow.indexOf('- name: Prepare Jest report directory');
  assert.ok(prepare > 0 && prepare < workflow.indexOf('- name: Verify VPS deployment trigger policy'));
  assert.match(workflow, /name: Prepare Jest report directory\n        run: >-\n          node -e "require\('node:fs'\)\.mkdirSync\('apps\/api\/coverage', \{ recursive: true \}\)"/);
  for (const id of ['api-unit', 'admissions', 'control', 'api-e2e']) {
    assert.match(workflow, new RegExp(`id: ${id}\\n(?:        #[^\\n]+\\n)?        run: [^\\n]+--json --outputFile="\\$GITHUB_WORKSPACE/apps/api/coverage/ci-${id}\\.json"`));
  }
  assert.match(workflow, /name: Publish test summary and failure annotations\n        if: always\(\)/);
  assert.match(workflow, /CI_STEPS_JSON: \$\{\{ toJSON\(steps\) \}\}/);
  assert.match(workflow, /name: Upload structured test reports\n        if: always\(\)/);
  assert.doesNotMatch(workflow, /continue-on-error: true|\|\| true/);
});

test('VPS retains its protected environment and exposes the real portal link and deployment outcomes', () => {
  assert.match(job, /environment:\n      name: production-vps\n      url: https:\/\/bhi47\.app/);
  assert.match(job, /name: Verify public portal after VPS deployment\n        id: public-health\n        shell: bash/);
  assert.match(job, /https:\/\/bhi47\.app\/api\/health/);
  assert.match(job, /name: Publish VPS deployment report\n        if: always\(\)/);
  assert.match(job, /DEPLOY_OUTCOME: \$\{\{ steps.deploy.outcome \}\}/);
  assert.match(job, /PUBLIC_HEALTH_OUTCOME: \$\{\{ steps.public-health.outcome \}\}/);
  assert.match(job, /GITHUB_STEP_SUMMARY/);
});

test('workflow pins Ubuntu and uses the verified Node 24 action releases', () => {
  assert.doesNotMatch(workflow, /runs-on: ubuntu-latest|actions\/(checkout|setup-node|cache)@v4|pnpm\/action-setup@v4/);
  assert.equal([...workflow.matchAll(/runs-on: ubuntu-24\.04/g)].length, 3);
  assert.match(workflow, /uses: actions\/upload-artifact@v6/);
});
