import api from '@/lib/api';

export interface LabelCount {
  label: string;
  count: number;
}

export function latencyTone(ms: number, warn = 50, danger = 200) {
  if (ms >= danger) return 'bg-rose-500/15 text-rose-400 border border-rose-500/30';
  if (ms >= warn) return 'bg-amber-500/15 text-amber-300 border border-amber-500/30';
  return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
}

export interface RouteLatencyStat {
  route: string;
  method?: string;
  count: number;
  avgLatencyMs: number;
  maxLatencyMs?: number;
  errorCount?: number;
  clientErrorCount?: number;
  serverErrorCount?: number;
  statusCounts?: Record<string, number>;
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
  traffic?: HttpTraffic;
  recentSlowRequests?: Array<{
    requestId: string; timestamp: string; method: string; route: string; status: number;
    durationMs: number; databaseOperations: number; summedDatabaseMs: number; stages: Record<string, number>;
  }>;
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
    redis?: {
      provider: 'self-hosted' | 'upstash' | 'external' | 'none' | 'unknown';
      cacheCommandAttemptsSinceStart: number;
      quotaAvailable: false;
    };
  };
  database: {
    status: 'connected' | 'disconnected';
    pingLatencyMs: number;
    readyState: number;
    pool?: { minPoolSize: number; maxPoolSize: number };
    driverDiagnostics?: {
      scope: 'process'; checkedOut: number; waiters: number; poolClears: number;
      checkout: { count: number; failures: number; avgMs: number | null; maxMs: number | null };
      commands: Array<{ command: string; count: number; failures: number; avgMs: number; maxMs: number }>;
      recentFailures: Array<{
        timestamp: string; kind: 'command' | 'checkout' | 'heartbeat' | 'operation'; command: string;
        durationMs: number; category: string; errorName: string; code?: string | number;
        requestId?: string; stage?: string; operation?: string;
        checkoutReason?: 'timeout' | 'poolClosed' | 'connectionError' | 'other';
      }>;
    };
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
    currentlyLockedAccounts?: number;
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
export async function getMetricsSummary(window: TrafficWindow = '5m'): Promise<MetricsSummaryResponse> {
  const res = await api.get<MetricsSummaryResponse>('/metrics/summary', { params: { window } });
  return res.data;
}

export type TrafficWindow = '5m' | '15m' | '1h' | '24h';
export interface HttpTraffic {
  source: 'process' | 'prometheus'; window: TrafficWindow; observedSeconds: number; resolutionSeconds: number;
  prometheusAvailable: boolean;
  totalRequests: number; requestsPerSecond: number;
  avgLatencyMs: number | null; p50LatencyMs: number | null; p95LatencyMs: number | null; p99LatencyMs: number | null;
  status2xx: number; status3xx: number; status4xx: number; status5xx: number;
  rawErrorRatePercent: number; actionableErrorRatePercent: number;
  statusCounts: Record<string, number>; outcomes: Record<string, number>;
  avgDbQueries?: number | null; p95DbQueries?: number | null;
  successfulP95LatencyMs?: number | null;
  latencyUpperBoundMs?: number;
  latencyOverflowRequests?: number;
  overTenSeconds?: number;
  routes: Array<{ route: string; totalRequests: number; p95LatencyMs: number | null; errorCount?: number; status4xx?: number; status5xx?: number; latencyUpperBoundMs?: number; latencyOverflowRequests?: number; overTenSeconds?: number }>;
}

export interface LockedAccountItem {
  _id: string;
  name: string;
  nameAr?: string;
  role: 'student' | 'admin' | 'staff';
  staffType?: string;
  userCode?: string;
  studentCode?: string;
  staffCode?: string;
  email?: string;
  nationalId?: string;
  failedLoginAttempts?: number;
  loginAttempts?: number;
  lockUntil?: string;
  lockedUntil?: string;
  lastLoginAt?: string;
  updatedAt?: string;
  avatarUrl?: string;
}

export interface UnlockAccountResult {
  success: boolean;
  message: string;
}

export interface UnlockAllAccountsResult {
  success: boolean;
  unlockedCount: number;
  message: string;
}

/** GET /api/admin/metrics/locked-accounts */
export async function getLockedAccounts(): Promise<LockedAccountItem[]> {
  const res = await api.get<LockedAccountItem[]>('/admin/metrics/locked-accounts');
  return res.data;
}

/** POST /api/admin/metrics/unlock-account/:id */
export async function unlockAccount(id: string): Promise<UnlockAccountResult> {
  const res = await api.post<UnlockAccountResult>(`/admin/metrics/unlock-account/${id}`);
  return res.data;
}

/** POST /api/admin/metrics/unlock-all-accounts */
export async function unlockAllAccounts(): Promise<UnlockAllAccountsResult> {
  const res = await api.post<UnlockAllAccountsResult>('/admin/metrics/unlock-all-accounts');
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

