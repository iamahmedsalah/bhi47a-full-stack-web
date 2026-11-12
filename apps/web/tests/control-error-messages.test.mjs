import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireWeb = createRequire(path.join(web, 'package.json'));
const ts = requireWeb('typescript');
const source = ts.transpileModule(fs.readFileSync(path.join(web, 'src/lib/api.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
function messages(locale) {
  const evaluated = { exports: {} };
  vm.runInNewContext(source, {
    module: evaluated, exports: evaluated.exports, process: { env: {} },
    window: { location: { pathname: '/' + locale + '/admin/control' } },
    require: (name) => name === 'axios' ? requireWeb('axios') : {},
  });
  return (message) => evaluated.exports.getApiErrorMessage({ response: { data: { message } } });
}
test('Control row validation messages retain row numbers and give localized recovery guidance', () => {
  const ar = messages('ar'), en = messages('en');
  assert.match(ar('Row 502: Stale mark revision'), /الصف 502/);
  assert.match(ar('Row 502: Stale mark revision'), /حدّث القالب/);
  assert.match(en('Row 502: Stale mark revision'), /Row 502.*changed/);
  assert.match(ar('Formula in row 30'), /30/);
  assert.match(en('Duplicate student in file at row 502'), /Duplicate.*502/);
  assert.match(ar('Preview is stale; preview again'), /أعد المعاينة/);
  assert.match(en('Coursework split is frozen after entry'), /frozen/);
});
test('Strict grading DTO failures do not leak raw nested property paths to the operator', () => {
  for (const locale of ['ar', 'en']) {
    const text = messages(locale)(['components.0.property nameAr should not exist', 'components.1.max must not be less than 0.01']);
    assert.ok(text.length > 0);
    assert.doesNotMatch(text, /components\.|nameAr|should not exist/);
  }
});
