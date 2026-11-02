import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Render the real page, form, table and Radix controls. Only transport/auth/router
// are fixtures; API authorization and persistence have a separate integration test.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const web = path.join(root, 'apps/web');
const output = path.join(root, 'outputs/admissions');
const requireWeb = createRequire(path.join(web, 'package.json'));
const requireApi = createRequire(path.join(root, 'apps/api/package.json'));
const { webpack } = requireWeb('next/dist/compiled/webpack/webpack');
const { chromium } = requireApi('playwright');
const fixture = { _id: '100000000000000000000001', code: 'INTAKE26', academicYear: '2026-2027', name: 'Admission 2026', nameAr: '\u0642\u0628\u0648\u0644 2026', opensAt: '2026-10-30T22:00:13.456Z', closesAt: '2026-11-30T22:00:17.123Z', isEnabled: true, status: 'scheduled', revision: 0 };
let period = { ...fixture };
let failure;
let denyList = false;
const mutations = [];
const queries = [];
let codeReady = false;
let codeFailure;
let denyHistory = false;
let codeVersion = 0;
const codeWrites = [];
let codeRows;
const resetCodes = () => { codeReady=false;codeFailure=undefined;codeVersion=0;codeWrites.length=0;codeRows=[{studentCode:'270001',sequence:1,status:'MISSING',reason:'UNVERIFIED_GAP'},{studentCode:'270002',sequence:2,status:'MISSING',reason:'UNVERIFIED_GAP'},{studentCode:'270003',sequence:3,status:'ASSIGNED',reason:'CURRENT_OWNER',currentStudentId:'100000000000000000000003'}]; };
resetCodes();
await fs.mkdir(output, { recursive: true });
const write = (name, contents) => fs.writeFile(path.join(output, name), contents);
await write('loader.cjs', `const ts=require(${JSON.stringify(requireWeb.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,esModuleInterop:true}}).outputText;`);
await write('auth.ts', `export const useAuth=()=>{const access=new URLSearchParams(location.search).get('access');const codes=location.pathname.includes('/student-codes');return {user:{_id:'fixture',role:codes&&!access?'admin':'staff',permissions:access==='none'?[]:codes?['student_codes.read']:[access==='read'?'admissions.periods.read':'admissions.periods.manage'],mustChangePassword:false}};};`);
await write('navigation.ts', `import {useSyncExternalStore} from 'react';const subscribe=fn=>{window.addEventListener('popstate',fn);return()=>window.removeEventListener('popstate',fn);};const router={replace:url=>{history.replaceState(null,'',url);window.dispatchEvent(new PopStateEvent('popstate'));},push:()=>{}};export const useSearchParams=()=>{const search=useSyncExternalStore(subscribe,()=>location.search);return new URLSearchParams(search);};export const useParams=()=>({locale:location.pathname.split('/')[1]});export const usePathname=()=>location.pathname;export const useRouter=()=>router;`);
await write('api.ts', `const call=async(method,url,body)=>{const response=await fetch(url,{method,headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok)throw data;return {data};};export const getApiErrorDetails=error=>error;export const getApiErrorMessage=(error,fallback)=>error.message||fallback;export default {get:(url,config)=>call('GET',url+'?'+new URLSearchParams(config?.params)),post:(url,body)=>call('POST',url,body),patch:(url,body)=>call('PATCH',url,body)};`);
await write('entry.tsx', `import React from 'react';import {createRoot} from 'react-dom/client';import {NextIntlClientProvider} from 'next-intl';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {Toaster} from 'sonner';import Page from '${path.join(web, 'src/app/[locale]/admin/admissions/page.tsx').replaceAll('\\', '/')}';import Codes from '${path.join(web, 'src/app/[locale]/admin/student-codes/page.tsx').replaceAll('\\', '/')}';import ar from '${path.join(web, 'src/messages/ar.json').replaceAll('\\', '/')}';import en from '${path.join(web, 'src/messages/en.json').replaceAll('\\', '/')}';const locale=location.pathname.split('/')[1];document.documentElement.dir=locale==='ar'?'rtl':'ltr';const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale={locale} messages={locale==='ar'?ar:en} timeZone="Africa/Cairo"><QueryClientProvider client={client}>{location.pathname.includes('/student-codes')?<Codes/>:<Page/>}<Toaster/></QueryClientProvider></NextIntlClientProvider>);`);
await write('api-client.ts', `import api from './api';export const apiGet=async(url,config)=>(await api.get(url,config)).data;export const apiPost=async(url,data,config)=>(await api.post(url,data,config)).data;export const apiPatch=async(url,data,config)=>(await api.patch(url,data,config)).data;export const apiDelete=async(url,config)=>(await api.delete(url,config)).data;`);
await new Promise((resolve, reject) => webpack({
  mode: 'development', devtool: false, context: web,
  cache: { type: 'filesystem', version: 'admission-fixtures-api-client-v2', cacheDirectory: path.join(output, 'webpack-cache') },
  entry: path.join(output, 'entry.tsx'), output: { path: output, filename: 'app.js', publicPath: '/' },
  resolve: { extensions: ['.tsx', '.ts', '.jsx', '.js'], modules: [path.join(web, 'node_modules'), 'node_modules'], alias: { 'next/navigation': path.join(output, 'navigation.ts'), '@/lib/api': path.join(output, 'api.ts'), '@/lib/api-client': path.join(output, 'api-client.ts'), '@/providers/auth-provider': path.join(output, 'auth.ts'), '@': path.join(web, 'src') } },
  module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(output, 'loader.cjs') }] },
}, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve()));
const css = await requireWeb('postcss')([requireWeb('@tailwindcss/postcss')({ base: web })]).process(await fs.readFile(path.join(web, 'src/app/globals.css'), 'utf8'), { from: path.join(web, 'src/app/globals.css') });
await write('styles.css', css.css);
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/admin/admissions/academic-years') { res.setHeader('Content-Type','application/json');res.end(JSON.stringify({items:[fixture.academicYear]}));return; }
    if (url.pathname.startsWith('/admin/student-codes')) {
      res.setHeader('Content-Type','application/json');
      if (url.pathname.endsWith('/audit')) {
        const summary={AVAILABLE:0,RESERVED:0,ASSIGNED:0,RELEASED:0,REQUIRES_REVIEW:0,MISSING:0};for(const row of codeRows)summary[row.status]++;
        const rows=codeRows.filter(row=>(!url.searchParams.get('status')||row.status===url.searchParams.get('status'))&&(!url.searchParams.get('search')||row.studentCode.includes(url.searchParams.get('search'))));
        res.end(JSON.stringify({academicYear:'2026-2027',yearPrefix:'27',scannedAt:'2026-11-01T08:00:00Z',fingerprint:String.fromCharCode(97+codeVersion).repeat(64),policy:codeReady?{academicYear:'2026-2027',yearPrefix:'27',nextSequence:4,initializedAt:'2026-11-01T08:00:00Z'}:null,canInitialize:!codeReady,mappingConflict:false,reuseEnabled:false,truncated:false,summary,items:rows,total:rows.length,page:1,limit:20,totalPages:1}));return;
      }
      if (url.pathname.endsWith('/history')) {
        if(denyHistory){res.statusCode=503;res.end(JSON.stringify({message:'unavailable'}));return;}
        res.end(JSON.stringify({entry:{studentCode:'270003',status:'ASSIGNED'},items:[{_id:'audit-event',action:'BACKFILLED',to:'ASSIGNED',reason:'Reviewed synthetic records.',actorId:fixture._id,at:'2026-11-01T08:00:00Z'}],total:1,page:1,limit:20,totalPages:1}));return;
      }
      const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks).toString());codeWrites.push({path:url.pathname,body});
      if(codeFailure||body.fingerprint!==String.fromCharCode(97+codeVersion).repeat(64)){res.statusCode=409;res.end(JSON.stringify({code:codeFailure||'CODE_PREVIEW_CHANGED'}));return;}
      if(url.pathname.endsWith('/initialize'))codeReady=true;
      else {const code=url.pathname.split('/').at(-2);codeRows=codeRows.map(row=>row.studentCode===code?{...row,status:'AVAILABLE',reason:'CONFIRMED_AVAILABLE'}:row);}
      codeVersion++;res.end(JSON.stringify({ok:true}));return;
    }
    if (url.pathname.startsWith('/admin/admissions/periods')) {
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'GET') {
        queries.push(Object.fromEntries(url.searchParams));
        if (denyList) { res.statusCode = 503; res.end(JSON.stringify({ message: 'unavailable' })); return; }
        res.end(JSON.stringify({ items: [period], total: 1, page: 1, limit: 20, totalPages: 1 })); return;
      }
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString()); mutations.push({ method: req.method, body });
      if (failure) { res.statusCode = 409; res.end(JSON.stringify({ code: failure })); return; }
      period = { ...period, ...body, revision: period.revision + 1 };
      period.status = !period.isEnabled ? 'disabled' : Date.now() >= Date.parse(period.closesAt) ? 'closed' : Date.now() >= Date.parse(period.opensAt) ? 'open' : 'scheduled';
      res.end(JSON.stringify(period)); return;
    }
    if (url.pathname === '/app.js' || url.pathname === '/styles.css') { res.setHeader('Content-Type', url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css'); res.end(await fs.readFile(path.join(output, url.pathname.slice(1)))); return; }
    res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html class="dark"><meta charset="utf-8"><link rel="stylesheet" href="/styles.css"><body><div id="root"></div><script src="/app.js"></script></body></html>');
  } catch (error) { res.statusCode = 500; res.end(JSON.stringify({ message: error.message })); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = `http://127.0.0.1:${server.address().port}`;
let browser, page;
try {
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/New_York' });
  const errors = []; page.on('pageerror', (error) => { errors.push(error.message); void write('runtime-error.txt', error.stack ?? error.message); });
  for (const locale of ['en', 'ar']) {
    period = { ...fixture }; mutations.length = 0;
    const t = JSON.parse(await fs.readFile(path.join(web, `src/messages/${locale}.json`), 'utf8')).admissions;
    await page.goto(`${address}/${locale}/admin/admissions`);
    await page.getByText(fixture.code, { exact: true }).waitFor();
    const edit = async () => { await page.getByRole('button', { name: t.actions, exact: true }).click(); await page.getByRole('menuitem', { name: t.edit, exact: true }).click(); };
    await edit();
    const dialog = page.getByRole('dialog');
    const name = dialog.getByLabel(t.fields.name, { exact: true });
    const save = dialog.getByRole('button', { name: t.save, exact: true });
    assert.equal(await dialog.getByLabel(t.fields.code, { exact: true }).isDisabled(), true);
    assert.equal(await dialog.getByLabel(t.fields.academicYear, { exact: true }).isDisabled(), true);
    assert.match(await dialog.getByRole('group', { name: t.fields.opensAt, exact: true }).innerText(), /31\/10\/2026 12:00/);
    await name.fill('X'); await save.click();
    await dialog.getByText(t.validation.name, { exact: true }).waitFor();
    assert.equal(mutations.length, 0);
    await name.fill('Changed intake');
    failure = 'ADMISSION_PERIOD_CHANGED'; await save.click();
    await dialog.getByRole('alert').getByText(t.errors.changed, { exact: true }).waitFor();
    assert.equal(await name.inputValue(), 'Changed intake');
    await page.screenshot({ path: path.join(output, `edit-conflict-${locale}.png`), fullPage: true });
    failure = undefined; await save.click(); await dialog.waitFor({ state: 'hidden' });
    assert.equal(period.name, 'Changed intake');
    const saved = mutations.at(-1).body;
    assert.equal(saved.opensAt, fixture.opensAt); assert.equal(saved.closesAt, fixture.closesAt);
    assert.ok(!('code' in saved) && !('academicYear' in saved));
    await page.getByRole('button', { name: t.create, exact: true }).click();
    assert.equal(await dialog.getByRole('checkbox', { name: t.fields.isEnabled, exact: true }).isChecked(), false);
    await save.click();
    await dialog.getByText(t.validation.code, { exact: true }).waitFor();
    await dialog.getByText(t.validation.academicYear, { exact: true }).waitFor();
    assert.equal(await dialog.getByText(t.validation.date, { exact: true }).count(), 2);
    await dialog.getByRole('button', { name: t.cancel, exact: true }).click();
    await page.getByRole('checkbox', { name: t.selectAll, exact: true }).check();
    await page.getByRole('button', { name: t.disableSelected, exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: t.confirm, exact: true }).click();
    await page.getByText(t.statuses.disabled, { exact: true }).waitFor();
    assert.equal(period.isEnabled, false);
    await page.clock.setFixedTime(new Date('2026-11-01T08:00:00Z'));
    await page.getByRole('button', { name: t.create, exact: true }).click();
    await dialog.getByLabel(t.fields.code, { exact: true }).fill('INTAKE27');
    await dialog.getByLabel(t.fields.academicYear, { exact: true }).fill('2027-2028');
    await name.fill('New intake');
    const nowLabel = locale === 'ar' ? '\u062a\u0639\u064a\u064a\u0646 \u0627\u0644\u0622\u0646' : 'Set to Now';
    const doneLabel = locale === 'ar' ? '\u062a\u0645' : 'Done';
    for (const boundary of ['opensAt', 'closesAt']) {
      if (boundary === 'closesAt') await page.clock.setFixedTime(new Date('2026-11-01T09:00:00Z'));
      await dialog.getByRole('group', { name: t.fields[boundary], exact: true }).getByRole('button').first().click();
      await page.getByRole('button', { name: nowLabel, exact: true }).click();
      await page.getByRole('button', { name: doneLabel, exact: true }).click();
    }
    failure = 'ADMISSION_PERIOD_CODE_TAKEN'; await save.click();
    await dialog.getByRole('alert').getByText(t.errors.duplicate, { exact: true }).waitFor();
    assert.equal(await dialog.getByLabel(t.fields.code, { exact: true }).getAttribute('aria-invalid'), 'true');
    failure = undefined; await save.click(); await dialog.waitFor({ state: 'hidden' });
    const created = mutations.at(-1);
    assert.equal(created.method, 'POST');
    assert.equal(created.body.isEnabled, false);
    assert.equal(created.body.opensAt, '2026-11-01T08:00:00.000Z');
    assert.equal(created.body.closesAt, '2026-11-01T09:00:00.000Z');
    assert.equal(created.body.academicYear, '2027-2028');
    period = { ...fixture };
    await page.goto(`${address}/${locale}/admin/admissions?access=read`);
    await page.getByText(fixture.code, { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: t.create, exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: t.actions, exact: true }).count(), 0);
    denyList = true; await page.goto(`${address}/${locale}/admin/admissions`);
    await page.getByText(t.errors.load, { exact: true }).waitFor();
    denyList = false; await page.getByRole('button', { name: t.retry, exact: true }).click();
    await page.getByText(fixture.code, { exact: true }).waitFor();
    const before = queries.length;
    const searched = page.waitForResponse((response) => response.url().includes('search=Admission+2026'));
    await page.getByRole('textbox', { name: t.search, exact: true }).pressSequentially('Admission 2026', { delay: 10 });
    await searched;
    assert.equal(await page.getByRole('textbox', { name: t.search, exact: true }).inputValue(), 'Admission 2026');
    assert.equal(queries.length - before, 1, 'search sends one debounced request');
    await page.screenshot({ path: path.join(output, `periods-${locale}.png`), fullPage: true });
  }
  for (const locale of ['en','ar']) {
    resetCodes();const t=JSON.parse(await fs.readFile(path.join(web,`src/messages/${locale}.json`),'utf8')).studentCodes;
    await page.goto(`${address}/${locale}/admin/student-codes`);
    await page.getByText(t.chooseScope,{exact:true}).waitFor();
    await page.getByRole('button',{name:t.manualYear,exact:true}).click();
    const year=page.getByLabel(t.fields.academicYear,{exact:true});const prefix=page.getByLabel(t.fields.yearPrefix,{exact:true});
    assert.equal(await prefix.getAttribute('dir'),'ltr');
    await year.fill('2026-2028');await prefix.fill('2');await page.getByRole('button',{name:t.scan,exact:true}).click();
    await page.getByText(t.validation.year,{exact:true}).waitFor();await page.getByText(t.validation.prefix,{exact:true}).waitFor();
    await year.fill('2026-2027');await prefix.fill('27');await page.getByRole('button',{name:t.scan,exact:true}).click();
    await page.getByText('270001',{exact:true}).waitFor();
    await page.getByRole('button',{name:t.initialize,exact:true}).click();
    const dialog=page.getByRole('dialog');const submit=dialog.getByRole('button',{name:t.confirmAction,exact:true});
    await submit.click();await dialog.getByText(t.validation.reason,{exact:true}).waitFor();await dialog.getByText(t.validation.confirm,{exact:true}).waitFor();assert.equal(codeWrites.length,0);
    const reason=dialog.getByLabel(t.fields.reason,{exact:true});await reason.fill('Reviewed synthetic identity inventory.');await dialog.getByRole('checkbox',{name:t.confirmed,exact:true}).check();
    codeFailure='CODE_PREVIEW_CHANGED';await submit.click();await dialog.getByRole('alert').getByText(t.errors.changed,{exact:true}).waitFor();assert.equal(await reason.inputValue(),'Reviewed synthetic identity inventory.');
    codeFailure=undefined;await submit.click();await dialog.waitFor({state:'hidden'});assert.equal(codeReady,true);
    const actions=(code)=>page.getByRole('button',{name:t.actionsFor.replace('{code}',code),exact:true});
    await actions('270001').click();await page.getByRole('menuitem',{name:t.recover,exact:true}).click();
    await reason.fill('Verified never assigned in internal and external records.');await dialog.getByRole('checkbox',{name:t.confirmed,exact:true}).check();await submit.click();
    await dialog.getByText(t.validation.attest,{exact:true}).waitFor();assert.equal(codeWrites.length,2);
    await dialog.getByRole('checkbox',{name:t.neverAssignedConfirmed,exact:true}).check();await submit.click();await dialog.waitFor({state:'hidden'});
    assert.equal(codeWrites.at(-1).body.neverAssignedConfirmed,true);
    await page.getByRole('row').filter({hasText:'270001'}).getByText(t.statuses.AVAILABLE,{exact:true}).waitFor();
    await page.getByRole('checkbox',{name:t.selectAll,exact:true}).check();await page.getByRole('button',{name:t.inspectSelection,exact:true}).click();await dialog.getByText('270002',{exact:false}).waitFor();await page.keyboard.press('Escape');
    denyHistory=true;await actions('270003').click();await page.getByRole('menuitem',{name:t.history,exact:true}).click();await dialog.getByRole('alert').getByText(t.errors.load,{exact:true}).waitFor();
    denyHistory=false;await dialog.getByRole('button',{name:t.retry,exact:true}).click();await dialog.getByText(t.events.BACKFILLED,{exact:true}).waitFor();await page.keyboard.press('Escape');
    await page.screenshot({path:path.join(output,`student-codes-${locale}.png`),fullPage:true});
    await page.goto(`${address}/${locale}/admin/student-codes?academicYear=2026-2027&yearPrefix=27&access=read`);await page.getByText('270002',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:t.initialize,exact:true}).count(),0);
    await actions('270002').click();assert.equal(await page.getByRole('menuitem',{name:t.recover,exact:true}).count(),0);await page.keyboard.press('Escape');
    await page.goto(`${address}/${locale}/admin/student-codes?academicYear=2026-2027&yearPrefix=27&access=none`);
    assert.equal(await page.getByRole('button',{name:t.scan,exact:true}).count(),0);
    assert.ok(codeWrites.every(write=>!write.path.includes('allocate')));
  }
  assert.deepEqual(errors, []);
  console.log('Student code audit passed: Arabic/English scope validation, reviewed initialization, stale-preview feedback, never-assigned recovery, history retry, bulk inspection and read-only/denied permissions.');
  console.log('Admission periods browser acceptance passed: Arabic/English, Cairo in a US browser, retained-input conflicts, exact timestamp preservation, validation, manual defaults, bulk disable, read-only access, retry and debounced URL search.');
} catch (error) {
  if (page) { await write('failure-dom.html', await page.content()); await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }); }
  throw error;
} finally {
  await browser?.close(); await new Promise((resolve) => server.close(resolve));
}
