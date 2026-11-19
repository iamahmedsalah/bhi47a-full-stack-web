import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireWeb = createRequire(path.join(web, 'package.json'));
const { createTranslator } = requireWeb('next-intl');
test('Control review dialogs render readable bilingual messages with real counts', () => {
  const keys = [
    'reviewExplanation', 'sendApprovalExplanation', 'approvalExplanation',
    'returnExplanation', 'reopenExplanation', 'clearExplanation',
    'readinessTitle', 'readinessStats', 'readinessWarning', 'readinessReady',
  ];
  for (const locale of ['ar', 'en']) {
    const messages = JSON.parse(fs.readFileSync(path.join(web, `src/messages/${locale}.json`), 'utf8'));
    const t = createTranslator({ locale, messages, namespace: 'control', onError: (error) => { throw error; } });
    for (const key of keys) {
      const rendered = t(key, { total: 2147, entered: 1679, missing: 468 });
      assert.doesNotMatch(rendered, /\?{2,}|\uFFFD|\{(?:total|entered|missing)\}/);
      if (locale === 'ar') assert.match(rendered, /[\u0600-\u06ff]/);
    }
    const stats = t('readinessStats', { total: 2147, entered: 1679, missing: 468 });
    for (const count of ['2147', '1679', '468']) assert.ok(stats.includes(count));
    assert.ok(t('readinessWarning', { missing: 468 }).includes('468'));
  }
});
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
  return (message, code) => evaluated.exports.getApiErrorMessage({ response: { data: { message, code } } });
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
test('Frozen schemes and busy resets provide bilingual actionable guidance from stable error codes', () => {
  const ar = messages('ar'), en = messages('en');
  assert.match(ar('Conflict', 'SCHEME_FROZEN'), /الدرجة العظمى.*فك قفل/);
  assert.match(en('Conflict', 'SCHEME_FROZEN'), /Maximums.*reset/);
  assert.match(ar('Conflict', 'COURSEWORK_SPLIT_FROZEN'), /الحضور.*مجمّد/);
  assert.match(en('Conflict', 'CONTROL_RESET_BUSY'), /No course data was reset/);
  assert.match(ar('Conflict', 'CONTROL_RESET_BUSY'), /لم تُصفّر.*انتظر/);
  assert.match(ar('Reconciliation is running; retry the reset shortly'), /التصفير مؤجل/);
});
test('Strict grading DTO failures do not leak raw nested property paths to the operator', () => {
  for (const locale of ['ar', 'en']) {
    const text = messages(locale)(['components.0.property nameAr should not exist', 'components.1.max must not be less than 0.01']);
    assert.ok(text.length > 0);
    assert.doesNotMatch(text, /components\.|nameAr|should not exist/);
  }
});

test('empty missing-grade exports explain recovery in both languages', () => {
  assert.match(messages('en')('Conflict', 'CONTROL_IMPORT_EMPTY'), /full workbook.*entry worksheet/);
  assert.match(messages('ar')('Conflict', 'CONTROL_IMPORT_EMPTY'), /الكشف الكامل.*الرصد/);
});

test('midterm grace validation and once-only protection have bilingual guidance', () => {
  for (const locale of ['ar', 'en']) {
    const translations = JSON.parse(fs.readFileSync(path.join(web, 'src/messages', locale + '.json'), 'utf8'));
    assert.ok(translations.control.auditActions.GRACE);
    assert.ok(translations.staff.permissions.labels.control_grades_grace);
  }
  for (const code of ['GRACE_MIDTERM_ONLY', 'GRACE_ALREADY_APPLIED', 'GRACE_PREVIEW_STALE', 'GRACE_INVALID_AMOUNT', 'GRACE_INVALID_MARKS', 'GRACE_NO_CHANGES']) {
    for (const locale of ['ar', 'en']) {
      const message = messages(locale)('Conflict', code);
      assert.notEqual(message, 'Conflict');
      assert.ok(!message.includes(code));
      if (locale === 'ar') assert.match(message, /[\u0600-\u06ff]/);
    }
  }
  assert.match(messages('en')('Conflict', 'GRACE_ALREADY_APPLIED'), /cannot be added again/);
});
test('mark errors include the configured maximum and increment in both languages', () => {
  assert.match(messages('en')('Row 2: Mark rule: off_step; max=20; step=0.5'), /Row 2:.*increment.*20.*0.5/);
  assert.match(messages('ar')('Row 2: Mark rule: above_max; max=20; step=0.5'), /الصف 2:.*الحد الأقصى.*20.*0.5/);
});
