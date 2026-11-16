import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

// Execute the real source as explicit ESM without changing the app's package type.
const source = await readFile(
  new URL('../src/lib/session-presentation.ts', import.meta.url),
  'utf8',
);
const ts = createRequire(import.meta.url)('typescript');
const code = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { formatLoginDateTime, formatInternetProvider, reportedNetworkType } =
  await import(
    `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  );

test('old logout sentinels and invalid login timestamps display unavailable', () => {
  for (const date of [undefined, null, '', 'invalid', '1970-01-01T00:00:00.000Z']) {
    assert.equal(formatLoginDateTime(date, 'ar', 'غير متاح'), 'غير متاح');
    assert.equal(formatLoginDateTime(date, 'en', 'Unavailable'), 'Unavailable');
  }
});
test('login dates use Cairo time across browser time zones and midnight', () => {
  const date = '2026-11-02T23:30:00Z';
  for (const locale of ['ar', 'en']) {
    const expected = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
      timeZone: 'Africa/Cairo', dateStyle: 'medium', timeStyle: 'short',
    }).format(new Date(date));
    assert.equal(formatLoginDateTime(date, locale, 'Unavailable'), expected);
  }
  assert.match(formatLoginDateTime(date, 'en', 'Unavailable'), /3 Nov 2026, 01:30/);
});
test('only physical transport reports identify Wi-Fi, cellular or Ethernet', () => {
  for (const type of ['wifi', 'cellular', 'ethernet']) {
    assert.equal(reportedNetworkType({ connection: { type } }), type);
  }
  assert.equal(reportedNetworkType({ webkitConnection: { type: 'ethernet' } }), 'ethernet');
  assert.equal(reportedNetworkType({ connection: { effectiveType: '4g' } }), undefined);
  assert.equal(reportedNetworkType({ connection: { type: '4g' } }), undefined);
  assert.equal(reportedNetworkType({}), undefined);
});
test('Egyptian provider brands retain the actual lookup name without guessing the connection type', () => {
  for (const [isp, brand] of [['TE Data', 'WE'], ['Telecom Egypt', 'WE'], ['Vodafone Egypt', 'Vodafone'], ['Etisalat Misr', 'e& / Etisalat'], ['Link Dot Net', 'Orange']]) {
    assert.equal(formatInternetProvider(isp, 'EG'), `${brand} · ${isp}`);
  }
  assert.equal(formatInternetProvider('Unknown operator', 'EG'), 'Unknown operator');
  assert.equal(formatInternetProvider('Vodafone UK', 'GB'), 'Vodafone UK');
  assert.equal(formatInternetProvider(undefined, 'EG'), undefined);
});
