import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request, Response } from 'express';
import { MetricsService } from './metrics.service';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    if (!req || !req.method) {
      return next.handle();
    }

    const start = process.hrtime.bigint();
    const method = req.method;
    const rawUrl = req.originalUrl || req.url || '';

    // Ignore scraping of /api/metrics itself to avoid recursion noise
    if (rawUrl.includes('/metrics')) {
      return next.handle();
    }

    // Normalize route to avoid high cardinality (e.g. replace 24-char Mongo ObjectIds, UUIDs, or numbers)
    const normalizedRoute = this.normalizeRoute(rawUrl);

    return next.handle().pipe(
      tap({
        next: () => {
          const durationNs = Number(process.hrtime.bigint() - start);
          const durationSec = durationNs / 1e9;
          const statusCode = res.statusCode || 200;
          this.metricsService.recordHttpRequest(
            method,
            normalizedRoute,
            statusCode,
            durationSec,
          );
        },
        error: (err: any) => {
          const durationNs = Number(process.hrtime.bigint() - start);
          const durationSec = durationNs / 1e9;
          const statusCode = err?.status || err?.statusCode || 500;
          this.metricsService.recordHttpRequest(
            method,
            normalizedRoute,
            statusCode,
            durationSec,
          );
        },
      }),
    );
  }

  private normalizeRoute(url: string): string {
    // Strip query strings
    const path = url.split('?')[0] || '';
    return (
      path
        // Replace MongoDB 24-char hex ObjectIds with :id
        .replace(/[a-fA-F0-9]{24}/g, ':id')
        // Replace UUIDs with :uuid
        .replace(
          /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g,
          ':uuid',
        )
        // Replace numeric IDs at path ends or segments with :id
        .replace(/\/\d+(?=\/|$)/g, '/:id')
    );
  }
}
