import type mongoose from 'mongoose';
import type { MetricsService } from '../core/metrics/metrics.service';
import type { AppLoggerService } from '../core/logger/logger.service';
import { getRequestQueryContext } from '../core/metrics/request-query-context';
import type {
  MongoFailureContext,
  MongoFailureKind,
} from './mongo-driver-diagnostics';

const attached = new WeakSet<object>();
const COMMANDS = new Set([
  'find',
  'aggregate',
  'count',
  'distinct',
  'getMore',
  'insert',
  'update',
  'delete',
  'findAndModify',
  'ping',
  'killCursors',
  'commitTransaction',
  'abortTransaction',
]);

/** Never captures command documents, replies, server addresses or driver error text. */
export function attachMongoDriverMetrics(
  client: mongoose.mongo.MongoClient,
  metrics: MetricsService,
  logger?: Pick<AppLoggerService, 'warn'>,
) {
  if (attached.has(client)) return;
  attached.add(client);
  let waiters = 0;
  const checkedOut = new Set<string>();
  const pending = new Map<
    number,
    { at: number; context: MongoFailureContext }
  >();
  const safeCommand = (name: string) => (COMMANDS.has(name) ? name : 'other');
  const poolState = () =>
    metrics.mongoDiagnostics.poolState(checkedOut.size, waiters);
  const failure = (
    kind: MongoFailureKind,
    command: string,
    ms: number,
    error: unknown,
    context?: MongoFailureContext,
  ) => {
    const item = metrics.mongoDiagnostics.failure(
      kind,
      command,
      Number.isFinite(ms) && ms >= 0 ? ms : 0,
      error,
      context,
    );
    // The ring/counters retain failures even when log emission is rate limited.
    if (metrics.mongoDiagnostics.shouldLogFailure())
      logger?.warn('MongoDB driver failure', {
        context: 'MongoDriverDiagnostics',
        ...item,
      });
  };
  const finishCheckout = (durationMS: number, outcome: string) => {
    waiters = Math.max(0, waiters - 1);
    metrics.poolWaiters.set(waiters);
    poolState();
    metrics.mongoDiagnostics.checkout(
      Number.isFinite(durationMS) && durationMS >= 0 ? durationMS : 0,
      outcome === 'success',
    );
    if (Number.isFinite(durationMS) && durationMS >= 0)
      metrics.poolCheckoutSeconds.observe({ outcome }, durationMS / 1000);
  };
  client.on('connectionCheckOutStarted', () => {
    metrics.poolWaiters.set(++waiters);
    poolState();
  });
  client.on('connectionCheckedOut', (event) => {
    finishCheckout(event.durationMS, 'success');
    checkedOut.add(`${event.address}:${event.connectionId}`);
    metrics.poolCheckedOut.set(checkedOut.size);
    poolState();
  });
  client.on('connectionCheckOutFailed', (event) => {
    const reason =
      event.reason === 'timeout' ||
      event.reason === 'poolClosed' ||
      event.reason === 'connectionError'
        ? event.reason
        : 'other';
    finishCheckout(event.durationMS, reason);
    // This driver version exposes a reason, not the original exception.
    failure('checkout', 'other', event.durationMS, undefined, {
      checkoutReason: reason,
    });
  });
  client.on('connectionCheckedIn', (event) => {
    checkedOut.delete(`${event.address}:${event.connectionId}`);
    metrics.poolCheckedOut.set(checkedOut.size);
    poolState();
  });
  client.on('connectionClosed', (event) => {
    checkedOut.delete(`${event.address}:${event.connectionId}`);
    metrics.poolCheckedOut.set(checkedOut.size);
    poolState();
  });
  client.on('connectionPoolCleared', () =>
    metrics.mongoDiagnostics.poolCleared(),
  );
  client.on('serverHeartbeatFailed', (event) =>
    failure('heartbeat', 'ping', event.duration, event.failure),
  );
  client.on('commandStarted', (event) => {
    const now = Date.now();
    for (const [id, entry] of pending)
      if (now - entry.at > 300_000) pending.delete(id);
    if (pending.size >= 1000) pending.delete(pending.keys().next().value!);
    const context = getRequestQueryContext();
    pending.set(event.requestId, {
      at: now,
      context: {
        requestId: context?.request.requestId,
        stage: context?.stage,
      },
    });
  });
  const command = (name: string, ms: number, outcome: string) => {
    if (Number.isFinite(ms) && ms >= 0) {
      metrics.mongoDiagnostics.command(
        safeCommand(name),
        ms,
        outcome === 'success',
      );
      metrics.mongoCommandSeconds.observe(
        { command: safeCommand(name), outcome },
        ms / 1000,
      );
    }
  };
  client.on('commandSucceeded', (event) => {
    pending.delete(event.requestId);
    command(event.commandName, event.duration, 'success');
  });
  client.on('commandFailed', (event) => {
    const context = pending.get(event.requestId)?.context;
    pending.delete(event.requestId);
    command(event.commandName, event.duration, 'failure');
    failure(
      'command',
      safeCommand(event.commandName),
      event.duration,
      event.failure,
      context,
    );
  });
}
