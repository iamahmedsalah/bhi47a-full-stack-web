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
const output = path.join(root, 'outputs/attendance-check-in');
await fs.mkdir(output, { recursive: true });
const write = (name, content) => fs.writeFile(path.join(output, name), content);
await write('loader.cjs', `const ts=require(${JSON.stringify(requireWeb.resolve('typescript'))}); module.exports=source=>ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,esModuleInterop:true}}).outputText;`);
await write('api.ts', `export const attendanceApi={checkIn:body=>{window.checkInCalls.push(body);return new Promise((resolve,reject)=>{window.resolveCheckIn=resolve;window.rejectCheckIn=reject;});}};`);
await write('device.ts', `export const getDeviceIdentity=()=>new Promise(resolve=>{window.resolveDevice=()=>resolve({deviceId:'synthetic-device',deviceFingerprint:'synthetic-fingerprint',deviceInfo:'Test phone'});});`);
await write('entry.tsx', `
import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{StudentQrScannerDialog}from'${path.join(web, 'src/features/attendance/components/student-qr-scanner-dialog.tsx').replaceAll('\\', '/')}';
window.checkInCalls=[];window.geoWatches=new Map();let nextWatch=0;
Object.defineProperty(navigator,'geolocation',{value:{watchPosition:success=>{const id=++nextWatch;window.geoWatches.set(id,success);return id;},clearWatch:id=>window.geoWatches.delete(id)}});
const locale=new URLSearchParams(location.search).get('locale')||'ar';document.documentElement.dir=locale==='ar'?'rtl':'ltr';
function App(){const[open,setOpen]=useState(true);return <><button id="reopen" onClick={()=>setOpen(true)}>Open</button><StudentQrScannerDialog open={open} onOpenChange={setOpen} locale={locale}/></>}
createRoot(document.getElementById('root')).render(<App/>);`);
await new Promise((resolve, reject) => webpack({
  mode: 'development', devtool: false, target: 'web', entry: path.join(output, 'entry.tsx'),
  output: { path: output, filename: 'bundle.js', publicPath: '/' },
  resolve: { extensions: ['.tsx', '.ts', '.js'], modules: [path.join(web, 'node_modules'), 'node_modules'], alias: {
    '../api/attendance-api': path.join(output, 'api.ts'),
    '@/lib/device-id': path.join(output, 'device.ts'), '@': path.join(web, 'src'),
  } },
  module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(output, 'loader.cjs') }] },
}, (error, stats) => error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve()));
const css = await requireWeb('postcss')([requireWeb('@tailwindcss/postcss')({ base: web })]).process(await fs.readFile(path.join(web, 'src/app/globals.css'), 'utf8'), { from: path.join(web, 'src/app/globals.css') });
await write('styles.css', css.css);
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const asset = /^\/[\w.-]+\.(?:js|css)$/.test(url.pathname) ? path.join(output, url.pathname.slice(1))
      : url.pathname.startsWith('/fonts/') ? path.join(web, 'public', url.pathname) : null;
    if (asset) {
      res.setHeader('Content-Type', url.pathname.endsWith('.js') ? 'text/javascript' : url.pathname.endsWith('.css') ? 'text/css' : 'font/ttf');
      res.end(await fs.readFile(asset)); return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><html class="dark"><head><meta charset="utf-8"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
  } catch (error) { res.statusCode = 500; res.end(String(error)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  const base = `http://127.0.0.1:${server.address().port}`;
  const screenshot = async (name) => {
    await page.evaluate(async () => {
      await document.fonts.ready;
      // Let exit/enter animations finish while leaving the spinner running.
      for (let pass = 0; pass < 3; pass++) {
        await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }
    });
    await page.screenshot({ path: path.join(output, name) });
  };
  const result = { status: 'present', courseCode: 'CS101', sessionType: 'lecture', checkedInAt: new Date().toISOString(), message: 'Attendance recorded' };
  for (const locale of ['ar', 'en']) {
    const ar = locale === 'ar';
    await page.goto(`${base}/?locale=${locale}`);
    await page.getByRole('button', { name: ar ? 'إدخال الرمز يدوياً' : 'Enter Code', exact: true }).click();
    const submit = () => page.getByRole('button', { name: ar ? 'توثيق الحضور الآن' : 'Verify & Record Attendance', exact: true }).click();
    const preparing = ar ? 'تجهيز الجهاز' : 'Preparing device';
    const locating = ar ? 'تحديد الموقع' : 'Getting location';
    const verifying = ar ? 'التحقق وتسجيل الحضور' : 'Verifying attendance';
    await page.getByPlaceholder('ABC123-456789').fill('ABC123-456789');
    await submit();
    await page.getByRole('heading', { name: preparing, exact: true }).waitFor();
    assert.equal(await page.locator('input').count(), 0, 'Input and duplicate submit actions are hidden while checking');
    assert.equal(await page.evaluate(() => window.checkInCalls.length), 0);
    await page.evaluate(() => window.resolveDevice());
    await page.getByRole('heading', { name: locating, exact: true }).waitFor();
    await page.evaluate(() => { for (const callback of window.geoWatches.values()) callback({ timestamp: Date.now(), coords: { latitude: 30, longitude: 31, accuracy: 10 } }); });
    await page.getByRole('heading', { name: verifying, exact: true }).waitFor();
    await screenshot(`verifying-${locale}.png`);
    assert.equal(await page.evaluate(() => window.checkInCalls.length), 1);
    assert.equal(await page.evaluate(() => window.checkInCalls[0].accuracy), 10);
    await page.evaluate(value => window.resolveCheckIn(value), result);
    await page.getByRole('button', { name: ar ? 'تم بنجاح وإغلاق' : 'Done & Close', exact: true }).waitFor();
    await screenshot(`success-${locale}.png`);
    await page.getByRole('button', { name: ar ? 'تسجيل جلسة أخرى' : 'Check In Another', exact: true }).click();
    await page.getByRole('button', { name: ar ? 'إدخال الرمز يدوياً' : 'Enter Code', exact: true }).click();
    await submit(); await page.evaluate(() => window.resolveDevice());
    await page.getByRole('heading', { name: locating, exact: true }).waitFor();
    await page.evaluate(() => { for (const callback of window.geoWatches.values()) callback({ timestamp: Date.now(), coords: { latitude: 30, longitude: 31, accuracy: 10 } }); });
    await page.getByRole('heading', { name: verifying, exact: true }).waitFor();
    await page.evaluate(() => window.rejectCheckIn({ message: 'The student is not enrolled in this course' }));
    await page.getByRole('heading', { name: ar ? 'لم يتم تسجيل الحضور' : 'Attendance was not recorded', exact: true }).waitFor();
    await screenshot(`rejected-${locale}.png`);
    await page.getByRole('button', { name: ar ? 'إعادة المحاولة' : 'Try again', exact: true }).click();
    await submit(); await page.evaluate(() => window.resolveDevice());
    await page.getByRole('heading', { name: locating, exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.geoWatches.size), 0, 'Closing stops GPS');
    assert.equal(await page.evaluate(() => window.checkInCalls.length), 2, 'Closing before location completes prevents another request');
    await page.locator('#reopen').click();
    await page.getByRole('dialog').waitFor();
    assert.equal(await page.getByRole('heading', { name: locating, exact: true }).count(), 0, 'Reopening clears the prior attempt');
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${base}/?locale=en`);
  await page.getByRole('button', { name: 'Enter Code', exact: true }).click();
  await page.getByPlaceholder('ABC123-456789').fill('ABC123-456789');
  await page.getByRole('button', { name: 'Verify & Record Attendance', exact: true }).click();
  await page.getByRole('heading', { name: 'Preparing device', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: Arabic/English mobile progress, success, rejection, retry, GPS cleanup, single submission and reduced motion');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
