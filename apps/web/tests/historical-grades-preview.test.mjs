import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireWeb = createRequire(path.join(web, 'package.json'));
const ts = requireWeb('typescript');
// Run the real catalog and inspector; replace only browser transport/downloads.
function load(relative, dependencies) {
  const code = ts.transpileModule(fs.readFileSync(path.join(web, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const evaluatedModule = { exports: {} };
  new Function('require', 'module', 'exports', code)((id) => id in dependencies ? dependencies[id] : requireWeb(id), evaluatedModule, evaluatedModule.exports);
  return evaluatedModule.exports;
}
const catalog = load('src/features/uploads/upload-catalog.ts', { '@/lib/api': {}, '@/lib/export-utils': {} });
const inspector = load('src/features/uploads/pre-flight-inspector.ts', {
  './upload-catalog': catalog,
  'read-excel-file/browser': { readSheet: async (file) => requireWeb('read-excel-file/node').readSheet(Buffer.from(await file.arrayBuffer())) },
});
const header = 'studentCode,courseCode,examType,grade,maxGrade,status,academicYear,semester';
const inspect = (rows, isAr = false) => inspector.inspectAndValidateFile(new File([`${header}\n${rows.join('\n')}`], 'previous.csv', { type: 'text/csv' }), 'grades', isAr, { historicalGrades: true });

test('historical preview accepts distinct components/years and preserves leading zero codes', async () => {
  const result = await inspect([
    '00123,111,midterm,25,30,present,2023-2024,first',
    '00123,111,final,38,50,present,2023-2024,first',
    '00123,111,midterm,18,20,present,2024-2025,first',
  ]);
  assert.equal(result.validRows, 3);
  assert.equal(result.invalidRows, 0);
  assert.equal(result.parsedRows[0].studentCode, '00123');
});
test('invalid historical rows are red and cannot all be committed', async () => {
  const result = await inspect(['00123,111,midterm,25,30,banned,2023-2024,first'], true);
  assert.equal(result.validRows, 0);
  assert.equal(result.invalidRows, 1);
  assert.equal(result.canCommit, false);
  assert.equal(result.previewRows[0].isValid, false);
  assert.ok(result.issues.some((issue) => issue.code === 'HISTORICAL_GRADE_INVALID' && /حالة/.test(issue.message)));
});
test('preview rejects a duplicate within the same component/year/term', async () => {
  const line = '00123,111,midterm,25,30,present,2023-2024,first';
  const result = await inspect([line, line]);
  assert.equal(result.validRows, 1);
  assert.equal(result.invalidRows, 1);
});
test('real XLSX preview accepts a zero absent mark and a different component', async () => {
  const requireApi = createRequire(path.join(web, '../api/package.json'));
  const { Workbook } = requireApi('exceljs');
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('Historical marks');
  sheet.addRow(header.split(','));
  sheet.addRow(['00123', '111', 'midterm', 0, 30, 'absent', '2023-2024', 'first']);
  sheet.addRow(['00123', '111', 'final', 38, 50, 'present', '2023-2024', 'first']);
  const result = await inspector.inspectAndValidateFile(new File([await workbook.xlsx.writeBuffer()], 'previous.xlsx'), 'grades', false, { historicalGrades: true });
  assert.equal(result.validRows, 2);
  assert.equal(result.invalidRows, 0);
  assert.equal(result.parsedRows[0].grade, '0');
});
