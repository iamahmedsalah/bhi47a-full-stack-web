import mongoose, { type Schema } from 'mongoose';
import { MetricsService } from '../core/metrics/metrics.service';
import type { AppLoggerService } from '../core/logger/logger.service';
import { createMongooseMetricsPlugin } from './mongoose-metrics.plugin';
import {
  runWithRequestQueryMetrics,
  measureDatabaseStage,
} from '../core/metrics/request-query-context';

describe('slow-query diagnostics', () => {
  it('captures pre-command failures through real query/aggregate middleware and preserves the original error', async () => {
    const metrics = new MetricsService();
    const logger = { warn: jest.fn() };
    const connection = mongoose.createConnection();
    try {
      const schema = new mongoose.Schema({ privateValue: String });
      schema.plugin(
        createMongooseMetricsPlugin(
          metrics,
          logger as unknown as AppLoggerService,
        ),
      );
      const model = connection.model('DiagnosticFailureFixture', schema);
      const failure = Object.assign(
        new Error('mongodb://secret@private-host'),
        { name: 'MongoServerSelectionError' },
      );
      jest.spyOn(model.collection, 'find').mockImplementation(() => {
        throw failure;
      });
      jest.spyOn(model.collection, 'aggregate').mockImplementation(() => {
        throw failure;
      });
      await expect(
        runWithRequestQueryMetrics('request-selection', () =>
          measureDatabaseStage('auth.session', () =>
            model.find({ privateValue: 'never-export' }).lean().exec(),
          ),
        ),
      ).rejects.toBe(failure);
      await expect(
        model.aggregate([{ $match: { privateValue: 'never-export' } }]).exec(),
      ).rejects.toBe(failure);
      const snapshot = metrics.mongoDiagnostics.snapshot();
      expect(snapshot.recentFailures).toHaveLength(2);
      expect(snapshot.recentFailures[1]).toMatchObject({
        kind: 'operation',
        category: 'server_selection',
        requestId: 'request-selection',
        stage: 'auth.session',
        operation: 'find',
      });
      expect(snapshot.recentFailures[0]).toMatchObject({
        kind: 'operation',
        operation: 'aggregate',
      });
      const exported = JSON.stringify({
        snapshot,
        logs: logger.warn.mock.calls,
      });
      expect(exported).not.toContain('private-host');
      expect(exported).not.toContain('never-export');
    } finally {
      await connection.close();
      metrics.onModuleDestroy();
      metrics.getRegistry().clear();
    }
  });
  it('captures a sub-log-threshold slow query with its shape and no personal values', () => {
    let post: ((this: unknown, result: unknown) => void) | undefined;
    const schema = {
      pre: jest.fn(),
      post: jest.fn((methods: unknown, callback: typeof post) => {
        if (Array.isArray(methods) && callback && callback.length <= 1)
          post = callback;
      }),
    } as unknown as Schema;
    const recordDbQuery = jest.fn();
    const warn = jest.fn();
    createMongooseMetricsPlugin(
      { recordDbQuery } as unknown as MetricsService,
      { warn } as unknown as AppLoggerService,
      1000,
    )(schema);
    post!.call(
      {
        _startTime: process.hrtime.bigint() - 734_000_000n,
        model: { collection: { name: 'complaints' } },
        op: 'find',
        getFilter: () => ({
          nationalId: '30101011234567',
          email: 'private@example.com',
        }),
        getOptions: () => ({ limit: 100, skip: 0, sort: { createdAt: -1 } }),
      },
      [{ _id: 'result' }],
    );
    expect(recordDbQuery).toHaveBeenCalledTimes(1);
    const [collection, operation, duration, details] =
      recordDbQuery.mock.calls[0];
    expect([collection, operation]).toEqual(['complaints', 'find']);
    expect(duration).toBeGreaterThanOrEqual(0.734);
    expect(details.options).toContain('limit=100');
    expect(details.options).toContain('docs=1');
    expect(details.filter).toContain('nationalId');
    expect(details.filter).not.toContain('30101011234567');
    expect(details.filter).not.toContain('private@example.com');
    expect(warn).not.toHaveBeenCalled();
  });

  it('captures fast enrollment query fingerprints with placeholders instead of row values', async () => {
    let post: ((this: unknown, result: unknown) => void) | undefined;
    const schema = {
      pre: jest.fn(),
      post: jest.fn((methods: unknown, callback: typeof post) => {
        if (Array.isArray(methods) && callback && callback.length <= 1)
          post = callback;
      }),
    } as unknown as Schema;
    const recordDbQuery = jest.fn();
    createMongooseMetricsPlugin({ recordDbQuery } as unknown as MetricsService)(
      schema,
    );
    await runWithRequestQueryMetrics('synthetic', () =>
      measureDatabaseStage('enrollment.rules', () => {
        post!.call(
          {
            _startTime: process.hrtime.bigint(),
            model: { collection: { name: 'grades' } },
            op: 'find',
            getFilter: () => ({
              studentId: 'private-student',
              isPublished: true,
            }),
            getOptions: () => ({}),
          },
          [],
        );
        return Promise.resolve();
      }),
    );
    const details = recordDbQuery.mock.calls[0][3];
    expect(details.filter).toBe('{"studentId":"?","isPublished":"?"}');
    expect(JSON.stringify(details)).not.toContain('private-student');
  });
});
