const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');

// Resolve exactly the merge implementation used by Jest's config loader.
const api = createRequire(path.resolve(__dirname, '../apps/api/package.json'));
const jest = createRequire(api.resolve('jest'));
const core = createRequire(jest.resolve('@jest/core'));
const config = createRequire(core.resolve('jest-config'));
const merge = config('deepmerge');

test('patched Jest merge never turns an own __proto__ data key into an inherited privilege', () => {
  const target = JSON.parse('{"__proto__":{"privileged":true},"nested":{"before":1}}');
  const result = merge(target, { nested: { after: 2 } });
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.equal(result.privileged, undefined);
  assert.equal({}.privileged, undefined);
  assert.deepEqual(result.nested, { before: 1, after: 2 });
  assert.equal(Object.hasOwn(result, '__proto__'), true);
});

test('prototype-shaped keys remain inert when both target and source supply them', () => {
  const target = JSON.parse('{"__proto__":{}}');
  const source = JSON.parse('{"__proto__":{"privileged":true}}');
  const result = merge(target, source);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.equal(result.privileged, undefined);
  assert.equal({}.privileged, undefined);
});

test('Jest merge retains arrays, nested globals, dates, symbols and custom array merge behavior', () => {
  const symbol = Symbol('setting');
  const date = new Date('2026-11-13T00:00:00Z');
  const target = { globals: { enabled: true }, files: ['first'], [symbol]: { first: 1 }, date };
  const source = { globals: { locale: 'ar' }, files: ['second'], [symbol]: { second: 2 } };
  const result = merge.all([target, source]);
  assert.deepEqual(result.globals, { enabled: true, locale: 'ar' });
  assert.deepEqual(result.files, ['first', 'second']);
  assert.deepEqual(result[symbol], { first: 1, second: 2 });
  assert.equal(result.date, date);
  assert.deepEqual(merge(target, source, { arrayMerge: (_before, after) => after }).files, ['second']);
  assert.deepEqual(target.files, ['first']);
});
