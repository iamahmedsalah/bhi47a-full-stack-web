import type mongoose from 'mongoose';
import type { MetricsService } from '../core/metrics/metrics.service';

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
) {
  if (attached.has(client)) return;
  attached.add(client);
  let waiters = 0;
  const checkedOut = new Set<string>();
  const finishCheckout = (durationMS: number, outcome: string) => {
    waiters = Math.max(0, waiters - 1);
    metrics.poolWaiters.set(waiters);
    if (Number.isFinite(durationMS) && durationMS >= 0)
      metrics.poolCheckoutSeconds.observe({ outcome }, durationMS / 1000);
  };
  client.on('connectionCheckOutStarted', () => {
    metrics.poolWaiters.set(++waiters);
  });
  client.on('connectionCheckedOut', (event) => {
    finishCheckout(event.durationMS, 'success');
    checkedOut.add(`${event.address}:${event.connectionId}`);
    metrics.poolCheckedOut.set(checkedOut.size);
  });
  client.on('connectionCheckOutFailed', (event) => {
    const reason = ['timeout', 'poolClosed', 'connectionError'].includes(
      event.reason,
    )
      ? event.reason
      : 'other';
    finishCheckout(event.durationMS, reason);
  });
  client.on('connectionCheckedIn', (event) => {
    checkedOut.delete(`${event.address}:${event.connectionId}`);
    metrics.poolCheckedOut.set(checkedOut.size);
  });
  client.on('connectionClosed', (event) => {
    checkedOut.delete(`${event.address}:${event.connectionId}`);
    metrics.poolCheckedOut.set(checkedOut.size);
  });
  const command = (name: string, ms: number, outcome: string) => {
    if (Number.isFinite(ms) && ms >= 0)
      metrics.mongoCommandSeconds.observe(
        { command: COMMANDS.has(name) ? name : 'other', outcome },
        ms / 1000,
      );
  };
  client.on('commandSucceeded', (event) =>
    command(event.commandName, event.duration, 'success'),
  );
  client.on('commandFailed', (event) =>
    command(event.commandName, event.duration, 'failure'),
  );
}
