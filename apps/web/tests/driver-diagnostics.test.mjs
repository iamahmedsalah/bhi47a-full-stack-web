import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDriverCommands, buildDriverFailures, DRIVER_FILTER_DEFAULTS, filterDriverCommands, filterDriverFailures } from '../src/features/metrics/driver-model.ts';

const failure = { timestamp: '2026-11-14T18:00:00Z', kind: 'command', command: 'find', durationMs: 45000, category: 'socket_timeout', errorName: 'MongoNetworkTimeoutError', code: 'ETIMEDOUT', requestId: 'request-a', stage: 'complaints.page' };
const data = {
  commands: [{ command: 'find', count: 50, failures: 2, avgMs: 2000, maxMs: 45000 }, { command: 'ping', count: 100, failures: 1, avgMs: 20, maxMs: 3000 }],
  recentFailures: [failure, { ...failure, timestamp: '2026-11-14T18:01:00Z', kind: 'heartbeat', command: 'ping', durationMs: 3000, category: 'network', requestId: undefined, stage: undefined }],
};

test('keeps failure identity stable across polling and distinct for identical retained events', () => {
  const initial = buildDriverFailures(data);
  const updated = buildDriverFailures({ ...data, recentFailures: [{ ...failure, timestamp: '2026-11-14T18:02:00Z' }, ...data.recentFailures] });
  assert.equal(initial[0]._id, updated[1]._id);
  assert(Object.hasOwn(initial[0], 'checkoutReason'));
  assert(Object.hasOwn(initial[0], 'operation'));
  assert.notEqual(...buildDriverFailures({ recentFailures: [failure, failure] }).map((row) => row._id));
  assert.deepEqual(buildDriverFailures(), []);
  assert.deepEqual(buildDriverCommands(), []);
});

test('combines search, kind, category, command and latency filters without changing process totals', () => {
  const rows = buildDriverFailures(data);
  const filters = { ...DRIVER_FILTER_DEFAULTS, driverSearch: 'REQUEST-A', driverCommand: 'find', driverCategory: 'socket_timeout', driverKind: 'command', driverThreshold: '10000' };
  assert.deepEqual(filterDriverFailures(rows, filters).map((row) => row.requestId), ['request-a']);
  assert.equal(filterDriverFailures(rows, { ...filters, driverCommand: 'ping' }).length, 0);
  assert.equal(filterDriverFailures(rows, { ...DRIVER_FILTER_DEFAULTS, driverSearch: 'انتهاء مهلة' }, () => 'انتهاء مهلة الاتصال').length, 2);
  assert.equal(data.commands[0].count, 50);
  assert.equal(rows.length, 2);
});

test('sorts retained samples and applies category fallback and valid duration thresholds', () => {
  const rows = buildDriverFailures({ recentFailures: [...data.recentFailures, { ...failure, timestamp: '2026-11-14T18:03:00Z', category: 'future_category', durationMs: 50 }] });
  assert.equal(filterDriverFailures(rows, DRIVER_FILTER_DEFAULTS)[0].durationMs, 50);
  assert.equal(filterDriverFailures(rows, { ...DRIVER_FILTER_DEFAULTS, driverSort: 'slowest' })[0].durationMs, 45000);
  assert.equal(filterDriverFailures(rows, { ...DRIVER_FILTER_DEFAULTS, driverCategory: 'other' }).length, 1);
  assert.equal(filterDriverFailures(rows, { ...DRIVER_FILTER_DEFAULTS, driverThreshold: 'invalid' }).length, 3);
});

test('filters/sorts lifetime command totals separately from failure-event filters', () => {
  const rows = buildDriverCommands(data);
  assert.equal(filterDriverCommands(rows, DRIVER_FILTER_DEFAULTS)[0].command, 'ping');
  assert.equal(filterDriverCommands(rows, { ...DRIVER_FILTER_DEFAULTS, driverSort: 'failures' })[0].command, 'find');
  assert.deepEqual(filterDriverCommands(rows, { ...DRIVER_FILTER_DEFAULTS, driverThreshold: '10000', driverCategory: 'network' }).map((row) => row.command), ['find']);
  assert.equal(filterDriverCommands(rows, { ...DRIVER_FILTER_DEFAULTS, driverSearch: 'PING' })[0].failures, 1);
});
