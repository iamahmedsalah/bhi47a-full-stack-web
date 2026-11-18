import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Real controls and styles with the production API envelope. Mongo transactions
// and academic effects are exercised separately by the Control integration suite.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const web = path.join(root, 'apps/web');
const output = path.join(root, 'outputs/control-release-browser');
const requireWeb = createRequire(path.join(web, 'package.json'));
const requireApi = createRequire(path.join(root, 'apps/api/package.json'));
const { webpack } = requireWeb('next/dist/compiled/webpack/webpack');
const { chromium } = requireApi('playwright');
const messages = Object.fromEntries(await Promise.all(['ar','en'].map(async locale=>[locale,JSON.parse(await fs.readFile(path.join(web,`src/messages/${locale}.json`),'utf8'))])));
await fs.mkdir(output,{recursive:true});
const write = (name, value) => fs.writeFile(path.join(output,name),value);
await write('loader.cjs',`const ts=require(${JSON.stringify(requireWeb.resolve('typescript'))});module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText};`);
await write('auth.ts',`export const useAuth=()=>{const role=new URLSearchParams(location.search).get('role');return {user:{_id:'fixture-admin',role:role?'staff':'admin',permissions:role==='visibility'?['grades.visibility.manage']:role==='editor'?['grades.write']:role==='publisher'?['grades.publish']:[]}}};`);
// Render the real panel outside Next while retaining observable navigation.
await write('navigation.ts',`window.__controlNavigations=[];const router={push:url=>window.__controlNavigations.push(url)};export const useSearchParams=()=>new URLSearchParams(location.search);export const useRouter=()=>router;export const useParams=()=>({locale:location.pathname.includes('/ar/')?'ar':'en'});`);
await write('api.ts',`const call=async(method,url,body)=>{const response=await fetch(url,{method,...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});const envelope=await response.json();if(!response.ok)throw new Error(envelope.message);return envelope;};export const getApiErrorMessage=e=>e.message;export default {get:u=>call('GET',u),post:(u,b)=>call('POST',u,b),patch:(u,b)=>call('PATCH',u,b)};`);
const local = relative => path.join(web,relative).replaceAll('\\','/');
await write('entry.tsx',`import React from 'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{NextIntlClientProvider}from'next-intl';import{Toaster}from'sonner';import{GradeFormDialog}from'${local('src/features/grades/components/grade-form-dialog.tsx')}';import{ControlReleasePanel}from'${local('src/features/grades/components/control-release-panel.tsx')}';import{GradesPublishingModal}from'${local('src/features/grades/components/grades-publishing-modal.tsx')}';import Results from '${local('src/app/[locale]/dashboard/results/page.tsx')}';import ar from'${local('src/messages/ar.json')}';import en from'${local('src/messages/en.json')}';const locale=location.pathname.includes('/ar/')?'ar':'en';const view=new URLSearchParams(location.search).get('view');document.documentElement.dir=locale==='ar'?'rtl':'ltr';const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale={locale} messages={locale==='ar'?ar:en} timeZone="Africa/Cairo"><QueryClientProvider client={client}><main className="max-w-6xl mx-auto p-6"><span data-testid="fixture-ready"/>{view==='form'?<GradeFormDialog open onOpenChange={()=>{}} isEditing courses={[]} onSubmit={async()=>{}} isSubmitting={false}/>:view==='visibility'?<GradesPublishingModal open onOpenChange={()=>{}} isAr={locale==='ar'}/>:view==='student'?<Results/>:<ControlReleasePanel locale={locale}/>}</main><Toaster/></QueryClientProvider></NextIntlClientProvider>);`);
await new Promise((resolve,reject)=>webpack({mode:'development',devtool:false,context:web,entry:path.join(output,'entry.tsx'),output:{path:output,filename:'app.js',publicPath:'/'},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:path.join(output,'loader.cjs')}]},resolve:{extensions:['.tsx','.ts','.js','.jsx'],modules:[path.join(web,'node_modules'),'node_modules'],alias:{'next/navigation':path.join(output,'navigation.ts'),'@/lib/api':path.join(output,'api.ts'),'@/providers/auth-provider':path.join(output,'auth.ts'),'@':path.join(web,'src')}}},(error,stats)=>error||stats.hasErrors()?reject(error||new Error(stats.toString({all:false,errors:true}))):resolve()));
const css=await requireWeb('postcss')([requireWeb('@tailwindcss/postcss')({base:web})]).process(await fs.readFile(path.join(web,'src/app/globals.css'),'utf8'),{from:path.join(web,'src/app/globals.css')});
await write('styles.css',css.css);
const courseId='100000000000000000000001';
const sheetId='200000000000000000000001';
let policy={version:0,rules:{passPercentage:50,finalMinimumPercentage:0,retake:'latest'}};
let activations=0, withdrawals=0, resets=0, resetConflict=true, active=false, stale=true;
let settings={gradesSystemOpen:false,gradesLevelBasis:'student',gradesOpenAt:'2026-11-13T08:00:00Z',gradesCloseAt:'2026-11-14T08:00:00Z',gradesPublishedLevels:['1'],gradesPublishedExamTypes:['final'],gradesVisibilityRules:[]};
const visibilityWrites=[];
let studentCloseAt;
let enabledStudentTypes;
let absentComponent='midterm';
let course111=false, course111Status='present', tuitionBlocked=false, resultMode='midterm';
let studentResponseOrder='immediate';
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if((url.pathname==='/students/me/results'&&studentResponseOrder==='profile-first')||(url.pathname==='/students/me/profile'&&studentResponseOrder==='results-first')) await new Promise(resolve=>setTimeout(resolve,200));
    const send=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(status===200?{success:true,data,timestamp:new Date().toISOString()}:data));};
    if(url.pathname==='/students/me/results-window')return send({visibleExamTypes:enabledStudentTypes,isOpen:!tuitionBlocked&&Date.now()<Date.parse(studentCloseAt),visibilityVersion:tuitionBlocked?'tuition-blocked':'tuition-clear',closeAt:studentCloseAt,reason:Date.now()>=Date.parse(studentCloseAt)?'ended':tuitionBlocked?'tuition_blocked':undefined,studentLevel:course111?'3':'1',isLevelPublished:!course111});
    if(url.pathname==='/students/me/results' && tuitionBlocked)return send([]);
    if(url.pathname==='/students/me/profile')return send({level:course111?'3':'1',gpa:0,academicWarnings:2});
    if(url.pathname==='/students/me/results' && course111 && resultMode!=='midterm'){
      const common={courseCode:'111',courseName:'Synthetic course 111',courseNameEn:'Synthetic course 111',academicYear:'2026-2027',semester:'first',academicLevel:'1',isPublished:true};
      const final={...common,_id:'final-111',examType:'final',grade:course111Status==='present'?48:0,maxGrade:60,status:course111Status,officialResult:{official:course111Status!=='incomplete',total:course111Status==='present'?80:32,totalMax:100,passed:course111Status==='present',percentage:course111Status==='present'?80:32,gradePoints:course111Status==='present'?3.3:0,letterGrade:course111Status==='banned'?'FX':course111Status==='incomplete'?'IC':course111Status==='present'?'B+':'F'}};
      return send(resultMode==='both'?[{...common,_id:'midterm-111',examType:'midterm',grade:15,maxGrade:20,status:'present'},final]:[final]);
    }
    if(url.pathname==='/students/me/results' && course111)return send([{_id:'course111-midterm',courseCode:'111',courseName:'Synthetic course 111',courseNameAr:'مقرر تجريبي 111',courseNameEn:'Synthetic course 111',examType:'midterm',grade:course111Status==='present'?5:0,maxGrade:20,status:course111Status,academicYear:'2026-2027',semester:'first',academicLevel:'1',isPublished:true}]);
    if(url.pathname==='/students/me/results')return send(Date.now()>=Date.parse(studentCloseAt)?[]:[{_id:'synthetic-midterm',courseCode:'SYNTH101',courseName:'Synthetic course',courseNameEn:'Synthetic course',courseNameAr:'Synthetic course',examType:'midterm',grade:absentComponent==='midterm'?0:15,maxGrade:20,status:absentComponent==='midterm'?'absent':'present',academicYear:'2026-2027',semester:'first',academicLevel:'1',isPublished:true},{_id:'synthetic-final',courseCode:'SYNTH101',courseName:'Synthetic course',examType:'final',grade:absentComponent==='final'?0:55,maxGrade:60,status:absentComponent==='final'?'absent':'present',academicYear:'2026-2027',semester:'first',academicLevel:'1',isPublished:true}]);
    if(url.pathname==='/admin/control/courses')return send({items:[{courseId,code:'SYNTH101',name:'Synthetic course',nameAr:'SYNTH101',nameEn:'Synthetic course',rosterCount:1,components:['coursework','midterm','final'].map(key=>({key,sheetId,slug:`synth101-${key}`,workflowState:'APPROVED',releaseActive:active&&key==='final',entered:1,published:active?1:0}))}]});
    if(url.pathname.startsWith('/admin/grades/')){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
      if(url.pathname.endsWith('/control-course/reset')){assert.equal(body.courseCode,'SYNTH101');assert.equal(body.confirmation,'SYNTH101');assert.equal(body.academicYear,'2026-2027');assert.equal(body.semester,'first');assert.equal(body.reason,'Synthetic cleanup');if(resetConflict){resetConflict=false;return send({code:'CONTROL_RESET_BUSY',message:'Reset processing is busy. Retry shortly.'},409);}resets++;active=false;return send({cleared:3});}
      if(url.pathname.endsWith('/settings')){if(req.method==='PATCH'){visibilityWrites.push(body);settings={...settings,...body};}return send(settings);}
      if(url.pathname.includes('/control-policy/')){if(req.method==='PATCH'){policy={version:policy.version+1,rules:{passPercentage:body.passPercentage,finalMinimumPercentage:body.finalMinimumPercentage,retake:body.retake}};}return send(policy);}
      if(url.pathname.endsWith('/release-preview'))return send({sheets:[{sheetId,courseCode:'SYNTH101',component:body.examType,students:1,activeReleaseId:active?'release-1':null}],releaseDigests:{[sheetId]:stale?'old-digest':'new-digest'}});
      if(url.pathname.endsWith('/publish')){
        if(body.isPublished&&stale){stale=false;return send({message:'Release preview changed; preview again'},409);}
        if(body.isPublished){assert.equal(body.releaseDigests[sheetId],'new-digest');activations++;active=true;}else{withdrawals++;active=false;}
        return send({count:1});
      }
      if(url.pathname.includes('/control-release-history/'))return send({releases:active?[{_id:'release-1',createdAt:'2026-11-06T12:00:00Z',digest:'new-digest'}]:[],activeReleaseId:active?'release-1':null,pendingJobs:0});
    }
    if(url.pathname.endsWith('.js')||url.pathname.endsWith('.css')){res.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript':'text/css');return res.end(await fs.readFile(path.join(output,path.basename(url.pathname))));}
    res.setHeader('Content-Type','text/html');res.end('<!doctype html><html class="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"><body><div id="root"></div><script src="/app.js"></script></body></html>');
  }catch(error){res.writeHead(500);res.end(JSON.stringify({message:error.message}));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
let browser,page;
const errors=[];
try{
  browser=await chromium.launch({headless:true});
  page=await browser.newPage({viewport:{width:1440,height:950}});
  page.on('pageerror',e=>{errors.push(e.message);console.error('Control release browser runtime error:',e.message);});
  const select=async(label,value)=>{await page.getByRole('button',{name:label,exact:true}).click();await page.getByRole('option',{name:value,exact:true}).click();};
  const en=messages.en.controlRelease;
  await page.goto(`${base}/en/admin/grades?releaseCourse=${courseId}&releaseComponent=midterm&releaseYear=2026-2027&releaseSemester=first`);
  await page.getByRole('button',{name:en.component,exact:true}).filter({hasText:en.midterm}).waitFor();
  await page.getByText('Midterm', {exact:false}).first().waitFor();
  await page.goto(`${base}/en/admin/grades`);
  await select(en.course,'SYNTH101 — Synthetic course');await select(en.component,en.final);
  await page.getByRole('button',{name:en.openSheet,exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>window.__controlNavigations),['/en/admin/control/synth101-final']);
  assert.equal(await page.getByRole('button',{name:en.activate,exact:true}).isEnabled(),false);
  await page.getByRole('button',{name:en.policy,exact:true}).click();
  await page.getByLabel(en.pass,{exact:true}).fill('55');
  await page.getByRole('button',{name:en.savePolicy,exact:true}).click();
  await page.getByText(en.saved,{exact:true}).waitFor();assert.equal(policy.rules.passPercentage,55);
  await page.getByRole('button',{name:en.preview,exact:true}).click();
  await page.getByRole('button',{name:en.activate,exact:true}).click();
  await page.getByText('Release preview changed; preview again',{exact:true}).waitFor();
  await page.getByRole('button',{name:en.preview,exact:true}).click();
  await page.getByRole('button',{name:en.activate,exact:true}).click();
  await page.getByText(en.activated,{exact:true}).waitFor();assert.equal(activations,1);
  await page.getByRole('button',{name:en.history,exact:true}).click();await page.getByText(en.active,{exact:true}).waitFor();
  await page.locator('main > section').screenshot({path:path.join(output,'english-release.png')});
  await page.getByRole('button',{name:en.withdraw,exact:true}).click();assert.equal(withdrawals,0);await page.getByRole('button',{name:en.confirmWithdraw,exact:true}).click();await page.getByText(en.withdrawn,{exact:true}).waitFor();assert.equal(withdrawals,1);
  const ar=messages.ar.controlRelease;
  await page.goto(`${base}/ar/admin/grades`);await select(ar.course,'SYNTH101 — SYNTH101');
  await page.getByRole('button',{name:ar.openSheet,exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>window.__controlNavigations),['/ar/admin/control/synth101-final']);
  await page.getByRole('button',{name:ar.preview,exact:true}).click();await page.getByRole('status').getByText(ar.windowNote,{exact:true}).waitFor();
  assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
  const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,section:document.querySelector('section').getBoundingClientRect().toJSON(),main:document.querySelector('main').getBoundingClientRect().toJSON()}));
  await fs.writeFile(path.join(output,'geometry.json'),JSON.stringify(geometry));
  await page.locator('main > section').screenshot({path:path.join(output,'arabic-release.png')});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'arabic-mobile.png'),fullPage:true});
  for(const locale of ['en','ar']){
    const ar=locale==='ar';
    const text=(en,arabic)=>ar?arabic:en;
    settings={gradesSystemOpen:false,gradesLevelBasis:'student',gradesOpenAt:'2026-11-13T08:00:00Z',gradesCloseAt:'2026-11-14T08:00:00Z',gradesPublishedLevels:['1'],gradesPublishedExamTypes:['final'],gradesVisibilityRules:[]};
    await page.setViewportSize({width:1440,height:1100});
    await page.goto(`${base}/${locale}/admin/grades?view=visibility`);
    const dialog=page.getByRole('dialog');
    await dialog.getByText(text('Master switch is off: all results are hidden','المفتاح العام مغلق: جميع النتائج محجوبة'),{exact:true}).waitFor();
    await dialog.getByRole('button',{name:text('Coursework and instructor quizzes','أعمال السنة والكويزات'),exact:true}).click();
    await dialog.getByText(text('Choose midterm or final visibility. Coursework is always hidden from students and counts toward the official total. Instructors control quiz visibility.','اختر إظهار الميدترم أو النهائي. أعمال السنة مخفية عن الطالب دائمًا وتُحتسب في المجموع الرسمي. إتاحة الكويزات من اختصاص دكتور المقرر.'),{exact:true}).waitFor();
    assert.ok(await dialog.evaluate(node=>node.getBoundingClientRect().width<=768),'desktop visibility modal should be at most 768px wide');
    assert.equal(await dialog.getByRole('button',{name:new RegExp(ar?'^(الاختبارات القصيرة|العملي|الشفوي|أعمال السنة) —':'^(Quizzes|Practical|Oral|Coursework) —')}).count(),0);
    await dialog.getByRole('button',{name:text('Open results viewing','فتح عرض النتائج'),exact:true}).click();
    await dialog.getByRole('button',{name:text('Hide all results','حجب كل النتائج'),exact:true}).waitFor();
    assert.equal(settings.gradesSystemOpen,true);
    await dialog.getByRole('button',{name:text('Level visibility basis','أساس إتاحة المستوى'),exact:true}).click();
    await page.getByRole('option',{name:text('By course level','حسب مستوى المقرر'),exact:true}).click();
    await dialog.getByRole('button',{name:text('Level visibility example','مثال على إتاحة المستويات'),exact:true}).click();
    await dialog.getByText(text('Example: Level 1 course 111 can appear for an enrolled Level 3 student when Level 1 is allowed.','مثال: المقرر 111 من المستوى الأول يظهر لأي طالب مسجّل به عند إتاحة المستوى الأول، حتى لو مستواه الحالي الثالث.'),{exact:true}).waitFor();
    assert.equal(settings.gradesLevelBasis,'course');
    await dialog.getByRole('button',{name:text('Midterm — Hidden','الميدترم — محجوب'),exact:true}).click();
    await dialog.getByRole('button',{name:text('Midterm — Visible','الميدترم — متاح'),exact:true}).waitFor();
    assert.ok(settings.gradesPublishedExamTypes.includes('midterm'));
    await dialog.getByRole('button',{name:text('Midterm — Visible','الميدترم — متاح'),exact:true}).click();
    await dialog.getByRole('button',{name:text('Midterm — Hidden','الميدترم — محجوب'),exact:true}).waitFor();
    await dialog.getByRole('textbox',{name:text('Course code','كود المقرر'),exact:true}).fill('synth101');
    await dialog.getByRole('textbox',{name:text('Student code','كود الطالب'),exact:true}).fill('260001');
    await dialog.getByRole('button',{name:text('Show matching results','إظهار المطابق'),exact:true}).click();
    await dialog.getByRole('button',{name:text('Remove override 1','حذف الاستثناء 1'),exact:true}).waitFor();
    assert.deepEqual(settings.gradesVisibilityRules,[{courseCode:'SYNTH101',studentCode:'260001',examType:'midterm',isVisible:true}]);
    await dialog.getByRole('button',{name:text('Clear schedule','إلغاء المواعيد'),exact:true}).click();
    await page.waitForFunction(()=>[...document.querySelectorAll('[role=dialog]')].length>0);
    await dialog.getByText(text('Viewing window is open; levels, components and overrides below apply','نافذة العرض مفتوحة؛ تطبّق المستويات والمكوّنات والاستثناءات أدناه'),{exact:true}).waitFor();
    assert.equal(settings.gradesOpenAt,null);assert.equal(settings.gradesCloseAt,null);
    assert.equal(activations,1,'visibility settings must not approve or activate Control drafts');
    await dialog.evaluate(node=>{node.scrollTop=0;});
    await dialog.screenshot({path:path.join(output,`visibility-${locale}-desktop.png`)});
    await page.setViewportSize({width:390,height:844});
    assert.ok(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth+2),'visibility controls must fit mobile width');
    await dialog.screenshot({path:path.join(output,`visibility-${locale}-mobile.png`)});
  }
  await page.goto(`${base}/en/admin/grades?view=visibility&role=editor`);
  await page.getByTestId('fixture-ready').waitFor({state:'attached'});
  assert.equal(await page.getByRole('dialog').count(),0,'grade editing alone must not grant visibility management');
  await page.goto(`${base}/en/admin/grades?view=visibility&role=visibility`);
  await page.getByRole('dialog').waitFor();
  assert.equal(await page.getByRole('button',{name:en.activate,exact:true}).count(),0,'visibility permission must not grant publication');
  studentCloseAt=new Date(Date.now()+8000).toISOString();
  await page.setViewportSize({width:1440,height:1100});
  await page.goto(`${base}/en/dashboard/results?view=student`);
  await page.getByText('SYNTH101',{exact:true}).first().waitFor();
  const studentRow=page.getByRole('row').filter({hasText:'SYNTH101'});
  await studentRow.getByText('Absent',{exact:true}).first().waitFor();
  await studentRow.getByText('55 / 60',{exact:true}).waitFor();
  await page.getByText('Results Inquiry Window Closed',{exact:true}).waitFor();
  assert.equal(await page.getByText('SYNTH101',{exact:true}).count(),0,'an already-open student page must hide cached results at the closing deadline');
  absentComponent='final';studentCloseAt=new Date(Date.now()+8000).toISOString();
  await page.goto(`${base}/en/dashboard/results?view=student`);
  await page.getByRole('row').filter({hasText:'SYNTH101'}).getByText('15 / 20',{exact:true}).waitFor();
  await page.getByRole('row').filter({hasText:'SYNTH101'}).getByText('Absent',{exact:true}).first().waitFor();
  course111=true;studentCloseAt=new Date(Date.now()+60000).toISOString();
  for(const locale of ['ar','en']){
    for(const status of ['present','absent','banned']){
      course111Status=status;
      await page.goto(`${base}/${locale}/dashboard/results?view=student`);
      const row=page.getByRole('row').filter({hasText:'111'});
      await row.first().waitFor();
      if(status==='present')await row.getByText('5 / 20',{exact:true}).waitFor();
      else await row.getByText(messages[locale].control.states[status],{exact:true}).first().waitFor();
      assert.equal(await page.getByText(locale==='ar'?'عرض النتائج غير متاح لمستواك الحالي':'Results hidden for your current level',{exact:true}).count(),0);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.evaluate(()=>Promise.all(document.getAnimations().filter(animation=>animation.effect?.getTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{}))));
      await page.screenshot({path:path.join(output,`course111-${locale}-${status}.png`),fullPage:true});
    }
  }
  for(const locale of ['ar','en']){
    tuitionBlocked=true;studentCloseAt=new Date(Date.now()+120000).toISOString();
    await page.goto(`${base}/${locale}/dashboard/results?view=student`);
    await page.getByText(locale==='en'?'Results withheld due to unpaid tuition fees':'النتيجة محجوبة بسبب عدم سداد المصروفات الدراسية',{exact:true}).waitFor();
    assert.equal(await page.getByRole('row').filter({hasText:'111'}).count(),0);
    tuitionBlocked=false;
    await page.goto(`${base}/${locale}/dashboard/results?view=student`);
    await page.getByRole('row').filter({hasText:'111'}).first().waitFor();
  }
  tuitionBlocked=false;course111=true;studentCloseAt=new Date(Date.now()+120000).toISOString();
  for(const locale of ['en','ar']){
    for(const mode of ['midterm','final','both']){
      resultMode=mode;enabledStudentTypes=mode==='both'?['midterm','final']:[mode];course111Status='present';
      await page.goto(`${base}/${locale}/dashboard/results?view=student`);
      await page.getByRole('row').filter({hasText:'111'}).first().waitFor();
      const headers=await page.getByRole('columnheader').allTextContents();
      if(mode==='midterm'){const row=page.getByRole('row').filter({hasText:'111'});assert.equal(await row.getByText(/^(A\+?|B\+?|C\+?|D\+?|F|FX|IC)$/).count(),0,'midterm must not display a letter grade');}
      assert.equal(headers.some(value=>/Coursework|أعمال السنة/.test(value)),false);
      assert.equal(headers.some(value=>/Midterm Exam/.test(value)),locale==='en'&&mode!=='final');
      assert.equal(headers.some(value=>/Final Exam/.test(value)),locale==='en'&&mode!=='midterm');
      if(mode!=='midterm')await page.getByRole('row').filter({hasText:'111'}).getByText('80.0%' ,{exact:true}).waitFor();
      const academicWarnings=page.getByText(locale==='en'?'Academic warnings':'عدد الإنذارات الأكاديمية',{exact:true});
      if(mode==='midterm')assert.equal(await academicWarnings.count(),0,'midterm-only results must not display official academic summary cards');
      else await academicWarnings.waitFor();
      assert.equal(await page.getByText('Level Performance',{exact:true}).count(),0);
      await page.evaluate(()=>Promise.all(document.getAnimations().filter(animation=>animation.effect?.getTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{}))));
      await page.screenshot({path:path.join(output,`student-${locale}-${mode}.png`),fullPage:true});
    }
    resultMode='both';
    for(const status of ['absent','banned','incomplete']){
      studentResponseOrder='profile-first';
      course111Status=status;
      await page.goto(`${base}/${locale}/dashboard/results?view=student`);
      const row=page.getByRole('row').filter({hasText:'111'});
      await row.getByText('15 / 20',{exact:true}).waitFor();
      await row.getByText(messages[locale].control.states[status],{exact:true}).first().waitFor();
      if(status!=='incomplete')await row.getByText('32.0%' ,{exact:true}).waitFor();
      if(status==='banned')await row.getByText('FX',{exact:true}).waitFor();
      if(status==='incomplete')await row.getByText('IC',{exact:true}).waitFor();
      const academicWarnings=page.getByText(locale==='en'?'Academic warnings':'عدد الإنذارات الأكاديمية',{exact:true});
      if(status==='incomplete')assert.equal(await academicWarnings.count(),0,'an incomplete result must not display official academic summary cards');
      else await academicWarnings.waitFor();
    }
    studentResponseOrder='results-first';course111Status='present';
    await page.goto(`${base}/${locale}/dashboard/results?view=student`);
    await page.getByRole('row').filter({hasText:'111'}).getByText('15 / 20',{exact:true}).waitFor();
    studentResponseOrder='immediate';
  }
  resultMode='midterm';enabledStudentTypes=['midterm','final'];course111Status='present';
  await page.goto(base+'/en/dashboard/results?view=student');
  await page.getByRole('row').filter({hasText:'111'}).getByText('5 / 20',{exact:true}).waitFor();
  await page.getByRole('columnheader').filter({hasText:'Final Exam'}).waitFor();
  await page.getByRole('note').filter({hasText:'The final column is enabled'}).waitFor();
  assert.equal(await page.getByRole('row').filter({hasText:'111'}).getByText('48 / 60',{exact:true}).count(),0);
  for(const locale of ['ar','en']){
    await page.goto(base+'/'+locale+'/admin/grades?view=form');
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button',{name:messages[locale].grades.form.status,exact:true}).click();
    for(const status of ['present','absent','banned','excused','withheld','incomplete']){
      await page.getByRole('option',{name:messages[locale].grades.form.statusValues[status],exact:true}).waitFor();
    }
    assert.equal(await page.getByText(/grades\.form\.statusValues/).count(),0);
    await page.screenshot({path:path.join(output,'grade-edit-'+locale+'.png'),fullPage:true});
  }
  await page.goto(base+'/en/admin/grades?role=publisher');
  await select(en.course,'SYNTH101 — Synthetic course');
  assert.equal(await page.getByRole('button',{name:'Reset Control for course SYNTH101',exact:true}).count(),0);
  await page.goto(base+'/en/admin/grades');
  await select(en.course,'SYNTH101 — Synthetic course');
  await page.getByRole('button',{name:'Reset Control for course SYNTH101',exact:true}).click();
  const resetDialog=page.getByRole('dialog');
  assert.equal(await resetDialog.getByRole('button',{name:'Confirm reset',exact:true}).isEnabled(),false);
  await resetDialog.getByLabel('Type the course code to confirm').fill('SYNTH101');
  await resetDialog.getByLabel('Reset reason').fill('Synthetic cleanup');
  await resetDialog.getByRole('button',{name:'Confirm reset',exact:true}).click();
  await resetDialog.getByRole('alert').getByText('Reset processing is busy. Retry shortly.',{exact:true}).waitFor();assert.equal(resets,0);
  await resetDialog.getByRole('button',{name:'Confirm reset',exact:true}).click();
  await resetDialog.waitFor({state:'hidden'});assert.equal(resets,1);
  assert.deepEqual(errors,[]);
  console.log('Control release browser acceptance passed: real API envelopes, scoped course selection, policy editing, stale preview recovery, activation, withdrawal, history, Arabic/English desktop/mobile.');
}catch(error){if(page){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});await write('failure-dom.html',await page.content());}await write('runtime-errors.json',JSON.stringify(errors));if(errors.length)throw new AggregateError([error],`Control release runtime errors: ${errors.join('; ')}`);throw error;}
finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
