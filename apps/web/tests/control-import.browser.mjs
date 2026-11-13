/** Real Control dialogs/CSS with synthetic transport; real XLSX parsing has API tests. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const web = path.join(root, 'apps/web');
const requireWeb = createRequire(path.join(web, 'package.json'));
const requireApi = createRequire(path.join(root, 'apps/api/package.json'));
const { webpack } = requireWeb('next/dist/compiled/webpack/webpack');
const { chromium } = requireApi('playwright');
const output = path.join(root, 'outputs/control-import-browser');
await fs.mkdir(output, { recursive: true });
const component = name => path.join(web, 'src/features/control/components', name).replaceAll('\\', '/');
await fs.writeFile(path.join(output, 'loader.cjs'), `const ts=require(${JSON.stringify(requireWeb.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,esModuleInterop:true}}).outputText;`);
await fs.writeFile(path.join(output, 'api.ts'), `async function call(method,url,body,config){const params=new URLSearchParams(config?.params??{});const form=body instanceof FormData;const response=await fetch(url+(params.size?'?'+params:''),{method,...(body?{body:form?body:JSON.stringify(body),...(form?{}:{headers:{'content-type':'application/json'}})}:{})});const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.message),{response:{data}});return {data};}export const getApiErrorMessage=e=>e.message??e.response?.data?.message??'Error';export default{get:(u,c)=>call('GET',u,null,c),post:(u,b,c)=>call('POST',u,b,c),put:(u,b,c)=>call('PUT',u,b,c)};`);
await fs.writeFile(path.join(output, 'entry.tsx'), `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {NextIntlClientProvider} from 'next-intl';import {Toaster} from 'sonner';import {GradingSchemeDialog} from '${component('grading-scheme-dialog.tsx')}';import {ControlFileImportDialog} from '${component('control-file-import-dialog.tsx')}';import {ControlAuditDrawer} from '${component('control-audit-drawer.tsx')}';import ar from '${path.join(web,'src/messages/ar.json').replaceAll('\\','/')}';import en from '${path.join(web,'src/messages/en.json').replaceAll('\\','/')}';const locale=location.pathname.startsWith('/ar')?'ar':'en';const mode=new URLSearchParams(location.search).get('mode');const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});const rows=Array.from({length:501},(_,i)=>({studentId:String(i+1).padStart(24,'0'),studentCode:String(260001+i),name:'Synthetic '+i,nameAr:'Synthetic '+i,score:10,components:{},result:{total:null,totalMax:100,complete:false}}));const file=new File(['synthetic bytes; API parser tested separately'],'control.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});function App(){const [open,setOpen]=useState(true);return open?mode==='scheme'?<GradingSchemeDialog open onOpenChange={setOpen} courseId="300000000000000000000001" courseCode="111" courseTitle="Synthetic course" academicYear="2026-2027" semester="first" locale={locale}/>:mode==='audit'?<ControlAuditDrawer open onOpenChange={setOpen} sheetId="100000000000000000000001" locale={locale}/>:<ControlFileImportDialog file={file} sheetId="100000000000000000000001" rows={rows} locale={locale} onClose={()=>setOpen(false)} onSaved={async()=>{}}/>:<p>Closed</p>}document.documentElement.dir=locale==='ar'?'rtl':'ltr';createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale={locale} messages={locale==='ar'?ar:en} timeZone="Africa/Cairo"><QueryClientProvider client={client}><App/><Toaster/></QueryClientProvider></NextIntlClientProvider>);`);
await new Promise((resolve,reject)=>webpack({mode:'development',devtool:false,context:web,entry:path.join(output,'entry.tsx'),output:{path:output,filename:'app.js',publicPath:'/'},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:path.join(output,'loader.cjs')}]},resolve:{extensions:['.tsx','.ts','.jsx','.js'],modules:[path.join(web,'node_modules'),'node_modules'],alias:{'@/lib/api':path.join(output,'api.ts'),'@':path.join(web,'src')}}},(error,stats)=>error||stats.hasErrors()?reject(error||new Error(stats.toString({all:false,errors:true}))):resolve()));
const css=await requireWeb('postcss')([requireWeb('@tailwindcss/postcss')({base:web})]).process(await fs.readFile(path.join(web,'src/app/globals.css'),'utf8'),{from:path.join(web,'src/app/globals.css')});await fs.writeFile(path.join(output,'styles.css'),css.css);
const components=['coursework','midterm','final'].map(key=>({key,max:key==='final'?60:20,step:0.5,enabled:true,nameAr:'Label',nameEn:'Label'}));
let revision=0,nonce=0,commits=0,lostResponse=true,schemePayload;
const receipts=new Map(), savedStudents=new Set(), previewRequests=[];
const emptyPreview = { previewId: 'empty-preview', changes: [], errors: [], valid: 0, skipped: 500, batchIndex: 0, totalBatches: 1, totalRows: 500 };
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.endsWith('/import/preview') && req.headers.referer?.includes('mode=empty')) {
   for await(const chunk of req){void chunk;}
   res.setHeader('content-type','application/json');
   return res.end(JSON.stringify(emptyPreview));
 }
 if(url.pathname.startsWith('/admin/control/')){
  res.setHeader('content-type','application/json');
  if(url.pathname.includes('/schemes/')){
   if(req.method==='PUT'){const chunks=[];for await(const c of req)chunks.push(c);schemePayload=JSON.parse(Buffer.concat(chunks));assert.ok(schemePayload.components.every(c=>Object.keys(c).sort().join(',')==='enabled,key,max,step'));}
   return res.end(JSON.stringify({components,version:1,courseworkAttendanceMax:5,courseworkQuizzesMax:15}));
  }
  if(url.pathname.endsWith('/audit')){const page=Number(url.searchParams.get('page')??1);return res.end(JSON.stringify({items:[{id:String(page),action:'UPDATE',source:page===1?'XLSX':'GRID',at:'2026-11-12T10:00:00Z',studentCode:'260001',studentName:'Synthetic student',actorName:'Synthetic reviewer',oldValue:{score:10,status:'present'},newValue:{score:15,status:'present'},reason:'Synthetic review'}],total:51,totalPages:2,page,limit:50}));}
  if(url.pathname.endsWith('/import/preview')){for await(const chunk of req){void chunk;}const batch=Number(url.searchParams.get('batch')??0);previewRequests.push(batch);const changes=Array.from({length:batch===0?500:1},(_,offset)=>({studentId:String(batch*500+offset+1).padStart(24,'0'),score:15,status:'present',expectedRev:0,opId:'op-'+(++nonce)}));const preview={previewId:String(++nonce).padStart(24,'0'),changes,errors:[],valid:changes.length,batchIndex:batch,totalBatches:2,totalRows:501};receipts.set(preview.previewId,{preview,revision});return res.end(JSON.stringify(preview));}
  if(url.pathname.endsWith('/import/commit')){const chunks=[];for await(const c of req)chunks.push(c);const {previewId}=JSON.parse(Buffer.concat(chunks));const receipt=receipts.get(previewId);assert.ok(receipt);commits++;if(!receipt.result){assert.equal(receipt.revision,revision,'A later batch must be refreshed after earlier saves');for(const change of receipt.preview.changes){assert.ok(!savedStudents.has(change.studentId),'No student may be saved twice');savedStudents.add(change.studentId);}revision++;receipt.result={summary:{ok:receipt.preview.valid},results:receipt.preview.changes.map(c=>({...c,result:'ok'}))};}if(lostResponse){lostResponse=false;res.statusCode=503;return res.end(JSON.stringify({message:'Synthetic response lost after save'}));}return res.end(JSON.stringify(receipt.result));}
  throw new Error('Unexpected fixture endpoint');
 }
 const asset=/^\/[\w.-]+\.(js|css)$/.test(url.pathname)?path.join(output,url.pathname.slice(1)):null;if(asset){res.setHeader('content-type',asset.endsWith('.js')?'text/javascript':'text/css');return res.end(await fs.readFile(asset));}res.setHeader('content-type','text/html; charset=utf-8');res.end('<!doctype html><html class="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"><body><div id="root"></div><script src="/app.js"></script></body></html>');
}catch(error){res.statusCode=500;res.end(JSON.stringify({message:error.message}));}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser,page;
try{
 browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1350,height:1000}});const errors=[];page.on('pageerror',error=>errors.push(error.message));const base=`http://127.0.0.1:${server.address().port}`;
 for(const locale of ['en','ar']){
  const t=JSON.parse(await fs.readFile(path.join(web,'src/messages/'+locale+'.json'),'utf8')).control;
  await page.goto(`${base}/${locale}?mode=empty`);
  await page.getByText(t.noImportChanges,{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:t.confirmImport,exact:true}).isEnabled(),false);
  assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'),'0');
  await page.getByText(t.fileInputHelp,{exact:true}).waitFor();
  await page.goto(`${base}/${locale}?mode=scheme`);await page.locator('#midterm-max').waitFor();assert.equal(await page.getByRole('note').count(),4);await page.locator('#midterm-step').fill('0');assert.equal(await page.getByRole('button',{name:t.confirm,exact:true}).isEnabled(),false);await page.locator('#midterm-step').fill('0.5');await page.locator('#midterm-max').fill('30');await page.locator('#final-max').fill('50');await page.getByRole('button',{name:t.confirm,exact:true}).click();await page.getByText('Closed',{exact:true}).waitFor();assert.equal(schemePayload.components.find(c=>c.key==='midterm').max,30);
  await page.goto(`${base}/${locale}?mode=audit`);
  const next=page.getByRole('button',{name:t.next,exact:true});
  for(let attempt=0;attempt<3;attempt++){
   await page.getByRole('button',{name:t.auditPreview,exact:true}).click();
   await page.getByRole('heading',{name:t.auditPreview,exact:true}).waitFor();
   await page.keyboard.press('Escape');
   await page.getByRole('heading',{name:t.auditPreview,exact:true}).waitFor({state:'hidden'});
   await next.waitFor();
   assert.equal(await next.isEnabled(),true,'closing a nested preview must retain audit pagination');
  }
  await next.click();await page.getByText(t.auditSources.GRID,{exact:true}).waitFor();
  await page.getByRole('button',{name:t.auditPreview,exact:true}).click();
  await page.getByRole('heading',{name:t.auditPreview,exact:true}).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('heading',{name:t.auditPreview,exact:true}).waitFor({state:'hidden'});
  await page.getByRole('button',{name:t.previous,exact:true}).click();
  await page.getByText(t.auditSources.XLSX,{exact:true}).waitFor();
  await page.screenshot({path:path.join(output,locale+'-audit.png'),fullPage:true});
 }
 const t=JSON.parse(await fs.readFile(path.join(web,'src/messages/en.json'),'utf8')).control;
 await page.goto(`${base}/en?mode=import`);const confirm=page.getByRole('button',{name:t.confirmImport,exact:true});await confirm.waitFor();await page.getByText(t.batchPosition.replace('{current}','1').replace('{total}','2'),{exact:true}).waitFor();assert.equal(await page.locator('tbody tr').count(),50);assert.equal(await confirm.isEnabled(),true);await confirm.click();await page.getByText('Synthetic response lost after save',{exact:true}).waitFor();assert.equal(savedStudents.size,500);await page.getByRole('button',{name:t.retry,exact:true}).click();await page.getByText(t.savedCount.replace('{count}','501'),{exact:true}).waitFor();assert.equal(savedStudents.size,501);assert.equal(commits,3);assert.deepEqual(previewRequests,[0,1,1]);assert.equal(await confirm.isEnabled(),false);await page.setViewportSize({width:390,height:844});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.getByRole('dialog').evaluate(element=>Promise.all(element.getAnimations().map(animation=>animation.finished.catch(()=>{}))));const geometry=await page.getByRole('dialog').evaluate(element=>{const rect=element.getBoundingClientRect();return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,maxHeight:getComputedStyle(element).maxHeight,viewport:innerHeight};});await fs.writeFile(path.join(output,'mobile-geometry.json'),JSON.stringify(geometry,null,2));assert.ok(geometry.y>=0 && geometry.y+geometry.height<=845,'Import dialog must fit vertically inside the mobile viewport');await page.screenshot({path:path.join(output,'mobile-import.png'),fullPage:true});await page.goto(`${base}/ar?mode=import`);await page.getByRole('heading',{name:JSON.parse(await fs.readFile(path.join(web,'src/messages/ar.json'),'utf8')).control.filePreviewTitle,exact:true}).waitFor();const mobileAction=await page.getByRole('button',{name:JSON.parse(await fs.readFile(path.join(web,'src/messages/ar.json'),'utf8')).control.confirmImport,exact:true}).boundingBox();assert.ok(mobileAction && mobileAction.y >= 0 && mobileAction.y + mobileAction.height <= 844,'Import action stays visible on mobile');assert.equal(await page.locator('html').getAttribute('dir'),'rtl');await page.screenshot({path:path.join(output,'arabic-mobile-import.png'),fullPage:true});assert.deepEqual(errors,[]);
 console.log('PASS: bilingual scheme help and strict payload, field validation, paginated audit details, 501-row preview, sequential batches, lost-response retry without duplicates and mobile layout.');
}catch(error){if(page){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});await fs.writeFile(path.join(output,'failure-dom.html'),await page.content());}throw error;}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
