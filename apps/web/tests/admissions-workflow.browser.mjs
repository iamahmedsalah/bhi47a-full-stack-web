import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const web = path.join(root, 'apps/web'), output = path.join(root, 'outputs/admissions-workflow');
const requireWeb = createRequire(path.join(web, 'package.json')), requireApi = createRequire(path.join(root, 'apps/api/package.json'));
const { webpack } = requireWeb('next/dist/compiled/webpack/webpack');
const { DefinePlugin } = webpack;
const { chromium } = requireApi('playwright');
await fs.mkdir(output, { recursive: true });
const write = (name, value) => fs.writeFile(path.join(output, name), value);
const source = file => path.join(web, file).replaceAll('\\', '/');
await write('loader.cjs', `const ts=require(${JSON.stringify(requireWeb.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,esModuleInterop:true}}).outputText;`);
await write('auth.ts', `import {PERMISSIONS} from '@student-portal/shared';export const useAuth=()=>({user:location.pathname.includes('/admin/')?{_id:'100000000000000000000001',role:new URLSearchParams(location.search).get('staff')?'staff':'admin',permissions:Object.values(PERMISSIONS),mustChangePassword:false}:null});`);
await write('navigation.ts', `import {useSyncExternalStore} from 'react';const subscribe=fn=>{window.addEventListener('popstate',fn);return()=>window.removeEventListener('popstate',fn);};const router={replace:url=>{history.replaceState(null,'',url);window.dispatchEvent(new PopStateEvent('popstate'));},push:()=>{}};export const useSearchParams=()=>new URLSearchParams(useSyncExternalStore(subscribe,()=>location.search));export const useParams=()=>({locale:location.pathname.split('/')[1]});export const usePathname=()=>location.pathname;export const useRouter=()=>router;`);
await write('image.tsx', `export default function Image({priority,fill,unoptimized,...props}){return <img {...props}/>}`);
await write('script.tsx', `import {useEffect} from 'react';export default function Script({onReady}){useEffect(()=>{onReady?.();},[]);return null;}`);
await write('api.ts', `const call=async(method,url,body,config)=>{const query=new URLSearchParams(Object.entries(config?.params??{}).filter(([,value])=>value!==undefined));const response=await fetch(url+(query.size?'?'+query:''),{method,headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok)throw {...data,statusCode:response.status};return {data};};export const getApiErrorDetails=error=>({...error,message:error.message??'Fixture error'});export const getApiErrorMessage=(error,fallback)=>error.message||fallback;export default {get:(url,config)=>call('GET',url,null,config),post:(url,body,config)=>call('POST',url,body,config),patch:(url,body,config)=>call('PATCH',url,body,config),delete:(url,config)=>call('DELETE',url,config?.data,config)};`);
await write('api-client.ts', `import api from './api';export const apiGet=async(url,config)=>(await api.get(url,config)).data;export const apiPost=async(url,data,config)=>(await api.post(url,data,config)).data;export const apiPatch=async(url,data,config)=>(await api.patch(url,data,config)).data;export const apiDelete=async(url,config)=>(await api.delete(url,config)).data;`);
await write('entry.tsx', `import React from 'react';import {createRoot} from 'react-dom/client';import {NextIntlClientProvider} from 'next-intl';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {Toaster} from 'sonner';import Hub from '${source('src/app/[locale]/admin/admissions/page.tsx')}';import {PublicAdmissionPage} from '${source('src/features/admissions/public-admission-page.tsx')}';import {LanguageProvider} from '${source('src/providers/language-provider.tsx')}';import ar from '${source('src/messages/ar.json')}';import en from '${source('src/messages/en.json')}';const locale=location.pathname.split('/')[1];document.documentElement.dir=locale==='ar'?'rtl':'ltr';const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});function FixtureApp(){const [locale,setLocale]=React.useState(location.pathname.split('/')[1]);React.useEffect(()=>{const change=()=>setLocale(location.pathname.split('/')[1]);window.addEventListener('popstate',change);return()=>window.removeEventListener('popstate',change);},[]);return <NextIntlClientProvider locale={locale} messages={locale==='ar'?ar:en} timeZone="Africa/Cairo"><QueryClientProvider client={client}><LanguageProvider>{location.pathname.includes('/admin/')?<Hub/>:<PublicAdmissionPage/>}<Toaster/></LanguageProvider></QueryClientProvider></NextIntlClientProvider>;}createRoot(document.getElementById('root')).render(<FixtureApp/>);`);
await new Promise((resolve, reject) => webpack({ mode: 'development', devtool: false, context: web, cache: { type: 'filesystem', version: 'admission-language-turnstile-v2', cacheDirectory: path.join(output, 'webpack-cache') }, entry: path.join(output, 'entry.tsx'), output: { path: output, filename: 'app.js', publicPath: '/' }, resolve: { extensions: ['.tsx', '.ts', '.jsx', '.js'], modules: [path.join(web, 'node_modules'), 'node_modules'], alias: { 'next/navigation': path.join(output, 'navigation.ts'), 'next/script': path.join(output, 'script.tsx'), 'next/image': path.join(output, 'image.tsx'), '@/lib/api': path.join(output, 'api.ts'), '@/lib/api-client': path.join(output, 'api-client.ts'), '@/providers/auth-provider': path.join(output, 'auth.ts'), '@': path.join(web, 'src') } }, plugins: [new DefinePlugin({ 'process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY': JSON.stringify('synthetic-widget-key') })], module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(output, 'loader.cjs') }] } }, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve()));
const css = await requireWeb('postcss')([requireWeb('@tailwindcss/postcss')({ base: web })]).process(await fs.readFile(source('src/app/globals.css'), 'utf8'), { from: source('src/app/globals.css') });
await write('styles.css', css.css);

const id = '100000000000000000000010', periodId = '100000000000000000000020';
const reference = 'ADM-1234567890ABCDEF12345678';
let applicant, periodDeleted, accessAvailable, approvalConflict, mappingCorrected;
let holdSaved = false;
const writes = [];
const reset = () => { applicant = { _id: id, publicReference: reference, academicYear: '2026-2027', admissionPeriodId: periodId, fullName: 'Synthetic applicant', fullNameAr: 'متقدم تجريبي', address: 'عنوان تجريبي بالقاهرة', phone: '01012345678', nationalIdMasked: '300********001', guardians: [{ name: 'Synthetic guardian', phone: '01112345678', relationship: 'Parent' }], studentType: 'NEW', status: 'PENDING', revision: 0, submittedAt: '2026-11-01T08:00:00Z', history: [{ action: 'SUBMITTED', revision: 0, at: '2026-11-01T08:00:00Z' }] }; periodDeleted = false; accessAvailable = false; approvalConflict = false; mappingCorrected = false; writes.length = 0; };
const list = items => ({ items, total: items.length, totalPages: 1, page: 1, limit: 20 });
reset();
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/logo.webp') { res.setHeader('Content-Type', 'image/webp'); res.end(await fs.readFile(path.join(web, 'public/logo.webp'))); return; }
    if (url.pathname === '/app.js' || url.pathname === '/styles.css') { res.setHeader('Content-Type', url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css'); res.end(await fs.readFile(path.join(output, url.pathname.slice(1)))); return; }
    if (!url.pathname.startsWith('/admin/') && !url.pathname.startsWith('/public/')) { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html class="dark"><meta charset="utf-8"><link rel="stylesheet" href="/styles.css"><body><div id="root"></div><script src="/app.js"></script></body></html>'); return; }
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
    res.setHeader('Content-Type', 'application/json');
    const send = (value, status = 200) => { res.statusCode = status; res.end(JSON.stringify(value)); };
    if (req.method !== 'GET') writes.push({ path: url.pathname, method: req.method, body });
    if (url.pathname === '/admin/admissions/academic-years') return send({ items: ['2026-2027','2027-2028'] });
    if (url.pathname === '/admin/admissions/access') return send(list([{ _id: periodId, admissionPeriodId: periodId, academicYear: '2026-2027', label: 'Synthetic scheduled invitation', method: 'BOTH', status: 'ACTIVE', effectiveStatus: 'PERIOD_SCHEDULED', canOpen: false, expiresAt: '2099-01-01T00:00:00Z', periodOpensAt: '2098-01-01T00:00:00Z', usedCount: 0, maxRegistrations: 10 }]));
    if (url.pathname === '/public/admissions/validate') return accessAvailable ? send({ admissionSession: 'synthetic-session', academicYear: '2026-2027', name: 'Synthetic intake', nameAr: 'دفعة تجريبية' }) : send({ code: 'ADMISSION_ACCESS_UNAVAILABLE', message: 'Admission access is unavailable or has expired.' }, 400);
    if (url.pathname === '/public/admissions/requests') return send({ publicReference: reference, secret: 's'.repeat(43) });
    if (url.pathname === '/public/admissions/status') return send({ publicReference: reference, status: 'REJECTED', rejection: { reasonCode: 'CAPACITY', explanation: '' } });
    if (url.pathname === '/admin/admissions/requests') return send(list([applicant]));
    if (url.pathname === `/admin/admissions/requests/${id}`) return send(applicant);
    if (url.pathname === `/admin/admissions/requests/${id}/approve`) { if (approvalConflict) return send({ code: 'ADMISSION_CONFLICT', message: 'The request changed.' }, 409); applicant = { ...applicant, status: 'APPROVED', revision: 1, studentCode: '270101', studentId: '100000000000000000000030' }; return send(applicant); }
    if (url.pathname === '/admin/admissions/groups') return send(list([]));
    if (url.pathname === '/admin/admissions/periods') return send(list(periodDeleted ? [] : [{ _id: periodId, code: 'INTAKE27', academicYear: '2026-2027', name: 'Synthetic intake', nameAr: 'دفعة تجريبية', isEnabled: true, opensAt: '2026-10-01T00:00:00Z', closesAt: '2026-12-01T00:00:00Z', status: 'open', revision: 0 }]));
    if (url.pathname === `/admin/admissions/periods/${periodId}` && req.method === 'DELETE') { periodDeleted = true; return send({ success: true, deletedId: periodId }); }
    if (url.pathname === '/admin/students/100000000000000000000031') return send({ _id: '100000000000000000000031', studentCode: '270101', fullName: 'Synthetic student', department: 'BIS', level: '1', academicYear: '2026-2027', semester: 'first', enrollmentStatus: 'active' });
    if (url.pathname === '/admin/student-codes/mappings/preview') return send({ items: mappingCorrected ? [] : [{ academicYear: '2026-2027', currentPrefix: '26', expectedPrefix: '27', nextSequence: 101, nextCode: '270101' }], fingerprint: 'f'.repeat(64), canApply: !mappingCorrected, collision: false, truncated: false, changesExistingStudentCodes: false });
    if (url.pathname === '/admin/student-codes/mappings/correct') { mappingCorrected = true; return send({ corrected: 1, changesExistingStudentCodes: false }); }
    if (url.pathname === '/admin/student-codes/270102/hold') { holdSaved = true; return send({ studentCode: '270102', status: 'RELEASED', reuseEnabled: false }); }
    if (url.pathname === '/admin/student-codes/audit') return send({ ...list([{ studentCode: '270101', sequence: 101, status: 'ASSIGNED', reason: 'CURRENT_OWNER', currentStudentId: '100000000000000000000030', studentProfileId: '100000000000000000000031', studentName: 'Synthetic student', studentNameAr: 'Synthetic student', department: 'BIS', level: '1' }, { studentCode: '270102', sequence: 102, status: holdSaved ? 'RELEASED' : 'REQUIRES_REVIEW', reason: holdSaved ? 'PREVIOUS_OWNER_BLOCKED' : 'PREVIOUS_OWNER_MISSING' }]), academicYear: '2026-2027', yearPrefix: '27', scannedAt: '2026-11-01T08:00:00Z', fingerprint: 'f'.repeat(64), canInitialize: false, reuseEnabled: false, truncated: false, mappingConflict: false, policy: { academicYear: '2026-2027', yearPrefix: '27', nextSequence: 103, initializedAt: '2026-11-01T08:00:00Z' }, summary: { AVAILABLE: 0, RESERVED: 0, ASSIGNED: 1, RELEASED: holdSaved ? 1 : 0, REQUIRES_REVIEW: holdSaved ? 0 : 1, MISSING: 0 } });
    send({ message: 'Unknown synthetic route' }, 404);
  } catch (error) { res.statusCode = 500; res.end(JSON.stringify({ message: error.message })); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = `http://127.0.0.1:${server.address().port}`;
let browser, page;
const errors = [];
try {
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, timezoneId: 'America/New_York' });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { window.__captchaRenders = 0; window.__captchaRemovals = 0; window.turnstile = { render: (_element, options) => { window.__captcha = options; window.__captchaRenders++; return 'fixture-widget'; }, remove: () => {window.__captchaRemovals++;}, reset: () => {} }; });
  for (const locale of ['en', 'ar']) {
    reset(); const messages = JSON.parse(await fs.readFile(source(`src/messages/${locale}.json`), 'utf8')), t = messages.admissionWorkflow, p = messages.admissions;
    holdSaved = false;
    await page.goto(`${address}/${locale}/admission#access=100000000000000000000099`);
    await page.getByRole('button', { name: locale === 'en' ? 'Switch to Arabic' : 'Switch to English', exact: true }).waitFor();
    const other = locale === 'en' ? 'ar' : 'en';
    await page.getByRole('button', { name: locale === 'en' ? 'Switch to Arabic' : 'Switch to English', exact: true }).click();
    await page.waitForURL(`**/${other}/admission`);
    await page.getByRole('button', { name: other === 'en' ? 'Switch to Arabic' : 'Switch to English', exact: true }).click();
    await page.waitForURL(`**/${locale}/admission`);
    await page.getByLabel(t.fields.pin, { exact: true }).fill('123456789');
    await page.getByRole('button', { name: t.openInvitation, exact: true }).click();
    await page.getByRole('alert').filter({ hasText: t.errors.accessUnavailable }).waitFor();
    assert.equal(writes.at(-1).body.accessId, undefined, 'a manually entered PIN must not be bound to a stale QR invitation');
    assert.equal(await page.getByText('Admission access is unavailable or has expired.', { exact: true }).count(), 0);
    accessAvailable = true; await page.getByRole('button', { name: t.openInvitation, exact: true }).click();
    await page.getByLabel(t.fields.fullName, { exact: true }).fill('Synthetic applicant');
    await page.getByLabel(t.fields.address, { exact: true }).fill('عنوان تجريبي بالقاهرة');
    await page.getByLabel(t.fields.nationalId, { exact: true }).fill('30001010100001');
    const phones = page.getByLabel(t.fields.phone, { exact: true });
    await phones.nth(0).fill('01012345678'); await phones.nth(1).fill('01012345678');
    await page.getByLabel(t.fields.name, { exact: true }).fill('Synthetic guardian');
    await page.getByRole('button', { name: t.fields.relationship, exact: true }).click(); await page.getByRole('option', { name: locale === 'ar' ? 'الأب' : 'Father', exact: true }).click();
    await page.waitForFunction(() => Boolean(window.__captcha));
    await page.evaluate(() => window.__captcha.callback('synthetic-valid-token'));
    await page.getByRole('button', { name: t.submit, exact: true }).click();
    await page.getByText(t.validationMessages.guardianPhone, { exact: true }).waitFor();
    assert.equal(writes.filter(write => write.path.endsWith('/requests')).length, 0);
    await page.locator('input[name="guardians.0.phone"]').fill('01112345678');
    const removals = await page.evaluate(() => window.__captchaRemovals);
    assert.equal(await page.evaluate(() => window.__captcha.retry), 'never');
    assert.equal(await page.evaluate(() => window.__captcha['error-callback']('300010')), true);
    assert.equal(await page.evaluate(() => window.__captchaRemovals), removals, 'Cloudflare owns error handling until the user retries; callbacks must not remove its widget');
    await page.getByText(t.captcha.failed, { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: t.submit, exact: true }).isDisabled(), true);
    const renders = await page.evaluate(() => window.__captchaRenders);
    await page.getByRole('button', { name: t.retry, exact: true }).click(); await page.waitForFunction(count => window.__captchaRenders > count, renders);
    assert.equal(await page.evaluate(() => window.__captcha['error-callback']('400020')), true);
    await page.getByText(t.verificationUnavailable, { exact: true }).waitFor();
    const beforeConfigurationRetry = await page.evaluate(() => window.__captchaRenders);
    await page.getByRole('button', { name: t.retry, exact: true }).click();
    await page.waitForFunction(count => window.__captchaRenders > count, beforeConfigurationRetry);
    await page.evaluate(() => window.__captcha.callback('synthetic-fresh-token'));
    await page.getByRole('button', { name: t.submit, exact: true }).click();
    await page.getByText(t.submitted, { exact: true }).waitFor();
    const submitted = writes.find(write => write.path.endsWith('/requests')).body;
    assert.notEqual(submitted.phone, submitted.guardians[0].phone); assert.equal(submitted.studentCode, undefined);
    assert.ok(!page.url().includes('token=') && !page.url().includes('secret='));
    await page.screenshot({ path: path.join(output, `public-${locale}.png`), fullPage: true });

    await page.goto(`${address}/${locale}/admin/admissions?tab=requests`);
    await page.getByText(reference, { exact: true }).waitFor();
    const from = page.getByRole('button', { name: t.from, exact: true }), to = page.getByRole('button', { name: t.to, exact: true });
    for (const picker of [from, to]) { assert.ok((await picker.boundingBox()).width >= 195); assert.equal(await picker.locator('span').first().evaluate(element => element.scrollWidth > element.clientWidth), false); }
    await page.getByRole('button', { name: t.actions, exact: true }).click();
    assert.equal(await page.getByRole('menuitem', { name: t.cancelAdmission, exact: true }).count(), 0);
    assert.equal(await page.getByRole('menuitem', { name: t.reject, exact: true }).count(), 1);
    assert.equal(await page.getByRole('menuitem', { name: t.deleteRequest, exact: true }).count(), 1);
    await page.getByRole('menuitem', { name: t.reject, exact: true }).click();
    const rejection = page.getByRole('dialog');
    await rejection.getByRole('button', { name: t.reasonCode, exact: true }).click();
    await page.getByRole('option', { name: t.reasons.OTHER, exact: true }).click();
    await rejection.getByRole('checkbox', { name: t.confirmDecision, exact: true }).check();
    await rejection.getByRole('button', { name: t.reject, exact: true }).click();
    await rejection.getByText(t.errors.reasonRequired, { exact: true }).waitFor();
    assert.equal(writes.filter(write => write.path.endsWith('/reject')).length, 0);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: t.approve, exact: true }).click();
    const dialog = page.getByRole('dialog'), approve = dialog.getByRole('button', { name: t.approve, exact: true });
    assert.equal(await approve.isDisabled(), true); await dialog.getByRole('checkbox', { name: t.confirmApproval, exact: true }).check();
    approvalConflict = true; await approve.click(); await dialog.getByText(t.errors.changed, { exact: true }).waitFor();
    assert.equal(await dialog.getByLabel(t.fields.department, { exact: true }).inputValue(), 'GENERAL');
    approvalConflict = false; await approve.click(); await dialog.waitFor({ state: 'hidden' });
    await page.getByText('270101', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, `admin-${locale}.png`), fullPage: true });
    await page.goto(`${address}/${locale}/admin/admissions?tab=requests&staff=1`); await page.getByText(reference, { exact: true }).waitFor();
    await page.getByRole('button', { name: t.actions, exact: true }).click(); assert.equal(await page.getByRole('menuitem', { name: t.deleteRequest, exact: true }).count(), 0); await page.keyboard.press('Escape');
    await page.goto(`${address}/${locale}/admin/admissions?tab=periods&staff=1`); await page.getByText('INTAKE27', { exact: true }).waitFor(); await page.getByRole('button', { name: p.actions, exact: true }).click(); assert.equal(await page.getByRole('menuitem', { name: p.delete, exact: true }).count(), 0); await page.keyboard.press('Escape');
    await page.goto(`${address}/${locale}/admin/admissions?tab=periods`); await page.getByText('INTAKE27', { exact: true }).waitFor(); await page.getByRole('button', { name: p.actions, exact: true }).click(); await page.getByRole('menuitem', { name: p.delete, exact: true }).click(); const periodRefresh = page.waitForResponse(response => response.request().method() === 'GET' && response.url().includes('/admin/admissions/periods')); await page.getByRole('alertdialog').getByRole('button', { name: p.delete, exact: true }).click(); await periodRefresh;
    assert.equal(periodDeleted, true); assert.equal(writes.find(write => write.method === 'DELETE').body.confirmed, true);
    await page.goto(`${address}/${locale}/admin/admissions?tab=codes`); await page.getByRole('button', { name: t.mapping.preview, exact: true }).click();
    const mapping = page.getByRole('dialog'); await mapping.getByText('270101', { exact: true }).waitFor();
    await mapping.getByLabel(t.reason, { exact: true }).fill('Reviewed future code prefix correction.'); await mapping.getByRole('checkbox', { name: t.mapping.confirm, exact: true }).check(); await mapping.getByRole('button', { name: t.mapping.apply, exact: true }).click(); await mapping.waitFor({ state: 'hidden' });
    assert.equal(mappingCorrected, true); await page.getByRole('button', { name: '270101', exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, `mapping-${locale}.png`), fullPage: true });
    const codeMessages = messages.studentCodes;
    await page.getByText('Synthetic student', { exact: true }).waitFor();
    await page.getByRole('button', { name: codeMessages.actionsFor.replace('{code}', '270101'), exact: true }).click();
    await page.getByRole('menuitem', { name: codeMessages.viewAudit, exact: true }).click();
    const auditDialog = page.getByRole('dialog');
    await auditDialog.getByText('Synthetic student', { exact: true }).waitFor();
    await auditDialog.getByRole('button', { name: codeMessages.linkedStudent, exact: true }).click();
    const linkedStudent = page.getByRole('dialog');
    await linkedStudent.getByText('Synthetic student', { exact: true }).waitFor();
    await linkedStudent.getByRole('button', { name: codeMessages.close, exact: true }).first().click();
    await linkedStudent.waitFor({ state: 'hidden' });
    assert.equal(await page.getByText('100000000000000000000030', {exact:true}).count(), 0, 'internal student IDs must not appear in the audit table');
    await page.getByRole('button', {name:codeMessages.actionsFor.replace('{code}','270102'),exact:true}).click();
    await page.getByRole('menuitem', {name:codeMessages.hold,exact:true}).click();
    const hold = page.getByRole('dialog');
    await hold.getByLabel(codeMessages.fields.reason,{exact:true}).fill('Reviewed missing original student against historical records.');
    await hold.getByRole('checkbox', {name:codeMessages.confirmed,exact:true}).check();
    await hold.getByRole('button',{name:codeMessages.confirmAction,exact:true}).click(); await hold.waitFor({state:'hidden'});
    assert.equal(holdSaved,true);
    await page.goto(`${address}/${locale}/admin/admissions?tab=access`);
    await page.getByText(t.accessStatus.PERIOD_SCHEDULED,{exact:true}).waitFor();
    await page.screenshot({path:path.join(output,`access-${locale}.png`),fullPage:true});
    await page.goto(`${address}/${locale}/admin/admissions?tab=groups`);
    await page.getByRole('button',{name:t.createGroup,exact:true}).click();
    const group = page.getByRole('dialog');
    await group.getByRole('button',{name:t.fields.academicYear,exact:true}).click();
    await page.getByRole('option',{name:'2027-2028',exact:true}).click();
    await page.screenshot({path:path.join(output,`group-dialog-${locale}.png`),fullPage:true});
    await group.locator('form').getByRole('button',{name:t.close,exact:true}).click(); await group.waitFor({state:'hidden'});
    await page.goto(`${address}/${locale}/admin/admissions?tab=imports`);
    await page.getByRole('heading',{name:t.uploadWorkbook,exact:true}).waitFor();
    await page.getByRole('button',{name:t.template,exact:true}).waitFor();
    await page.getByRole('button',{name:t.preview,exact:true}).waitFor();
    await page.screenshot({path:path.join(output,`imports-${locale}.png`),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.goto(`${address}/${locale}/admin/admissions?tab=requests`); await page.getByText(reference,{exact:true}).waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth+2),'the admission page must fit a mobile viewport');
    await page.screenshot({path:path.join(output,`mobile-${locale}.png`),fullPage:true});
    await page.setViewportSize({width:1440,height:1100});
  }
  assert.deepEqual(errors, []);
  console.log('Admission workflow browser acceptance passed in Arabic and English: manual PIN independent of stale QR identity, revoked access feedback, guardian-phone validation, CAPTCHA retry, direct approval, full date placeholders, admin-only deletion, prefix correction, historical owner hold, hidden internal IDs, period availability, group-year dropdown, desktop/mobile layout.');
} catch (error) {
  if (page) { await write('failure-dom.html', await page.content()); await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }); }
  await write('runtime-errors.json', JSON.stringify(errors)); throw error;
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
