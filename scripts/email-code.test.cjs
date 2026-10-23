const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const source = readFileSync(`${__dirname}/../apps/web/public/email-code.js`, 'utf8');

function open(hash, writeText) {
  const nodes = Object.fromEntries(['code', 'copy', 'status', 'title', 'description', 'notice'].map(id => [id, {
    value: '', disabled: id === 'copy', handlers: {},
    setAttribute() {}, addEventListener(event, callback) { this.handlers[event] = callback; },
    focus() {}, select() { this.selected = true; },
  }]));
  const history = [];
  const window = { location: { hash, pathname: '/email-code.html' }, history: { replaceState(...args) { history.push(args); } }, addEventListener(event, callback) { this[event] = callback; } };
  const document = { documentElement: {}, getElementById: id => nodes[id] };
  vm.runInNewContext(source, { window, document, navigator: { clipboard: { writeText } }, URLSearchParams });
  return { nodes, document, window, history };
}

test('English copier removes fragment, preserves leading zeros and copies only after a click', async () => {
  const copied = [];
  const page = open('#lang=en&code=012345', async value => copied.push(value));
  assert.deepEqual(page.history[0], [null, '', '/email-code.html']);
  assert.equal(page.document.documentElement.lang, 'en');
  assert.equal(page.nodes.code.value, '012345');
  assert.deepEqual(copied, []);
  await page.nodes.copy.handlers.click();
  assert.deepEqual(copied, ['012345']);
  assert.match(page.nodes.status.textContent, /Copied/);
  page.window.pagehide();
  assert.equal(page.nodes.code.value, '');
  assert.equal(page.nodes.copy.disabled, true);
});

test('Arabic clipboard denial provides a selectable manual fallback', async () => {
  const page = open('#lang=ar&code=123456', async () => { throw new Error('denied'); });
  await page.nodes.copy.handlers.click();
  assert.equal(page.document.documentElement.dir, 'rtl');
  assert.equal(page.nodes.code.selected, true);
  assert.match(page.nodes.status.textContent, /يدوياً/);
});

test('missing or malformed fragments disable copying and never render supplied HTML', () => {
  for (const hash of ['', '#code=<script>alert(1)</script>', '#code=12345']) {
    const { nodes } = open(hash, async () => assert.fail('must not copy'));
    assert.equal(nodes.copy.disabled, true);
    assert.equal(nodes.code.value, '');
  }
});
