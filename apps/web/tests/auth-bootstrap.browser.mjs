import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const web = path.join(root, 'apps/web');
const requireWeb = createRequire(path.join(web, 'package.json'));
const { webpack } = requireWeb('next/dist/compiled/webpack/webpack');
const { chromium } = createRequire(path.join(root, 'apps/api/package.json'))('playwright');
const output = path.join(root, 'outputs/auth-bootstrap-browser');
await fs.mkdir(output, { recursive: true });
const write = (name, value) => fs.writeFile(path.join(output, name), value);
await write('loader.cjs', `const ts=require(${JSON.stringify(requireWeb.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,esModuleInterop:true}}).outputText;`);
await write('navigation.ts', `window.authNavigations=[];const router={push:path=>window.authNavigations.push(path),replace:path=>window.authNavigations.push(path)};export const useRouter=()=>router;export const usePathname=()=>location.pathname;`);
await write('theme.ts', `const setTheme=()=>{};export const useTheme=()=>({theme:'system',setTheme});`);
await write('reauth.tsx', `export const ReauthDialog=()=>null;`);
await write('api.ts', `async function request(method,path,data,options={}){const response=await fetch('/fixture'+path,{method,signal:options.signal,headers:{'Content-Type':'application/json'},body:method==='POST'?JSON.stringify(data):undefined});const body=await response.json();if(!response.ok)throw body;return {data:body};}export default {get:(path,options)=>request('GET',path,undefined,options),post:(path,data,options)=>request('POST',path,data,options)};`);
await write('entry.tsx', `import React from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {AuthProvider,useAuth} from '@/providers/auth-provider';function View(){const auth=useAuth();const [error,setError]=React.useState('');return <main><output data-testid="loading">{String(auth.loading)}</output><output data-testid="role">{auth.user?.role??'anonymous'}</output><output data-testid="error">{error}</output><button onClick={()=>auth.login('admin',{email:'synthetic@example.test',password:'synthetic'}).catch(e=>setError(e.code??e.message))}>Login</button></main>;}createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}})}><AuthProvider locale="en"><View/></AuthProvider></QueryClientProvider>);`);
await new Promise((resolve, reject) => webpack({
  mode: 'development', devtool: false, context: web, entry: path.join(output, 'entry.tsx'),
  output: { path: output, filename: 'app.js', publicPath: '/' },
  module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(output, 'loader.cjs') }] },
  resolve: { extensions: ['.tsx', '.ts', '.js'], modules: [path.join(web, 'node_modules'), 'node_modules'], alias: {
    'next/navigation': path.join(output, 'navigation.ts'),
    '@/lib/api': path.join(output, 'api.ts'),
    '@/providers/theme-provider': path.join(output, 'theme.ts'),
    '@/components/auth/reauth-dialog': path.join(output, 'reauth.tsx'),
    '@': path.join(web, 'src'),
  } },
}, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve()));

let role = 'student';
let authenticated = false;
let storeSession = true;
const calls = [];
const account = () => ({ _id: 'synthetic-user', role, name: 'Synthetic', permissions: [], mustChangePassword: false });
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/app.js') {
    res.setHeader('Content-Type', 'application/javascript');
    return res.end(await fs.readFile(path.join(output, 'app.js')));
  }
  if (url.pathname.startsWith('/fixture/')) {
    calls.push(url.pathname);
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname.endsWith('/login')) {
      authenticated = storeSession;
      return res.end(JSON.stringify({ user: account() }));
    }
    if (url.pathname.endsWith('/me')) {
      res.statusCode = authenticated ? 200 : 401;
      return res.end(JSON.stringify(authenticated ? account() : { statusCode: 401, message: 'Unauthorized' }));
    }
    return res.end('{}');
  }
  res.setHeader('Content-Type', 'text/html');
  res.end('<!doctype html><html><body><div id="root"></div><script src="/app.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const route of ['/en', '/en/about', '/en/admission', '/en/news/article']) {
    calls.length = 0;
    await page.goto(base + route);
    await page.getByTestId('role').getByText('anonymous', { exact: true }).waitFor();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(calls.length, 0, `${route} should not bootstrap a session`);
  }
  for (role of ['admin', 'staff', 'student']) {
    authenticated = false;
    calls.length = 0;
    await page.goto(base + '/en/login/' + (role === 'student' ? 'student' : 'admin'));
    await page.waitForFunction(() => document.querySelector('[data-testid="loading"]').textContent === 'false');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await page.getByTestId('role').getByText(role, { exact: true }).waitFor();
    const target = role === 'student' ? '/en/dashboard' : '/en/admin';
    await page.waitForFunction(target => window.authNavigations.includes(target), target);
    assert.equal(calls.filter(path => path.endsWith('/login')).length, 1);
    assert.equal(calls.filter(path => path.endsWith('/me')).length, 2, 'initial probe and post-login cookie verification');
  }
  authenticated = true;
  role = 'student';
  calls.length = 0;
  await page.goto(base + '/en/complaints');
  await page.getByTestId('role').getByText('student', { exact: true }).waitFor();
  assert.equal(calls.filter(path => path.endsWith('/me')).length, 1, 'hybrid complaint form keeps authenticated submission');
  authenticated = false;
  storeSession = false;
  await page.goto(base + '/en/login/student');
  await page.waitForFunction(() => document.querySelector('[data-testid="loading"]').textContent === 'false');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.getByTestId('error').getByText('SESSION_COOKIE_NOT_STORED', { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.authNavigations), []);
  assert.deepEqual(errors, []);
  console.log('PASS real AuthProvider: no marketing probes; admin/staff/student login; hybrid complaint session; blocked-cookie rejection without protected navigation.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
