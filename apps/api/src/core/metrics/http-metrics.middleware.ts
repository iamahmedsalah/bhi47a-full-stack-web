import type { RequestHandler } from 'express';
import type { MetricsService } from './metrics.service';

export function normalizeMetricRoute(url: string): string {
  return (url.split('?')[0] || '/')
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      ':uuid',
    )
    .replace(/[a-f0-9]{24}/gi, ':id')
    .replace(/\/\d+(?=\/|$)/g, '/:id');
}

/** Measure the final response, including guard, validation and rate-limit rejections. */
export function createHttpMetricsMiddleware(
  metrics: MetricsService,
): RequestHandler {
  return (req, res, next) => {
    const route = normalizeMetricRoute(req.originalUrl || req.url);
    if (
      route === '/api/metrics' ||
      route.startsWith('/api/metrics/') ||
      route === '/api/admin/metrics'
    ) {
      next();
      return;
    }
    const start = process.hrtime.bigint();
    res.once('finish', () => {
      const matchedPath: unknown = req.route?.path;
      const recordedRoute =
        typeof matchedPath === 'string'
          ? normalizeMetricRoute(`${req.baseUrl || ''}${matchedPath}`)
          : res.statusCode === 404
            ? '/unmatched'
            : route;
      metrics.recordHttpRequest(
        req.method,
        recordedRoute,
        res.statusCode,
        Number(process.hrtime.bigint() - start) / 1e9,
      );
    });
    next();
  };
}
