import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MaterialUploadQueue } from '../src/features/courses/material-upload-queue.ts';

const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup() {
  const settled = [];
  return {
    settled,
    queue: new MaterialUploadQueue({
      settled: (task) => settled.push(task),
      error: () => 'Failed',
    }),
  };
}
const input = (key, request) => ({
  key,
  request,
  courseId: 'course',
  label: 'Course book',
  fileName: 'كتاب.pdf',
  fileSize: 15000000,
});

test('closing an observing UI does not abort the owned upload', async () => {
  const { queue, settled } = setup();
  const work = deferred();
  let config;
  const unsubscribe = queue.subscribe(() => {});
  const id = queue.start(
    input('book', (options) => {
      config = options;
      return work.promise;
    }),
  );
  unsubscribe();
  assert.equal(config.signal.aborted, false);
  work.resolve();
  await tick();
  assert.equal(
    queue.getSnapshot().find((task) => task.id === id).status,
    'completed',
  );
  assert.equal(settled.length, 1);
});

test('transfer completion stays in saving until the server acknowledges', async () => {
  const { queue, settled } = setup();
  const work = deferred();
  let config;
  queue.start(
    input('book', (options) => {
      config = options;
      return work.promise;
    }),
  );
  config.onUploadProgress({ loaded: 9999, total: 10000 });
  assert.equal(queue.getSnapshot()[0].progress, 99);
  config.onUploadProgress({ loaded: 10000, total: 10000 });
  assert.equal(queue.getSnapshot()[0].status, 'saving');
  assert.equal(settled.length, 0);
  work.resolve();
  await tick();
  assert.equal(queue.getSnapshot()[0].status, 'completed');
});

test('large uploads are serialized and a queued cancellation never sends bytes', async () => {
  const { queue } = setup();
  const first = deferred();
  let secondCalls = 0;
  queue.start(input('first', () => first.promise));
  const second = queue.start(
    input('second', async () => {
      secondCalls++;
    }),
  );
  assert.equal(queue.getSnapshot()[1].status, 'queued');
  queue.cancel(second);
  first.resolve();
  await tick();
  assert.equal(secondCalls, 0);
  assert.equal(queue.getSnapshot()[1].status, 'cancelled');
});

test('explicit cancellation aborts the request and ignores a late success', async () => {
  const { queue } = setup();
  const work = deferred();
  let config;
  const id = queue.start(
    input('book', (options) => {
      config = options;
      return work.promise;
    }),
  );
  queue.cancel(id);
  assert.equal(config.signal.aborted, true);
  work.resolve();
  await tick();
  assert.equal(queue.getSnapshot()[0].status, 'cancelled');
});

test('failures do not automatically replay a POST; retry is explicit and duplicates are deduplicated', async () => {
  const { queue } = setup();
  let calls = 0;
  const work = deferred();
  const request = input('book', () => {
    calls++;
    return calls === 1 ? work.promise : Promise.resolve();
  });
  const id = queue.start(request);
  assert.equal(queue.start(request), id);
  work.reject(new Error('network'));
  await tick();
  assert.equal(calls, 1);
  assert.equal(queue.getSnapshot()[0].status, 'failed');
  queue.retry(id);
  await tick();
  assert.equal(calls, 2);
  assert.equal(queue.getSnapshot()[0].status, 'completed');
});

test('account disposal aborts requests, drops queued work, and suppresses stale notifications', async () => {
  const { queue, settled } = setup();
  let config;
  let queuedCalls = 0;
  const work = deferred();
  queue.start(
    input('first', (options) => {
      config = options;
      return work.promise;
    }),
  );
  queue.start(
    input('second', async () => {
      queuedCalls++;
    }),
  );
  queue.dispose();
  work.resolve();
  await tick();
  assert.equal(config.signal.aborted, true);
  assert.equal(queuedCalls, 0);
  assert.equal(settled.length, 0);
});

test('unknown content length is displayed as indeterminate', async () => {
  const { queue } = setup();
  const work = deferred();
  let config;
  queue.start(
    input('first', (options) => {
      config = options;
      return work.promise;
    }),
  );
  config.onUploadProgress({ loaded: 500 });
  assert.equal(queue.getSnapshot()[0].progress, null);
  work.resolve();
  await tick();
});
