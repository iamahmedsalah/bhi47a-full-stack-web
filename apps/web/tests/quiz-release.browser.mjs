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
let staffOnly = false;
let denyAssignedCourses = false;
let denyStaffCourses = false;
let staffSaveFailure;
let staffProfile;
const staffProfileMutations = [];
const resetStaffProfile = () => { staffProfile = { _id: fixtureId, name: 'Synthetic teaching staff', nameAr: 'عضو هيئة تدريس', email: 'staff@example.test', username: 'staff.original', phone: '01281577808', role: 'staff', staffType: 'assistant_lecturer', permissions: [], isActive: true }; };
resetStaffProfile();
const staffCourseRequests = [];
let studentCalls = 0;
const mutations = [];
const reset = (delay = 120000) => {
  settings = { ...base, endsAt: new Date(Date.now() + delay).toISOString() };
  studentCalls = 0; mutations.length = 0;
};
reset();
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, 'loader.cjs'), `const ts=require(${JSON.stringify(requireWeb.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,esModuleInterop:true}}).outputText;`);
await fs.writeFile(path.join(output, 'auth.ts'), `export const useAuth=()=>({user:{_id:'fixture-admin',role:new URLSearchParams(location.search).get('as')==='staff'?'staff':location.pathname.includes('/admin/')?'admin':'student',staffType:new URLSearchParams(location.search).get('staffType')||undefined,permissions:['quizzes.read','quizzes.write'],mustChangePassword:false}});`);
await fs.writeFile(path.join(output, 'navigation.ts'), `export const useParams=()=>({locale:location.pathname.split('/')[1]});export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);export const useRouter=()=>({push:()=>{},replace:()=>{}});`);
await fs.writeFile(path.join(output, 'api.ts'), `
  const call=async(method,url,body)=>{const response=await fetch(url,{method,headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw result;return {data:result,timestamp:new Date().toISOString()};};
  export const getApiErrorMessage=(error,fallback)=>error.message||fallback;export const getApiErrorDetails=error=>error;export const apiBaseUrl='';
  export default {get:(url,config)=>call('GET',url+(config?.params?'?'+new URLSearchParams(config.params):'')),post:(url,body)=>call('POST',url,body),patch:(url,body)=>call('PATCH',url,body),delete:url=>call('DELETE',url)};
`);
await fs.writeFile(path.join(output, 'entry.tsx'), `
  import React from 'react';import {createRoot} from 'react-dom/client';import {NextIntlClientProvider} from 'next-intl';
  import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {Toaster} from 'sonner';
  import Admin from '${path.join(web, 'src/app/[locale]/admin/quizzes/page.tsx').replaceAll('\\', '/')}';
  import Student from '${path.join(web, 'src/app/[locale]/dashboard/quizzes/page.tsx').replaceAll('\\', '/')}';
  import {StaffDetailsDialog} from '${path.join(web, 'src/features/staff/components/staff-details-dialog.tsx').replaceAll('\\', '/')}';
  import {StaffManagementPage} from '${path.join(web, 'src/features/staff/components/staff-management-page.tsx').replaceAll('\\', '/')}';
  import ar from '${path.join(web, 'src/messages/ar.json').replaceAll('\\', '/')}';import en from '${path.join(web, 'src/messages/en.json').replaceAll('\\', '/')}';
  Math.random=()=>0;const locale=location.pathname.split('/')[1];document.documentElement.dir=locale==='ar'?'rtl':'ltr';
  const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:0},mutations:{retry:false}}});window.quizQueryClient=client;
  const staffType=new URLSearchParams(location.search).get('staffType')||'doctor';
  function StaffFixture(){const [open,setOpen]=React.useState(true);return <><button onClick={()=>setOpen(true)}>Open staff details</button><StaffDetailsDialog staff={open?{_id:'${fixtureId}',name:'Synthetic teaching staff',role:'staff',staffType,isActive:true,permissions:[]}:null} open={open} onOpenChange={setOpen}/></>}
  createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale={locale} messages={locale==='ar'?ar:en} timeZone="Africa/Cairo"><QueryClientProvider client={client}>{location.pathname.includes('/admin/staff')?(location.search.includes('manage=true')?<StaffManagementPage/>:<StaffFixture/>):location.pathname.includes('/admin/')?<Admin/>:<Student/>}<Toaster/></QueryClientProvider></NextIntlClientProvider>);
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
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;
    if (pathname.startsWith('/admin/') || pathname.startsWith('/students/') || pathname.startsWith('/staff/') || pathname === '/courses') {
      res.setHeader('Content-Type', 'application/json');
      if (pathname === '/admin/staff' && req.method === 'POST') {
        const chunks = [];for await (const chunk of req) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks).toString());staffProfileMutations.push(body);
        staffProfile={...staffProfile,...body,_id:fixtureId,isActive:true};res.end(JSON.stringify(staffProfile));return;
      }
      if (pathname === '/admin/staff') { res.end(JSON.stringify({ items: [staffProfile], total: 1, totalPages: 1, page: 1, limit: 20 })); return; }
      if (pathname === `/admin/staff/${fixtureId}` && req.method === 'PATCH') {
        const chunks = [];for await (const chunk of req) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks).toString());staffProfileMutations.push(body);
        if ('role' in body || 'password' in body) {
          res.statusCode=400;res.end(JSON.stringify({statusCode:400,message:'property role should not exist'}));return;
        }
        if (staffSaveFailure) {
          res.statusCode=staffSaveFailure==='email'?409:503;
          res.end(JSON.stringify(staffSaveFailure==='email'?{statusCode:409,code:'STAFF_EMAIL_TAKEN',message:'Staff email already exists',errors:{email:'emailTaken'}}:{statusCode:503,message:'Internal diagnostic details must not appear'}));return;
        }
        staffProfile={...staffProfile,...body};if(staffProfile.staffType!=='doctor')delete staffProfile.titlePrefix;res.end(JSON.stringify(staffProfile));return;
      }
      if (pathname === '/admin/courses' && url.searchParams.has('staffId')) {
        staffCourseRequests.push(Object.fromEntries(url.searchParams));
        const invalid = [...url.searchParams.keys()].some((key) => !['staffId', 'page', 'limit'].includes(key));
        if (invalid || denyStaffCourses) {
          res.statusCode = invalid ? 400 : 503;res.end(JSON.stringify({ message: 'Assigned courses unavailable' }));return;
        }
        const second = url.searchParams.get('page') === '2';
        res.end(JSON.stringify({ items: [{ _id: second ? '200000000000000000000002' : courseId, code: second ? 'AS102' : 'AS101',
          name: second ? 'Second assigned course' : 'Assigned teaching course', nameAr: second ? 'المقرر الثاني' : 'مقرر عضو هيئة التدريس',
          teachingAssistantIds: [fixtureId] }], totalPages: 2 }));return;
      }
      if ((staffOnly && pathname === '/admin/courses') || (denyAssignedCourses && pathname === '/staff/me/assigned-courses')) {
        res.statusCode = 403; res.end(JSON.stringify({ message: 'Course request failed' })); return;
      }
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
      if (pathname === '/staff/me/assigned-courses') data = [{ _id: courseId, code: 'QR101', name: 'Course', nameAr: 'المقرر' }];
      if (pathname === '/admin/courses' || pathname === '/courses') data = { items: [{ _id: courseId, code: 'QR101', name: 'Course', nameAr: 'المقرر' }], totalPages: 1 };
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
    for (const staffType of ['doctor', 'teaching_assistant', 'assistant_lecturer']) {
      await page.goto(`${address}/${locale}/admin/staff?staffType=${staffType}`);
      await page.getByRole('button', { name: locale === 'ar' ? /^المقررات المسندة/ : /^Assigned Courses/ }).click();
      await page.getByText('AS101', { exact: true }).waitFor();
      await page.getByText('AS102', { exact: true }).waitFor();
    }
    denyStaffCourses = true;
    await page.goto(`${address}/${locale}/admin/staff?staffType=teaching_assistant`);
    await page.getByRole('button', { name: locale === 'ar' ? /^المقررات المسندة/ : /^Assigned Courses/ }).click();
    await page.getByRole('alert').getByText(locale === 'ar' ? 'تعذر تحميل المقررات المسندة. أعد المحاولة.' : 'Could not load assigned courses. Please retry.', { exact: true }).waitFor();
    denyStaffCourses = false;
    await page.getByRole('button', { name: locale === 'ar' ? 'إعادة المحاولة' : 'Retry', exact: true }).click();
    await page.getByText('AS101', { exact: true }).waitFor();
    await page.getByText('AS102', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, `staff-assigned-courses-${locale}.png`), fullPage: true });
    await page.getByRole('button', { name: locale === 'ar' ? 'إغلاق' : 'Close', exact: true }).last().click();
    const beforeReopen = staffCourseRequests.length;
    const reopened = page.waitForResponse((response) => response.url().includes('staffId=') && response.url().includes('page=2'));
    await page.getByRole('button', { name: 'Open staff details', exact: true }).click();
    await reopened;
    assert.ok(staffCourseRequests.length > beforeReopen, 'reopening staff details refreshes assigned courses');
  }
  assert.ok(staffCourseRequests.every((params) => params.staffId === fixtureId && !('_t' in params)));
  console.log('Staff management dialog passed: Arabic/English doctor, TA and assistant lecturer courses, pagination, retry, reopening and validated query parameters.');
  for (const locale of ['en', 'ar']) {
    resetStaffProfile();staffProfileMutations.length=0;
    const t = JSON.parse(await fs.readFile(path.join(web, `src/messages/${locale}.json`), 'utf8')).staff;
    await page.goto(`${address}/${locale}/admin/staff?manage=true`);
    await page.getByRole('button', {name:t.table.actions,exact:true}).first().click();
    await page.getByRole('menuitem',{name:t.actions.edit,exact:true}).click();
    const dialog=page.getByRole('dialog');
    const name=dialog.getByLabel(t.fields.name,{exact:true});
    const nameAr=dialog.getByLabel(t.fields.nameAr,{exact:true});
    const email=dialog.getByLabel(t.fields.email,{exact:true});
    const username=dialog.getByLabel(t.fields.username,{exact:false});
    const save=dialog.getByRole('button',{name:t.save,exact:true});
    await save.waitFor({ state: 'visible' });
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(button => button.type === 'submit')?.disabled);
    await name.fill('X');await nameAr.fill('س');await email.fill('invalid-email');await username.fill('bad user');await save.click();
    for (const key of ['nameLength','nameArLength','emailInvalid','usernameFormat']) await dialog.getByText(t.validation[key],{exact:true}).waitFor();
    assert.equal(staffProfileMutations.length,0,'invalid fields do not send a request');
    await name.fill('Updated teaching staff');await nameAr.fill('اسم عربي محدث');await email.fill('staff@example.test');await username.fill('staff.updated');
    staffSaveFailure='email';await save.click();
    await dialog.getByRole('alert').getByText(t.validation.emailTaken,{exact:true}).waitFor();
    assert.equal(await email.getAttribute('aria-invalid'),'true');
    assert.equal(await nameAr.inputValue(),'اسم عربي محدث');
    staffSaveFailure='server';await save.click();
    await dialog.getByRole('alert').getByText(t.validation.saveFailed,{exact:true}).waitFor();
    await page.screenshot({path:path.join(output,`staff-profile-validation-${locale}.png`),fullPage:true});
    staffSaveFailure=undefined;await save.click();
    await dialog.waitFor({state:'hidden'});
    const payload=staffProfileMutations.at(-1);
    assert.equal(payload.nameAr,'اسم عربي محدث');assert.equal(payload.staffType,'assistant_lecturer');
    assert.ok(staffProfileMutations.every((item)=>!('role' in item)&&!('password' in item)));
    assert.deepEqual(payload.courseIds,[courseId,'200000000000000000000002']);
    assert.deepEqual(payload.permissions,[]);
    assert.equal(staffProfile.name,'Updated teaching staff');
    await page.getByRole('button',{name:t.table.actions,exact:true}).first().click();
    await page.getByRole('menuitem',{name:t.actions.edit,exact:true}).click();
    await nameAr.fill('');await username.fill('');await dialog.getByLabel(t.fields.phone,{exact:true}).fill('');
    await email.fill('staff@example.test');await name.click();
    assert.equal(await username.inputValue(),'','editing email must not recreate a cleared username');
    await save.click();await dialog.waitFor({state:'hidden'});
    for(const field of ['nameAr','username','phone'])assert.equal(staffProfileMutations.at(-1)[field],'');
  }
  console.log('Staff profile edit passed: Arabic/English field validation, duplicate email, retained input on server failure, Arabic names and successful updates without role changes.');
  for (const locale of ['en', 'ar']) {
    const t = JSON.parse(await fs.readFile(path.join(web, `src/messages/${locale}.json`), 'utf8')).staff;
    resetStaffProfile();staffProfile.staffType='doctor';staffProfile.titlePrefix='dr';staffProfile.nameAr='';
    await page.goto(`${address}/${locale}/admin/staff?manage=true`);
    for (const prefix of ['prof','assoc_prof','dr']) {
      await page.getByRole('button',{name:t.table.actions,exact:true}).first().click();
      await page.getByRole('menuitem',{name:t.actions.edit,exact:true}).click();
      const dialog=page.getByRole('dialog');
      const title=dialog.getByRole('combobox',{name:t.fields.titlePrefix,exact:true});
      await title.click();await page.getByRole('option',{name:t.doctorPrefixes[prefix],exact:true}).click();
      await dialog.getByLabel(t.fields.name,{exact:true}).fill('Dr. Updated teaching staff');
      await dialog.getByLabel(t.fields.email,{exact:true}).focus();
      assert.equal((await title.innerText()).trim(),t.doctorPrefixes[prefix]);
      const save=dialog.getByRole('button',{name:t.save,exact:true});
      await page.waitForFunction(()=>![...document.querySelectorAll('button')].find(button=>button.type==='submit')?.disabled);
      await save.click();await dialog.waitFor({state:'hidden'});
      assert.equal(staffProfileMutations.at(-1).titlePrefix,prefix);
      const prefixLabel=t.doctorPrefixes[prefix].split(' (')[0];
      await page.getByText(`${prefixLabel} Updated teaching staff`,{exact:true}).first().waitFor();
      await page.getByRole('button',{name:t.table.actions,exact:true}).first().click();
      await page.getByRole('menuitem',{name:t.actions.edit,exact:true}).click();
      assert.equal((await page.getByRole('dialog').getByRole('combobox',{name:t.fields.titlePrefix,exact:true}).innerText()).trim(),t.doctorPrefixes[prefix]);
      await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
    }
    await page.getByRole('button',{name:t.table.actions,exact:true}).first().click();
    await page.getByRole('menuitem',{name:t.actions.edit,exact:true}).click();
    const edit=page.getByRole('dialog');
    await edit.getByRole('combobox',{name:t.fields.staffType,exact:true}).click();
    await page.getByRole('option',{name:t.types.teaching_assistant,exact:true}).click();
    assert.equal(await edit.getByRole('combobox',{name:t.fields.titlePrefix,exact:true}).count(),0);
    await edit.getByRole('button',{name:t.save,exact:true}).click();await edit.waitFor({state:'hidden'});
    assert.equal(staffProfile.staffType,'teaching_assistant');assert.equal(staffProfile.titlePrefix,undefined);
    for(const prefix of ['prof','assoc_prof','dr']){
      await page.getByRole('button',{name:t.create,exact:true}).click();
      const create=page.getByRole('dialog');
      await create.getByLabel(t.fields.name,{exact:true}).fill('New teaching staff');
      await create.getByLabel(t.fields.email,{exact:true}).fill('new-teaching@example.test');
      await create.getByLabel(t.fields.temporaryPassword,{exact:true}).fill('SyntheticPassword123!');
      await create.getByRole('combobox',{name:t.fields.titlePrefix,exact:true}).click();
      await page.getByRole('option',{name:t.doctorPrefixes[prefix],exact:true}).click();
      await create.getByRole('button',{name:t.create,exact:true}).click();await create.waitFor({state:'hidden'});
      assert.equal(staffProfileMutations.at(-1).titlePrefix,prefix);
      await page.getByText(`${t.doctorPrefixes[prefix].split(' (')[0]} New teaching staff`,{exact:true}).first().waitFor();
    }
  }
  console.log('Doctor prefixes passed in Arabic and English: create, update, reopen, explicit selection overriding name inference, and non-doctor role changes.');
  if (!process.argv.includes('--staff-only')) {
  for (const locale of ['en', 'ar']) {
    reset();
    await page.goto(`${address}/${locale}/admin/quizzes?create=true`);
    const marks = page.getByRole('button', { name: locale === 'ar' ? 'إعلان الدرجات' : 'Marks release', exact: true });
    await marks.waitFor();
    assert.match(await marks.innerText(), new RegExp(locale === 'ar' ? 'إتاحة تلقائية بعد إغلاق الاختبار' : 'Release automatically after closing'));
    const reviewCheckbox = page.getByRole('checkbox', { name: locale === 'ar' ? 'تفعيل مراجعة الإجابات' : 'Enable answer review' });
    assert.equal(await reviewCheckbox.isChecked(), false);
    await marks.click();
    await page.getByRole('menuitemradio', { name: locale === 'ar' ? 'إتاحة تلقائية بعد إغلاق الاختبار' : 'Release automatically after closing', exact: true }).click();
    await page.getByText(new RegExp(locale === 'ar' ? 'موعد الإتاحة التلقائية:' : 'Automatic release:'), { exact: false }).waitFor();
    await page.screenshot({ path: path.join(output, `create-${locale}.png`), fullPage: true });
  }
  staffOnly = true;
  for (const staffType of ['doctor', 'teaching_assistant', 'assistant_lecturer']) {
    reset();
    await page.goto(`${address}/en/admin/quizzes?create=true&as=staff&staffType=${staffType}`);
    await page.getByRole('button', { name: 'Marks release', exact: true }).waitFor();
    assert.match(await page.getByRole('button', { name: 'Marks release', exact: true }).innerText(), /Release automatically after closing/);
    assert.match(await page.getByRole('button', { name: 'Answer review', exact: true }).innerText(), /Manual control/);
    await page.getByRole('button', { name: 'Select course...', exact: true }).click();
    await page.getByRole('option', { name: /QR101/ }).waitFor();
  }
  denyAssignedCourses = true;
  await page.goto(`${address}/en/admin/quizzes?create=true&as=staff&staffType=doctor`);
  await page.getByText('Could not load assigned courses. Please retry.', { exact: true }).waitFor();
  denyAssignedCourses = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.getByRole('button', { name: 'Select course...', exact: true }).click();
  await page.getByRole('option', { name: /QR101/ }).waitFor();
  staffOnly = false;
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
  await page.waitForFunction(() => navigator.onLine === false);
  await page.waitForFunction(() => window.quizQueryClient.isFetching() === 0);
  settings.resultsReleaseMode = 'manual';settings.publishResults = false;
  await page.context().setOffline(false);
  await page.waitForFunction(() => navigator.onLine === true);
  await page.waitForFunction(() => !Array.from(document.querySelectorAll('[role="dialog"]')).some((el) => el.textContent.includes('100%')));
  assert.ok(studentCalls > reconnectCalls, 'reconnecting refreshes release policy');
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(output, 'student-result-updated.png'), fullPage: true });
  console.log('Quiz release browser acceptance passed: Arabic/English controls, automatic marks/manual review defaults, staff assignment selectors/error recovery, closing validation, closed-quiz editing, Cairo inputs in foreign timezones, atomic sheet replacement, deadline refresh and open result updates.');
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();await new Promise((resolve) => server.close(resolve));
}
