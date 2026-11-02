import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalRedirect } from '../src/lib/canonical-redirect.ts';
const target = 'https://bhi47.app';
const hosts = 'portal.169-58-108-189.sslip.io';
test('redirects only configured old hosts and preserves locale/path/query', () => {
  for (const host of hosts.split(',')) assert.equal(canonicalRedirect(`https://${host}/ar/admission?tab=status`, target, hosts), target+'/ar/admission?tab=status');
});
test('does not redirect canonical, development or unknown hosts', () => {
  for(const host of ['bhi47.app','localhost:3000','evil.test','old.vercel.app','ww.bhi47.app','169.58.108.189','www.bhi47.app']) assert.equal(canonicalRedirect(`https://${host}/ar`, target, hosts), undefined);
});
test('refuses unsafe canonical origins and cannot turn a double-slash path into an open redirect', () => {
  for(const origin of ['http://bhi47.app','https://user:password@bhi47.app','https://bhi47.app/path','not-a-url']) assert.equal(canonicalRedirect(`https://${hosts}/ar`,origin,hosts),undefined);
  const value = new URL(canonicalRedirect(`https://${hosts}//evil.test/admission`,target,hosts));
  assert.equal(value.origin,target); assert.equal(value.pathname,'//evil.test/admission');
});
test('does not inject or send QR fragments to the server', () => {
  assert.equal(new URL(canonicalRedirect(`https://${hosts}/ar/admission`,target,hosts)).hash,'');
});
