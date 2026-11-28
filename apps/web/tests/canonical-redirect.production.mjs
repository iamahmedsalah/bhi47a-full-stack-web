import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const probe = http.createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const child = spawn(process.execPath, [path.join(web,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)], {
  cwd:web, stdio:['ignore','pipe','pipe'], env:{...process.env,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',CANONICAL_WEB_ORIGIN:'https://bhi47.app',LEGACY_WEB_HOSTS:'portal.169-58-108-189.sslip.io'},
});
let startupOutput = '';
for (const stream of [child.stdout, child.stderr]) {
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => { startupOutput = (startupOutput + chunk).slice(-4000); });
}
const request = (host, pathname='/ar/admission?tab=status') => new Promise((resolve,reject) => {
  const req=http.get({hostname:'127.0.0.1',port,path:pathname,headers:{Host:host}}, res=>{res.resume();resolve(res);});
  req.setTimeout(30000,()=>req.destroy(new Error(`Local production response timed out for ${host}${pathname}`)));req.on('error',reject);
});
try {
  const deadline = Date.now() + 120_000;
  while (true) {
    try {
      await request(`127.0.0.1:${port}`, '/ar');
      break;
    } catch (error) {
      if (child.exitCode !== null || Date.now() > deadline) {
        throw new Error(`Local production web server did not become ready\n${startupOutput}`, { cause: error });
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  for(const host of ['portal.169-58-108-189.sslip.io']){
    const res=await request(host);assert.equal(res.statusCode,308,`Expected redirect for ${host}: ${JSON.stringify(res.headers)}`);assert.equal(res.headers.location,'https://bhi47.app/ar/admission?tab=status');
  }
  const canonical=await request('bhi47.app');assert.equal(canonical.statusCode,200);assert.equal(canonical.headers.location,undefined);
  const local=await request(`127.0.0.1:${port}`);assert.equal(local.statusCode,200);
  for(const host of ['old.vercel.app','ww.bhi47.app','169.58.108.189','www.bhi47.app']) {
    const res=await request(host);assert.equal(res.statusCode,200,`Unexpected application redirect for ${host}`);
  }
  console.log('Production proxy passed: only the old portal redirects with preserved path/query; other hosts do not redirect in the application. Nginx handles www canonicalization.');
} finally {child.kill('SIGTERM');}
