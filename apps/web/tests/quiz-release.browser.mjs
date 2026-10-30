import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const web = path.join(root, 'apps/web');
const output = path.join(root, 'outputs/quiz-release');
const requireWeb = createRequire(path.join(web, 'package.json'));
const requireApi = createRequire(path.join(root, 'apps/api/package.json'));
const { webpack } = requireWeb('next/dist/compiled/webpack/webpack');
const { chromium } = requireApi('playwright');
const fixtureId = '100000000000000000000001';
const courseId = '200000000000000000000001';
const base = {
  _id: fixtureId, title: 'Release fixture', courseId, courseCode: 'QR101', courseName: 'Course', courseNameAr: 'المقرر',
  isPublished: true, durationMinutes: 1, totalMarks: 2, passingMarks: 1,
  publishResults: false, allowReview: false, allowResume: true,
  resultsReleaseMode: 'after_close', reviewReleaseMode: 'after_close',
  questions: [{ id: 'q1', text: 'Two plus two?', type: 'mcq', options: ['4', '5'], correctOptionIndex: 0, points: 2 }],
};
let settings;
let importResult;
let studentCalls = 0;
const mutations = [];
const reset = (delay = 120000) => {
  settings = { ...base, endsAt: new Date(Date.now() + delay).toISOString() };
  studentCalls = 0; mutations.length = 0;
};
reset();
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, 'loader.cjs'), `const ts=require(${JSON.stringify(requireWeb.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,esModuleInterop:true}}).outputText;`);
await fs.writeFile(path.join(output, 'auth.ts'), `export const useAuth=()=>({user:{_id:'fixture-admin',role:location.pathname.includes('/admin/')?'admin':'student',permissions:[],mustChangePassword:false}});`);
await fs.writeFile(path.join(output, 'navigation.ts'), `export const useParams=()=>({locale:location.pathname.split('/')[1]});export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);export const useRouter=()=>({push:()=>{},replace:()=>{}});`);
await fs.writeFile(path.join(output, 'api.ts'), `
  const call=async(method,url,body)=>{const response=await fetch(url,{method,headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw result;return {data:result,timestamp:new Date().toISOString()};};
  export const getApiErrorMessage=(error,fallback)=>error.message||fallback;export const getApiErrorDetails=error=>error;export const apiBaseUrl='';
  export default {get:url=>call('GET',url),post:(url,body)=>call('POST',url,body),patch:(url,body)=>call('PATCH',url,body),delete:url=>call('DELETE',url)};
`);
await fs.writeFile(path.join(output, 'entry.tsx'), `
  import React from 'react';import {createRoot} from 'react-dom/client';import {NextIntlClientProvider} from 'next-intl';
  import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {Toaster} from 'sonner';
  import Admin from '${path.join(web, 'src/app/[locale]/admin/quizzes/page.tsx').replaceAll('\\', '/')}';
  import Student from '${path.join(web, 'src/app/[locale]/dashboard/quizzes/page.tsx').replaceAll('\\', '/')}';
  import ar from '${path.join(web, 'src/messages/ar.json').replaceAll('\\', '/')}';import en from '${path.join(web, 'src/messages/en.json').replaceAll('\\', '/')}';
  Math.random=()=>0;const locale=location.pathname.split('/')[1];document.documentElement.dir=locale==='ar'?'rtl':'ltr';
  const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:0},mutations:{retry:false}}});window.quizQueryClient=client;
  createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale={locale} messages={locale==='ar'?ar:en} timeZone="Africa/Cairo"><QueryClientProvider client={client}>{location.pathname.includes('/admin/')?<Admin/>:<Student/>}<Toaster/></QueryClientProvider></NextIntlClientProvider>);
`);
await new Promise((resolve, reject) => webpack({
  mode: 'development', devtool: false, context: web,
  cache: { type: 'filesystem', cacheDirectory: path.join(output, 'webpack-cache') },
  entry: path.join(output, 'entry.tsx'), output: { path: output, filename: 'app.js', publicPath: '/' },
  resolve: { extensions: ['.tsx', '.ts', '.jsx', '.js'], modules: [path.join(web, 'node_modules'), 'node_modules'], alias: {
    'next/navigation': path.join(output, 'navigation.ts'), '@/lib/api': path.join(output, 'api.ts'), '@/providers/auth-provider': path.join(output, 'auth.ts'), '@': path.join(web, 'src'),
  } },
  module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(output, 'loader.cjs') }] },
}, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve()));
const css = await requireWeb('postcss')([requireWeb('@tailwindcss/postcss')({ base: web })]).process(await fs.readFile(path.join(web, 'src/app/globals.css'), 'utf8'), { from: path.join(web, 'src/app/globals.css') });
await fs.writeFile(path.join(output, 'styles.css'), css.css);
const state = () => {
  const isEnded = Date.now() >= Date.parse(settings.endsAt);
  const resultsAvailable = settings.resultsReleaseMode === 'after_close' ? isEnded : settings.publishResults;
  const reviewAvailable = resultsAvailable && isEnded && (settings.reviewReleaseMode === 'after_close' || settings.allowReview);
  return { ...settings, resultsAvailable, reviewAvailable, isEnded };
};
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname.startsWith('/admin/') || pathname.startsWith('/students/') || pathname === '/courses') {
      res.setHeader('Content-Type', 'application/json');
      if (pathname === '/admin/quizzes/parse-questions-file') {
        res.end(JSON.stringify(importResult)); return;
      }
      if (req.method === 'PATCH' || req.method === 'POST') {
        const chunks = [];for await (const chunk of req) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks).toString());mutations.push(body);settings = { ...settings, ...body };
      }
      const current = state();
      const student = { ...current, publishResults: current.resultsAvailable, canReview: current.reviewAvailable,
        isSubmitted: true, questionsCount: 1, isOpen: !current.isEnded, submission: { ...(current.resultsAvailable ? { score: 2, percentage: 100, isPassed: true } : {}), totalMarks: 2, submittedAt: new Date().toISOString(), durationSeconds: 10 } };
      let data = [];
      if (pathname === '/admin/courses' || pathname === '/courses') data = { items: [{ _id: courseId, code: 'QR101', name: 'Course', nameAr: 'المقرر' }] };
      else if (pathname === '/admin/quizzes') data = req.method === 'GET' ? { items: [current], total: 1, page: 1, limit: 15, totalPages: 1 } : current;
      else if (pathname.startsWith('/admin/quizzes/')) data = current;
      else if (pathname === '/students/me/quizzes') { studentCalls++; data = [student]; }
      res.end(JSON.stringify(data));return;
    }
    if (pathname.endsWith('.js') || pathname === '/styles.css') {
      res.setHeader('Content-Type', pathname.endsWith('.js') ? 'text/javascript' : 'text/css');
      res.end(await fs.readFile(path.join(output, pathname.slice(1))));return;
    }
    res.setHeader('Content-Type', 'text/html');res.end('<!doctype html><html class="dark"><meta charset="utf-8"><link rel="stylesheet" href="/styles.css"><body><div id="root"></div><script src="/app.js"></script></body></html>');
  } catch (error) { res.statusCode = 500;res.end(JSON.stringify({ message: error.message })); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, timezoneId: 'UTC' });
  const errors = [];page.on('pageerror', (error) => errors.push(error.message));
  for (const locale of ['en', 'ar']) {
    reset();
    await page.goto(`${address}/${locale}/admin/quizzes?create=true`);
    const marks = page.getByRole('button', { name: locale === 'ar' ? 'إعلان الدرجات' : 'Marks release', exact: true });
    await marks.waitFor();
    assert.match(await marks.innerText(), new RegExp(locale === 'ar' ? 'تحكم يدوي' : 'Manual control'));
    const reviewCheckbox = page.getByRole('checkbox', { name: locale === 'ar' ? 'تفعيل مراجعة الإجابات' : 'Enable answer review' });
    assert.equal(await reviewCheckbox.isChecked(), false);
    await marks.click();
    await page.getByRole('menuitemradio', { name: locale === 'ar' ? 'إتاحة تلقائية بعد إغلاق الاختبار' : 'Release automatically after closing', exact: true }).click();
    await page.getByText(locale === 'ar' ? 'حدد تاريخ ووقت إغلاق الاختبار للإتاحة التلقائية.' : 'Choose a closing date and time for automatic release.', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, `create-${locale}.png`), fullPage: true });
  }
  // Edit a closed quiz without altering its original timestamp; both settings round-trip.
  reset(-60000);settings.resultsReleaseMode = 'manual';settings.reviewReleaseMode = 'manual';
  const oldDeadline = settings.endsAt;
  await page.goto(`${address}/en/admin/quizzes`);
  const row = page.getByRole('row').filter({ hasText: 'Release fixture' });await row.waitFor();
  await row.locator('button').last().click();await page.getByRole('menuitem', { name: 'Edit Quiz', exact: true }).click();
  for (const name of ['Marks release', 'Answer review']) {
    await page.getByRole('button', { name, exact: true }).click();
    await page.getByRole('menuitemradio', { name: 'Release automatically after closing', exact: true }).click();
  }
  await page.getByText(`Automatic release: ${new Date(oldDeadline).toLocaleString('en-GB', { timeZone: 'Africa/Cairo', dateStyle: 'medium', timeStyle: 'short' })} (Cairo time)`, { exact: true }).waitFor();
  await page.getByRole('button', { name: /Save Changes|Update Quiz|Save Quiz|حفظ/ }).click();
  await page.waitForFunction(() => !document.getElementById('quiz-results-release'));
  assert.equal(mutations.at(-1).endsAt, oldDeadline);
  assert.equal(mutations.at(-1).resultsReleaseMode, 'after_close');assert.equal(mutations.at(-1).reviewReleaseMode, 'after_close');
  // Updating the same Cairo wall time in foreign browser zones saves the same UTC instant.
  for (const timezoneId of ['UTC', 'America/New_York']) {
    const foreign = await browser.newPage({ timezoneId });
    reset(); settings.endsAt = '2027-07-15T09:00:00.000Z';
    await foreign.goto(`${address}/en/admin/quizzes`);
    const quizRow = foreign.getByRole('row').filter({ hasText: 'Release fixture' });
    await quizRow.waitFor(); await quizRow.locator('button').last().click();
    await foreign.getByRole('menuitem', { name: 'Edit Quiz', exact: true }).click();
    await foreign.getByRole('button', { name: /15\/07\/2027 12:00 PM/ }).click();
    await foreign.getByRole('button', { name: 'HH', exact: true }).click();
    await foreign.getByRole('option', { name: '01', exact: true }).click();
    await foreign.getByRole('button', { name: 'Done', exact: true }).click();
    await foreign.getByRole('button', { name: 'Save Quiz', exact: true }).click();
    await foreign.waitForFunction(() => !document.getElementById('quiz-results-release'));
    assert.equal(mutations.at(-1).endsAt, '2027-07-15T10:00:00.000Z', timezoneId);
    await foreign.close();
  }
  // Sheet re-uploads replace the editor atomically; errors keep all existing QA.
  for (const locale of ['en', 'ar']) {
    reset(); settings.resultsReleaseMode = 'manual'; settings.reviewReleaseMode = 'manual';
    await page.goto(`${address}/${locale}/admin/quizzes`);
    const quizRow = page.getByRole('row').filter({ hasText: 'Release fixture' });
    await quizRow.waitFor(); await quizRow.locator('button').last().click();
    await page.getByRole('menuitem', { name: locale === 'ar' ? 'تعديل الاختبار' : 'Edit Quiz', exact: true }).click();
    const uploaded = [{ ...base.questions[0], id: 'import-q1', correctOptionIndex: 1 }, { ...base.questions[0], id: 'import-q2', text: 'Second imported question' }];
    importResult = { questions: uploaded, errors: [], validCount: 2, totalRows: 2 };
    const file = { name: 'questions.csv', mimeType: 'text/csv', buffer: Buffer.from('fixture') };
    for (let upload = 0; upload < 2; upload++) {
      await page.locator('input[type=file]').setInputFiles(file);
      await page.getByRole('heading', { name: locale === 'ar' ? 'أسئلة الاختبار (2)' : 'Questions (2)', exact: true }).waitFor();
      await page.getByRole('button', { name: locale === 'ar' ? 'رفع ملف الأسئلة' : 'Upload Questions File', exact: true }).waitFor();
    }
    importResult = { questions: [{ ...base.questions[0], text: 'Partial must not replace' }], errors: ['Invalid answer in row 3'], validCount: 1, totalRows: 2 };
    await page.locator('input[type=file]').setInputFiles(file);
    await page.getByText('Invalid answer in row 3', { exact: true }).waitFor();
    await page.getByRole('heading', { name: locale === 'ar' ? 'أسئلة الاختبار (2)' : 'Questions (2)', exact: true }).waitFor();
    await page.getByRole('button', { name: locale === 'ar' ? 'حفظ الاختبار' : 'Save Quiz', exact: true }).click();
    await page.waitForFunction(() => !document.getElementById('quiz-results-release'));
    assert.equal(mutations.at(-1).questions.length, 2);
    assert.equal(mutations.at(-1).questions[0].id, 'q1');
    assert.equal(mutations.at(-1).questions[0].correctOptionIndex, 1);
    assert.equal(mutations.at(-1).questions[1].text, 'Second imported question');
  }
  // One deadline refresh unlocks the real student page without a reload.
  reset(4000);
  await page.goto(`${address}/en/dashboard/quizzes`);
  await page.getByText('Release fixture', { exact: true }).first().waitFor();
  await page.getByTestId('quiz-release-schedule').waitFor();
  await page.getByRole('button', { name: 'See Quiz Result', exact: true }).waitFor({ timeout: 12000 });
  assert.equal(studentCalls, 2, 'initial list plus one deadline refresh');
  await page.getByRole('button', { name: 'See Quiz Result', exact: true }).click();
  await page.getByRole('dialog').getByText('100%', { exact: true }).waitFor();
  settings.resultsReleaseMode = 'manual';settings.publishResults = false;
  await page.evaluate(() => window.quizQueryClient.invalidateQueries({ queryKey: ['student-online-quizzes'] }));
  await page.waitForFunction(() => !Array.from(document.querySelectorAll('[role="dialog"]')).some((el) => el.textContent.includes('100%')));
  const hiddenCalls = studentCalls;
  settings.resultsReleaseMode = 'after_close';settings.reviewReleaseMode = 'manual';settings.allowReview = false;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[role="dialog"]')).some((el) => el.textContent.includes('100%')));
  assert.ok(studentCalls > hiddenCalls, 'returning to the page refreshes marks');
  const reconnectCalls = studentCalls;
  await page.context().setOffline(true);
  settings.resultsReleaseMode = 'manual';settings.publishResults = false;
  await page.context().setOffline(false);
  await page.waitForFunction(() => !Array.from(document.querySelectorAll('[role="dialog"]')).some((el) => el.textContent.includes('100%')));
  assert.ok(studentCalls > reconnectCalls, 'reconnecting refreshes release policy');
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(output, 'student-result-updated.png'), fullPage: true });
  console.log('Quiz release browser acceptance passed: Arabic/English controls, manual defaults, closing validation, closed-quiz editing, Cairo inputs in foreign timezones, atomic sheet replacement, deadline refresh and open result updates.');
} finally {
  await browser?.close();await new Promise((resolve) => server.close(resolve));
}
