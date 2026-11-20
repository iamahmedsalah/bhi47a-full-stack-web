import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireWeb = createRequire(path.join(web, 'package.json'));
const ts = requireWeb('typescript');
function evaluate(relativePath, dependencies) {
  const source = ts.transpileModule(fs.readFileSync(path.join(web, relativePath), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const evaluated = { exports: {} };
  vm.runInNewContext(source, {
    module: evaluated, exports: evaluated.exports,
    require: (name) => {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return evaluated.exports;
}

test('single and selected student deactivation use POST /deactivate; permanent deletion stays separate', async () => {
  const calls = [];
  const api = evaluate('src/features/students/api.ts', {
    '@/lib/api': {}, '@/lib/export-utils': {},
    '@/lib/api-client': Object.fromEntries(['apiPost', 'apiDelete', 'apiPatch', 'apiGet'].map((name) => [
      name, async (url) => { calls.push([name, url]); return { message: 'ok' }; },
    ])),
  });
  // Synthetic IDs only: these tests never connect to student accounts or a database.
  const ids = ['100000000000000000000001', '100000000000000000000002'];
  await api.deactivateStudent(ids[0]);
  await Promise.all(ids.map((id) => api.deactivateStudent(id)));
  assert.deepEqual(calls, [ids[0], ...ids].map((id) => ['apiPost', `/admin/students/${id}/deactivate`]));
  calls.length = 0;
  await api.deleteStudent(ids[0]);
  assert.deepEqual(calls, [['apiDelete', `/admin/students/${ids[0]}`]]);
  calls.length = 0;
  await api.activateStudent(ids[0]);
  assert.deepEqual(calls, [['apiPost', `/admin/students/${ids[0]}/activate`]]);
});

test('student form accepts the four persisted statuses and rejects unsupported values', () => {
  const { studentFormSchema } = evaluate('src/features/students/schema.ts', {
    zod: requireWeb('zod'), '@student-portal/shared': requireWeb('@student-portal/shared'),
  });
  const student = {
    studentCode: '990001', fullNameEn: 'Synthetic Student', academicEmail: '',
    level: '1', academicYear: '2026-2027', semester: 'first',
  };
  for (const enrollmentStatus of ['active', 'inactive', 'graduated', 'suspended']) {
    assert.equal(studentFormSchema.safeParse({ ...student, enrollmentStatus }).success, true);
  }
  for (const enrollmentStatus of ['', 'withdrawn', 'deleted', 'unknown']) {
    assert.equal(studentFormSchema.safeParse({ ...student, enrollmentStatus }).success, false);
  }
});
