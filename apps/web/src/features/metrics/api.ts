import api from '@/lib/api';

export interface LabelCount {
  label: string;
  count: number;
}

export interface RouteLatencyStat {
  route: string;
  method?: string;
  count: number;
  avgLatencyMs: number;
  maxLatencyMs?: number;
  errorCount?: number;
}

export interface RecentSlowQuery {
  id: string;
  collection: string;
  operation: string;
  durationMs: number;
  timestamp: string;
  filter?: string;
  options?: string;
  uptimeSeconds?: number;
  isColdStart?: boolean;
}

export interface SlowQueryAggregate {
  collection: string;
  operation: string;
  count: number;
  avgMs: number;
  maxMs: number;
  coldStartCount: number;
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

export interface MetricsSummaryResponse {
  timestamp: string;
  uptimeSeconds: number;
  system: {
    nodeVersion: string;
    platform?: string;
    arch?: string;
    cpuCores?: number;
    loadAverage?: [number, number, number];
    memoryHeapUsedMb: number;
    memoryHeapTotalMb: number;
    memoryRssMb: number;
    totalMemoryMb?: number;
    freeMemoryMb?: number;
    cpuUsage: {
      user: number;
      system: number;
    };
    eventLoop?: {
      meanMs: number;
      p99Ms: number;
      maxMs: number;
    };
  };
  http: {
    totalRequests: number;
    requestsPerSecond: number;
    status2xx: number;
    status4xx: number;
    status5xx: number;
    errorRatePercent?: number;
    avgLatencyMs: number;
    topSlowestRoutes?: RouteLatencyStat[];
    routes?: RouteLatencyStat[];
    availableMethods?: string[];
  };
  infrastructure?: {
    redis: 'online' | 'inline_fallback';
    firebase: 'online' | 'disabled';
  };
  cache?: {
    status: 'healthy' | 'degraded' | 'disabled' | 'offline';
    driver: string;
    effectiveDriver: string;
    redisConnected: boolean;
    itemCount: number;
    quota?: {
      mode: 'preserved' | 'active' | 'offline';
      dailyLimit: number;
      commandsToday: number;
      quotaUsedPercent: number;
      policy: string;
      statusText: string;
      details: string;
    };
  };
  database: {
    status: 'connected' | 'disconnected';
    pingLatencyMs: number;
    readyState: number;
    pool?: { minPoolSize: number; maxPoolSize: number };
    totalQueries: number;
    slowQueriesCount: number;
    slowQueryThresholdMs?: number;
    coldStartWindowSeconds?: number;
    recentSlowQueries: RecentSlowQuery[];
    slowQueriesByCollection?: SlowQueryAggregate[];
    availableCollections?: string[];
    availableOperations?: string[];
  };
  security: {
    successfulLogins: number;
    failedLogins: number;
    invalidCredentialLogins?: number;
    lockedLogins?: number;
    rateLimitBlocks: number;
    antiCheatViolations: number;
    rateLimitByEndpoint?: LabelCount[];
    antiCheatByReason?: LabelCount[];
  };
  academic: {
    activeQuizAttempts: number;
    quizzesSubmitted: number;
    quizzesPassed?: number;
    quizzesFailed?: number;
    excelRowsImported: number;
    excelImportsByType?: LabelCount[];
  };
}

/** GET /api/metrics/summary (admin only, JSON envelope). */
export async function getMetricsSummary(): Promise<MetricsSummaryResponse> {
  const res = await api.get<MetricsSummaryResponse>('/metrics/summary');
  return res.data;
}

/**
 * GET /api/metrics (admin cookie or scrape secret). Returns raw Prometheus
 * exposition text. The handler writes the response directly (bypassing the
 * envelope), and the axios interceptor unwraps `response.data`, so the
 * resolved value is the text body itself.
 */
export async function getRawPrometheusMetrics(): Promise<string> {
  const raw: unknown = await api.get('/metrics', {
    responseType: 'text',
    transformResponse: (data: unknown) => data,
  });
  return typeof raw === 'string' ? raw : String(raw ?? '');
}
