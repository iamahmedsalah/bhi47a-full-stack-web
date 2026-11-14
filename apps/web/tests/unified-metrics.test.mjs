import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDatabaseRows, buildRouteRows } from '../src/features/metrics/unified-model.ts';

test('unions uncalled catalog, lifetime, current window and trace-only routes without mixing scopes', () => {
  const data = {
    http: { routes: [{ route: 'HEAD /api/health', method: 'HEAD', count: 0, avgLatencyMs: 0 }, { route: 'GET /api/old', count: 10, avgLatencyMs: 80 }] },
    traffic: { routes: [{ route: 'POST /api/live', totalRequests: 4, p95LatencyMs: 250 }] },
    recentSlowRequests: [{ method: 'PATCH', route: '/api/trace', databaseOperations: 5 }],
  };
  const rows = buildRouteRows(data);
  assert.equal(rows.length, 4);
  assert.equal(rows.find((row) => row.method === 'HEAD').avgMs, null);
  assert.equal(rows.find((row) => row.route === 'GET /api/old').windowCalls, 0);
  assert.equal(rows.find((row) => row.route === 'GET /api/old').p95Ms, null);
  assert.equal(rows.find((row) => row.method === 'POST').lifetimeCalls, 0);
  assert.equal(rows.find((row) => row.method === 'POST').window4xx, null);
  assert.equal(rows.find((row) => row.method === 'PATCH').traces.length, 1);
});

test('merges bounded query samples without double counting lifetime aggregates', () => {
  const data = { database: {
    slowQueriesByCollection: [{ collection: 'users', operation: 'find', count: 100, avgMs: 250, maxMs: 800, coldStartCount: 3 }],
    recentSlowQueries: [{ collection: 'users', operation: 'find', durationMs: 400 }, { collection: 'courses', operation: 'findOne', durationMs: 300, isColdStart: true }],
  } };
  const rows = buildDatabaseRows(data);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].count, 100);
  assert.equal(rows[0].samples.length, 1);
  assert.equal(rows[1].count, 1);
  assert.equal(rows[1].coldStartCount, 1);
});

test('keeps overflow and slow-request counts in their selected route window', () => {
  const rows = buildRouteRows({ http: {}, traffic: { routes: [{
    route: 'GET /api/admin/complaints', totalRequests: 4, p95LatencyMs: null,
    latencyUpperBoundMs: 120000, latencyOverflowRequests: 1, overTenSeconds: 4,
  }] } });
  assert.equal(rows[0].p95Ms, null);
  assert.equal(rows[0].latencyOverflowRequests, 1);
  assert.equal(rows[0].latencyUpperBoundMs, 120000);
  assert.equal(rows[0].overTenSeconds, 4);
});
