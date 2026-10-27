import type { Schema } from 'mongoose';
import type { MetricsService } from '../core/metrics/metrics.service';
import type { AppLoggerService } from '../core/logger/logger.service';
import { METRICS_SLOW_QUERY_THRESHOLD_MS } from '../core/metrics/metrics.constants';
import { getRequestQueryContext } from '../core/metrics/request-query-context';

const DEFAULT_SLOW_QUERY_THRESHOLD_MS =
  process.env.NODE_ENV === 'production' ? 100 : 350;

interface QueryLike {
  getFilter?: () => unknown;
  getOptions?: () => Record<string, unknown>;
  _fields?: unknown;
  _mongooseOptions?: { populate?: Record<string, unknown> };
}

function safeStringify(value: unknown, max = 200): string | undefined {
  if (value === undefined || value === null) return undefined;
  try {
    return JSON.stringify(value).slice(0, max);
  } catch {
    return undefined;
  }
}

/** Preserve query structure without copying student IDs, tokens or search text. */
function filterShape(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 5).map(filterShape);
  if (value && typeof value === 'object') {
    if (value instanceof Date) return '[date]';
    if ('toHexString' in value) return '[id]';
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, filterShape(nested)]),
    );
  }
  return '?';
}

/**
 * Builds a compact description of the query shape so slow-query logs reveal
 * whether a `{}` filter was a paginated list (limit set) or a full scan.
 */
function describeQueryShape(query: QueryLike, op: string): string | undefined {
  const parts: string[] = [];
  const options =
    typeof query.getOptions === 'function' ? query.getOptions() : {};
  if (options.limit !== undefined) {
    const limitStr =
      typeof options.limit === 'number' || typeof options.limit === 'string'
        ? String(options.limit)
        : safeStringify(options.limit);
    if (limitStr) parts.push(`limit=${limitStr}`);
  } else if (op === 'find') {
    parts.push('limit=NONE');
  }
  if (options.skip !== undefined) {
    const skipStr =
      typeof options.skip === 'number' || typeof options.skip === 'string'
        ? String(options.skip)
        : safeStringify(options.skip);
    if (skipStr) parts.push(`skip=${skipStr}`);
  }
  const sort = safeStringify(options.sort, 80);
  if (sort) parts.push(`sort=${sort}`);
  const fields = safeStringify(query._fields, 80);
  if (fields) parts.push(`select=${fields}`);
  const populate = query._mongooseOptions?.populate;
  if (populate && Object.keys(populate).length > 0) {
    parts.push(`populate=${Object.keys(populate).join(',')}`);
  }
  return parts.length > 0 ? parts.join(' ') : undefined;
}

export function createMongooseMetricsPlugin(
  metricsService?: MetricsService,
  logger?: AppLoggerService,
  customThresholdMs?: number,
) {
  const thresholdMs =
    customThresholdMs &&
    Number.isFinite(customThresholdMs) &&
    customThresholdMs > 0
      ? customThresholdMs
      : Number(process.env.SLOW_QUERY_THRESHOLD_MS) > 0
        ? Number(process.env.SLOW_QUERY_THRESHOLD_MS)
        : DEFAULT_SLOW_QUERY_THRESHOLD_MS;

  return function mongooseMetricsPlugin(schema: Schema) {
    const queryMethods = [
      'find',
      'findOne',
      'findOneAndUpdate',
      'findOneAndDelete',
      'updateOne',
      'updateMany',
      'deleteOne',
      'deleteMany',
      'countDocuments',
      'distinct',
    ] as const;

    // 1. Query hooks
    schema.pre(queryMethods as any, function (this: any) {
      this._startTime = process.hrtime.bigint();
    });

    schema.post(queryMethods as any, function (this: any, result: any) {
      if (this._startTime) {
        const durationNs = Number(process.hrtime.bigint() - this._startTime);
        const durationSec = durationNs / 1e9;
        const durationMs = Math.round(durationNs / 1e6);
        const collectionName =
          this.model?.collection?.name ||
          this.mongooseCollection?.name ||
          'unknown';
        const op = this.op || 'query';
        const docsReturned = Array.isArray(result)
          ? result.length
          : result !== null && result !== undefined
            ? 1
            : 0;

        const captureDetails = durationMs >= METRICS_SLOW_QUERY_THRESHOLD_MS;
        let filter: string | undefined;
        let options: string | undefined;
        if (captureDetails) {
          const query = this as QueryLike;
          filter = safeStringify(
            filterShape(
              typeof query.getFilter === 'function'
                ? query.getFilter()
                : undefined,
            ),
            300,
          );
          const baseOptions = describeQueryShape(query, op);
          options = baseOptions
            ? `${baseOptions} docs=${docsReturned}`
            : `docs=${docsReturned}`;
        }
        metricsService?.recordDbQuery(
          collectionName,
          op,
          durationSec,
          captureDetails ? { filter, options } : undefined,
        );

        if (durationMs >= thresholdMs) {
          logger?.warn(
            `[SLOW QUERY] ${collectionName}.${op} took ${durationMs}ms (threshold: ${thresholdMs}ms)`,
            {
              context: 'MongooseMetrics',
              collection: collectionName,
              operation: op,
              durationMs,
              docsReturned,
              filter,
              options,
              uptimeSeconds: Math.floor(process.uptime()),
              requestId: getRequestQueryContext()?.request.requestId,
              stage: getRequestQueryContext()?.stage,
            },
          );
        }
      }
    });

    // 2. Aggregate hooks
    schema.pre('aggregate', function (this: any) {
      this._startTime = process.hrtime.bigint();
    });

    schema.post('aggregate', function (this: any) {
      if (this._startTime) {
        const durationNs = Number(process.hrtime.bigint() - this._startTime);
        const durationSec = durationNs / 1e9;
        const durationMs = Math.round(durationNs / 1e6);
        const collectionName = this._model?.collection?.name || 'aggregate';

        const filter =
          durationMs >= METRICS_SLOW_QUERY_THRESHOLD_MS
            ? safeStringify(filterShape(this.pipeline()), 300)
            : undefined;
        metricsService?.recordDbQuery(
          collectionName,
          'aggregate',
          durationSec,
          { filter },
        );

        if (durationMs >= thresholdMs) {
          logger?.warn(
            `[SLOW QUERY] ${collectionName}.aggregate took ${durationMs}ms (threshold: ${thresholdMs}ms)`,
            {
              context: 'MongooseMetrics',
              collection: collectionName,
              operation: 'aggregate',
              durationMs,
              filter,
              requestId: getRequestQueryContext()?.request.requestId,
              stage: getRequestQueryContext()?.stage,
            },
          );
        }
      }
    });

    // 3. Document Save hook
    schema.pre('save', function (this: any) {
      this._saveStartTime = process.hrtime.bigint();
    });

    schema.post('save', function (this: any) {
      if (this._saveStartTime) {
        const durationNs = Number(
          process.hrtime.bigint() - this._saveStartTime,
        );
        const durationSec = durationNs / 1e9;
        const durationMs = Math.round(durationNs / 1e6);
        const collectionName = this.constructor?.collection?.name || 'document';

        metricsService?.recordDbQuery(collectionName, 'save', durationSec);

        if (durationMs >= thresholdMs) {
          logger?.warn(
            `[SLOW QUERY] ${collectionName}.save took ${durationMs}ms (threshold: ${thresholdMs}ms)`,
            {
              context: 'MongooseMetrics',
              collection: collectionName,
              operation: 'save',
              durationMs,
              requestId: getRequestQueryContext()?.request.requestId,
              stage: getRequestQueryContext()?.stage,
            },
          );
        }
      }
    });
  };
}
