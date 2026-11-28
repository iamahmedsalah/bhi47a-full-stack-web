// Real student enrollment dialog, controls and CSS; synthetic local transport only.
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
const output = path.join(root, 'outputs/student-course-enrollment');
await fs.mkdir(output, { recursive: true });
const local = (p) => path.join(web, p).replaceAll('\\','/');
await fs.writeFile(path.join(output, 'auth.ts'), `export const useAuth=()=>({user:{_id:'synthetic-staff',role:'staff'}});`);
await fs.writeFile(path.join(output,'loader.cjs'),`const ts=require(${JSON.stringify(requireWeb.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,esModuleInterop:true}}).outputText;`);
await fs.writeFile(path.join(output,'api.ts'),`async function call(method,url,body,config){const params=new URLSearchParams(config?.params??{});const response=await fetch(url+(params.size?'?'+params:''),{method,signal:config?.signal,...(body?{body:JSON.stringify(body),headers:{'content-type':'application/json'}}:{})});const data=await response.json();if(!response.ok)throw new Error(data.message);return {data};}export const getApiErrorMessage=e=>e.message;export default {get:(u,c)=>call('GET',u,null,c),post:(u,b)=>call('POST',u,b)};`);
await fs.writeFile(path.join(output,'entry.tsx'),`import React from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {NextIntlClientProvider} from 'next-intl';import {Toaster} from 'sonner';import ar from '${local('src/messages/ar.json')}';import en from '${local('src/messages/en.json')}';import {StudentCourseEnrollmentDialog} from '${local('src/features/courses/components/student-course-enrollment-dialog')}';const locale=location.pathname.startsWith('/ar')?'ar':'en';document.documentElement.dir=locale==='ar'?'rtl':'ltr';createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale={locale} messages={locale==='ar'?ar:en} timeZone="Africa/Cairo"><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><StudentCourseEnrollmentDialog principalId="synthetic-staff" locale={locale} onClose={()=>{}}/><Toaster/></QueryClientProvider></NextIntlClientProvider>);`);
await new Promise((resolve,reject)=>webpack({mode:'development',devtool:false,context:web,entry:path.join(output,'entry.tsx'),output:{path:output,filename:'app.js'},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:path.join(output,'loader.cjs')}]},resolve:{extensions:['.tsx','.ts','.jsx','.js'],modules:[path.join(web,'node_modules'),'node_modules'],alias:{'@/lib/api':path.join(output,'api.ts'),'@/providers/auth-provider':path.join(output,'auth.ts'),'@':path.join(web,'src')}}},(error,stats)=>error||stats.hasErrors()?reject(error||new Error(stats.toString({all:false,errors:true}))):resolve()));
const css=await requireWeb('postcss')([requireWeb('@tailwindcss/postcss')({base:web})]).process(await fs.readFile(path.join(web,'src/app/globals.css'),'utf8'),{from:path.join(web,'src/app/globals.css')});
await fs.writeFile(path.join(output,'styles.css'),css.css);
const students = [
  {userId:'100000000000000000000001',studentCode:'00111',fullName:'Synthetic Student',fullNameAr:'طالب تجريبي',level:'1',department:'BIS',academicYear:'2026-2027',semester:'first'},
  {userId:'100000000000000000000002',studentCode:'00222',fullName:'Second Student',fullNameAr:'طالب آخر',level:'2',department:'BIS',academicYear:'2026-2027',semester:'first'},
];
const catalog = [
  {_id:'200000000000000000000001',code:'111',name:'First Course',nameAr:'المادة الأولى',level:'1',creditHours:3},
  {_id:'200000000000000000000002',code:'222',name:'Second Course',nameAr:'المادة الثانية',level:'1',creditHours:3},
];
let revision=1, failNext=false, writes=[];
const memberships=new Map();
function reset(){revision=1;failNext=false;writes=[];memberships.clear();memberships.set(`${students[0].userId}:2026-2027:first`,new Set(['111']));}
const key=(id,term)=>`${id}:${term.academicYear}:${term.semester}`;
const version=()=>revision.toString(16).padStart(64,'0');
const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/admin/academic-years/options'){res.setHeader('content-type','application/json');return res.end(JSON.stringify({items:['2026-2027','2025-2026'],currentYear:'2026-2027',currentSemester:'first'}));}
  if(url.pathname.startsWith('/admin/course-student-enrollments')){
    res.setHeader('content-type','application/json');
    if(url.pathname.endsWith('/students')){const search=url.searchParams.get('search');return res.end(JSON.stringify({items:students.filter(s=>(s.studentCode+' '+s.fullName+' '+s.fullNameAr).includes(search)),hasMore:false}));}
    const id=url.pathname.split('/')[3];const student=students.find(s=>s.userId===id);assert.ok(student);
    if(req.method==='POST'){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks));
      assert.equal(body.expectedVersion,version());assert.equal(body.academicYear,'2026-2027');assert.equal(body.semester,'first');
      if(failNext){failNext=false;revision++;res.statusCode=409;return res.end(JSON.stringify({message:'Registration changed; refresh and retry'}));}
      const course=catalog.find(c=>c._id===body.courseId);assert.ok(course);const set=memberships.get(key(id,body))??new Set();
      const action=url.pathname.endsWith('/withdraw')?'withdraw':'add';if(action==='add')set.add(course.code);else set.delete(course.code);
      memberships.set(key(id,body),set);revision++;writes.push({id,action,...body});return res.end(JSON.stringify(action==='add'?{enrolled:1}:{withdrawn:true}));
    }
    const term=Object.fromEntries(url.searchParams);const set=memberships.get(key(id,term))??new Set();
    if(url.pathname.endsWith('/courses'))return res.end(JSON.stringify({items:catalog.filter(c=>!set.has(c.code)&&(c.code+c.name+c.nameAr).includes(term.search??'')),hasMore:false}));
    return res.end(JSON.stringify({student,version:version(),status:'approved',totalCreditHours:set.size*3,courses:catalog.filter(c=>set.has(c.code))}));
  }
  if(url.pathname.endsWith('.js')||url.pathname.endsWith('.css')){res.setHeader('content-type',url.pathname.endsWith('.js')?'text/javascript':'text/css');return res.end(await fs.readFile(path.join(output,path.basename(url.pathname))));}
  res.setHeader('content-type','text/html');res.end('<!doctype html><html class="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"><body><div id="root"></div><script src="/app.js"></script></body></html>');
}catch(error){res.statusCode=500;res.end(JSON.stringify({message:error.message}));}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
  browser=await chromium.launch({headless:true});
  for(const locale of ['en','ar']){
    reset();const ar=locale==='ar';const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${base}/${locale}`);await page.getByRole('textbox',{name:ar?'بحث الطالب بالكود أو الاسم':'Search student code or name'}).fill('00111');
    await page.getByRole('button').filter({hasText:'00111'}).click();
    const registered=page.getByRole('region',{name:ar?'المواد المسجلة':'Registered courses',exact:true});
    await registered.getByText(ar?'المادة الأولى':'First Course',{exact:true}).waitFor();
    await page.getByRole('textbox',{name:ar?'بحث المادة بالكود أو الاسم':'Search course code or name'}).fill('222');
    const adding=page.getByRole('region',{name:ar?'إضافة مادة':'Add a course',exact:true});
    await adding.getByRole('button',{name:ar?'إضافة':'Add',exact:true}).click();
    await page.getByRole('alertdialog').getByRole('button',{name:ar?'إلغاء':'Cancel',exact:true}).click();assert.equal(writes.length,0,'cancel must not mutate registration');
    await adding.getByRole('button',{name:ar?'إضافة':'Add',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:ar?'تأكيد':'Confirm',exact:true}).click();
    await registered.getByText(ar?'المادة الثانية':'Second Course',{exact:true}).waitFor();assert.equal(writes.length,1);assert.equal(writes[0].action,'add');
    failNext=true;await registered.getByRole('button',{name:(ar?'إجراءات المادة ':'Course actions ')+'222',exact:true}).click();await page.getByRole('menuitem',{name:ar?'سحب المادة':'Withdraw course',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:ar?'تأكيد':'Confirm',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'Registration changed; refresh and retry'}).waitFor();assert.equal(writes.length,1,'stale rejection must preserve the course');
    await registered.getByRole('button',{name:(ar?'إجراءات المادة ':'Course actions ')+'222',exact:true}).click();await page.getByRole('menuitem',{name:ar?'سحب المادة':'Withdraw course',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:ar?'تأكيد':'Confirm',exact:true}).click();
    await registered.getByText(ar?'المادة الثانية':'Second Course',{exact:true}).waitFor({state:'hidden'});assert.equal(writes.length,2);assert.equal(writes[1].action,'withdraw');
    await page.getByRole('button',{name:ar?'الترم':'Semester',exact:true}).click();await page.getByRole('option',{name:ar?'الثاني':'Second',exact:true}).click();await registered.getByText(ar?'لا توجد مواد مسجلة في هذا الترم.':'No courses registered for this term.',{exact:true}).waitFor();assert.equal(writes.length,2,'term switch is read-only');
    await page.getByRole('button',{name:ar?'الترم':'Semester',exact:true}).click();await page.getByRole('option',{name:ar?'الأول':'First',exact:true}).click();await registered.getByText(ar?'المادة الأولى':'First Course',{exact:true}).waitFor();
    await page.setViewportSize({width:390,height:844});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.getByRole('dialog').evaluate(element=>Promise.all(element.getAnimations().map(animation=>animation.finished.catch(()=>{}))));const geometry=await page.getByRole('dialog').evaluate(element=>{const rect=element.getBoundingClientRect();return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,viewport:innerWidth,scrollWidth:element.scrollWidth};});await fs.writeFile(path.join(output,locale+'-geometry.json'),JSON.stringify(geometry));assert.ok(geometry.x>=0 && geometry.x+geometry.width<=391 && geometry.y>=0 && geometry.y+geometry.height<=845,JSON.stringify(geometry));await page.screenshot({path:path.join(output,`${locale}-mobile.png`),fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile modal must not overflow horizontally');
    await page.getByRole('button',{name:ar?'تغيير الطالب':'Change student',exact:true}).click();await page.getByRole('textbox',{name:ar?'بحث الطالب بالكود أو الاسم':'Search student code or name'}).fill('00222');await page.getByRole('button').filter({hasText:'00222'}).click();await registered.getByText(ar?'لا توجد مواد مسجلة في هذا الترم.':'No courses registered for this term.',{exact:true}).waitFor();assert.deepEqual(errors,[]);await page.close();
  }
  console.log('PASS: bilingual individual enrollment search, add/cancel/withdraw, stale retry, term/student isolation and mobile layout. API permissions and persistence are tested separately.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
