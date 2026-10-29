import type { Schema } from 'mongoose';
import type { MetricsService } from '../core/metrics/metrics.service';
import type { AppLoggerService } from '../core/logger/logger.service';
import { createMongooseMetricsPlugin } from './mongoose-metrics.plugin';
import {
  runWithRequestQueryMetrics,
  measureDatabaseStage,
} from '../core/metrics/request-query-context';

describe('slow-query diagnostics', () => {
  it('captures a sub-log-threshold slow query with its shape and no personal values', () => {
    let post: ((this: unknown, result: unknown) => void) | undefined;
    const schema = {
      pre: jest.fn(),
      post: jest.fn((methods: unknown, callback: typeof post) => {
        if (Array.isArray(methods)) post = callback;
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
        if (Array.isArray(methods)) post = callback;
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
