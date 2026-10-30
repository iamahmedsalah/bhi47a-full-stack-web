import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { cairoDateTimeToIso, toCairoDateTimeLocal } from '../src/lib/cairo-time.ts';
import { replaceImportedQuestions } from '../src/features/quizzes/import-utils.ts';

test('Cairo wall time converts summer and winter using IANA rules', () => {
  assert.equal(cairoDateTimeToIso('2026-01-15T12:00'), '2026-01-15T10:00:00.000Z');
  assert.equal(cairoDateTimeToIso('2026-07-15T12:00'), '2026-07-15T09:00:00.000Z');
  assert.equal(toCairoDateTimeLocal('2026-07-15T09:00:49Z'), '2026-07-15T12:00');
});

test('rejects DST gaps, ambiguous minutes, malformed and impossible dates', () => {
  for (const value of ['2026-04-24T00:30', '2026-10-29T23:30', '2026-02-30T12:00', '2026-01-01T24:00', '', 'invalid']) {
    assert.equal(cairoDateTimeToIso(value), undefined, value);
  }
});

test('the same entered Cairo deadline produces the same instant in foreign timezones', () => {
  const moduleUrl = new URL('../src/lib/cairo-time.ts', import.meta.url).href;
  for (const TZ of ['UTC', 'America/New_York', 'Asia/Tokyo', 'Africa/Cairo']) {
    const actual = execFileSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', `import {cairoDateTimeToIso} from ${JSON.stringify(moduleUrl)}; console.log(cairoDateTimeToIso('2026-07-15T12:00'));`], { env: { ...process.env, TZ }, encoding: 'utf8' });
    assert.equal(actual.trim(), '2026-07-15T09:00:00.000Z', TZ);
  }
});

const question = (id, text, answer = 0) => ({ id, text, type: 'mcq', options: ['A', 'B', 'C', 'D'], correctOptionIndex: answer, points: 1 });
test('repeated sheets replace questions, retain unchanged identities and update answers', () => {
  const current = [question('saved-a', 'First'), question('saved-b', 'Second')];
  const imported = [question('upload-b', 'Second', 1), question('upload-a', 'First')];
  const result = replaceImportedQuestions(current, imported);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((q) => q.id), ['saved-b', 'saved-a']);
  assert.equal(result[0].correctOptionIndex, 1);
  assert.deepEqual(replaceImportedQuestions(result, imported), result);
  assert.equal(current[1].correctOptionIndex, 0);
  assert.deepEqual(replaceImportedQuestions(current, [question('new', 'New question')]).map((q) => q.id), ['new']);
});

test('duplicate text rows do not reuse a question ID twice', () => {
  const result = replaceImportedQuestions([question('saved', 'Same')], [question('a', 'Same'), question('b', 'Same')]);
  assert.deepEqual(result.map((q) => q.id), ['saved', 'b']);
});
