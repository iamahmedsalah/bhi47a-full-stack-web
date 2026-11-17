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
await write('auth.ts', `export const useAuth=()=>({user:{_id:'synthetic',role:'student',name:'Synthetic',mustChangePassword:false}});`);
await write('image.tsx', `import React from 'react';export default function Image({fill,priority,unoptimized,...props}){return <img {...props}/>;}`);
await write('dynamic.tsx', `export default ()=>()=>null;`);
await write('link.tsx', `import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>;}`);
await write('attendance.ts', `export const attendanceApi={getMyAttendanceHistory:async()=>({summary:{totalSessions:0,presentCount:0,lateCount:0,attendanceRate:0}}),getStudentLiveSessions:async()=>({sessions:[]})};`);
await write('api.ts', `const request=async({url,params})=>{const response=await fetch('/fixture'+url+(params?'?'+new URLSearchParams(params):''));return response.json();};export const apiBaseUrl='';export const getApiErrorMessage=e=>e.message||'Error';export const getApiErrorDetails=e=>e;export default {request,get:(url,config)=>request({url,...config})};`);
await write('api-client.ts', `import api from './api';export const apiGet=async(url,config)=>(await api.get(url,config)).data;export const apiPost=async()=>({});export const apiPatch=apiPost;export const apiDelete=apiPost;`);
await write('entry.tsx', `
  import React from 'react';import {createRoot} from 'react-dom/client';import {NextIntlClientProvider} from 'next-intl';
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
  createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale={locale} messages={locale==='ar'?ar:en} timeZone="Africa/Cairo"><QueryClientProvider client={client}><MaterialUploadProvider locale={locale}><App/></MaterialUploadProvider></QueryClientProvider></NextIntlClientProvider>);
`);
await new Promise((resolve, reject) => webpack({
  mode: 'development', devtool: false, context: web,
  entry: path.join(output, 'entry.tsx'), output: { path: output, filename: 'app.js', publicPath: '/' },
  resolve: { extensions: ['.tsx', '.ts', '.js'], modules: [path.join(web, 'node_modules'), 'node_modules'], alias: {
    'next/navigation': path.join(output, 'navigation.ts'), 'next/image': path.join(output, 'image.tsx'), 'next/dynamic': path.join(output, 'dynamic.tsx'), 'next/link': path.join(output, 'link.tsx'),
    '@/lib/api': path.join(output, 'api.ts'), '@/lib/api-client': path.join(output, 'api-client.ts'), '@/providers/auth-provider': path.join(output, 'auth.ts'), '@/features/attendance/api/attendance-api': path.join(output, 'attendance.ts'), '@': path.join(web, 'src'),
  } },
  module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(output, 'loader.cjs') }] },
}, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve()));
const quiz = { _id:'quiz-fixture', title:'Portal fixture quiz', courseId:'course-fixture', courseCode:'TEST', courseName:'Synthetic course', durationMinutes:10, totalMarks:10, passingMarks:5, questionsCount:1, isOpen:true, isEnded:false, isSubmitted:false };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/fixture')) {
    const endpoint = url.pathname.slice('/fixture'.length);
    let data = {};
    if (endpoint === '/students/me/quizzes') data = [quiz];
    else if (endpoint === '/students/me/course-quizzes') data = [];
    else if (endpoint === '/students/me/profile') data = { studentCode:'TEST',fullName:'Synthetic',level:'1' };
    else if (endpoint === '/students/me/syllabi') data = { registeredCourses:[],availableLevelCourses:[] };
    else if (endpoint === '/admin/students-must-change-password-codes') data = {items:['20260001','20260002'],total:2,totalPages:1};
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
    const toggle=dialog.getByRole('switch');assert.equal(await toggle.getAttribute('aria-checked'),'false');
    const save=dialog.getByRole('button',{name:locale==='ar'?'حفظ للجميع':'Save for all students',exact:true});
    await save.click();assert.equal(await page.evaluate(()=>window.saved),false);
    await toggle.click();await save.click();assert.equal(await page.evaluate(()=>window.saved),true);
    assert.deepEqual(errors,[]);await page.close();
  }
  console.log('Portal regressions passed in Arabic and English: delayed search echoes, continuous parent renders, clear/reset, dashboard ↔ quizzes shared cache, and mixed password flags with explicit bulk enable/disable.');
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
