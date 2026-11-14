import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const requireWeb = createRequire(new URL('../package.json', import.meta.url));
const ts = requireWeb('typescript');
const evaluated = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/lib/search-text.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { module: evaluated, exports: evaluated.exports });
const { normalizeSearchText } = evaluated.exports;

test('normalizes Arabic names and institutional digits without conflating distinct names', () => {
  assert.equal(normalizeSearchText(' أَحْمَــد   إبراهيم ٢٥٠٦٣٣ '), 'احمد ابراهيم 250633');
  assert.equal(normalizeSearchText('إِبراهيم ۲۵۰۶۳۳'), 'ابراهيم 250633');
  assert.equal(normalizeSearchText('  SYNTH 111 '), 'synth 111');
  assert.notEqual(normalizeSearchText('علي'), normalizeSearchText('عمر'));
});
