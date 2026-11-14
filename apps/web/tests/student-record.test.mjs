import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const requireWeb = createRequire(new URL('../package.json', import.meta.url));
const ts = requireWeb('typescript');
const source = ts.transpileModule(fs.readFileSync(new URL('../src/features/students/api.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

function recordApi(apiGet) {
  const evaluated = { exports: {} };
  vm.runInNewContext(source, { module: evaluated, exports: evaluated.exports,
    require: (name) => name === '@/lib/api-client' ? { apiGet } : {},
  });
  return evaluated.exports;
}

test('academic record fetches every grade page using the exact student code', async () => {
  const calls = [];
  const api = recordApi(async (url, { params }) => {
    calls.push({ url, ...params });
    return { items: [{ _id: String(params.page) }], page: params.page, totalPages: 3, total: 3 };
  });
  const result = await api.listStudentGrades('250633');
  assert.deepEqual(Array.from(result.items, (row) => row._id), ['1', '2', '3']);
  assert.equal(calls.length, 3);
  assert.ok(calls.every((call) => call.studentCode === '250633' && call.limit === 100 && call.url === '/admin/grades'));
});

test('a failed later page does not silently return a partial academic record', async () => {
  const api = recordApi(async (url, { params }) => {
    if (params.page === 2) throw new Error('Record page unavailable');
    return { items: [], totalPages: 2 };
  });
  await assert.rejects(api.listStudentGrades('250633'), /Record page unavailable/);
});
