import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import type { MetricsService } from './metrics.service';
import {
  createHttpMetricsMiddleware,
  normalizeMetricRoute,
} from './http-metrics.middleware';

describe('HTTP response metrics', () => {
  it.each([200, 400, 401, 403, 429, 500])(
    'records final status %i exactly once after the response finishes',
    (status) => {
      const recordHttpRequest = jest.fn();
      const middleware = createHttpMetricsMiddleware({
        recordHttpRequest,
      } as unknown as MetricsService);
      const req = {
        method: 'POST',
        originalUrl: '/api/auth/student/login?token=private',
      } as Request;
      const res = Object.assign(new EventEmitter(), { statusCode: 200 });
      middleware(req, res as unknown as Response, () => {
        res.statusCode = status;
      });
      expect(recordHttpRequest).not.toHaveBeenCalled();
      res.emit('finish');
      res.emit('finish');
      expect(recordHttpRequest).toHaveBeenCalledTimes(1);
      expect(recordHttpRequest).toHaveBeenCalledWith(
        'POST',
        '/api/auth/student/login',
        status,
        expect.any(Number),
      );
    },
  );

  it.each(['/api/metrics', '/api/metrics/summary', '/api/admin/metrics'])(
    'excludes %s and strips identifiers and query strings',
    (path) => {
      expect(normalizeMetricRoute('/api/items/123?password=private')).toBe(
        '/api/items/:id',
      );
      expect(
        normalizeMetricRoute('/api/items/73d285d7-75aa-440c-a483-d39a220afe11'),
      ).toBe('/api/items/:uuid');
      const recordHttpRequest = jest.fn();
      const res = new EventEmitter();
      createHttpMetricsMiddleware({
        recordHttpRequest,
      } as unknown as MetricsService)(
        { method: 'GET', originalUrl: path } as Request,
        res as unknown as Response,
        jest.fn(),
      );
      res.emit('finish');
      expect(recordHttpRequest).not.toHaveBeenCalled();
    },
  );
});
