const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

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
  assert.match(job, /steps:\n      - uses: actions\/checkout@v5/);
  assert.match(job, /node scripts\/auth-readiness\.cjs https:\/\/bhi47\.app/);
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

test('deployment auth verification uses Node 24 and ships both readiness files', () => {
  const setup = job.indexOf('name: Setup deployment verification Node.js');
  const gate = job.indexOf('name: Verify public portal after VPS deployment');
  assert.ok(setup > 0 && setup < gate);
  assert.match(job.slice(setup, gate), /uses: actions\/setup-node@v5\n        with:\n          node-version: 24/);
  const nodeSetup = job.slice(setup, job.indexOf('      - name:', setup + 1));
  assert.match(nodeSetup, /^          package-manager-cache: false$/m);
  assert.doesNotMatch(nodeSetup, /^          cache:/m);
  for (const file of ['scripts/auth-readiness.cjs', 'scripts/auth-readiness.test.cjs']) {
    assert.ok(readFileSync(`${__dirname}/../${file}`, 'utf8').length > 0, `${file} must ship in checkout`);
    const ignored = spawnSync('git', ['check-ignore', '--no-index', '--', file], {
      cwd: `${__dirname}/..`, encoding: 'utf8', timeout: 10000,
    });
    assert.equal(ignored.status, 1, `${file} must not be excluded by gitignore: ${ignored.stdout || ignored.stderr}`);
  }
});

test('validation installs pnpm before enabling its dependency cache', () => {
  const validation = workflow.slice(workflow.indexOf('\n  validate:\n'), workflow.indexOf('\n  docker-validate:\n'));
  const install = validation.indexOf('uses: pnpm/action-setup@v5');
  const setup = validation.indexOf('uses: actions/setup-node@v5');
  assert.ok(install > 0 && install < setup);
  assert.match(validation.slice(setup), /^          cache: pnpm$/m);
});

test('public health gate validates the real API envelope and rejects unhealthy responses', () => {
  const check = job.match(/https:\/\/bhi47\.app\/api\/health \| python3 -c '([^'\n]+)'/);
  assert.ok(check, 'Public health JSON validator must be present');
  const python = process.platform === 'win32' ? 'python' : 'python3';
  for (const [body, expected] of [
    [JSON.stringify({ success: true, data: { status: 'ok' }, timestamp: '2026-11-13T00:00:00Z' }), 0],
    [JSON.stringify({ success: false, data: { status: 'ok' } }), 1],
    [JSON.stringify({ success: true, data: { status: 'disconnected' } }), 1],
    [JSON.stringify({ success: true, data: null }), 1],
    [JSON.stringify({ status: 'ok' }), 1],
    ['null', 1],
    ['[]', 1],
    ['<html>Proxy error</html>', 1],
  ]) {
    const result = spawnSync(python, ['-c', check[1]], { input: body, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, expected, result.stderr || result.error?.message);
  }
});
