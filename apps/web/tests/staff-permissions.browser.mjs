// Real student enrollment dialog, controls and CSS; synthetic local transport only.
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
const output = path.join(root, 'outputs/staff-permissions');
await fs.mkdir(output, { recursive: true });
const local = (p) => path.join(web, p).replaceAll('\\','/');
await fs.writeFile(path.join(output,'loader.cjs'),`const ts=require(${JSON.stringify(requireWeb.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,esModuleInterop:true}}).outputText;`);
await fs.writeFile(path.join(output,'api.ts'),`async function call(method,url,body,config){const params=new URLSearchParams(config?.params??{});const response=await fetch(url+(params.size?'?'+params:''),{method,signal:config?.signal,...(body?{body:JSON.stringify(body),headers:{'content-type':'application/json'}}:{})});const data=await response.json();if(!response.ok)throw new Error(data.message);return {data};}export const getApiErrorMessage=e=>e.message;export default {get:(u,c)=>call('GET',u,null,c),post:(u,b)=>call('POST',u,b)};`);
await fs.writeFile(path.join(output,'entry.tsx'),`import React from 'react';import {createRoot} from 'react-dom/client';import {NextIntlClientProvider} from 'next-intl';import {StaffPermissionFields} from '${local('src/features/staff/components/staff-permission-fields')}';import ar from '${local('src/messages/ar.json')}';import en from '${local('src/messages/en.json')}';const locale=location.pathname.startsWith('/ar')?'ar':'en';document.documentElement.dir=locale==='ar'?'rtl':'ltr';function App(){const [value,setValue]=React.useState(['students.read']);return <NextIntlClientProvider locale={locale} messages={locale==='ar'?ar:en}><main style={{maxWidth:760,margin:'20px auto',padding:12}}><StaffPermissionFields value={value} onChange={setValue}/><output data-testid="selected">{JSON.stringify(value)}</output></main></NextIntlClientProvider>};createRoot(document.getElementById('root')).render(<App/>);`);
await new Promise((resolve,reject)=>webpack({mode:'development',devtool:false,context:web,entry:path.join(output,'entry.tsx'),output:{path:output,filename:'app.js'},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:path.join(output,'loader.cjs')}]},resolve:{extensions:['.tsx','.ts','.jsx','.js'],modules:[path.join(web,'node_modules'),'node_modules'],alias:{'@/lib/api':path.join(output,'api.ts'),'@':path.join(web,'src')}}},(error,stats)=>error||stats.hasErrors()?reject(error||new Error(stats.toString({all:false,errors:true}))):resolve()));
const css=await requireWeb('postcss')([requireWeb('@tailwindcss/postcss')({base:web})]).process(await fs.readFile(path.join(web,'src/app/globals.css'),'utf8'),{from:path.join(web,'src/app/globals.css')});
await fs.writeFile(path.join(output,'styles.css'),css.css);
const server = http.createServer(async (req, res) => {
  const filename = path.basename(new URL(req.url, 'http://localhost').pathname);
  if (/\.(js|css)$/.test(filename)) {
    res.setHeader('content-type', filename.endsWith('.js') ? 'text/javascript' : 'text/css');
    res.end(await fs.readFile(path.join(output, filename)));
  } else {
    res.setHeader('content-type', 'text/html');
    res.end('<!doctype html><html class="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"><body><div id="root"></div><script src="/app.js"></script></body></html>');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({headless:true});
try {
  for (const locale of ['ar', 'en']) {
    const messages = JSON.parse(await fs.readFile(path.join(web, `src/messages/${locale}.json`), 'utf8')).staff.permissions;
    const page = await browser.newPage({viewport:{width:1000,height:850}});
    await page.goto(`http://127.0.0.1:${server.address().port}/${locale}`);
    const search = page.getByRole('textbox', {name:messages.search});
    await search.fill('control.grades.grace');
    const grace = page.getByRole('checkbox', {name:messages.labels.control_grades_grace});
    await grace.waitFor();
    assert.equal(await page.getByRole('checkbox').count(), 1);
    await grace.click();
    assert((await page.getByTestId('selected').textContent()).includes('students.read'), 'filter must preserve hidden grants');
    assert((await page.getByTestId('selected').textContent()).includes('control.grades.grace'));
    await page.getByRole('button',{name:messages.selection,exact:true}).click();
    await page.getByRole('option',{name:messages.unselectedOnly,exact:true}).click();
    await page.getByText(messages.noMatches,{exact:true}).waitFor();
    await page.getByRole('button',{name:messages.selection,exact:true}).click();
    await page.getByRole('option',{name:messages.allPermissions,exact:true}).click();
    await search.fill('');
    await page.getByRole('button',{name:messages.section,exact:true}).click();
    await page.getByRole('option',{name:messages.groups.control,exact:true}).click();
    assert.equal(await page.getByRole('checkbox').count(),19);
    await search.fill('control.grades.grace');
    await page.screenshot({path:path.join(output,locale+'-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(output,locale+'-mobile.png'),fullPage:true});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.close();
  }
  console.log('PASS: bilingual permission search, section/assignment filters, grace grant, hidden selection preservation and mobile layout.');
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
