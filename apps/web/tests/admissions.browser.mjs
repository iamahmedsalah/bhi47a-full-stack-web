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
await fs.mkdir(output, { recursive: true });
const write = (name, contents) => fs.writeFile(path.join(output, name), contents);
await write('loader.cjs', `const ts=require(${JSON.stringify(requireWeb.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,esModuleInterop:true}}).outputText;`);
await write('auth.ts', `export const useAuth=()=>({user:{_id:'fixture',role:'staff',permissions:new URLSearchParams(location.search).get('access')==='none'?[]:[new URLSearchParams(location.search).get('access')==='read'?'admissions.periods.read':'admissions.periods.manage'],mustChangePassword:false}});`);
await write('navigation.ts', `import {useSyncExternalStore} from 'react';const subscribe=fn=>{window.addEventListener('popstate',fn);return()=>window.removeEventListener('popstate',fn);};const router={replace:url=>{history.replaceState(null,'',url);window.dispatchEvent(new PopStateEvent('popstate'));},push:()=>{}};export const useSearchParams=()=>{const search=useSyncExternalStore(subscribe,()=>location.search);return new URLSearchParams(search);};export const usePathname=()=>location.pathname;export const useRouter=()=>router;`);
await write('api.ts', `const call=async(method,url,body)=>{const response=await fetch(url,{method,headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok)throw data;return {data};};export const getApiErrorDetails=error=>error;export const getApiErrorMessage=(error,fallback)=>error.message||fallback;export default {get:(url,config)=>call('GET',url+'?'+new URLSearchParams(config?.params)),post:(url,body)=>call('POST',url,body),patch:(url,body)=>call('PATCH',url,body)};`);
await write('entry.tsx', `import React from 'react';import {createRoot} from 'react-dom/client';import {NextIntlClientProvider} from 'next-intl';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {Toaster} from 'sonner';import Page from '${path.join(web, 'src/app/[locale]/admin/admissions/page.tsx').replaceAll('\\', '/')}';import ar from '${path.join(web, 'src/messages/ar.json').replaceAll('\\', '/')}';import en from '${path.join(web, 'src/messages/en.json').replaceAll('\\', '/')}';const locale=location.pathname.split('/')[1];document.documentElement.dir=locale==='ar'?'rtl':'ltr';const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale={locale} messages={locale==='ar'?ar:en} timeZone="Africa/Cairo"><QueryClientProvider client={client}><Page/><Toaster/></QueryClientProvider></NextIntlClientProvider>);`);
await new Promise((resolve, reject) => webpack({
  mode: 'development', devtool: false, context: web,
  cache: { type: 'filesystem', cacheDirectory: path.join(output, 'webpack-cache') },
  entry: path.join(output, 'entry.tsx'), output: { path: output, filename: 'app.js', publicPath: '/' },
  resolve: { extensions: ['.tsx', '.ts', '.jsx', '.js'], modules: [path.join(web, 'node_modules'), 'node_modules'], alias: { 'next/navigation': path.join(output, 'navigation.ts'), '@/lib/api': path.join(output, 'api.ts'), '@/providers/auth-provider': path.join(output, 'auth.ts'), '@': path.join(web, 'src') } },
  module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(output, 'loader.cjs') }] },
}, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve()));
const css = await requireWeb('postcss')([requireWeb('@tailwindcss/postcss')({ base: web })]).process(await fs.readFile(path.join(web, 'src/app/globals.css'), 'utf8'), { from: path.join(web, 'src/app/globals.css') });
await write('styles.css', css.css);
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
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
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/New_York' });
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
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
  assert.deepEqual(errors, []);
  console.log('Admission periods browser acceptance passed: Arabic/English, Cairo in a US browser, retained-input conflicts, exact timestamp preservation, validation, manual defaults, bulk disable, read-only access, retry and debounced URL search.');
} finally {
  await browser?.close(); await new Promise((resolve) => server.close(resolve));
}
