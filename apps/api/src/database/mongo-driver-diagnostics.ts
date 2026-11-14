import { Counter, type Registry } from 'prom-client';

export type MongoFailureKind =
  'command' | 'checkout' | 'heartbeat' | 'operation';
export interface MongoFailureContext {
  requestId?: string;
  stage?: string;
  operation?: string;
  checkoutReason?: 'timeout' | 'poolClosed' | 'connectionError' | 'other';
}

/** No error messages, stacks, command documents, addresses or query values. */
export function describeMongoFailure(error: unknown) {
  const chain: Array<Record<string, unknown>> = [];
  let current = error;
  for (
    let depth = 0;
    depth < 4 && current && typeof current === 'object';
    depth++
  ) {
    const item = current as Record<string, unknown>;
    chain.push(item);
    current = item.cause;
  }
  const has = (name: string) => chain.some((item) => item.name === name);
  const codeIs = (...codes: Array<string | number>) =>
    chain.some((item) => codes.includes(item.code as string | number));
  const category = has('MongoNetworkTimeoutError')
    ? 'socket_timeout'
    : has('MongoServerSelectionError')
      ? 'server_selection'
      : has('MongoWaitQueueTimeoutError')
        ? 'checkout_timeout'
        : has('MongoOperationTimeoutError')
          ? 'operation_timeout'
          : codeIs(50, 262)
            ? 'execution_timeout'
            : codeIs(18)
              ? 'authentication'
              : codeIs(13)
                ? 'authorization'
                : codeIs('ENOTFOUND', 'EAI_AGAIN')
                  ? 'dns'
                  : codeIs(
                        'ECONNRESET',
                        'ECONNREFUSED',
                        'EPIPE',
                        'ETIMEDOUT',
                      ) || has('MongoNetworkError')
                    ? 'network'
                    : codeIs(91, 189, 10107, 11600, 11602, 13435)
                      ? 'topology'
                      : has('MongoPoolClearedError')
                        ? 'pool_cleared'
                        : 'other';
  const knownNames = new Set([
    'MongoNetworkTimeoutError',
    'MongoServerSelectionError',
    'MongoWaitQueueTimeoutError',
    'MongoNetworkError',
    'MongoServerError',
    'MongoPoolClearedError',
    'MongoOperationTimeoutError',
  ]);
  const name = chain.find((item) => knownNames.has(String(item.name)))?.name;
  const code = chain
    .map((item) => item.code)
    .find(
      (value) =>
        (typeof value === 'number' &&
          Number.isSafeInteger(value) &&
          value >= 0 &&
          value <= 2_147_483_647) ||
        [
          'ENOTFOUND',
          'EAI_AGAIN',
          'ECONNRESET',
          'ECONNREFUSED',
          'EPIPE',
          'ETIMEDOUT',
        ].includes(String(value)),
    );
  return {
    category,
    errorName: typeof name === 'string' ? name : 'Other',
    code:
      typeof code === 'number' || typeof code === 'string' ? code : undefined,
  };
}

export interface MongoFailureSample
  extends ReturnType<typeof describeMongoFailure>, MongoFailureContext {
  timestamp: string;
  kind: MongoFailureKind;
  command: string;
  durationMs: number;
}

export class MongoDriverDiagnostics {
  private readonly failures: Counter<string>;
  private readonly clears: Counter<string>;
  private readonly commands = new Map<
    string,
    { count: number; failures: number; totalMs: number; maxMs: number }
  >();
  private readonly recentFailures: MongoFailureSample[] = [];
  private checkoutCount = 0;
  private checkoutFailures = 0;
  private checkoutTotalMs = 0;
  private checkoutMaxMs = 0;
  private checkedOut = 0;
  private waiters = 0;
  private poolClears = 0;
  private logWindowStart = 0;
  private failureLogs = 0;

  constructor(registry: Registry) {
    this.failures = new Counter({
      name: 'student_portal_mongodb_driver_failures_total',
      help: 'Database failures by bounded kind, command and sanitized category; operation and command events may describe the same failure',
      labelNames: ['kind', 'command', 'category'],
      registers: [registry],
    });
    this.clears = new Counter({
      name: 'student_portal_mongodb_pool_clears_total',
      help: 'Driver pool clear events since process startup',
      registers: [registry],
    });
  }

  poolState(checkedOut: number, waiters: number) {
    this.checkedOut = checkedOut;
    this.waiters = waiters;
  }

  checkout(ms: number, success: boolean) {
    this.checkoutCount++;
    if (!success) this.checkoutFailures++;
    this.checkoutTotalMs += ms;
    this.checkoutMaxMs = Math.max(this.checkoutMaxMs, ms);
  }

  command(command: string, ms: number, success: boolean) {
    const item = this.commands.get(command) ?? {
      count: 0,
      failures: 0,
      totalMs: 0,
      maxMs: 0,
    };
    item.count++;
    if (!success) item.failures++;
    item.totalMs += ms;
    item.maxMs = Math.max(item.maxMs, ms);
    this.commands.set(command, item);
  }

  poolCleared() {
    this.poolClears++;
    this.clears.inc();
  }

  shouldLogFailure() {
    const now = Date.now();
    if (now - this.logWindowStart >= 60_000) {
      this.logWindowStart = now;
      this.failureLogs = 0;
    }
    return this.failureLogs++ < 10;
  }

  failure(
    kind: MongoFailureKind,
    command: string,
    durationMs: number,
    error: unknown,
    context?: MongoFailureContext,
  ) {
    const description = describeMongoFailure(error);
    if (kind === 'checkout' && context?.checkoutReason === 'timeout')
      description.category = 'checkout_timeout';
    const item: MongoFailureSample = {
      timestamp: new Date().toISOString(),
      kind,
      command,
      durationMs,
      ...description,
      ...context,
    };
    this.failures.inc({ kind, command, category: item.category });
    this.recentFailures.unshift(item);
    this.recentFailures.splice(50);
    return item;
  }

  snapshot() {
    return {
      scope: 'process' as const,
      checkedOut: this.checkedOut,
      waiters: this.waiters,
      poolClears: this.poolClears,
      checkout: {
        count: this.checkoutCount,
        failures: this.checkoutFailures,
        avgMs: this.checkoutCount
          ? this.checkoutTotalMs / this.checkoutCount
          : null,
        maxMs: this.checkoutCount ? this.checkoutMaxMs : null,
      },
      commands: [...this.commands].map(([command, item]) => ({
        command,
        count: item.count,
        failures: item.failures,
        avgMs: item.totalMs / item.count,
        maxMs: item.maxMs,
      })),
      recentFailures: this.recentFailures.map((item) => ({ ...item })),
    };
  }
}
