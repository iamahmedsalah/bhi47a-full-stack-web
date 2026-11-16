/** Real attempt comparison dialog/CSS with synthetic transport; real XLSX parsing has API tests. */
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
const output = path.join(root, 'outputs/control-attempts-browser');
await fs.mkdir(output, { recursive: true });
const component = name => path.join(web, 'src/features/control/components', name).replaceAll('\\', '/');
await fs.writeFile(path.join(output, 'loader.cjs'), `const ts=require(${JSON.stringify(requireWeb.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,esModuleInterop:true}}).outputText;`);
await fs.writeFile(path.join(output, 'api.ts'), `async function call(method,url,body,config){const params=new URLSearchParams(config?.params??{});const form=body instanceof FormData;const response=await fetch(url+(params.size?'?'+params:''),{method,...(body?{body:form?body:JSON.stringify(body),...(form?{}:{headers:{'content-type':'application/json'}})}:{})});const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.message),{response:{data}});return {data};}export const getApiErrorMessage=e=>e.message??e.response?.data?.message??'Error';export default{get:(u,c)=>call('GET',u,null,c),post:(u,b,c)=>call('POST',u,b,c),put:(u,b,c)=>call('PUT',u,b,c)};`);
await fs.writeFile(path.join(output,'entry.tsx'), `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {NextIntlClientProvider} from 'next-intl';import {ControlAttemptDialog} from '${component('control-attempt-dialog.tsx')}';import ar from '${path.join(web,'src/messages/ar.json').replaceAll('\\','/')}';import en from '${path.join(web,'src/messages/en.json').replaceAll('\\','/')}';const locale=location.pathname.startsWith('/ar')?'ar':'en';const client=new QueryClient({defaultOptions:{queries:{retry:false}}});function App(){const [open,setOpen]=useState(true);return open?<ControlAttemptDialog sheetId="100000000000000000000001" locale={locale} approval canCarry onClose={()=>setOpen(false)} onCarried={async()=>{}} onApproved={async review=>{await fetch('/approval',{method:'POST',body:JSON.stringify(review)});setOpen(false);}}/>:<p>Closed</p>;}document.documentElement.dir=locale==='ar'?'rtl':'ltr';createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale={locale} messages={locale==='ar'?ar:en} timeZone="Africa/Cairo"><QueryClientProvider client={client}><App/></QueryClientProvider></NextIntlClientProvider>);`);
await new Promise((resolve,reject)=>webpack({mode:'development',devtool:false,context:web,entry:path.join(output,'entry.tsx'),output:{path:output,filename:'app.js',publicPath:'/'},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:path.join(output,'loader.cjs')}]},resolve:{extensions:['.tsx','.ts','.jsx','.js'],modules:[path.join(web,'node_modules'),'node_modules'],alias:{'@/lib/api':path.join(output,'api.ts'),'@':path.join(web,'src')}}},(error,stats)=>error||stats.hasErrors()?reject(error||new Error(stats.toString({all:false,errors:true}))):resolve()));
const css=await requireWeb('postcss')([requireWeb('@tailwindcss/postcss')({base:web})]).process(await fs.readFile(path.join(web,'src/app/globals.css'),'utf8'),{from:path.join(web,'src/app/globals.css')});await fs.writeFile(path.join(output,'styles.css'),css.css);
const id = number => String(number).padStart(24, '0');
const attempt = (year, percentage, incomplete = false) => ({academicYear:year,semester:'first',fingerprint:'a'.repeat(64),marks:['coursework','midterm','final'].map((component,index)=>({id:id(index+10),component,grade:[17,25,40][index],maxGrade:[20,30,50][index],status:incomplete&&index===2?'incomplete':'present'})),result:{percentage:incomplete?null:percentage,letterGrade:incomplete?'IC':null,official:!incomplete}});
let approval, carried=false, carryCount=0, undoCount=0, digest='d'.repeat(64);
const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');
  res.setHeader('content-type','application/json');
  if(url.pathname==='/approval'){const chunks=[];for await(const c of req)chunks.push(c);approval=JSON.parse(Buffer.concat(chunks));return res.end('{}');}
  if(url.pathname.endsWith('/carry-ic')){const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks));assert.equal(body.sourceFinalId,id(12));assert.equal(body.fingerprint,'a'.repeat(64));carried=true;carryCount++;return res.end('{}');}
  if(url.pathname.endsWith('/undo-carry-ic')){const chunks=[];for await(const c of req)chunks.push(c);assert.equal(JSON.parse(Buffer.concat(chunks)).studentId,id(3));carried=false;undoCount++;return res.end('{}');}
  if(url.pathname.endsWith('/attempts')){const page=Number(url.searchParams.get('page'));return res.end(JSON.stringify({semester:'summer',digest,total:51,page,limit:50,comparisons:[{studentId:id(page),studentCode:page===1?'260001':'260051',name:'Synthetic student',previous:attempt('2024-2025',70),current:attempt('2025-2026',page===1?80:65),canAcceptNew:page===1,recommendation:page===1?'accept_new':'keep_previous'}],icTotal:1,icSources:page===1?[{studentId:id(3),studentCode:'260003',name:'IC student',source:attempt('2024-2025',null,true),alreadyCarried:carried}]:[],carriedTotal:carried?1:0,carried:carried?[{studentId:id(3),studentCode:'260003',academicYear:'2024-2025',semester:'first',fingerprint:'a'.repeat(64)}]:[]}));}
  const asset=/^\/[\w.-]+\.(js|css)$/.test(url.pathname)?path.join(output,url.pathname.slice(1)):null;
  if(asset){res.setHeader('content-type',asset.endsWith('.js')?'text/javascript':'text/css');return res.end(await fs.readFile(asset));}
  res.setHeader('content-type','text/html; charset=utf-8');res.end('<!doctype html><html class="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"><div id="root"></div><script src="/app.js"></script></html>');
}catch(error){res.statusCode=500;res.end(JSON.stringify({message:error.message}));}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1300,height:1000}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  for(const locale of ['en','ar']){
    const t=JSON.parse(await fs.readFile(path.join(web,'src/messages/'+locale+'.json'),'utf8')).controlAttempts;
    await page.goto(`http://127.0.0.1:${server.address().port}/${locale}`);
    const choice=page.getByRole('checkbox',{name:`260001 ${t.keepPrevious}`,exact:true});
    await choice.check();
    await page.getByRole('button',{name:t.nextPage,exact:true}).click();
    await page.getByText('260051',{exact:true}).waitFor();
    assert.equal(await page.getByRole('checkbox').count(),0,'Lower attempt cannot be selected');
    await page.getByRole('button',{name:t.previousPage,exact:true}).click();
    await choice.waitFor();assert.equal(await choice.isChecked(),true,'Review choices survive pagination');
    await page.getByRole('button',{name:`260003 ${t.actions}`,exact:true}).click();
    await page.getByRole('menuitem',{name:t.carry,exact:true}).click();
    await page.getByText(t.carriedTitle,{exact:true}).waitFor();
    await page.getByRole('button',{name:`260003 ${t.actions}`,exact:true}).last().click();
    await page.getByRole('menuitem',{name:t.undo,exact:true}).click();
    await page.getByRole('button',{name:t.undo,exact:true}).click();
    await page.getByText(t.carriedTitle,{exact:true}).waitFor({state:'hidden'});
    await choice.check();
    await page.getByRole('button',{name:t.approve,exact:true}).click();
    await page.getByText('Closed',{exact:true}).waitFor();
    assert.deepEqual(approval.keepPreviousStudentIds,[id(1)]);
    assert.equal(approval.attemptReviewDigest,digest);
  }
  const t=JSON.parse(await fs.readFile(path.join(web,'src/messages/en.json'),'utf8')).controlAttempts;
  await page.goto(`http://127.0.0.1:${server.address().port}/en`);
  await page.getByRole('checkbox').check();digest='e'.repeat(64);
  await page.getByRole('button',{name:t.nextPage,exact:true}).click();
  await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('button',{name:t.approve,exact:true}).isDisabled(),true);
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(output,'mobile.png'),fullPage:true});
  assert.equal(carryCount,2);assert.equal(undoCount,2);assert.deepEqual(errors,[]);
  console.log('PASS: bilingual whole-attempt choices, lower-result protection, pagination, IC carry/undo, stale source guard and mobile dialog. API persistence tested separately.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
