/** Real export dialog, API wrapper and Blob downloader with local XLSX fixtures. */
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
const ExcelJS = requireApi('exceljs');
const { ANALYTICS_REPORT_SHEETS } = requireWeb('@student-portal/shared');
const output = path.join(root, 'outputs/analytics-export');
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, 'loader.cjs'), `const ts = require(${JSON.stringify(requireWeb.resolve('typescript'))}); module.exports = source => ts.transpileModule(source, {compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,esModuleInterop:true}}).outputText;`);
await fs.writeFile(path.join(output, 'auth.ts'), `export const useAuth=()=>({user:{_id:'fixture',role:'admin'}});`);
await fs.writeFile(path.join(output, 'navigation.ts'), `export const useRouter=()=>({push: path => location.assign(path)});`);
await fs.writeFile(path.join(output, 'api.ts'), `
export const getApiErrorMessage = (e, fallback) => e.message || fallback;
export default {get:async (url, options) => {
  const query = new URLSearchParams();
  for(const [key,value] of Object.entries(options?.params ?? {})) if(value !== undefined) query.set(key,String(value));
  const response = await fetch(url+'?'+query);
  if(!response.ok) throw await response.json();
  return options?.responseType === 'blob' ? response.blob() : {data: await response.json()}; // Match binary vs JSON API response shapes.
}, patch:async (url, dto) => {
  const response = await fetch(url,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(dto)});
  if(!response.ok) throw await response.json();
  return {data:await response.json()};
}};`);
await fs.writeFile(path.join(output, 'entry.tsx'), `
import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
import {NextIntlClientProvider} from 'next-intl';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {DeferredAnalyticsSummary} from '${path.join(web, 'src/features/analytics/components/deferred-analytics-summary.tsx').replaceAll('\\', '/')}';
import ar from '${path.join(web, 'src/messages/ar.json').replaceAll('\\', '/')}';
import en from '${path.join(web, 'src/messages/en.json').replaceAll('\\', '/')}';
import {AnalyticsExportModal} from '${path.join(web, 'src/features/analytics/components/analytics-export-modal.tsx').replaceAll('\\', '/')}';
import {ControlDashboardAnalytics} from '${path.join(web, 'src/features/control/components/control-dashboard-analytics.tsx').replaceAll('\\', '/')}';
import {StudentLoginShortcut} from '${path.join(web, 'src/components/dashboard/quick-actions.tsx').replaceAll('\\', '/')}';
const locale = new URLSearchParams(location.search).get('locale') || 'en';
document.documentElement.dir = locale === 'ar' ? 'rtl':'ltr';
const client=new QueryClient();
function App(){const [open,setOpen]=useState(true);if(location.search.includes('performance'))return <><div style={{height:2500}}>Dashboard above fold</div><div id="advanced-performance"><DeferredAnalyticsSummary isAr={false}/></div></>;if(location.search.includes('control'))return <ControlDashboardAnalytics/>;if(location.search.includes('maintenance'))return <StudentLoginShortcut locale={locale}/>;return <><button id="reopen" onClick={()=>setOpen(true)}>Open export</button><AnalyticsExportModal open={open} onOpenChange={setOpen} locale={locale}/></>}
createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><NextIntlClientProvider locale={locale} messages={locale === 'ar' ? ar:en} timeZone="Africa/Cairo"><App/></NextIntlClientProvider></QueryClientProvider>);`);
await new Promise((resolve, reject) => webpack({
  mode:'development', devtool:false, target:'web', entry:path.join(output, 'entry.tsx'),
  output:{path:output,filename:'bundle.js',publicPath:'/'},
  resolve:{extensions:['.tsx','.ts','.jsx','.js'],modules:[path.join(web,'node_modules'),'node_modules'],alias:{'next/navigation':path.join(output,'navigation.ts'),'@/lib/api':path.join(output,'api.ts'),'@/providers/auth-provider':path.join(output,'auth.ts'),'@':path.join(web,'src')}},
  module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:path.join(output,'loader.cjs')}]},
},(error,stats)=>error || stats.hasErrors() ? reject(error || new Error(stats.toString({all:false,errors:true}))) : resolve()));
const css = await requireWeb('postcss')([requireWeb('@tailwindcss/postcss')({base:web})]).process(await fs.readFile(path.join(web,'src/app/globals.css'),'utf8'),{from:path.join(web,'src/app/globals.css')});
await fs.writeFile(path.join(output,'styles.css'),css.css);
const requests = [];
const controlRequests = [];
const maintenanceWrites = [];
let portalSettings = { registrationVisible: true, syllabiVisible: true, studentLoginMaintenance: false };
let failNext = false;
let overviewRequests = 0;
let hold = false;
let release;
const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url,'http://localhost');
    if (url.pathname === '/admin/portal-settings') {
      if (req.method === 'PATCH') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const patch = JSON.parse(body);
        maintenanceWrites.push(patch);
        portalSettings = { ...portalSettings, ...patch };
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(portalSettings));
      return;
    }
    if (url.pathname === '/admin/academic-years/options') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ items: ['2027-2028', '2026-2027', '2025-2026'], currentYear: '2026-2027', currentSemester: 'first' }));
      return;
    }
    if (url.pathname === '/admin/control/dashboard') {
      const term = Object.fromEntries(url.searchParams);
      controlRequests.push(term);
      const exam = (passed, total, published, bannedCount = 0) => ({
        published,
        passRate: { passed, total, presentCount: total - bannedCount, bannedCount, threshold: 18 },
      });
      const items = term.semester === 'first' ? [
        { courseId: 'one', code: 'A01', name: 'Alpha', level: '1', rosterCount: 2, recorded: 3, results: 0, exams: { midterm: exam(1, 1, true), final: exam(0, 0, false) } },
        { courseId: 'two', code: 'A02', name: 'Beta', level: '2', rosterCount: 8, recorded: 21, results: 2, exams: { midterm: exam(4, 7, false, 1), final: exam(1, 2, true) } },
        { courseId: 'three', code: 'A03', name: 'Gamma', level: '2', rosterCount: 3, recorded: 3, results: 0, exams: { midterm: exam(0, 0, false), final: exam(0, 3, false) } },
      ] : [];
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ items }));
      return;
    }
    if(url.pathname === '/admin/analytics/overview') { overviewRequests++; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({kpis:{totalQuizzes:0,publishedQuizzes:0,activeQuizzes:0,avgQuizParticipationRate:0,avgQuizPassRate:0,totalCourses:0,activeCourses:0},staffPerformance:[],coursePerformance:[]}));return;}
    if(url.pathname === '/admin/analytics/report/export') {
      const query = Object.fromEntries(url.searchParams); requests.push(query);
      if(hold) await new Promise(resolve => { release=resolve; });
      if(failNext) {failNext=false;res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'Synthetic export failure'}));return;}
      const keys=query.sheets ? query.sheets.split(',') : ANALYTICS_REPORT_SHEETS.filter(key=>key !== 'submissions' || query.includeSubmissions === 'true');
      const workbook=new ExcelJS.Workbook();
      for(const key of keys){const sheet=workbook.addWorksheet(key,{views:[{rightToLeft:query.locale === 'ar'}]});sheet.addRow(['Synthetic header']);}
      res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.end(await workbook.xlsx.writeBuffer()); return;
    }
    const asset=/^\/[\w.-]+\.js$/.test(url.pathname) || url.pathname === '/styles.css' ? path.join(output,url.pathname.slice(1)) : url.pathname.startsWith('/fonts/') ? path.join(web,'public',url.pathname) : null;
    if(asset){res.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript':url.pathname.endsWith('.css')?'text/css':'font/woff2');res.end(await fs.readFile(asset));return;}
    res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html class="dark"><head><meta charset="utf-8"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
  } catch(error){res.statusCode=500;res.end(String(error));}
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
let browser;
try {
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1050}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue():route.abort());
  const base=`http://127.0.0.1:${server.address().port}`;
  await page.goto(base+'/?performance=1');
  await page.locator('#advanced-performance').waitFor();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(overviewRequests,0,'Below-fold analytics must not fetch during initial dashboard rendering');
  await page.locator('#advanced-performance').scrollIntoViewIfNeeded();
  await page.getByText('Quizzes, Faculty Performance & Course Pass Rates',{exact:true}).waitFor();
  assert.equal(overviewRequests,1,'Analytics fetch once when their section approaches the viewport');
  const select=async(label,option)=>{try {await page.getByRole('combobox',{name:label,exact:true}).click({timeout:10000});await page.getByRole('option',{name:option,exact:true}).click();}catch(error){await page.screenshot({path:path.join(output,'failure.png')});await fs.writeFile(path.join(output,'failure.html'),await page.content());console.error('Selectors:',await page.locator('[role=combobox]').evaluateAll(items=>items.map(item=>item.outerHTML)),errors);throw error;}};
  const download=async(label)=>{
    const [file]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:label,exact:true}).click()]);
    assert.match(file.suggestedFilename(),/\.xlsx$/);
    const workbook=new ExcelJS.Workbook();await workbook.xlsx.readFile(await file.path());
    await page.getByRole('dialog').waitFor({state:'hidden'});return workbook;
  };
  const reopen=async()=>{await page.locator('#reopen').click();await page.getByRole('dialog').waitFor();await page.getByRole('dialog').evaluate(element=>Promise.all(element.getAnimations().map(animation=>animation.finished)));};
  for(const locale of ['en','ar']) {
    const m=JSON.parse(await fs.readFile(path.join(web,'src/messages',`${locale}.json`),'utf8')).analyticsExport;
    await page.goto(`${base}/?locale=${locale}`);
    const dialog=page.getByRole('dialog');await dialog.waitFor();
    assert.equal(await dialog.getAttribute('dir'),locale === 'ar'?'rtl':'ltr');
    assert.equal(await page.getByRole('combobox',{name:m.department,exact:true}).count(),0);
    const full=await download(m.downloadAll);assert.equal(full.worksheets.length,11);assert.equal(requests.at(-1).sheets,undefined);
    await reopen();await select(m.mode,m.selected);
    await page.getByRole('checkbox',{name:m.sheets.quizzes,exact:true}).uncheck();
    assert.equal(await page.getByRole('button',{name:m.downloadSelected,exact:true}).isDisabled(),true);
    await page.getByText(m.selectAtLeastOne,{exact:true}).waitFor();
    await page.getByRole('checkbox',{name:m.sheets.students,exact:true}).check();
    await select(m.level,m.levelValue.replace('{level}','3'));
    await select(m.department,locale === 'ar'?'المحاسبة والمراجعة':'Accounting and Auditing');
    await page.getByRole('button',{name:m.academicYear,exact:true}).click();
    await page.getByRole('option',{name:'2027-2028',exact:true}).click();
    await select(m.semester,m.semesters.first);
    await page.screenshot({path:path.join(output,`${locale}-selected.png`)});
    const single=await download(m.downloadSelected);assert.deepEqual(single.worksheets.map(sheet=>sheet.name),['students']);
    assert.deepEqual(requests.at(-1),{locale,includeSubmissions:'false',sheets:'students',academicYear:'2027-2028',level:'3',department:'ACCOUNTING',semester:'first'});
    await reopen();await select(m.level,m.levelValue.replace('{level}','4'));
    assert.match(await page.getByRole('combobox',{name:m.department,exact:true}).innerText(),locale === 'ar'?/المحاسبة/:/Accounting/);
    await select(m.level,m.levelValue.replace('{level}','2'));assert.equal(await page.getByRole('combobox',{name:m.department,exact:true}).count(),0);
    await page.getByRole('checkbox',{name:m.sheets.enrollment,exact:true}).check();
    const partial=await download(m.downloadSelected);assert.equal(partial.worksheets.length,2);assert.equal(requests.at(-1).department,'GENERAL');
    await reopen();await select(m.level,m.levelValue.replace('{level}','3'));
    assert.equal(await page.getByRole('combobox',{name:m.department,exact:true}).innerText(),m.allDepartments);
    failNext=true;await page.getByRole('button',{name:m.downloadSelected,exact:true}).click();
    await page.getByRole('alert').getByText('Synthetic export failure',{exact:true}).waitFor();
    await download(m.downloadSelected);await reopen();
    hold=true;const before=requests.length;
    const pending=page.waitForEvent('download');
    await page.evaluate(label=>{const button=[...document.querySelectorAll('button')].find(item=>item.textContent.trim()===label);button.click();button.click();},m.downloadSelected);
    await page.getByRole('button',{name:m.working,exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:m.working,exact:true}).isDisabled(),true);
    await dialog.press('Escape');assert.equal(await dialog.isVisible(),true);
    await page.waitForFunction(()=>document.querySelector('[role=dialog]'));
    for(let attempt=0;!release && attempt<50;attempt++) await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(requests.length,before+1);assert.ok(release);hold=false;release();release=undefined;
    await pending;await dialog.waitFor({state:'hidden'});await reopen();
    for(const width of [290,390]) {
      await page.setViewportSize({width,height:900});
      await dialog.evaluate(async element=>{element.getBoundingClientRect();await Promise.all(element.getAnimations().map(animation=>animation.finished));});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth && document.querySelector('[role=dialog]').scrollWidth<=document.querySelector('[role=dialog]').clientWidth),true);
      await dialog.evaluate(element=>{element.scrollTop=0;});
      const box=await dialog.boundingBox();
      if(box.y<0 || box.y+box.height>900){console.error('Mobile dialog bounds',locale,width,box,await dialog.evaluate(element=>({maxHeight:getComputedStyle(element).maxHeight,height:getComputedStyle(element).height,translate:getComputedStyle(element).translate,transform:getComputedStyle(element).transform,top:getComputedStyle(element).top,overflow:getComputedStyle(element).overflowY,scrollHeight:element.scrollHeight,clientHeight:element.clientHeight,viewport:innerHeight})));await page.screenshot({path:path.join(output,'mobile-failure.png')});}
      assert.ok(box.y>=0 && box.y+box.height<=900, `${locale} dialog fits the mobile viewport`);
      await page.screenshot({path:path.join(output,`${locale}-${width}.png`)});
      await page.getByRole('button',{name:m.downloadSelected,exact:true}).scrollIntoViewIfNeeded();
      assert.equal(await page.getByRole('button',{name:m.downloadSelected,exact:true}).isVisible(),true);
      const footer=await page.getByRole('button',{name:m.downloadSelected,exact:true}).boundingBox();assert.ok(footer.y>=0 && footer.y+footer.height<=900, 'Download action remains within the viewport after scrolling');
    }
    await page.setViewportSize({width:1440,height:1050});
  }
  for (const locale of ['en', 'ar']) {
    const { controlDashboard: t } = JSON.parse(await fs.readFile(path.join(web, 'src/messages', `${locale}.json`), 'utf8'));
    await page.goto(`${base}/?control=1&locale=${locale}`);
    const section = page.locator('#control-analytics');
    const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 });
    const number = new Intl.NumberFormat(locale);
    const chart = (title, exam) => section.locator('figure').filter({
      has: page.getByRole('heading', { name: title.replace('{exam}', exam), exact: true }),
    });
    const outcomes = (exam) => chart(t.outcomesChart, exam);
    const checkOutcome = async (exam, group, count, total) => {
      const item = outcomes(exam).getByText(t.outcomes[group], { exact: true }).locator('..');
      await item.getByText(number.format(count), { exact: true }).waitFor();
      await item.getByText(percent.format(count / total), { exact: true }).waitFor();
    };
    await checkOutcome(t.exams.midterm, 'passed', 5, 8);
    await checkOutcome(t.exams.midterm, 'belowThreshold', 2, 8);
    await checkOutcome(t.exams.midterm, 'banned', 1, 8);
    assert.deepEqual(controlRequests.at(-1), { academicYear: '2026-2027', semester: 'first' });
    const row = section.getByRole('row').filter({ hasText: 'Gamma' });
    const beta = section.getByRole('row').filter({ hasText: 'Beta' });
    await beta.getByText(t.notPublished, { exact: true }).waitFor();
    await section.getByRole('row').filter({ hasText: 'Alpha' }).getByText(t.published, { exact: true }).waitFor();
    await row.getByText(t.notPublished, { exact: true }).waitFor();
    assert.equal(await section.locator('figure svg.recharts-surface').count(), 3);
    assert.deepEqual(await section.getByRole('columnheader').allTextContents(), [t.course, t.registered, t.gradeRecords, t.publicationStatus]);
    await section.locator('figure svg').getByText('A01 · Alpha', { exact: true }).first().waitFor();
    const search = section.getByRole('searchbox', { name: t.searchCourses, exact: true });
    await search.fill('a03');
    assert.equal(await section.getByRole('row').count(), 2);
    await row.waitFor();
    await search.clear();
    await page.screenshot({ path: path.join(output, `control-${locale}.png`), fullPage: true });
    await page.setViewportSize({ width: 360, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.setViewportSize({ width: 1440, height: 1050 });
    const levelFilter = section.getByRole('button', { name: t.levelFilter, exact: true });
    await levelFilter.click();
    await page.getByRole('option', { name: t.courseLevel.replace('{level}', '2'), exact: true }).click();
    await section.getByRole('row').filter({ hasText: 'Alpha' }).waitFor({ state: 'hidden' });
    await section.locator('figure svg').getByText('A01 · Alpha', { exact: true }).first().waitFor({ state: 'hidden' });
    await section.locator('figure svg').getByText('A02 · Beta', { exact: true }).first().waitFor();
    await checkOutcome(t.exams.midterm, 'passed', 4, 7);
    assert.equal(await section.getByRole('row').count(), 3);
    await search.fill('A03');
    await row.waitFor();
    assert.equal(await section.getByRole('row').count(), 2);
    await search.clear();
    await levelFilter.click();
    await page.getByRole('option', { name: t.courseLevel.replace('{level}', '3'), exact: true }).click();
    await section.getByText(t.noLevelCourses, { exact: true }).waitFor();
    await levelFilter.click();
    await page.getByRole('option', { name: t.allLevels, exact: true }).click();
    await section.getByRole('row').filter({ hasText: 'Alpha' }).waitFor();
    const componentFilter = (exam) => chart(t.ratesChart, exam).getByRole('button', { name: t.component, exact: true });
    await componentFilter(t.exams.midterm).click();
    await page.getByRole('option', { name: t.exams.final, exact: true }).click();
    await beta.getByText(t.published, { exact: true }).waitFor();
    await chart(t.ratesChart, t.exams.final).locator('svg').getByText('A03 · Gamma', { exact: true }).waitFor();
    await checkOutcome(t.exams.final, 'passed', 1, 5);
    await checkOutcome(t.exams.final, 'belowThreshold', 4, 5);
    await checkOutcome(t.exams.final, 'banned', 0, 5);
    await componentFilter(t.exams.final).click();
    await page.getByRole('option', { name: t.exams.midterm, exact: true }).click();
    for (const [label, value] of [[t.passRateFilter, t.bands.atLeast75], [t.passRateFilter, t.bands.unpublished], [t.semester, t.semesters.second]]) {
      await section.getByRole('button', { name: label, exact: true }).click();
      await page.getByRole('option', { name: value, exact: true }).click();
      if (value === t.bands.atLeast75) {
        assert.equal(await section.getByRole('row').count(), 2);
        await section.getByText('Alpha', { exact: false }).last().waitFor();
      } else if (value === t.bands.unpublished) {
        await row.waitFor();
        await checkOutcome(t.exams.midterm, 'passed', 4, 7);
        await section.getByRole('row').filter({ hasText: 'Alpha' }).waitFor({state:'hidden'});
      } else {
        await section.getByText(t.noMatches, { exact: true }).waitFor();
        await componentFilter(t.exams.midterm).click();
        await page.getByRole('option', { name: t.exams.final, exact: true }).click();
        await outcomes(t.exams.final).getByText(t.noResults, { exact: true }).waitFor();
      }
    }
    assert.deepEqual(controlRequests.at(-1), { academicYear: '2026-2027', semester: 'second' });
  }
  for (const locale of ['en', 'ar']) {
    const { adminShortcuts: t } = JSON.parse(await fs.readFile(path.join(web, 'src/messages', `${locale}.json`), 'utf8'));
    const start = maintenanceWrites.length;
    await page.goto(`${base}/?maintenance=1&locale=${locale}`);
    await page.getByText(t.loginOpen, { exact: true }).waitFor();
    const tile = page.getByRole('button').filter({ hasText: t.studentLogin });
    const confirmation = page.getByRole('alertdialog');
    await tile.click();
    await confirmation.getByRole('button', { name: t.cancel, exact: true }).click();
    await confirmation.waitFor({ state: 'hidden' });
    assert.equal(maintenanceWrites.length, start);
    await tile.click();
    await confirmation.getByRole('button', { name: t.closeLogin, exact: true }).click();
    await page.getByText(t.maintenanceActive, { exact: true }).waitFor();
    assert.deepEqual(maintenanceWrites.at(-1), { studentLoginMaintenance: true });
    await tile.click();
    await confirmation.getByRole('button', { name: t.openLogin, exact: true }).click();
    await page.getByText(t.loginOpen, { exact: true }).waitFor();
    assert.deepEqual(maintenanceWrites.at(-1), { studentLoginMaintenance: false, studentLoginMaintenanceEta: null, studentLoginMaintenanceMessage: null });
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: deferred quiz analytics, Arabic/English Control filters and outcome charts, exam pass rates before publication, separate publication status, analytics XLSX exports, and confirmed student sign-in maintenance.');
} finally {if(release)release();await browser?.close();await new Promise(resolve=>server.close(resolve));}
