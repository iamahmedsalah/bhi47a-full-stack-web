import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const web = path.join(root, 'apps/web');
const output = path.join(root, 'outputs/portal-regressions');
const requireWeb = createRequire(path.join(web, 'package.json'));
const { chromium } = createRequire(path.join(root, 'apps/api/package.json'))('playwright');
const { webpack } = requireWeb('next/dist/compiled/webpack/webpack');
await fs.mkdir(output, { recursive: true });
const write = (name, source) => fs.writeFile(path.join(output, name), source);
await write('loader.cjs', `const ts=require(${JSON.stringify(requireWeb.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,esModuleInterop:true}}).outputText;`);
await write('navigation.ts', `export const useParams=()=>({locale:location.pathname.split('/')[1]});export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);const router={push:()=>{},replace:url=>setTimeout(()=>history.replaceState(null,'',url),500)};export const useRouter=()=>router;`);
await write('auth.ts', `
  const params = new URLSearchParams(location.search);
  export const useAuth = () => ({ user: {
    _id: 'synthetic', role: params.get('role') || 'student', name: 'Synthetic',
    mustChangePassword: false, permissions: params.has('delete') ? ['attendance.delete'] : [],
  } });
`);
await write('image.tsx', `import React from 'react';export default function Image({fill,priority,unoptimized,...props}){return <img {...props}/>;}`);
await write('dynamic.tsx', `import React from 'react';export default function dynamic(load){const Component=React.lazy(async()=>{const result=await load();return {default:result.default??result};});return props=><React.Suspense fallback={null}><Component {...props}/></React.Suspense>;}`);
await write('link.tsx', `import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>;}`);
await write('api.ts', `
  import { AxiosError } from 'axios';
  const request = async ({ url, params, method, data }) => {
    const response = await fetch('/fixture' + url + (params ? '?' + new URLSearchParams(params) : ''), {
      method, ...(data ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}),
    });
    const body = await response.json();
    if (!response.ok && url.endsWith('/qr')) throw new AxiosError(body.message, undefined, undefined, undefined, { status: response.status });
    return body;
  };
  export const apiBaseUrl = '';
  export const getApiErrorMessage = e => e.message || 'Error';
  export const getApiErrorDetails = e => e;
  export default { request, get: (url, config) => request({ url, ...config }),
    delete: (url, config) => request({ url, ...config, method: 'DELETE' }) };
`);
await write('api-client.ts', `import api from './api';export const apiGet=async(url,config)=>(await api.get(url,config)).data;export const apiPost=async(url,body)=>{const response=await fetch('/fixture'+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw new Error(result.message);return result.data};export const apiPatch=apiPost;export const apiDelete=apiPost;`);
await write('entry.tsx', `
  import React from 'react';import {createRoot} from 'react-dom/client';import {NextIntlClientProvider} from 'next-intl';
  import Attendance from '@/app/[locale]/admin/attendance/page';
  import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
  import Dashboard from '@/app/[locale]/dashboard/page';import Quizzes from '@/app/[locale]/dashboard/quizzes/page';
  import {MaterialUploadProvider} from '@/features/courses/material-upload-provider';
  import {FilterBar} from '@/components/ui/filter-bar';import {PasswordRequirementDialog} from '@/features/students/components/password-requirement-dialog';
  import {useTableState} from '@/hooks/use-table-state';
  import ar from '@/messages/ar.json';import en from '@/messages/en.json';
  const locale=location.pathname.split('/')[1];document.documentElement.dir=locale==='ar'?'rtl':'ltr';
  const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:60000}}});window.client=client;
  function App(){const [view,setView]=React.useState('search');window.view=setView;const {search,setSearch}=useTableState({defaultFilters:{}});const [,tick]=React.useState(0);
    React.useEffect(()=>{const t=setInterval(()=>tick(n=>n+1),30);return()=>clearInterval(t)},[]);
    return <>{view==='search'?<><FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Search fixture"/><button onClick={()=>setSearch('external')}>External reset</button><output>{search}</output></>:view==='home'?<Dashboard/>:view==='quizzes'?<Quizzes/>:<PasswordRequirementDialog summary={{totalStudents:8020,mustChangeCount:83,allEnabled:false,anyEnabled:true}} isAr={locale==='ar'} busy={false} onClose={()=>{}} onSave={async enabled=>{window.saved=enabled}}/>}</>;
  }
  createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale={locale} messages={locale==='ar'?ar:en} timeZone="Africa/Cairo"><QueryClientProvider client={client}><MaterialUploadProvider locale={locale}>{location.pathname.endsWith('/attendance') ? <Attendance/> : <App/>}</MaterialUploadProvider></QueryClientProvider></NextIntlClientProvider>);
`);
await new Promise((resolve, reject) => webpack({
  mode: 'development', devtool: false, context: web,
  entry: path.join(output, 'entry.tsx'), output: { path: output, filename: 'app.js', publicPath: '/' },
  resolve: { extensions: ['.tsx', '.ts', '.js'], modules: [path.join(web, 'node_modules'), 'node_modules'], alias: {
    'next/navigation': path.join(output, 'navigation.ts'), 'next/image': path.join(output, 'image.tsx'), 'next/dynamic': path.join(output, 'dynamic.tsx'), 'next/link': path.join(output, 'link.tsx'),
    '@/lib/api': path.join(output, 'api.ts'), '@/lib/api-client': path.join(output, 'api-client.ts'), '@/providers/auth-provider': path.join(output, 'auth.ts'), '@': path.join(web, 'src'),
  } },
  module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(output, 'loader.cjs') }] },
}, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve()));
const quiz = { _id:'quiz-fixture', title:'Portal fixture quiz', courseId:'course-fixture', courseCode:'TEST', courseName:'Synthetic course', durationMinutes:10, totalMarks:10, passingMarks:5, questionsCount:1, isOpen:true, isEnded:false, isSubmitted:false };
let requiredCodes = ['20260001', '20260002'];
const studentUpdates = [];
const attendanceSession = {
  _id: 'session-fixture', courseCode: 'TEST', courseName: 'Synthetic course', level: '3',
  sessionType: 'section', academicPosition: 'instructor', createdByName: 'Synthetic instructor',
  startsAt: '2026-10-02T19:40:00Z', status: 'CLOSED',
};
const attendanceRecord = {
  _id: 'record-fixture', studentName: 'Synthetic attendee', studentCode: '20260001',
  method: 'manual', status: 'present', checkedInAt: attendanceSession.startsAt,
};
let attendanceRecords = [];
let attendanceSessionAvailable = true;
let attendanceRecordReads = 0;
let attendanceSessionStatus = 'CLOSED';
let attendanceQrReads = 0;
let attendanceClosesBeforeQr = false;
const attendanceDeletes = [];
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/attendance/sessions/session-fixture/live') {
    res.writeHead(204).end();
    return;
  }
  if (url.pathname.startsWith('/fixture')) {
    const endpoint = url.pathname.slice('/fixture'.length);
    let data = {};
    if (endpoint === '/students/me/quizzes') data = [quiz];
    else if (endpoint === '/students/me/course-quizzes') data = [];
    else if (endpoint === '/students/me/profile') data = { studentCode:'TEST',fullName:'Synthetic',level:'1' };
    else if (endpoint === '/students/me/attendance-history') data = { summary: { totalSessions: 0, presentCount: 0, lateCount: 0, attendanceRate: 0 } };
    else if (endpoint === '/attendance/student/live-sessions') data = { sessions: [] };
    else if (endpoint === '/attendance/my-classes') data = [];
    else if (endpoint === '/attendance/sessions') {
      const stats = { totalCheckedIn: attendanceRecords.length, presentCount: attendanceRecords.length, lateCount: 0 };
      const total = Number(attendanceSessionAvailable);
      const status = attendanceSessionStatus;
      data = {
        sessions: attendanceSessionAvailable ? [{ ...attendanceSession, status, expiresAt: new Date(Date.now() + 600_000).toISOString(), qrRotationSeconds: 60, stats }] : [],
        kpi: { ...stats, totalSessions: total, activeSessions: status === 'OPEN' ? total : 0 },
        total, page: 1, limit: 20, totalPages: total, filters: { levels: [], courses: [] },
      };
    } else if (endpoint === '/attendance/sessions/session-fixture/qr') {
      attendanceQrReads++;
      if (attendanceClosesBeforeQr) {
        attendanceSessionStatus = 'CLOSED';
        res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ message: 'Session closed' }));
        return;
      }
      data = { token: 'fixture-token', manualCode: '123456', checkInUrl: '/ar/attendance/check-in', rotationSeconds: 60, remainingSeconds: 60, expiresAt: new Date(Date.now() + 60_000).toISOString() };
    } else if (endpoint === '/attendance/sessions/session-fixture' && req.method === 'DELETE') {
      attendanceDeletes.push(attendanceSession._id);
      data = { deletedCount: attendanceRecords.length };
      attendanceSessionAvailable = false;
      attendanceRecords = [];
    } else if (endpoint === '/attendance/sessions/session-fixture/records') {
      if (req.method === 'DELETE') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const { recordIds } = JSON.parse(body);
        attendanceDeletes.push(recordIds);
        const before = attendanceRecords.length;
        attendanceRecords = attendanceRecords.filter(record => !recordIds.includes(record._id));
        data = { deletedCount: before - attendanceRecords.length };
      } else {
        attendanceRecordReads++;
        data = { items: attendanceRecords, total: attendanceRecords.length, page: 1, totalPages: 1 };
      }
    }
    else if (endpoint === '/students/me/syllabi') data = { registeredCourses:[],availableLevelCourses:[] };
    else if (endpoint === '/admin/students-must-change-password-codes') data = {items:requiredCodes,total:requiredCodes.length,totalPages:1};
    else if (endpoint === '/admin/students-password-requirement' && req.method === 'POST') {
      let body = '';for await (const chunk of req) body += chunk;
      const update = JSON.parse(body);studentUpdates.push(update);
      if (!['20260001','20260002'].includes(update.studentCode)) {
        res.writeHead(404, {'Content-Type':'application/json'});res.end(JSON.stringify({message:'Student not found'}));return;
      }
      requiredCodes = requiredCodes.filter(code => code !== update.studentCode);
      if (update.enabled) requiredCodes.push(update.studentCode);
      data = update;
    }
    res.setHeader('Content-Type', 'application/json');res.end(JSON.stringify({success:true,data,timestamp:new Date().toISOString()}));return;
  }
  if (url.pathname.endsWith('.js')) {res.setHeader('Content-Type','text/javascript');res.end(await fs.readFile(path.join(output,path.basename(url.pathname))));return;}
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/app.js"></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({headless:true});
  for (const locale of ['en','ar']) {
    requiredCodes = ['20260001', '20260002'];studentUpdates.length = 0;
    const page = await browser.newPage();const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
    await page.goto(`http://127.0.0.1:${server.address().port}/${locale}/dashboard`);
    const input = page.getByRole('textbox');await input.fill('20');
    await page.waitForTimeout(350);await input.press('End');await input.pressSequentially('26012345',{delay:15});
    await page.waitForTimeout(1100);assert.equal(await input.inputValue(),'2026012345');assert.equal(await page.locator('output').textContent(),'2026012345');
    await page.getByRole('button',{name:'Clear search'}).click();await page.waitForTimeout(600);assert.equal(await input.inputValue(),'');
    await page.getByRole('button',{name:'External reset'}).click();await page.waitForFunction(()=>document.querySelector('input').value==='external');
    for (const view of ['home','quizzes','home','quizzes']) {
      await page.evaluate(v=>window.view(v),view);
      await page.waitForFunction(()=>Boolean(window.client.getQueryData(['student-online-quizzes'])?.quizzes));
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(()=>Array.isArray(window.client.getQueryData(['student-online-quizzes']).quizzes)),true);
    }
    await page.evaluate(()=>window.view('passwords'));const dialog=page.getByRole('dialog');await dialog.getByText('20260001',{exact:true}).waitFor();
    const toggle=dialog.getByRole('switch',{name:locale==='ar'?'إلزام جميع الطلاب بتغيير كلمة المرور':'Require all students to change their password'});assert.equal(await toggle.getAttribute('aria-checked'),'false');
    const save=dialog.getByRole('button',{name:locale==='ar'?'حفظ للجميع':'Save for all students',exact:true});
    await save.click();assert.equal(await page.evaluate(()=>window.saved),false);
    await toggle.click();await save.click();assert.equal(await page.evaluate(()=>window.saved),true);
    const codeInput=dialog.getByRole('textbox',{name:locale==='ar'?'كود الطالب':'Student code'});
    const individualToggle=dialog.getByRole('switch',{name:locale==='ar'?'إلزام هذا الطالب بتغيير كلمة المرور':'Require this student to change their password'});
    const individualSave=dialog.getByRole('button',{name:locale==='ar'?'حفظ لهذا الطالب فقط':'Save for this student only',exact:true});
    await dialog.getByRole('button',{name:'20260001',exact:true}).click();
    assert.equal(await codeInput.inputValue(),'20260001');assert.equal(await individualToggle.getAttribute('aria-checked'),'true');
    await individualToggle.click();await individualSave.click();
    await dialog.getByRole('status').waitFor();
    await dialog.getByRole('button',{name:'20260001',exact:true}).waitFor({state:'detached'});
    assert.deepEqual(studentUpdates,[{studentCode:'20260001',enabled:false}]);
    await dialog.getByRole('button',{name:'20260002',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.saved),true);
    await codeInput.fill('20260001');await individualToggle.click();await individualSave.click();
    await dialog.getByRole('button',{name:'20260001',exact:true}).waitFor();
    assert.deepEqual(studentUpdates.at(-1),{studentCode:'20260001',enabled:true});
    await codeInput.fill('unknown');await individualSave.click();await dialog.getByRole('alert').waitFor();
    assert.equal(studentUpdates.length,2);
    await codeInput.fill('99999999');await individualSave.click();await dialog.getByRole('alert').filter({hasText:'Student not found'}).waitFor();
    assert.deepEqual(requiredCodes.sort(),['20260001','20260002']);
    assert.deepEqual(errors,[]);await page.close();
  }
  for (const account of ['admin', 'staff&delete=1', 'staff']) {
    attendanceRecords = account === 'staff&delete=1' ? [] : [attendanceRecord];
    attendanceSessionAvailable = true;
    attendanceRecordReads = 0;
    attendanceDeletes.length = 0;
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/ar/admin/attendance?role=${account}`);
    await page.getByRole('button', { name: account === 'admin' ? 'الرقابة وإدارة الحضور العامة' : 'جلساتي وسجل الحضور' }).click();
    await page.getByRole('button', { name: 'إجراءات جلسة TEST' }).click();
    const deleteAction = page.getByRole('menuitem', { name: 'حذف الجلسة' });
    if (account === 'staff') {
      assert.equal(await deleteAction.count(), 0);
      await page.getByRole('menuitem', { name: 'سجل الطلاب' }).click();
      await page.getByRole('dialog', { name: 'سجل حضور الجلسة' }).getByText('Synthetic attendee').waitFor();
      assert.equal(await page.getByRole('button', { name: 'حذف المحدد' }).count(), 0);
    } else {
      await deleteAction.click();
      const confirmation = page.getByRole('alertdialog', { name: 'هل أنت متأكد من حذف الجلسة؟' });
      await confirmation.waitFor();
      assert.equal(await page.getByRole('dialog', { name: 'سجل حضور الجلسة' }).count(), 0);
      assert.equal(await confirmation.getByRole('button', { name: 'نعم', exact: true }).isEnabled(), true);
      await confirmation.getByRole('button', { name: 'لا', exact: true }).click();
      await confirmation.waitFor({ state: 'detached' });
      assert.deepEqual(attendanceDeletes, []);
      await page.getByRole('button', { name: 'إجراءات جلسة TEST' }).click();
      await deleteAction.click();
      await confirmation.getByRole('button', { name: 'نعم', exact: true }).click();
      await page.getByRole('button', { name: 'إجراءات جلسة TEST' }).waitFor({ state: 'detached' });
      assert.deepEqual(attendanceDeletes, [attendanceSession._id]);
      assert.deepEqual(attendanceRecords, []);
      assert.equal(attendanceRecordReads, 0);
    }
    await page.close();
  }
  attendanceSessionAvailable = true;
  attendanceRecords = [attendanceRecord];
  for (const [status, closeBeforeQr] of [['CLOSED', false], ['EXPIRED', false], ['OPEN', false], ['OPEN', true]]) {
    attendanceSessionStatus = status;
    attendanceClosesBeforeQr = closeBeforeQr;
    attendanceQrReads = 0;
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/ar/admin/attendance?role=admin`);
    await page.getByRole('button', { name: 'الرقابة وإدارة الحضور العامة' }).click();
    const course = page.getByRole('button', { name: /Synthetic course/ });
    await course.press('Enter');
    if (status === 'OPEN' && !closeBeforeQr) {
      await page.getByText('123456', { exact: true }).waitFor();
      await page.locator('svg[shape-rendering="crispEdges"]').waitFor();
      assert.equal(await page.getByRole('dialog', { name: 'سجل حضور الجلسة' }).count(), 0);
    } else {
      await page.getByRole('dialog', { name: 'سجل حضور الجلسة' }).getByText('Synthetic attendee').waitFor();
    }
    assert.equal(attendanceQrReads, status === 'OPEN' ? 1 : 0);
    await page.close();
  }
  console.log('Course-name actions verified for closed, expired, active and just-closed sessions.');
  console.log('Direct session deletion verified for admins and staff, including empty sessions, cancellation and permission checks.');
  console.log('Portal regressions passed in Arabic and English: delayed search echoes, continuous parent renders, clear/reset, dashboard ↔ quizzes shared cache, and mixed password flags with explicit bulk enable/disable.');
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
