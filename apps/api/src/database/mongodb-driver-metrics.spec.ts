import { EventEmitter } from 'node:events';
import { MetricsService } from '../core/metrics/metrics.service';
import { attachMongoDriverMetrics } from './mongodb-driver-metrics';
import { describeMongoFailure } from './mongo-driver-diagnostics';
import {
  measureDatabaseStage,
  runWithRequestQueryMetrics,
} from '../core/metrics/request-query-context';

describe('driver diagnostics', () => {
  it('classifies nested failures without exporting arbitrary error fields', () => {
    expect(
      describeMongoFailure({
        name: 'MongoNetworkTimeoutError',
        message: 'private-host',
        code: 'unsafe',
      }),
    ).toEqual({
      category: 'socket_timeout',
      errorName: 'MongoNetworkTimeoutError',
      code: undefined,
    });
    expect(
      describeMongoFailure({ name: 'MongoServerError', code: 50 }),
    ).toMatchObject({ category: 'execution_timeout', code: 50 });
    expect(
      describeMongoFailure({
        cause: { code: 'ENOTFOUND', hostname: 'private-host' },
      }),
    ).toMatchObject({ category: 'dns', code: 'ENOTFOUND' });
    expect(
      describeMongoFailure({ name: 'MongoOperationTimeoutError' }).category,
    ).toBe('operation_timeout');
    const cyclic: { cause?: unknown } = {};
    cyclic.cause = cyclic;
    expect(describeMongoFailure(cyclic).category).toBe('other');
  });

  it('correlates command failures from command start, bounds history/logs, and exposes driver health', async () => {
    const metrics = new MetricsService();
    const client = new EventEmitter();
    const logger = { warn: jest.fn() };
    try {
      attachMongoDriverMetrics(client as never, metrics, logger);
      await runWithRequestQueryMetrics('request-a', () =>
        measureDatabaseStage('complaints.page', () => {
          client.emit('commandStarted', {
            requestId: 1,
            command: { secret: 'never-export' },
          });
          return Promise.resolve();
        }),
      );
      await runWithRequestQueryMetrics('request-b', () =>
        measureDatabaseStage('auth.session', () => {
          client.emit('commandStarted', { requestId: 2 });
          return Promise.resolve();
        }),
      );
      const event = (requestId: number) => ({
        requestId,
        commandName: 'find',
        duration: 45_000,
        failure: {
          name: 'MongoNetworkTimeoutError',
          message: 'mongodb://secret@private-host',
          stack: 'never-export',
          code: 'ETIMEDOUT',
        },
      });
      client.emit('commandFailed', event(2));
      client.emit('commandFailed', event(1));
      expect(metrics.mongoDiagnostics.snapshot().recentFailures).toMatchObject([
        {
          requestId: 'request-a',
          stage: 'complaints.page',
          category: 'socket_timeout',
          code: 'ETIMEDOUT',
        },
        { requestId: 'request-b', stage: 'auth.session' },
      ]);
      client.emit('connectionCheckOutStarted');
      client.emit('connectionCheckOutFailed', {
        durationMS: 1000,
        reason: 'timeout',
      });
      client.emit('connectionPoolCleared', { address: 'private-host' });
      client.emit('serverHeartbeatFailed', {
        duration: 3000,
        failure: { name: 'MongoNetworkError' },
      });
      const snapshot = metrics.mongoDiagnostics.snapshot();
      expect(
        snapshot.recentFailures.find((item) => item.kind === 'checkout'),
      ).toMatchObject({
        category: 'checkout_timeout',
        errorName: 'Other',
        checkoutReason: 'timeout',
      });
      expect(snapshot).toMatchObject({
        waiters: 0,
        poolClears: 1,
        checkout: { count: 1, failures: 1, avgMs: 1000, maxMs: 1000 },
        commands: [{ command: 'find', count: 2, failures: 2, avgMs: 45000 }],
      });
      for (let i = 0; i < 60; i++) client.emit('commandFailed', event(i + 3));
      expect(metrics.mongoDiagnostics.snapshot().recentFailures).toHaveLength(
        50,
      );
      expect(logger.warn.mock.calls.length).toBeLessThanOrEqual(10);
      const output =
        JSON.stringify({ snapshot, logs: logger.warn.mock.calls }) +
        (await metrics.getMetrics());
      for (const privateValue of [
        'private-host',
        'never-export',
        'mongodb://secret',
      ])
        expect(output).not.toContain(privateValue);
      expect(output).toContain('student_portal_mongodb_driver_failures_total');
      expect(
        (await metrics.getSummary()).database.driverDiagnostics.poolClears,
      ).toBe(1);
    } finally {
      metrics.onModuleDestroy();
      metrics.getRegistry().clear();
    }
  });
  it('uses each checkout duration directly, bounds labels, and keeps commands separate from query counts', async () => {
    const metrics = new MetricsService();
    const client = new EventEmitter();
    try {
      attachMongoDriverMetrics(client as never, metrics);
      attachMongoDriverMetrics(client as never, metrics);
      client.emit('connectionCheckOutStarted', {});
      client.emit('connectionCheckOutStarted', {});
      client.emit('connectionCheckedOut', {
        address: 'private-host',
        connectionId: 1,
        durationMS: 1014,
      });
      client.emit('connectionCheckOutFailed', {
        durationMS: 1050,
        reason: 'timeout',
      });
      client.emit('commandSucceeded', {
        commandName: 'find',
        duration: 12,
        reply: { private: 'never-export' },
      });
      client.emit('commandFailed', {
        commandName: 'arbitrary-untrusted',
        duration: 8,
        failure: new Error('never-export'),
      });
      client.emit('connectionCheckedIn', {
        address: 'private-host',
        connectionId: 1,
      });
      const exported = await metrics.getMetrics();
      expect(exported).toContain(
        'student_portal_mongodb_pool_checkout_seconds_sum{outcome="success"} 1.014',
      );
      expect(exported).toContain(
        'student_portal_mongodb_pool_checkout_seconds_sum{outcome="timeout"} 1.05',
      );
      expect(exported).toContain('student_portal_mongodb_pool_waiters 0');
      expect(exported).toContain('student_portal_mongodb_pool_checked_out 0');
      expect(exported).toContain('command="other",outcome="failure"');
      expect(exported).not.toContain('private-host');
      expect(exported).not.toContain('never-export');
      expect((await metrics.getSummary()).database.totalQueries).toBe(0);
    } finally {
      metrics.onModuleDestroy();
      metrics.getRegistry().clear();
    }
  });
});
