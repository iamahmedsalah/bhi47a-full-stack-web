import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Real React workbook, project controls, translations and CSS. Transport is a
// synthetic fixture; the separate Mongo integration suite checks persistence.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const web = path.join(root, 'apps/web'), output = path.join(root, 'outputs/control-browser');
const requireWeb = createRequire(path.join(web, 'package.json'));
const requireApi = createRequire(path.join(root, 'apps/api/package.json'));
const { webpack } = requireWeb('next/dist/compiled/webpack/webpack');
const { chromium } = requireApi('playwright');
await fs.mkdir(output, { recursive: true });
const write = (name, source) => fs.writeFile(path.join(output, name), source);
await write('loader.cjs', `const ts=require(${JSON.stringify(requireWeb.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,esModuleInterop:true}}).outputText;`);
await write('navigation.ts', `import {useSyncExternalStore} from 'react';const subscribe=fn=>{window.addEventListener('popstate',fn);return()=>window.removeEventListener('popstate',fn);};const nativeReplace=history.replaceState.bind(history);history.replaceState=(...args)=>{nativeReplace(...args);window.dispatchEvent(new PopStateEvent('popstate'));};const router={push:url=>{location.href=url;},replace:url=>{window.__serverNavigations=(window.__serverNavigations||0)+1;history.replaceState(null,'',url);window.dispatchEvent(new PopStateEvent('popstate'));}};export const useRouter=()=>router;export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(useSyncExternalStore(subscribe,()=>location.search));`);
await write('api.ts', `const call=async(method,url,body,config)=>{const target=new URL(url,location.origin);for(const [k,v] of Object.entries(config?.params??{}))target.searchParams.set(k,String(v));const r=await fetch(target,{method,...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});if(!r.ok){const error=await r.json();throw Object.assign(new Error(error.message),error);}return config?.responseType==='blob'?r.blob():{success:true,data:await r.json(),timestamp:new Date().toISOString()};};export const getApiErrorDetails=e=>({code:e.code,message:e.message});export const getApiErrorMessage=e=>e.message;export default {get:(u,c)=>call('GET',u,null,c),post:(u,b)=>call('POST',u,b),patch:(u,b)=>call('PATCH',u,b),put:(u,b)=>call('PUT',u,b)};`);
await write('entry.tsx', `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {NextIntlClientProvider} from 'next-intl';import {QueryClient,QueryClientProvider,useQuery} from '@tanstack/react-query';import {Toaster} from 'sonner';import {ControlWorkbookGrid} from '${path.join(web, 'src/features/control/components/control-workbook-grid.tsx').replaceAll('\\','/')}';import ar from '${path.join(web,'src/messages/ar.json').replaceAll('\\','/')}';import en from '${path.join(web,'src/messages/en.json').replaceAll('\\','/')}';const locale=location.pathname.split('/')[1];const id=location.pathname.split('/').at(-1);const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});function App(){const [search,setSearch]=useState('');const [show,setShow]=useState(true);const {data}=useQuery({queryKey:['control','sheet',id],queryFn:()=>fetch('/admin/control/sheets/'+id).then(r=>r.json())});return data?<main className="p-6"><h1 className="text-2xl mb-5">{locale==='ar'?'دفتر درجات الكنترول':'Control grade workbook'}</h1><button onClick={()=>setShow(!show)}>Toggle fixture editor</button>{show&&<ControlWorkbookGrid principalId="fixture-user" sheetDetails={data} locale={locale} search={search} onSearchChange={setSearch} onOpenScheme={()=>{}} onOpenSheetAudit={()=>{}} onOpenRowAudit={()=>{}} onLockToggleRequest={()=>{}}/>}</main>:null}document.documentElement.dir=locale==='ar'?'rtl':'ltr';createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale={locale} messages={locale==='ar'?ar:en} timeZone="Africa/Cairo"><QueryClientProvider client={client}><App/><Toaster/></QueryClientProvider></NextIntlClientProvider>);`);
await new Promise((resolve, reject) => webpack({ mode: 'development', devtool: false, context: web,
  entry: path.join(output, 'entry.tsx'), output: { path: output, filename: 'app.js', publicPath: '/' },
  module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(output, 'loader.cjs') }] },
  resolve: { extensions: ['.tsx','.ts','.jsx','.js'], modules: [path.join(web,'node_modules'),'node_modules'], alias: { 'next/navigation': path.join(output,'navigation.ts'), '@/lib/api': path.join(output,'api.ts'), '@': path.join(web,'src') } },
}, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString({all:false,errors:true}))) : resolve()));
const css = await requireWeb('postcss')([requireWeb('@tailwindcss/postcss')({base:web})]).process(await fs.readFile(path.join(web,'src/app/globals.css'),'utf8'),{from:path.join(web,'src/app/globals.css')});
await write('styles.css',css.css);
const ids = { midterm: '100000000000000000000001', coursework: '100000000000000000000002', final: '100000000000000000000003' };
const components = Object.entries(ids).map(([key])=>({key,nameAr:{midterm:'الميدتيرم',coursework:'أعمال السنة',final:'النهائي'}[key],nameEn:key,max:key==='final'?60:20,step:0.5,enabled:true}));
const downloadRequests=[];
let denySave = false, writes = 0, schemeVersion = 1, reviewEditor = false, graceAllowed = false, graceReceipt = null;
const states = Object.fromEntries(Object.keys(ids).map(k=>[k,{revision:0,workflowState:'DRAFT'}]));
const rows = Array.from({length:3001},(_,i)=>({studentId:(i+1).toString(16).padStart(24,'0'), studentCode:String(260001+i), name:`Synthetic Student ${i+1}`,nameAr:`طالب تجريبي ${i+1}`,notRegistered:false,components:{},result:{total:null,totalMax:100,complete:false}}));
const detail = key => ({sheet:{id:ids[key],academicYear:'2026-2027',semester:'first',component:key,locked:false,grace:key==='midterm'?graceReceipt:null,...states[key]},course:{id:'300000000000000000000001',code:'CS101',name:'Synthetic course'},rules:components.find(c=>c.key===key),capabilities:{canGrace:graceAllowed,canEdit:states[key].workflowState==='DRAFT'||(states[key].workflowState==='IN_REVIEW'&&reviewEditor),canEditReview:reviewEditor,canApprove:true,canSubmit:true,canReview:true,canImport:true,canExport:true,canManageSchemes:true,canViewAudit:true,canManageStates:true,canLock:true,canUnlock:true}});
rows[0].tuition={isBlocked:true,status:'unpaid'};
rows[1].tuition={isBlocked:false,status:'paid'};
for(const [index,midterm,final] of [[200,19,31],[201,18,30]]) {
  for(const [component,score] of Object.entries({midterm,final}))
    rows[index].components[component]={studentId:rows[index].studentId,score,status:'present',rev:1,isPublished:false};
}
let workbookReads=0;
let checkpointEnabled=false;
const checkpoints=new Map();
const server = http.createServer(async (req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.startsWith('/admin/control/')) {
      if(url.pathname.endsWith('/template')||url.pathname.endsWith('/report')){downloadRequests.push({path:url.pathname,...Object.fromEntries(url.searchParams)});res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');return res.end(Buffer.from('synthetic workbook; real XLSX tested at API'));}
      res.setHeader('Content-Type','application/json');
      const key=Object.keys(ids).find(k=>url.pathname.includes(ids[k])) || 'midterm';
      if(url.pathname.endsWith('/workbook')) {workbookReads++;return res.end(JSON.stringify({revision:states[key].revision,componentStates:Object.fromEntries(Object.entries(states).map(([k,v])=>[k,v.workflowState])),scheme:{version:schemeVersion,components,courseworkAttendanceMax:5,courseworkQuizzesMax:15},rows}));}
      if(url.pathname.endsWith('/checkpoint') && req.method==='GET') return res.end(JSON.stringify(checkpoints.get(key) ?? null));
      if(req.method==='GET') return res.end(JSON.stringify(detail(key)));
      const chunks=[];for await(const chunk of req) chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks).toString());
      if(url.pathname.endsWith('/checkpoint') && req.method==='PUT') {
        const {expectedActorId,...checkpoint}=body;
        assert.equal(expectedActorId,'fixture-user');
        if(checkpointEnabled) checkpoints.set(key,checkpoint);
        return res.end(JSON.stringify({saved:true}));
      }
      if(url.pathname.endsWith('/grace/preview')) {assert.equal(graceAllowed,true);assert.equal(key,'midterm');assert.equal(body.amount,5);return res.end(JSON.stringify({digest:'a'.repeat(64),revision:states[key].revision,amount:5,max:20,counts:{registered:3001,changed:3,capped:1,atMaximum:1,absentOrBanned:2,held:0,unentered:0,other:2995},sample:[{studentCode:rows[0].studentCode,before:0,added:5,after:5},{studentCode:rows[1].studentCode,before:1,added:5,after:6},{studentCode:rows[2].studentCode,before:18,added:2,after:20}]}));}
      if(url.pathname.endsWith('/grace')) {assert.equal(graceAllowed,true);assert.equal(key,'midterm');assert.equal(body.digest,'a'.repeat(64));assert.equal(body.expectedRevision,states[key].revision);assert.ok(body.operationId);graceReceipt={amount:5,changed:3,capped:1,appliedAt:new Date().toISOString()};[5,6,20].forEach((score,i)=>rows[i].components.midterm={...rows[i].components.midterm,score,rev:rows[i].components.midterm.rev+1});states[key].revision++;return res.end(JSON.stringify(graceReceipt));}
      if(url.pathname.endsWith('/entries')) {
        if(body.expectedSchemeVersion!==schemeVersion){res.statusCode=409;return res.end(JSON.stringify({code:'SCHEME_CHANGED',message:'Synthetic scheme changed'}));}
        if(denySave){res.statusCode=503;return res.end(JSON.stringify({message:'Synthetic save failure'}));}
        writes++;
        const results=body.changes.map(change=>{const row=rows.find(r=>r.studentId===change.studentId);const entry={studentId:row.studentId,score:change.score,status:change.status||'present',rev:(row.components[key]?.rev||0)+1,isPublished:false,attendanceMark:change.attendanceMark,quizzesMark:change.quizzesMark};row.components[key]=entry;return {studentId:row.studentId,opId:change.opId,result:'ok',entry};});
        states[key].revision++;return res.end(JSON.stringify({results,summary:{ok:results.length,invalid:0,conflict:0,forbidden:0}}));
      }
      if(url.pathname.endsWith('/review')) {assert.equal(body.reason,undefined,'workflow does not send a reason');assert.equal(body.allowMissing,true,'blank entries require explicit confirmation');assert.equal(body.expectedRevision,states[key].revision,'workflow must use the current sheet revision after autosave');states[key].revision++;states[key].workflowState=body.action==='SUBMIT'?'IN_REVIEW':body.action==='SUBMIT_APPROVAL'?'PENDING_APPROVAL':body.action==='APPROVE'?'APPROVED':'DRAFT';return res.end(JSON.stringify(detail(key)));}
      if(url.pathname==='/admin/control/sheets') return res.end(JSON.stringify(detail(body.component)));
    }
    if(/\.(js|css)$/.test(url.pathname)) {res.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript':'text/css');return res.end(await fs.readFile(path.join(output,path.basename(url.pathname))));}
    res.setHeader('Content-Type','text/html');res.end('<!doctype html><html class="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"><body><div id="root"></div><script src="/app.js"></script></body></html>');
  } catch(error){res.statusCode=500;res.end(JSON.stringify({message:error.message}));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
let browser,page;
try {
  browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1500,height:950}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let finishWorkbookLoad;
  const workbookGate = new Promise(resolve => { finishWorkbookLoad = resolve; });
  await page.route('**/workbook', async route => {
    await workbookGate;
    await route.continue();
  }, { times: 1 });
  await page.goto(`${base}/en/admin/control/${ids.midterm}`);
  await page.getByRole('status').getByText('Loading grade workbook…', {exact:true}).waitFor({state:'visible'});
  finishWorkbookLoad();
  const mark=page.getByRole('textbox',{name:'260001 Midterm',exact:true});await mark.waitFor();
  const midtermRate=page.getByRole('group',{name:'Midterm pass rate',exact:true});
  const finalRate=page.getByRole('group',{name:'Final pass rate',exact:true});
  assert.equal(await finalRate.count(),0,'only the selected midterm rate is displayed');
  assert.doesNotMatch(await midtermRate.innerText(),/greater than|of 3001/,'pass-rate cards show the percentage without the calculation');
  await midtermRate.getByText('0.03%',{exact:true}).waitFor();
  const rateGeometry=await midtermRate.evaluate(element=>({left:element.getBoundingClientRect().left,parentLeft:element.parentElement.getBoundingClientRect().left,width:element.getBoundingClientRect().width}));
  assert.ok(Math.abs(rateGeometry.left-rateGeometry.parentLeft)<=1 && rateGeometry.width<350,'rate is compact and aligned to the physical left');
  const heldRow=page.locator('tbody tr').filter({hasText:'260001'});
  await heldRow.getByText('Blocked',{exact:true}).waitFor();
  assert.equal(await mark.isDisabled(),true,'financial hold locks grade inputs');
  assert.equal(await heldRow.getByRole('button',{name:'260001 Component status',exact:true}).isDisabled(),true,'financial hold locks exam status');
  assert.equal(await heldRow.getAttribute('data-tuition-blocked'),'true');
  assert.equal(await page.locator('tbody tr').filter({hasText:'260002'}).getAttribute('data-tuition-blocked'),null);
  assert.ok(await heldRow.locator('td').evaluateAll(cells=>cells.every(cell=>getComputedStyle(cell).backgroundColor!=='rgba(0, 0, 0, 0)')));
  rows[0].tuition={isBlocked:false,status:'paid'};
  rows[1].tuition={isBlocked:true,status:'unpaid'};
  await page.reload();await mark.waitFor();
  assert.equal(await mark.isEnabled(),true,'lifting financial hold restores entry');
  await mark.press('Enter');
  assert.equal(await page.getByRole('textbox',{name:'260003 Midterm',exact:true}).evaluate(el=>document.activeElement===el),true,'Enter skips a tuition-held row');
  await page.getByRole('textbox',{name:'260003 Midterm',exact:true}).press('ArrowUp');
  assert.equal(await mark.evaluate(el=>document.activeElement===el),true,'ArrowUp skips a tuition-held row');
  rows[1].tuition={isBlocked:false,status:'paid'};
  await page.reload();await mark.waitFor();
  assert.equal(await page.getByRole('button',{name:'Export missing marks',exact:true}).count(),0);
  await page.getByRole('button',{name:'Templates',exact:true}).click();
  const templates=page.getByRole('dialog');
  await templates.getByRole('button',{name:'Entry component',exact:true}).click();
  await page.getByRole('option',{name:'final',exact:true}).click();
  const templateDownload=page.waitForEvent('download');await templates.getByRole('button',{name:'Download Excel',exact:true}).click();assert.equal((await templateDownload).suggestedFilename(),'control-CS101-final-workbook.xlsx');
  assert.equal(downloadRequests.at(-1).component,'final');assert.equal(downloadRequests.at(-1).mode,'workbook');
  await templates.getByRole('button',{name:'Download Excel',exact:true,disabled:false}).waitFor();
  await templates.getByRole('progressbar',{name:'Download complete',exact:true}).waitFor();
  assert.equal(await templates.getByRole('progressbar',{name:'Download complete',exact:true}).getAttribute('aria-valuenow'),'100');
  await page.keyboard.press('Escape');
  await templates.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Control reports',exact:true}).click();
  const reports=page.getByRole('dialog');
  const courseReportDownload=page.waitForEvent('download');await reports.getByRole('button',{name:'Download Excel',exact:true}).click();assert.equal((await courseReportDownload).suggestedFilename(),'control-CS101-course-2026-2027-first.xlsx');
  await reports.getByRole('button',{name:'Download Excel',exact:true,disabled:false}).waitFor();
  await reports.getByRole('button',{name:'Report type',exact:true}).click();
  await page.getByRole('option',{name:'Consolidated report (Round table)',exact:true}).click();
  await reports.getByRole('button',{name:'Level',exact:true}).click();await page.getByRole('option',{name:'Level 2',exact:true}).click();
  const reportDownload=page.waitForEvent('download');await reports.getByRole('button',{name:'Download Excel',exact:true}).click();assert.equal((await reportDownload).suggestedFilename(),'control-round-table-2026-2027-first-2.xlsx');
  assert.equal(downloadRequests.at(-1).type,'round-table');assert.equal(downloadRequests.at(-1).level,'2');assert.equal(downloadRequests.at(-1).semester,'first');
  await reports.getByRole('button',{name:'Download Excel',exact:true,disabled:false}).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('columnheader').count(),11);
  const optionalReason=page.getByRole('textbox',{name:'Reason (optional for exam statuses and excuses)',exact:true});
  assert.equal(await optionalReason.inputValue(),'');
  await page.getByRole('button',{name:'260001 Component status',exact:true}).click();
  const midtermStatusMenu=page.getByRole('listbox');
  const bannedMidterm=midtermStatusMenu.getByRole('option',{name:'Banned',exact:true});
  // Radix mounts its portaled options after the trigger click; count() does not wait.
  await bannedMidterm.waitFor({state:'visible'});
  assert.equal(await bannedMidterm.count(),1);
  assert.equal(await midtermStatusMenu.getByRole('option',{name:'Incomplete',exact:true}).count(),0);
  await bannedMidterm.click();
  await page.getByRole('status').getByText(/All changes saved/).waitFor();
  assert.equal(rows[0].components.midterm.status,'banned');
  assert.equal(rows[0].components.midterm.score,null);
  assert.equal(await optionalReason.inputValue(),'');
  await page.getByRole('button',{name:'260001 Component status',exact:true}).click();
  await page.getByRole('option',{name:'Absent',exact:true}).click();
  await page.getByRole('status').getByText(/All changes saved/).waitFor();
  assert.equal(rows[0].components.midterm.status,'absent');
  await page.goto(`${base}/en/admin/control/${ids.final}`);
  await page.getByRole('textbox',{name:'260001 Final',exact:true}).waitFor();
  assert.equal(await midtermRate.count(),0,'midterm rate is hidden on the final tab');
  await finalRate.getByText('0.03%',{exact:true}).waitFor();
  for(const state of ['Banned','Incomplete','Excused']) {
    await page.getByRole('button',{name:'260001 Component status',exact:true}).click();
    await page.getByRole('option',{name:state,exact:true}).click();
    await page.getByRole('status').getByText(/All changes saved/).waitFor();
    assert.equal(await optionalReason.inputValue(),'');
    assert.equal(rows[0].components.final.status,{Banned:'banned',Incomplete:'incomplete',Excused:'excused'}[state]);
    assert.equal(rows[0].components.final.score,null);
  }
  await page.goto(`${base}/en/admin/control/${ids.midterm}`);
  await mark.waitFor();
  assert.equal(await page.locator('tbody tr').count(),100);
  await page.getByRole('table').evaluate(table=>table.parentElement.scrollTop=table.parentElement.scrollHeight);
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await page.getByRole('textbox',{name:'260101 Midterm',exact:true}).waitFor();
  await midtermRate.getByText('0.03%',{exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('table').parentElement.scrollTop===0);
  await page.getByRole('table').evaluate(table=>table.parentElement.scrollTop=table.parentElement.scrollHeight);
  await page.getByRole('button',{name:'Previous',exact:true}).click();
  await mark.waitFor();
  await page.waitForFunction(()=>document.querySelector('table').parentElement.scrollTop===0);
  const readsBeforeSave=workbookReads;await mark.fill('17.5');await page.getByRole('status').getByText(/All changes saved/).waitFor();assert.equal(rows[0].components.midterm.score,17.5);await page.waitForLoadState('networkidle');assert.equal(workbookReads,readsBeforeSave,'autosave must patch acknowledged rows instead of downloading the whole roster');
  await mark.fill('19');await page.getByRole('status').getByText(/All changes saved/).waitFor();
  await midtermRate.getByText('0.07%',{exact:true}).waitFor();
  await mark.fill('18');await page.getByRole('status').getByText(/All changes saved/).waitFor();
  await midtermRate.getByText('0.03%',{exact:true}).waitFor();
  assert.equal(workbookReads,readsBeforeSave,'pass rates update from acknowledged saves without refetching the workbook');
  await mark.press('Enter');assert.equal(await page.getByRole('textbox',{name:'260002 Midterm',exact:true}).evaluate(el=>document.activeElement===el),true);
  denySave=true;await mark.fill('16');await page.getByText('Synthetic save failure').waitFor();assert.equal(await mark.inputValue(),'16');await page.getByRole('button',{name:'Toggle fixture editor',exact:true}).click();await page.getByRole('button',{name:'Toggle fixture editor',exact:true}).click();await page.getByText('Your unsaved draft was restored. Review the current marks and scheme, then retry saving.',{exact:true}).waitFor();assert.equal(await mark.inputValue(),'16');denySave=false;
  await page.getByRole('button',{name:'Retry save',exact:true}).click();await page.getByRole('status').getByText(/All changes saved/).waitFor();assert.equal(rows[0].components.midterm.score,16);
  schemeVersion=2;await mark.fill('15');await page.getByRole('button',{name:'Refresh scheme; keep my draft',exact:true}).waitFor();assert.equal(await mark.inputValue(),'15');
  await page.getByRole('button',{name:'Refresh scheme; keep my draft',exact:true}).click();await page.getByRole('button',{name:'Retry save',exact:true}).click();await page.getByRole('status').getByText(/All changes saved/).waitFor();assert.equal(rows[0].components.midterm.score,15);
  await page.getByRole('button',{name:'Coursework',exact:true}).click();await page.waitForURL(`**/${ids.coursework}`);
  assert.equal(await midtermRate.count()+await finalRate.count(),0,'exam pass rates are hidden on coursework');
  await page.getByRole('textbox',{name:'260001 Attendance contribution',exact:true}).fill('4');await page.getByRole('textbox',{name:'260001 Quiz contribution',exact:true}).fill('13');
  await page.getByRole('status').getByText(/All changes saved/).waitFor();assert.equal(rows[0].components.coursework.score,17);assert.equal(rows[0].components.coursework.attendanceMark,4);
  await page.getByRole('button',{name:'Toggle fixture editor',exact:true}).evaluate(el=>{el.style.display='none';});
  await page.screenshot({path:path.join(output,'english-workbook.png'),fullPage:true});
  rows[0].tuition={isBlocked:true,status:'unpaid'};
  await page.goto(`${base}/ar/admin/control/${ids.midterm}`);await page.getByRole('textbox',{name:'260001 الميدتيرم',exact:true}).waitFor();
  assert.equal(await page.locator('html').getAttribute('dir'),'rtl');await page.getByText('محجوب',{exact:true}).waitFor();await page.getByRole('button',{name:'Toggle fixture editor',exact:true}).evaluate(el=>{el.style.display='none';});await page.screenshot({path:path.join(output,'arabic-workbook.png'),fullPage:true});
  const messages=JSON.parse(await fs.readFile(path.join(web,'src/messages/ar.json'),'utf8')).control;
  const arabicRate=page.getByRole('group',{name:'نسبة نجاح '+messages.midterm,exact:true});
  await arabicRate.waitFor();
  const rtlGeometry=await arabicRate.evaluate(element=>({left:element.getBoundingClientRect().left,parentLeft:element.parentElement.getBoundingClientRect().left}));
  assert.ok(Math.abs(rtlGeometry.left-rtlGeometry.parentLeft)<=1,'Arabic indicator is also at the physical left');
  await page.getByRole('button',{name:messages.SUBMIT,exact:true}).click();
  const arabicReview=page.getByRole('dialog');
  await arabicReview.getByText('مراجعة الكشف قبل المتابعة',{exact:true}).waitFor();
  await arabicReview.getByText(messages.reviewExplanation,{exact:true}).waitFor();
  assert.doesNotMatch(await arabicReview.innerText(),/\?{2,}|\uFFFD/,'Arabic review text must not contain corrupted characters');
  await page.screenshot({path:path.join(output,'arabic-review-dialog.png'),fullPage:true});
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'نماذج',exact:true}).click();
  await page.getByRole('heading',{name:'نماذج الرصد',exact:true}).waitFor();
  await page.screenshot({path:path.join(output,'arabic-templates.png'),fullPage:true});
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'تقرير الكنترول',exact:true}).click();
  await page.getByRole('heading',{name:'تقرير الكنترول',exact:true}).waitFor();
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(output,'arabic-reports-mobile.png'),fullPage:true});
  const reportAction=await page.getByRole('dialog').getByRole('button',{name:'تنزيل Excel',exact:true}).boundingBox();
  assert.ok(reportAction && reportAction.y+reportAction.height<=844,'report download stays accessible on mobile');
  await page.keyboard.press('Escape');await page.setViewportSize({width:1500,height:950});
  await page.getByRole('textbox',{name:messages.search,exact:true}).fill('263001');
  await page.getByRole('textbox',{name:'263001 '+messages.midterm,exact:true}).waitFor();
  assert.equal(await page.locator('tbody tr').count(),1);
  await page.getByRole('group',{name:'نسبة نجاح '+messages.midterm,exact:true}).locator('bdi').waitFor();
  await page.getByRole('textbox',{name:messages.search,exact:true}).fill('');
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'arabic-mobile.png'),fullPage:true});
  for(const row of rows)if(!row.components.midterm)row.components.midterm={studentId:row.studentId,score:10,status:'present',rev:1,isPublished:false};
  rows[1].tuition={isBlocked:true,status:'unpaid'};
  rows[0].tuition={isBlocked:false,status:'paid'};
  delete rows[1].components.midterm;
  delete rows[2].components.midterm;
  await page.goto(`${base}/en/admin/control/${ids.midterm}`);
  const freshMark=page.getByRole('textbox',{name:'260001 Midterm',exact:true});
  await freshMark.fill('14.5');await page.getByRole('status').getByText(/All changes saved/).waitFor();
  await page.getByRole('button',{name:'Submit for review',exact:true}).click();
  const workflowDialog=page.getByRole('dialog');
  assert.doesNotMatch(await workflowDialog.innerText(),/\?{2,}|\uFFFD/,'English review text must not contain corrupted characters');
  await workflowDialog.getByText('There are 2 students without marks.',{exact:false}).waitFor();
  assert.equal(await workflowDialog.getByRole('textbox').count(),0,'workflow does not ask for reasons');
  assert.equal(await workflowDialog.getByRole('button',{name:'Confirm',exact:true}).isEnabled(),true,'explicit confirmation permits blank entries without a reason');
  const reviewResponse=page.waitForResponse(response=>response.url().endsWith('/review')&&response.request().method()==='POST');
  await workflowDialog.getByRole('button',{name:'Confirm',exact:true}).click();
  assert.equal((await reviewResponse).status(),200);
  await page.waitForLoadState('networkidle');
  assert.equal(states.midterm.workflowState,'IN_REVIEW');
  assert.equal(await freshMark.getAttribute('readonly'),'');
  assert.equal(await page.getByRole('button',{name:'Approve sheet',exact:true}).count(),0);
  reviewEditor=true;
  await page.reload();
  const controlMark=page.getByRole('textbox',{name:'260001 Midterm',exact:true});
  await controlMark.waitFor();
  await controlMark.fill('16');
  await page.getByRole('status').getByText(/All changes saved/).waitFor();
  assert.equal(rows[0].components.midterm.score,16);
  await page.getByRole('button',{name:'Send for approval',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Confirm',exact:true}).click();
  await page.getByRole('status').getByText(/Awaiting approval/).waitFor();
  assert.equal(states.midterm.workflowState,'PENDING_APPROVAL');
  assert.equal(await controlMark.getAttribute('readonly'),'');
  await page.getByRole('button',{name:'Approve sheet',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Confirm',exact:true}).click();
  await page.getByRole('status').getByText(/Approved/).waitFor();
  assert.equal(states.midterm.workflowState,'APPROVED');
  assert.equal(await page.evaluate(()=>window.__serverNavigations||0),0,'client grid filters must not trigger server navigations');assert.deepEqual(errors,[]);assert.ok(writes>=3);
  assert.equal(await page.getByRole('button',{name:'Grace marks',exact:true}).count(),0,'permission required to display grace action');
  graceAllowed=true;states.midterm.workflowState='IN_REVIEW';
  [0,1,18].forEach((score,i)=>{rows[i].tuition={isBlocked:false,status:'paid'};rows[i].components.midterm={studentId:rows[i].studentId,score,status:'present',rev:1,isPublished:false};});
  await page.goto(`${base}/en/admin/control/${ids.final}`);
  await page.getByRole('textbox',{name:'260001 Final',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Grace marks',exact:true}).count(),0,'grace never appears on finals');
  await page.goto(`${base}/en/admin/control/${ids.midterm}`);
  await page.getByRole('button',{name:'Grace marks',exact:true}).click();
  const grace=page.getByRole('dialog');
  await grace.getByRole('spinbutton',{name:'Grace marks',exact:true}).fill('5');
  await grace.getByRole('button',{name:'Preview grace marks',exact:true}).click();
  await grace.getByText('Capped at maximum',{exact:true}).waitFor();
  assert.equal(await grace.getByRole('row').count(),4);
  await grace.getByRole('button',{name:'Confirm once-only grace marks',exact:true}).click();
  await grace.getByText('Grace marks applied and recorded in the audit log.',{exact:true}).waitFor();
  await grace.getByRole('button',{name:'Close grace marks',exact:true}).click();
  await page.getByRole('button',{name:'Grace marks applied',exact:true,disabled:true}).waitFor();
  checkpointEnabled=true;
  states.midterm.workflowState='DRAFT';
  const sheetUrl=`${base}/en/admin/control/${ids.midterm}`;
  await page.goto(sheetUrl);
  await page.getByRole('button',{name:'Next',exact:true}).click();
  const checkpointResponse=page.waitForResponse(response=>response.url().endsWith('/checkpoint')&&response.request().method()==='PUT'&&response.ok());
  await page.getByRole('textbox',{name:'260150 Midterm',exact:true}).focus();
  await checkpointResponse;
  assert.equal(checkpoints.get('midterm').studentId,rows[149].studentId);
  // Change the row's position while retaining the same student identity.
  rows[149].studentCode='999999';
  await page.close();
  page=await browser.newPage({viewport:{width:1500,height:950}});
  await page.goto(sheetUrl);
  await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='999999 Midterm');
  assert.equal(new URL(page.url()).searchParams.get('page'),'31');
  const resetResponse=page.waitForResponse(response=>response.url().endsWith('/checkpoint')&&response.request().method()==='PUT'&&response.ok());
  const gradeWritesBeforeReset=writes;
  await page.getByRole('button',{name:'Start from first page',exact:true}).click();
  await resetResponse;
  assert.equal(checkpoints.get('midterm').studentId,null);
  assert.equal(writes,gradeWritesBeforeReset);
  await page.goto(sheetUrl);
  await page.getByRole('textbox',{name:'260001 Midterm',exact:true}).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('page'),null);
  console.log('Control browser acceptance passed: 3001-student paginated/searchable bilingual real grid, all grade columns, autosave/retry, keyboard navigation, coursework 5/15, desktop/mobile screenshots. API persistence is covered separately.');
} catch(error) { if(page) await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});throw error; }
finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
