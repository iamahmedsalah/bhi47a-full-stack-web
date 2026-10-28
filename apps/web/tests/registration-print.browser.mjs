/** Actual Chromium download/print regression test; uses synthetic students only. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');
const webRequire = createRequire(path.join(root, 'apps/web/package.json'));
const apiRequire = createRequire(path.join(root, 'apps/api/package.json'));
const ts = webRequire('typescript');
const { webpack } = webRequire('next/dist/compiled/webpack/webpack');
const { chromium } = apiRequire('playwright');
const output = path.join(root, 'outputs/course-326-print');

async function main() {
  await fs.mkdir(output, { recursive: true });
  const source = await fs.readFile(path.join(root, 'apps/web/src/lib/registration-print.ts'), 'utf8');
  const entry = path.join(output, 'entry.cjs');
  await fs.writeFile(entry, ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText);
  await new Promise((resolve, reject) => webpack({
    mode: 'development', devtool: false, target: 'web', entry,
    output: { path: output, filename: 'bundle.js', library: { name: 'RegistrationPrint', type: 'window' }, publicPath: '/' },
    resolve: { modules: [path.join(root, 'apps/web/node_modules'), 'node_modules'] },
  }, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve()));
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const assets = { '/bundle.js': path.join(output, 'bundle.js'), '/logo.webp': path.join(root, 'apps/web/public/logo.webp'),
      '/fonts/ar/Cairo-VariableFont_slnt,wght.ttf': path.join(root, 'apps/web/public/fonts/ar/Cairo-VariableFont_slnt,wght.ttf'),
      '/fonts/en/DMSans-VariableFont_opsz,wght.ttf': path.join(root, 'apps/web/public/fonts/en/DMSans-VariableFont_opsz,wght.ttf') };
    if (assets[pathname]) { res.setHeader('Content-Type', pathname.endsWith('.js') ? 'text/javascript' : pathname.endsWith('.ttf') ? 'font/ttf' : 'image/webp'); res.end(await fs.readFile(assets[pathname])); }
    else if (pathname === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html><body><script src="/bundle.js"></script></body></html>'); }
    else { res.statusCode = 404; res.end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1000, height: 1300 }, acceptDownloads: true });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.evaluate(() => {
      const original = HTMLCanvasElement.prototype.toDataURL;
      window.captures = [];
      window.capturedCourses = [];
      HTMLCanvasElement.prototype.toDataURL = function (...args) {
        const data = original.apply(this, args);
        if (this.width > 1000 && this.height > 1000) {
          window.captures.push(data);
          const doc = document.querySelector('iframe')?.contentDocument;
          window.capturedCourses.push(Array.from(doc?.querySelectorAll('tbody tr') || [], (row) => row.cells[1].textContent.trim()));
        }
        return data;
      };
    });
    const makeForm = (department, semester, count = 6) => ({ academicYear: '2026-2027', studentInformation: { studentNameAr: 'طالب اختبار لطباعة التسجيل', studentNameEn: 'Registration Print Test Student', studentCode: 'TEST326', academicLevel: '3', department, semester, gpa: 3 },
      registeredCourses: Array.from({ length: count }, (_, i) => ({ code: i ? `TEST${i}` : '326', courseName: 'Governmental Accounting', courseNameAr: 'المحاسبة في الوحدات الحكومية', courseNameEn: 'Governmental Accounting', creditHours: 3, type: 'elective', status: 'registered' })),
      totalCreditHours: count * 3, registrationStatus: 'approved', date: '2026-10-28', advisorNotes: 'ملاحظات المرشد الأكاديمي للاختبار' });
    for (const [locale, department, semester, count] of [['ar', 'ACCOUNTING', 'first', 6], ['en', 'BIS', 'second', 6], ['ar', 'ACCOUNTING', 'first', 35]]) {
      const form = makeForm(department, semester, count);
      await page.evaluate(() => { window.captures = []; window.capturedCourses = []; });
      const pending = page.waitForEvent('download', { timeout: 60000 });
      await page.evaluate(({ form, locale }) => window.RegistrationPrint.downloadRegistrationPdf(form, locale), { form, locale });
      const download = await pending;
      const file = path.join(output, `${department}-${locale}-${count}.pdf`);
      await download.saveAs(file);
      const pdf = await fs.readFile(file);
      assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
      assert.ok(pdf.length > 50000, 'PDF must contain rendered content');
      const pages = (pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length;
      assert.ok(count === 6 ? pages === 1 : pages > 1, `Unexpected page count: ${pages}`);
      const captures = await page.evaluate(() => window.captures);
      assert.equal(captures.length, pages);
      const codes = await page.evaluate(() => window.capturedCourses.flat());
      assert.deepEqual(codes, form.registeredCourses.map((course) => course.code), 'Every course must appear once, without losing rows at page boundaries');
      await fs.writeFile(path.join(output, `${department}-${locale}-${count}.png`), Buffer.from(captures[0].split(',')[1], 'base64'));
      await fs.writeFile(path.join(output, `${department}-${locale}-${count}-last.png`), Buffer.from(captures.at(-1).split(',')[1], 'base64'));
      console.log(`${department} ${locale} ${count} courses: ${pages} page(s), ${pdf.length} bytes`);
    }
    const form = makeForm('ACCOUNTING', 'first');
    const popupPromise = page.waitForEvent('popup');
    await page.evaluate((form) => window.RegistrationPrint.openRegistrationPrintView(form, 'download', 'ar'), form);
    const popup = await popupPromise;
    await popup.waitForSelector('.sheet');
    assert.match(await popup.locator('.details-grid').innerText(), /المحاسبة/);
    await popup.getByRole('button', { name: 'View in English', exact: true }).click();
    await popup.waitForFunction(() => document.documentElement.lang === 'en');
    assert.match(await popup.locator('.details-grid').innerText(), /Accounting/);
    assert.match(await popup.locator('.details-grid').innerText(), /First Semester/);
    const nativePdf = await popup.pdf({ format: 'A4', printBackground: true });
    assert.equal((nativePdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 1, 'Native print must fit the normal registration on one A4 page');
    const popupDownload = page.waitForEvent('download', { timeout: 60000 });
    await popup.getByRole('button', { name: 'Download PDF', exact: true }).click();
    await (await popupDownload).saveAs(path.join(output, 'popup-download.pdf'));
    await popup.evaluate(() => { window.print = () => { window.printInvoked = true; }; });
    await popup.getByRole('button', { name: 'Print Form', exact: true }).click();
    await popup.waitForFunction(() => window.printInvoked === true);
    assert.deepEqual(errors, []);
    console.log('Popup language switch, PDF download, print button and Arabic fonts passed.');
  } finally { await browser?.close(); await new Promise((resolve) => server.close(resolve)); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
