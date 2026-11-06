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
await write('auth.ts',`export const useAuth=()=>({user:{_id:'fixture-admin',role:'admin'}});`);
await write('api.ts',`const call=async(method,url,body)=>{const response=await fetch(url,{method,...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});const envelope=await response.json();if(!response.ok)throw new Error(envelope.message);return envelope;};export const getApiErrorMessage=e=>e.message;export default {get:u=>call('GET',u),post:(u,b)=>call('POST',u,b),patch:(u,b)=>call('PATCH',u,b)};`);
const local = relative => path.join(web,relative).replaceAll('\\','/');
await write('entry.tsx',`import React from 'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{NextIntlClientProvider}from'next-intl';import{Toaster}from'sonner';import{ControlReleasePanel}from'${local('src/features/grades/components/control-release-panel.tsx')}';import ar from'${local('src/messages/ar.json')}';import en from'${local('src/messages/en.json')}';const locale=location.pathname.includes('/ar/')?'ar':'en';document.documentElement.dir=locale==='ar'?'rtl':'ltr';const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale={locale} messages={locale==='ar'?ar:en} timeZone="Africa/Cairo"><QueryClientProvider client={client}><main className="max-w-6xl mx-auto p-6"><ControlReleasePanel locale={locale}/></main><Toaster/></QueryClientProvider></NextIntlClientProvider>);`);
await new Promise((resolve,reject)=>webpack({mode:'development',devtool:false,context:web,entry:path.join(output,'entry.tsx'),output:{path:output,filename:'app.js',publicPath:'/'},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:path.join(output,'loader.cjs')}]},resolve:{extensions:['.tsx','.ts','.js','.jsx'],modules:[path.join(web,'node_modules'),'node_modules'],alias:{'@/lib/api':path.join(output,'api.ts'),'@/providers/auth-provider':path.join(output,'auth.ts'),'@':path.join(web,'src')}}},(error,stats)=>error||stats.hasErrors()?reject(error||new Error(stats.toString({all:false,errors:true}))):resolve()));
const css=await requireWeb('postcss')([requireWeb('@tailwindcss/postcss')({base:web})]).process(await fs.readFile(path.join(web,'src/app/globals.css'),'utf8'),{from:path.join(web,'src/app/globals.css')});
await write('styles.css',css.css);
const courseId='100000000000000000000001';
const sheetId='200000000000000000000001';
let policy={version:0,rules:{passPercentage:50,finalMinimumPercentage:0,retake:'latest'}};
let activations=0, withdrawals=0, active=false, stale=true;
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    const send=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(status===200?{success:true,data,timestamp:new Date().toISOString()}:data));};
    if(url.pathname==='/admin/control/courses')return send({items:[{courseId,code:'SYNTH101',name:'Synthetic course',nameAr:'SYNTH101',nameEn:'Synthetic course',rosterCount:1,components:['coursework','midterm','final'].map(key=>({key,sheetId,entered:1,published:active?1:0}))}]});
    if(url.pathname.startsWith('/admin/grades/')){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
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
try{
  browser=await chromium.launch({headless:true});
  page=await browser.newPage({viewport:{width:1440,height:950}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const select=async(label,value)=>{await page.getByRole('button',{name:label,exact:true}).click();await page.getByRole('option',{name:value,exact:true}).click();};
  const en=messages.en.controlRelease;
  await page.goto(`${base}/en/admin/grades`);
  await select(en.course,'SYNTH101 — Synthetic course');await select(en.component,en.final);
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
  await page.getByRole('button',{name:en.history,exact:true}).click();await page.getByText(en.active,{exact:false}).waitFor();
  await page.locator('main > section').screenshot({path:path.join(output,'english-release.png')});
  await page.getByRole('button',{name:en.withdraw,exact:true}).click();await page.getByText(en.withdrawn,{exact:true}).waitFor();assert.equal(withdrawals,1);
  const ar=messages.ar.controlRelease;
  await page.goto(`${base}/ar/admin/grades`);await select(ar.course,'SYNTH101 — SYNTH101');
  await page.getByRole('button',{name:ar.preview,exact:true}).click();await page.getByRole('status').getByText(ar.windowNote,{exact:true}).waitFor();
  assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
  const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,section:document.querySelector('section').getBoundingClientRect().toJSON(),main:document.querySelector('main').getBoundingClientRect().toJSON()}));
  await fs.writeFile(path.join(output,'geometry.json'),JSON.stringify(geometry));
  await page.locator('main > section').screenshot({path:path.join(output,'arabic-release.png')});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'arabic-mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('Control release browser acceptance passed: real API envelopes, scoped course selection, policy editing, stale preview recovery, activation, withdrawal, history, Arabic/English desktop/mobile.');
}catch(error){if(page)await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});throw error;}
finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
