import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import * as os from 'os';
import { monitorEventLoopDelay } from 'perf_hooks';
import {
  Counter,
  Histogram,
  Gauge,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';
import mongoose from 'mongoose';
import { ConnectionHolder } from '../../common/rate-limit/connection-holder';
import { CacheService } from '../cache/cache.service';

/** Queries captured within this many seconds of boot are flagged as cold-start. */
const COLD_START_WINDOW_SECONDS = 90;
const MAX_LABEL_KEYS = 50;

export interface DbQueryDetails {
  filter?: string;
  /** Compact query shape, e.g. `limit=20 skip=0 sort={"code":1} populate=userId` */
  options?: string;
}

export interface RecentSlowQuery {
  id: string;
  collection: string;
  operation: string;
  durationMs: number;
  timestamp: string;
  filter?: string;
  options?: string;
  /** Process uptime (s) when captured; helps spot cold-start pool latency. */
  uptimeSeconds: number;
  isColdStart: boolean;
}

export interface RouteLatencyStat {
  route: string;
  method: string;
  count: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
  errorCount: number;
}

export interface SlowQueryAggregate {
  collection: string;
  operation: string;
  count: number;
  avgMs: number;
  maxMs: number;
  coldStartCount: number;
}

export interface LabelCount {
  label: string;
  count: number;
}

export const CANONICAL_OPERATIONS = [
  'find',
  'findOne',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndReplace',
  'updateOne',
  'updateMany',
  'deleteOne',
  'deleteMany',
  'countDocuments',
  'estimatedDocumentCount',
  'distinct',
  'aggregate',
  'save',
  'insertMany',
  'bulkWrite',
] as const;

export const CANONICAL_COLLECTIONS = [
  'users',
  'student_profiles',
  'student_academic_profiles',
  'courses',
  'quizzes',
  'course_quizzes',
  'quiz_attempts',
  'quiz_submissions',
  'course_registrations',
  'registration_terms',
  'gpa_registration_rules',
  'academic_advising_requests',
  'advising_cases',
  'advising_plans',
  'advising_notes',
  'advising_rules',
  'advising_graphs',
  'advising_audit_logs',
  'course_recommendations',
  'grades',
  'attendance',
  'attendance_records',
  'attendance_sessions',
  'course_staff_assignments',
  'complaints',
  'notifications',
  'academic_emails',
  'exam_schedules',
  'email_logs',
  'faqs',
  'ai_settings',
  'ai_usage_logs',
  'chat_sessions',
  'system_settings',
  'staff_audit_logs',
] as const;

@Injectable()
export class MetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly registry: Registry;

  // HTTP Metrics
  public readonly httpRequestsTotal: Counter<string>;
  public readonly httpRequestDurationSeconds: Histogram<string>;

  // MongoDB & Database Metrics
  public readonly dbQueryDurationSeconds: Histogram<string>;
  public readonly dbSlowQueriesTotal: Counter<string>;
  public readonly dbConnectedStatus: Gauge<string>;

  // Security Metrics
  public readonly authLoginAttemptsTotal: Counter<string>;
  public readonly rateLimitBlocksTotal: Counter<string>;
  public readonly antiCheatViolationsTotal: Counter<string>;

  // Academic Domain Metrics
  public readonly activeQuizAttemptsGauge: Gauge<string>;
  public readonly quizzesSubmittedTotal: Counter<string>;
  public readonly excelRowsImportedTotal: Counter<string>;

  // In-memory telemetry for Admin UI Dashboard
  private totalHttpRequests = 0;
  private totalHttpDurationMs = 0;
  private status2xxCount = 0;
  private status4xxCount = 0;
  private status5xxCount = 0;
  private totalDbQueries = 0;
  private totalDbSlowQueries = 0;
  private successfulLogins = 0;
  private failedLogins = 0;
  private rateLimitBlocks = 0;
  private antiCheatViolations = 0;
  private quizzesSubmitted = 0;
  private excelRowsImported = 0;
  private activeQuizAttempts = 0;
  private quizzesPassed = 0;
  private quizzesFailed = 0;
  private loginsInvalidCredentials = 0;
  private loginsLocked = 0;

  // Label breakdowns (capped to MAX_LABEL_KEYS keys each)
  private readonly rateLimitByEndpoint = new Map<string, number>();
  private readonly antiCheatByReason = new Map<string, number>();
  private readonly excelImportsByType = new Map<string, number>();

  // Circular ring buffer of the last 50 slow queries
  private readonly recentSlowQueries: RecentSlowQuery[] = [];
  private readonly MAX_SLOW_QUERIES = 50;

  // Per collection+operation slow query aggregates (capped at 200 keys)
  private readonly slowQueryAggregates = new Map<
    string,
    {
      collection: string;
      operation: string;
      count: number;
      totalMs: number;
      maxMs: number;
      coldStartCount: number;
    }
  >();

  // Route statistics (capped at 500 items)
  private readonly routeStats = new Map<
    string,
    {
      method: string;
      route: string;
      count: number;
      totalMs: number;
      maxMs: number;
      errorCount: number;
    }
  >();

  // Catalog of all defined routes registered on boot (e.g. from Swagger / Route Explorer)
  private catalogRoutes: Array<{ method: string; path: string }> = [];

  registerCatalogRoutes(routes: Array<{ method: string; path: string }>) {
    this.catalogRoutes = routes;
  }

  // Event loop delay histogram: high lag inflates every measured query time
  private eventLoopHistogram?: ReturnType<typeof monitorEventLoopDelay>;

  constructor(@Optional() private readonly cacheService?: CacheService) {
    this.registry = new Registry();

    // Default System Metrics (CPU, Memory Heap/RSS, Event Loop Lag, GC)
    collectDefaultMetrics({
      register: this.registry,
      prefix: 'student_portal_',
    });

    // HTTP Requests Counter
    this.httpRequestsTotal = new Counter({
      name: 'student_portal_http_requests_total',
      help: 'Total number of HTTP requests received across routes',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    // HTTP Request Duration Histogram
    this.httpRequestDurationSeconds = new Histogram({
      name: 'student_portal_http_request_duration_seconds',
      help: 'HTTP request duration in seconds for latency percentiles (p50, p95, p99)',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
      registers: [this.registry],
    });

    // Database Query Duration Histogram
    this.dbQueryDurationSeconds = new Histogram({
      name: 'student_portal_mongodb_query_duration_seconds',
      help: 'Duration of MongoDB database queries in seconds',
      labelNames: ['collection', 'operation'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2],
      registers: [this.registry],
    });

    // Database Slow Queries Counter (> 100ms)
    this.dbSlowQueriesTotal = new Counter({
      name: 'student_portal_mongodb_slow_queries_total',
      help: 'Total number of MongoDB queries that exceeded 100ms threshold',
      labelNames: ['collection', 'operation'],
      registers: [this.registry],
    });

    // Database Connection State Gauge (1 = connected, 0 = disconnected)
    this.dbConnectedStatus = new Gauge({
      name: 'student_portal_mongodb_connected',
      help: 'MongoDB connection status (1 = connected, 0 = disconnected)',
      registers: [this.registry],
    });
    this.dbConnectedStatus.set(0);

    // Security: Auth Login Attempts
    this.authLoginAttemptsTotal = new Counter({
      name: 'student_portal_auth_login_attempts_total',
      help: 'Total authentication login attempts by status (success, invalid_credentials, locked)',
      labelNames: ['status'],
      registers: [this.registry],
    });

    // Security: Rate Limit Blocks
    this.rateLimitBlocksTotal = new Counter({
      name: 'student_portal_rate_limit_blocks_total',
      help: 'Total requests blocked by rate limiting (HTTP 429)',
      labelNames: ['endpoint'],
      registers: [this.registry],
    });

    // Security: Anti-Cheat Violations
    this.antiCheatViolationsTotal = new Counter({
      name: 'student_portal_anti_cheat_violations_total',
      help: 'Total anti-cheat violations detected during online quizzes',
      labelNames: ['reason'],
      registers: [this.registry],
    });

    // Academic: Active Quiz Attempts in Progress
    this.activeQuizAttemptsGauge = new Gauge({
      name: 'student_portal_active_quiz_attempts_gauge',
      help: 'Current active quiz attempts in progress',
      registers: [this.registry],
    });
    this.activeQuizAttemptsGauge.set(0);

    // Academic: Quizzes Submitted
    this.quizzesSubmittedTotal = new Counter({
      name: 'student_portal_quizzes_submitted_total',
      help: 'Total quizzes submitted by outcome (passed, failed)',
      labelNames: ['status'],
      registers: [this.registry],
    });

    // Academic: Excel Rows Imported
    this.excelRowsImportedTotal = new Counter({
      name: 'student_portal_excel_rows_imported_total',
      help: 'Total Excel records imported by category',
      labelNames: ['type'],
      registers: [this.registry],
    });
  }

  onModuleInit() {
    try {
      this.eventLoopHistogram = monitorEventLoopDelay({ resolution: 20 });
      this.eventLoopHistogram.enable();
    } catch {
      this.eventLoopHistogram = undefined;
    }
  }

  onModuleDestroy() {
    this.eventLoopHistogram?.disable();
  }

  private incrementLabel(map: Map<string, number>, key: string, by = 1) {
    if (map.size >= MAX_LABEL_KEYS && !map.has(key)) return;
    map.set(key, (map.get(key) ?? 0) + by);
  }

  private toLabelCounts(map: Map<string, number>): LabelCount[] {
    return Array.from(map.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }

  getRegistry(): Registry {
    return this.registry;
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }

  recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    durationSeconds: number,
  ) {
    const labels = {
      method: method.toUpperCase(),
      route,
      status_code: String(statusCode),
    };
    this.httpRequestsTotal.inc(labels);
    this.httpRequestDurationSeconds.observe(labels, durationSeconds);

    this.totalHttpRequests++;
    this.totalHttpDurationMs += durationSeconds * 1000;
    if (statusCode >= 200 && statusCode < 400) this.status2xxCount++;
    else if (statusCode >= 400 && statusCode < 500) this.status4xxCount++;
    else if (statusCode >= 500) this.status5xxCount++;

    // Track route latency (capped to 100 unique routes to prevent memory leaks)
    const upperMethod = method.toUpperCase();
    const routeKey = `${upperMethod} ${route}`;
    if (this.routeStats.size < 100 || this.routeStats.has(routeKey)) {
      const durationMs = durationSeconds * 1000;
      const existing = this.routeStats.get(routeKey) || {
        method: upperMethod,
        route,
        count: 0,
        totalMs: 0,
        maxMs: 0,
        errorCount: 0,
      };
      existing.count++;
      existing.totalMs += durationMs;
      existing.maxMs = Math.max(existing.maxMs, durationMs);
      if (statusCode >= 400) existing.errorCount++;
      this.routeStats.set(routeKey, existing);
    }
  }

  recordDbQuery(
    collection: string,
    operation: string,
    durationSeconds: number,
    details?: DbQueryDetails | string,
  ) {
    const labels = { collection, operation };
    this.dbQueryDurationSeconds.observe(labels, durationSeconds);
    this.totalDbQueries++;

    const durationMs = Math.round(durationSeconds * 1000);
    if (durationSeconds >= 0.1) {
      this.dbSlowQueriesTotal.inc(labels);
      this.totalDbSlowQueries++;

      const normalized: DbQueryDetails =
        typeof details === 'string' ? { filter: details } : (details ?? {});
      const uptimeSeconds = Math.floor(process.uptime());
      const isColdStart = uptimeSeconds <= COLD_START_WINDOW_SECONDS;

      // Append to ring buffer
      this.recentSlowQueries.unshift({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        collection,
        operation,
        durationMs,
        timestamp: new Date().toISOString(),
        filter: normalized.filter ? normalized.filter.slice(0, 200) : undefined,
        options: normalized.options
          ? normalized.options.slice(0, 200)
          : undefined,
        uptimeSeconds,
        isColdStart,
      });

      if (this.recentSlowQueries.length > this.MAX_SLOW_QUERIES) {
        this.recentSlowQueries.pop();
      }

      const aggKey = `${collection}:${operation}`;
      if (
        this.slowQueryAggregates.size < 200 ||
        this.slowQueryAggregates.has(aggKey)
      ) {
        const agg = this.slowQueryAggregates.get(aggKey) || {
          collection,
          operation,
          count: 0,
          totalMs: 0,
          maxMs: 0,
          coldStartCount: 0,
        };
        agg.count++;
        agg.totalMs += durationMs;
        agg.maxMs = Math.max(agg.maxMs, durationMs);
        if (isColdStart) agg.coldStartCount++;
        this.slowQueryAggregates.set(aggKey, agg);
      }
    }
  }

  setDbConnected(isConnected: boolean) {
    this.dbConnectedStatus.set(isConnected ? 1 : 0);
  }

  recordLoginAttempt(status: 'success' | 'invalid_credentials' | 'locked') {
    this.authLoginAttemptsTotal.inc({ status });
    if (status === 'success') {
      this.successfulLogins++;
    } else {
      this.failedLogins++;
      if (status === 'locked') this.loginsLocked++;
      else this.loginsInvalidCredentials++;
    }
  }

  recordRateLimitBlock(endpoint = 'general') {
    this.rateLimitBlocksTotal.inc({ endpoint });
    this.rateLimitBlocks++;
    this.incrementLabel(this.rateLimitByEndpoint, endpoint);
  }

  recordAntiCheatViolation(reason: string) {
    this.antiCheatViolationsTotal.inc({ reason });
    this.antiCheatViolations++;
    this.incrementLabel(this.antiCheatByReason, reason);
  }

  updateActiveQuizAttempts(delta: number) {
    this.activeQuizAttempts = Math.max(0, this.activeQuizAttempts + delta);
    this.activeQuizAttemptsGauge.set(this.activeQuizAttempts);
  }

  recordQuizSubmission(isPassed: boolean) {
    const status = isPassed ? 'passed' : 'failed';
    this.quizzesSubmittedTotal.inc({ status });
    this.quizzesSubmitted++;
    if (isPassed) this.quizzesPassed++;
    else this.quizzesFailed++;
  }

  recordExcelRowsImported(type: string, count: number) {
    this.excelRowsImportedTotal.inc({ type }, count);
    this.excelRowsImported += count;
    this.incrementLabel(this.excelImportsByType, type, count);
  }

  async getSummary() {
    const memory = process.memoryUsage();
    const uptimeSec = Math.floor(process.uptime());

    const conn = ConnectionHolder.connection || mongoose.connection;
    const readyState = conn?.readyState ?? 0;
    const isDbConnected = Number(readyState) === 1;

    let pingLatencyMs = -1;
    if (isDbConnected && conn?.db) {
      try {
        const start = process.hrtime.bigint();
        await conn.db.admin().ping();
        const diffNs = Number(process.hrtime.bigint() - start);
        pingLatencyMs = Math.round((diffNs / 1e6) * 100) / 100;
      } catch {
        pingLatencyMs = -1;
      }
    }

    const avgLatencyMs =
      this.totalHttpRequests > 0
        ? Math.round(this.totalHttpDurationMs / this.totalHttpRequests)
        : 0;

    const rps =
      uptimeSec > 0
        ? Math.round((this.totalHttpRequests / uptimeSec) * 10) / 10
        : 0;

    const errorCount = this.status4xxCount + this.status5xxCount;
    const errorRatePercent =
      this.totalHttpRequests > 0
        ? Math.round((errorCount / this.totalHttpRequests) * 1000) / 10
        : 0;

    // Build unified route catalogue: seed from Swagger catalog, overlay observed traffic
    const mergedRoutesMap = new Map<string, RouteLatencyStat>();

    // 1. Seed with all routes discovered from the Swagger/NestJS controller catalog
    for (const ep of this.catalogRoutes) {
      const cleanPath = ep.path.startsWith('/api')
        ? ep.path
        : `/api${ep.path.startsWith('/') ? '' : '/'}${ep.path}`;
      const routeKey = `${ep.method} ${cleanPath}`;
      mergedRoutesMap.set(routeKey, {
        route: routeKey,
        method: ep.method,
        count: 0,
        avgLatencyMs: 0,
        maxLatencyMs: 0,
        errorCount: 0,
      });
    }

    // 2. Overlay live traffic stats
    for (const stat of this.routeStats.values()) {
      const routeKey = `${stat.method} ${stat.route}`;
      mergedRoutesMap.set(routeKey, {
        route: routeKey,
        method: stat.method,
        count: stat.count,
        avgLatencyMs: Math.round(stat.totalMs / stat.count),
        maxLatencyMs: Math.round(stat.maxMs),
        errorCount: stat.errorCount,
      });
    }

    const allRoutes: RouteLatencyStat[] = Array.from(
      mergedRoutesMap.values(),
    ).sort((a, b) => {
      // Active routes with traffic first, sorted by latency desc; then unused catalog routes
      if (b.count > 0 && a.count > 0) return b.avgLatencyMs - a.avgLatencyMs;
      if (b.count > 0) return 1;
      if (a.count > 0) return -1;
      return a.route.localeCompare(b.route);
    });
    const topSlowestRoutes = allRoutes.filter((r) => r.count > 0).slice(0, 5);

    const slowQueriesByCollection: SlowQueryAggregate[] = Array.from(
      this.slowQueryAggregates.values(),
    )
      .map((agg) => ({
        collection: agg.collection,
        operation: agg.operation,
        count: agg.count,
        avgMs: Math.round(agg.totalMs / agg.count),
        maxMs: agg.maxMs,
        coldStartCount: agg.coldStartCount,
      }))
      .sort((a, b) => b.count - a.count);

    const collectionsSet = new Set<string>([
      ...CANONICAL_COLLECTIONS,
      ...this.recentSlowQueries.map((q) => q.collection),
      ...Array.from(this.slowQueryAggregates.values()).map((a) => a.collection),
    ]);

    const operationsSet = new Set<string>([
      ...CANONICAL_OPERATIONS,
      ...this.recentSlowQueries.map((q) => q.operation),
      ...Array.from(this.slowQueryAggregates.values()).map((a) => a.operation),
    ]);

    const elh = this.eventLoopHistogram;
    const nsToMs = (ns: number) =>
      Number.isFinite(ns) ? Math.round((ns / 1e6) * 100) / 100 : 0;
    const eventLoop = elh
      ? {
          meanMs: nsToMs(elh.mean),
          p99Ms: nsToMs(elh.percentile(99)),
          maxMs: nsToMs(elh.max),
        }
      : { meanMs: 0, p99Ms: 0, maxMs: 0 };

    const loadAvg = os.loadavg();
    const cpus = os.cpus();
    const poolConfig = {
      minPoolSize: Number(process.env.MONGODB_MIN_POOL_SIZE ?? 5),
      maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE ?? 50),
    };

    return {
      timestamp: new Date().toISOString(),
      uptimeSeconds: uptimeSec,
      system: {
        nodeVersion: process.version,
        platform: os.platform(),
        arch: os.arch(),
        cpuCores: cpus ? cpus.length : 1,
        loadAverage: [
          Math.round(loadAvg[0] * 100) / 100,
          Math.round(loadAvg[1] * 100) / 100,
          Math.round(loadAvg[2] * 100) / 100,
        ],
        memoryHeapUsedMb: Math.round((memory.heapUsed / 1024 / 1024) * 10) / 10,
        memoryHeapTotalMb:
          Math.round((memory.heapTotal / 1024 / 1024) * 10) / 10,
        memoryRssMb: Math.round((memory.rss / 1024 / 1024) * 10) / 10,
        totalMemoryMb: Math.round((os.totalmem() / 1024 / 1024) * 10) / 10,
        freeMemoryMb: Math.round((os.freemem() / 1024 / 1024) * 10) / 10,
        cpuUsage: process.cpuUsage(),
        eventLoop,
      },
      http: {
        totalRequests: this.totalHttpRequests,
        requestsPerSecond: rps,
        status2xx: this.status2xxCount,
        status4xx: this.status4xxCount,
        status5xx: this.status5xxCount,
        errorRatePercent,
        avgLatencyMs,
        topSlowestRoutes,
        routes: allRoutes,
        availableMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      },
      infrastructure: {
        redis:
          process.env.REDIS_HOST || process.env.REDIS_URL
            ? 'online'
            : 'inline_fallback',
        firebase: process.env.FIREBASE_PROJECT_ID ? 'online' : 'disabled',
      },
      cache: this.cacheService
        ? this.cacheService.getHealth()
        : {
            status: 'disabled',
            driver: 'memory',
            effectiveDriver: 'memory',
            redisConnected: false,
            itemCount: 0,
          },
      database: {
        status: isDbConnected ? 'connected' : 'disconnected',
        pingLatencyMs,
        readyState,
        pool: poolConfig,
        totalQueries: this.totalDbQueries,
        slowQueriesCount: this.totalDbSlowQueries,
        slowQueryThresholdMs: 100,
        coldStartWindowSeconds: COLD_START_WINDOW_SECONDS,
        recentSlowQueries: this.recentSlowQueries,
        slowQueriesByCollection,
        availableCollections: Array.from(collectionsSet).sort(),
        availableOperations: Array.from(operationsSet).sort(),
      },
      security: {
        successfulLogins: this.successfulLogins,
        failedLogins: this.failedLogins,
        invalidCredentialLogins: this.loginsInvalidCredentials,
        lockedLogins: this.loginsLocked,
        rateLimitBlocks: this.rateLimitBlocks,
        antiCheatViolations: this.antiCheatViolations,
        rateLimitByEndpoint: this.toLabelCounts(this.rateLimitByEndpoint),
        antiCheatByReason: this.toLabelCounts(this.antiCheatByReason),
      },
      academic: {
        activeQuizAttempts: this.activeQuizAttempts,
        quizzesSubmitted: this.quizzesSubmitted,
        quizzesPassed: this.quizzesPassed,
        quizzesFailed: this.quizzesFailed,
        excelRowsImported: this.excelRowsImported,
        excelImportsByType: this.toLabelCounts(this.excelImportsByType),
      },
    };
  }
}
