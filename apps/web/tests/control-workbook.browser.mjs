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
await write('api.ts', `const call=async(method,url,body,config)=>{const r=await fetch(url,{method,...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});if(!r.ok){const error=await r.json();throw Object.assign(new Error(error.message),error);}return config?.responseType==='blob'?r.blob():{success:true,data:await r.json(),timestamp:new Date().toISOString()};};export const getApiErrorDetails=e=>({code:e.code,message:e.message});export const getApiErrorMessage=e=>e.message;export default {get:(u,c)=>call('GET',u,null,c),post:(u,b)=>call('POST',u,b),patch:(u,b)=>call('PATCH',u,b)};`);
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
let denySave = false, writes = 0, schemeVersion = 1;
const states = Object.fromEntries(Object.keys(ids).map(k=>[k,{revision:0,workflowState:'DRAFT'}]));
const rows = Array.from({length:3001},(_,i)=>({studentId:(i+1).toString(16).padStart(24,'0'), studentCode:String(260001+i), name:`Synthetic Student ${i+1}`,nameAr:`طالب تجريبي ${i+1}`,notRegistered:false,components:{},result:{total:null,totalMax:100,complete:false}}));
const detail = key => ({sheet:{id:ids[key],academicYear:'2026-2027',semester:'first',component:key,locked:false,...states[key]},course:{id:'300000000000000000000001',code:'CS101',name:'Synthetic course'},rules:components.find(c=>c.key===key),capabilities:{canEdit:states[key].workflowState==='DRAFT',canSubmit:true,canReview:true,canImport:true,canExport:true,canManageSchemes:true,canViewAudit:true,canLock:true,canUnlock:true}});
let workbookReads=0;
const server = http.createServer(async (req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.startsWith('/admin/control/')) {
      res.setHeader('Content-Type','application/json');
      const key=Object.keys(ids).find(k=>url.pathname.includes(ids[k])) || 'midterm';
      if(url.pathname.endsWith('/workbook')) {workbookReads++;return res.end(JSON.stringify({revision:states[key].revision,componentStates:Object.fromEntries(Object.entries(states).map(([k,v])=>[k,v.workflowState])),scheme:{version:schemeVersion,components,courseworkAttendanceMax:5,courseworkQuizzesMax:15},rows}));}
      if(req.method==='GET') return res.end(JSON.stringify(detail(key)));
      const chunks=[];for await(const chunk of req) chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks).toString());
      if(url.pathname.endsWith('/entries')) {
        if(body.expectedSchemeVersion!==schemeVersion){res.statusCode=409;return res.end(JSON.stringify({code:'SCHEME_CHANGED',message:'Synthetic scheme changed'}));}
        if(denySave){res.statusCode=503;return res.end(JSON.stringify({message:'Synthetic save failure'}));}
        writes++;
        const results=body.changes.map(change=>{const row=rows.find(r=>r.studentId===change.studentId);const entry={studentId:row.studentId,score:change.score,status:change.status||'present',rev:(row.components[key]?.rev||0)+1,isPublished:false,attendanceMark:change.attendanceMark,quizzesMark:change.quizzesMark};row.components[key]=entry;return {studentId:row.studentId,opId:change.opId,result:'ok',entry};});
        states[key].revision++;return res.end(JSON.stringify({results,summary:{ok:results.length,invalid:0,conflict:0,forbidden:0}}));
      }
      if(url.pathname.endsWith('/review')) {assert.equal(body.expectedRevision,states[key].revision,'workflow must use the current sheet revision after autosave');states[key].revision++;states[key].workflowState=body.action==='SUBMIT'?'IN_REVIEW':body.action==='APPROVE'?'APPROVED':'DRAFT';return res.end(JSON.stringify(detail(key)));}
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
  await page.goto(`${base}/en/admin/control/${ids.midterm}`);
  const mark=page.getByRole('textbox',{name:'260001 Midterm',exact:true});await mark.waitFor();
  assert.equal(await page.getByRole('columnheader').count(),11);
  assert.equal(await page.locator('tbody tr').count(),100);
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await page.getByRole('textbox',{name:'260101 Midterm',exact:true}).waitFor();
  await page.getByRole('button',{name:'Previous',exact:true}).click();
  await mark.waitFor();
  const readsBeforeSave=workbookReads;await mark.fill('17.5');await page.getByRole('status').getByText(/All changes saved/).waitFor();assert.equal(rows[0].components.midterm.score,17.5);await page.waitForLoadState('networkidle');assert.equal(workbookReads,readsBeforeSave,'autosave must patch acknowledged rows instead of downloading the whole roster');
  await mark.press('Enter');assert.equal(await page.getByRole('textbox',{name:'260002 Midterm',exact:true}).evaluate(el=>document.activeElement===el),true);
  denySave=true;await mark.fill('16');await page.getByText('Synthetic save failure').waitFor();assert.equal(await mark.inputValue(),'16');await page.getByRole('button',{name:'Toggle fixture editor',exact:true}).click();await page.getByRole('button',{name:'Toggle fixture editor',exact:true}).click();await page.getByText('Your unsaved draft was restored. Review the current marks and scheme, then retry saving.',{exact:true}).waitFor();assert.equal(await mark.inputValue(),'16');denySave=false;
  await page.getByRole('button',{name:'Retry save',exact:true}).click();await page.getByRole('status').getByText(/All changes saved/).waitFor();assert.equal(rows[0].components.midterm.score,16);
  schemeVersion=2;await mark.fill('15');await page.getByRole('button',{name:'Refresh scheme; keep my draft',exact:true}).waitFor();assert.equal(await mark.inputValue(),'15');
  await page.getByRole('button',{name:'Refresh scheme; keep my draft',exact:true}).click();await page.getByRole('button',{name:'Retry save',exact:true}).click();await page.getByRole('status').getByText(/All changes saved/).waitFor();assert.equal(rows[0].components.midterm.score,15);
  await page.getByRole('button',{name:'Coursework',exact:true}).click();await page.waitForURL(`**/${ids.coursework}`);
  await page.getByRole('textbox',{name:'260001 Attendance contribution',exact:true}).fill('4');await page.getByRole('textbox',{name:'260001 Quiz contribution',exact:true}).fill('13');
  await page.getByRole('status').getByText(/All changes saved/).waitFor();assert.equal(rows[0].components.coursework.score,17);assert.equal(rows[0].components.coursework.attendanceMark,4);
  await page.getByRole('button',{name:'Toggle fixture editor',exact:true}).evaluate(el=>{el.style.display='none';});
  await page.screenshot({path:path.join(output,'english-workbook.png'),fullPage:true});
  await page.goto(`${base}/ar/admin/control/${ids.midterm}`);await page.getByRole('textbox',{name:'260001 الميدتيرم',exact:true}).waitFor();
  assert.equal(await page.locator('html').getAttribute('dir'),'rtl');await page.getByRole('button',{name:'Toggle fixture editor',exact:true}).evaluate(el=>{el.style.display='none';});await page.screenshot({path:path.join(output,'arabic-workbook.png'),fullPage:true});
  const messages=JSON.parse(await fs.readFile(path.join(web,'src/messages/ar.json'),'utf8')).control;
  await page.getByRole('textbox',{name:messages.search,exact:true}).fill('263001');
  await page.getByRole('textbox',{name:'263001 '+messages.midterm,exact:true}).waitFor();
  assert.equal(await page.locator('tbody tr').count(),1);
  await page.getByRole('textbox',{name:messages.search,exact:true}).fill('');
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'arabic-mobile.png'),fullPage:true});
  for(const row of rows)if(!row.components.midterm)row.components.midterm={studentId:row.studentId,score:10,status:'present',rev:1,isPublished:false};
  await page.goto(`${base}/en/admin/control/${ids.midterm}`);
  const freshMark=page.getByRole('textbox',{name:'260001 Midterm',exact:true});
  await freshMark.fill('14.5');await page.getByRole('status').getByText(/All changes saved/).waitFor();
  await page.getByRole('button',{name:'Submit for review',exact:true}).click();
  const workflowDialog=page.getByRole('dialog');
  await workflowDialog.getByRole('textbox').fill('Synthetic autosave and review acceptance');
  const reviewResponse=page.waitForResponse(response=>response.url().endsWith('/review')&&response.request().method()==='POST');
  await workflowDialog.getByRole('button',{name:'Confirm',exact:true}).click();
  assert.equal((await reviewResponse).status(),200);
  await page.waitForLoadState('networkidle');
  assert.equal(states.midterm.workflowState,'IN_REVIEW');
  assert.equal(await page.evaluate(()=>window.__serverNavigations||0),0,'client grid filters must not trigger server navigations');assert.deepEqual(errors,[]);assert.ok(writes>=3);
  console.log('Control browser acceptance passed: 3001-student paginated/searchable bilingual real grid, all grade columns, autosave/retry, keyboard navigation, coursework 5/15, desktop/mobile screenshots. API persistence is covered separately.');
} catch(error) { if(page) await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});throw error; }
finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
