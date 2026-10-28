/** Real Chromium modal regression tests with synthetic courses and mocked HTTP only. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const web = path.join(root, 'apps/web');
const requireWeb = createRequire(path.join(web, 'package.json'));
const requireApi = createRequire(path.join(root, 'apps/api/package.json'));
const { webpack } = requireWeb('next/dist/compiled/webpack/webpack');
const { chromium } = requireApi('playwright');
const output = path.join(root, 'outputs/course-enrollment');

async function main() {
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'loader.cjs'), `const ts = require(${JSON.stringify(requireWeb.resolve('typescript'))}); module.exports = function(source) { return ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, esModuleInterop: true } }).outputText; };`);
  await fs.writeFile(path.join(output, 'auth.ts'), `export const useAuth = () => ({ user: { role: new URLSearchParams(location.search).get('role') || 'admin' } });`);
  await fs.writeFile(path.join(output, 'api.ts'), `
    const courses = [{ _id:'326', code:'326', name:'Governmental Accounting', nameAr:'المحاسبة في الوحدات الحكومية غير الهادفة للربح', level:'3' }, { _id:'317', code:'317', name:'Investment Principles', nameAr:'مبادئ الاستثمار', level:'3' }, { _id:'S11', code:'S11', name:'Computer Programming', nameAr:'تصميم برامج الحاسب الآلي', level:'3' }];
    window.requests = [];
    export const getApiErrorMessage = (e) => e.message;
    export default {
      get: async (url) => ({ data: url === '/admin/courses' ? { items:courses, total:3, page:1, totalPages:1 } : { enrolledCount:3 } }),
      delete: async (url, options) => { window.requests.push({ url, options }); },
      post: async (url, body, options) => {
        const opts = body instanceof FormData ? options.params : body;
        window.requests.push({ url, options: opts });
        const allowed = opts.overrideRegistrationLimits === true;
        const total = opts.rows?.length ?? 200;
        return { data: { courseId:'326', courseCode:'326', courseName:'Governmental Accounting', totalRows:total, enrolledCount:allowed ? total : 0, alreadyEnrolledCount:0, skippedBlockedCount:0, overriddenCount:allowed ? total : 0, errorCount:allowed ? 0 : total,
          errors: allowed ? [] : Array.from({ length:Math.min(20,total) }, (_,i) => 'السطر '+(i+2)+': Limit exceeded / تجاوز حد التسجيل'),
          issues: allowed ? [] : Array.from({ length:Math.min(20,total) }, (_,i) => ({ row:i+2, code:'REGISTRATION_LIMIT_EXCEEDED', message:'Limit exceeded', limits: { proposedCourseCount:7, maxCourses:6, proposedCreditHours:21, maxCreditHours:18 } })) } };
      }
    };`);
  await fs.writeFile(path.join(output, 'entry.tsx'), `
    import React from 'react'; import { createRoot } from 'react-dom/client';
    import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
    import { Toaster } from 'sonner';
    import { enrollmentHtmlRows } from '${path.join(web, 'src/features/courses/enrollment-sheet').replaceAll('\\', '/')}';
    window.enrollmentHtmlRows = enrollmentHtmlRows;
    import { CourseStudentEnrollmentDialog } from '${path.join(web, 'src/features/courses/components/course-student-enrollment-dialog').replaceAll('\\', '/')}';
    const locale = new URLSearchParams(location.search).get('locale') || 'ar';
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry:false } } })}><CourseStudentEnrollmentDialog open onOpenChange={() => {}} locale={locale}/><Toaster/></QueryClientProvider>);`);
  await new Promise((resolve, reject) => webpack({ mode:'development', devtool:false, target:'web', entry:path.join(output, 'entry.tsx'),
    output: { path:output, filename:'bundle.js', publicPath:'/' },
    resolve: { extensions:['.tsx','.ts','.jsx','.js'], modules:[path.join(web, 'node_modules'), 'node_modules'], alias: { '@/lib/api':path.join(output,'api.ts'), '@/providers/auth-provider':path.join(output,'auth.ts'), '@':path.join(web,'src') } },
    module: { rules:[{ test:/\.tsx?$/, exclude:/node_modules/, use:path.join(output,'loader.cjs') }] },
  }, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all:false, errors:true }))) : resolve()));
  const postcss = requireWeb('postcss');
  const css = await postcss([requireWeb('@tailwindcss/postcss')({ base:web })]).process(await fs.readFile(path.join(web, 'src/app/globals.css'), 'utf8'), { from:path.join(web,'src/app/globals.css') });
  await fs.writeFile(path.join(output,'styles.css'), css.css);
  const server = http.createServer(async (req,res) => {
    const pathname = new URL(req.url,'http://localhost').pathname;
    const files = { '/bundle.js':path.join(output,'bundle.js'), '/styles.css':path.join(output,'styles.css') };
    const asset = files[pathname] || (pathname.startsWith('/fonts/') ? path.join(web,'public',pathname) : null);
    if (asset) { res.setHeader('Content-Type', pathname.endsWith('.js') ? 'text/javascript' : pathname.endsWith('.css') ? 'text/css' : 'font/ttf'); res.end(await fs.readFile(asset)); }
    else { res.setHeader('Content-Type','text/html; charset=utf-8'); res.end('<!doctype html><html class="dark"><head><link rel="stylesheet" href="/styles.css"></head><body style="font-family:Cairo, sans-serif"><div id="root"></div><script src="/bundle.js"></script></body></html>'); }
  });
  await new Promise((resolve) => server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless:true });
    const page = await browser.newPage({ viewport:{ width:1280, height:960 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const base = `http://127.0.0.1:${server.address().port}`;
    async function select(label, option) { await page.getByRole('combobox',{ name:label, exact:true }).click(); await page.getByRole('option',{ name:option, exact:true }).click(); }
    await page.goto(base);
    await page.getByRole('combobox',{ name:'المقرر الدراسي', exact:true }).waitFor();
    await select('القسم','المحاسبة');
    await select('المستوى الدراسي','المستوى 3');
    await page.getByRole('combobox',{ name:'المقرر الدراسي', exact:true }).click();
    const options = await page.getByRole('option').allTextContents();
    assert.equal(options.length,2);
    assert.ok(options.every((label) => !label.includes('الفصل')));
    const dropdown = await page.getByRole('listbox').boundingBox();
    const dialog = await page.getByRole('dialog', { includeHidden:true }).boundingBox();
    assert.ok(dropdown.x >= dialog.x && dropdown.x + dropdown.width <= dialog.x + dialog.width + 1, 'Dropdown stays inside the modal width');
    await page.getByRole('option',{ name:/^326/ }).click();
    await page.locator('input[type=file]').setInputFiles({ name:'students.csv', mimeType:'text/csv', buffer:Buffer.from('studentCode\nTEST326') });
    await page.getByRole('button',{ name:'تسجيل الطلاب', exact:true }).click();
    await page.getByText('عرض 20 من 200 أخطاء',{ exact:true }).waitFor();
    assert.equal(await page.getByText('لم يتم تسجيل طلاب',{ exact:true }).count(),1);
    assert.match(await page.locator('[aria-live=polite]').first().innerText(), /200/);
    await page.getByText('عرض 20 من 200 أخطاء',{ exact:true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path:path.join(output,'arabic-results.png'), fullPage:true });
    await page.getByRole('checkbox').check();
    await page.getByRole('textbox',{ name:'سبب الاستثناء' }).fill('موافقة إدارية موثقة على زيادة عدد المقررات');
    await page.getByRole('button',{ name:'تسجيل الطلاب', exact:true }).click();
    await page.getByRole('alertdialog').waitFor();
    assert.equal(await page.evaluate(() => window.requests.length),1,'Override request waits for explicit confirmation');
    await page.getByRole('button',{ name:'تأكيد وبدء التسجيل' }).click();
    await page.getByText('تم تسجيل 200 طالب باستثناء إداري موثّق.',{ exact:true }).waitFor();
    assert.equal(await page.evaluate(() => window.requests[1].options.overrideRegistrationLimits),true);
    await select('القسم','نظم معلومات الأعمال (BIS)');
    await page.getByRole('combobox',{ name:'المقرر الدراسي', exact:true }).click();
    assert.ok(!(await page.getByRole('option').allTextContents()).some((item) => item.startsWith('326')));
    await page.keyboard.press('Escape');
    await select('الفصل الدراسي','الفصل الثاني');
    await page.getByRole('combobox',{ name:'المقرر الدراسي', exact:true }).click();
    assert.ok((await page.getByRole('option').allTextContents()).some((item) => item.startsWith('326')));
    await page.keyboard.press('Escape');
    for (const locale of ['ar','en']) {
      await page.setViewportSize({ width:375,height:812 });
      await page.goto(`${base}/?locale=${locale}`);
      const picker = page.getByRole('combobox',{ name:locale === 'ar' ? 'المقرر الدراسي' : 'Course', exact:true });
      await picker.click();
      const box = await page.getByRole('listbox').boundingBox();
      assert.ok(box.x >= 0 && box.x+box.width <= 375,'Mobile dropdown fits viewport');
      await page.screenshot({ path:path.join(output,`${locale}-mobile.png`), fullPage:true });
      await page.keyboard.press('Escape');
      const modal = await page.getByRole('dialog').boundingBox();
      assert.ok(modal.height <= 812*0.91,'Mobile dialog scrolls inside viewport');
    }
    await page.goto(`${base}/?locale=en&role=staff`);
    await page.getByRole('dialog').waitFor();
    assert.equal(await page.getByRole('checkbox').count(),0,'Staff cannot request limit overrides');
    const html = '<html><meta charset="UTF-8"><table><tr><td colspan="2">تسجيل مقرر</td></tr><tr><th>كود الطالب</th><th>اسم الطالب</th></tr><tr><td>000326</td><td>طالب &amp; اختبار</td></tr></table><script>window.injected = true</script></html>';
    const parsed = await page.evaluate((html) => { const bytes = new TextEncoder().encode(html); return window.enrollmentHtmlRows(bytes.buffer); }, html);
    assert.deepEqual(parsed,[{ 'كود الطالب':'000326', 'اسم الطالب':'طالب & اختبار' }]);
    assert.equal(await page.evaluate(() => window.injected),undefined,'Legacy HTML is parsed inertly');
    await page.goto(base);
    await select('القسم','المحاسبة');
    await page.getByRole('combobox',{ name:'المقرر الدراسي', exact:true }).click();
    await page.getByRole('option',{ name:/^326/ }).click();
    await page.locator('input[type=file]').setInputFiles({ name:'legacy.xls', mimeType:'application/vnd.ms-excel', buffer:Buffer.from(html) });
    await page.getByRole('button',{ name:'تسجيل الطلاب', exact:true }).click();
    await page.getByText('عرض 1 من 1 أخطاء',{ exact:true }).waitFor();
    const legacyRequest = await page.evaluate(() => window.requests[0]);
    assert.match(legacyRequest.url,/enroll-students-batch$/);
    assert.equal(legacyRequest.options.rows[0]['كود الطالب'],'000326');
    const ExcelJS = requireApi('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Students');
    sheet.addRow(['كود الطالب']);
    for (let i=0;i<200;i++) sheet.addRow([String(i).padStart(6,'0')]);
    await page.getByRole('button',{ name:'إزالة الملف' }).click();
    await page.locator('input[type=file]').setInputFiles({ name:'students.xlsx', mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer:Buffer.from(await workbook.xlsx.writeBuffer()) });
    await page.getByRole('button',{ name:'تسجيل الطلاب', exact:true }).click();
    await page.getByText('عرض 40 من 200 أخطاء',{ exact:true }).waitFor();
    assert.equal(await page.evaluate(() => window.requests.length),3,'200 XLSX rows use two batches');
    assert.equal(await page.evaluate(() => window.requests[1].options.rows[0]['كود الطالب']),'000000');
    assert.equal(await page.getByText('السطر 152: تجاوز حد التسجيل',{ exact:true }).count(),1,'Second batch reports original sheet row numbers');
    if (process.argv[2]) {
      const bytes = Array.from(await fs.readFile(process.argv[2]));
      const counts = await page.evaluate((bytes) => { const rows = window.enrollmentHtmlRows(new Uint8Array(bytes).buffer); return { rows:rows?.length, codesAreText:rows?.every((row) => typeof row['كود الطالب'] === 'string') }; },bytes);
      assert.ok(counts.rows > 0 && counts.codesAreText);
      console.log(`Optional legacy sheet: ${counts.rows} rows parsed; student values were not logged or uploaded.`);
    }
    assert.deepEqual(errors,[]);
    console.log('Arabic/English, desktop/mobile, same-placement filtering, exact error totals, explicit exception confirmation and staff restrictions passed.');
  } finally { await browser?.close(); await new Promise((resolve) => server.close(resolve)); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
