import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/hooks/use-google-signin.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const flush = () => new Promise((resolve) => setImmediate(resolve));

function mount(post) {
  const effects = [];
  const intervals = new Set();
  const listeners = new Set();
  let stateIndex = 0;
  let now = 1_000_000;
  let initializes = 0;
  let refreshIntervalMs;
  const document = {
    visibilityState: 'visible',
    addEventListener: (_name, listener) => listeners.add(listener),
    removeEventListener: (_name, listener) => listeners.delete(listener),
  };
  const window = {
    google: { accounts: { id: { initialize: () => { initializes++; } } } },
    setInterval: (callback, delay) => { refreshIntervalMs = delay; intervals.add(callback); return callback; },
    clearInterval: (id) => intervals.delete(id),
  };
  const exports = {};
  vm.runInNewContext(code, {
    exports, window, document, console,
    Date: class extends Date { static now() { return now; } },
    process: { env: { NEXT_PUBLIC_GOOGLE_CLIENT_ID: 'test.apps.googleusercontent.com' } },
    require: (id) => id === 'react' ? {
      useCallback: (callback) => callback,
      useEffect: (effect) => effects.push(effect),
      useRef: (current) => ({ current }),
      // Model a render after the Google script has loaded.
      useState: () => [stateIndex++ === 0, () => {}],
    } : id === '@/lib/api' ? { __esModule: true, default: { post } } : require(id),
  });
  exports.useGoogleSignIn({ onSuccess: () => {} });
  // The final effect coordinates nonce preparation once the GIS script is ready.
  const cleanup = effects.at(-1)();
  return {
    window, document, cleanup,
    advance: (ms) => { now += ms; },
    tick: () => { for (const callback of intervals) callback(); },
    visible: () => { document.visibilityState = 'visible'; for (const callback of listeners) callback(); },
    get initializes() { return initializes; },
    get refreshIntervalMs() { return refreshIntervalMs; },
    get listenerCount() { return listeners.size; },
  };
}

test('nonce refresh respects Retry-After across repeated timer and visibility events', async () => {
  let calls = 0;
  const hook = mount(async () => {
    calls++;
    if (calls === 1) throw { statusCode: 429, retryAfterAt: 1_900_000 };
    return { data: { flowId: 'flow', proof: 'proof', nonce: 'nonce' } };
  });
  await flush();
  for (let index = 0; index < 4; index++) {
    hook.advance(180_000);
    hook.tick();
    hook.visible();
    await flush();
  }
  assert.equal(calls, 1);
  hook.advance(180_000);
  hook.tick();
  await flush();
  assert.equal(calls, 2);
  assert.equal(hook.initializes, 1);
  hook.cleanup();
  assert.equal(hook.listenerCount, 0);
});

test('hidden tabs do not create nonces and concurrent refreshes share one request', async () => {
  let calls = 0;
  const hook = mount(async () => {
    calls++;
    return { data: { flowId: 'flow', proof: 'proof', nonce: 'nonce' } };
  });
  await flush();
  hook.document.visibilityState = 'hidden';
  hook.advance(360_000);
  hook.tick();
  await flush();
  assert.equal(calls, 1);
  hook.visible();
  hook.tick();
  hook.visible();
  await flush();
  assert.equal(calls, 2);
  assert.equal(hook.initializes, 2);
  hook.cleanup();
});

test('reuses fresh nonces and refreshes before the five-minute expiry', async () => {
  let calls = 0;
  const hook = mount(async () => {
    calls++;
    return { data: { flowId: 'flow', proof: 'proof', nonce: 'nonce' } };
  });
  await flush();
  assert.equal(hook.refreshIntervalMs, 60_000);
  for (let minute = 1; minute <= 3; minute++) {
    hook.advance(60_000);
    hook.tick();
    await flush();
    assert.equal(calls, 1);
  }
  hook.advance(60_000);
  hook.tick();
  await flush();
  assert.equal(calls, 2);
  hook.cleanup();
});
