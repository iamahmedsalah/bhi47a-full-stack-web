import { EventEmitter } from 'node:events';
import { MetricsService } from '../core/metrics/metrics.service';
import { attachMongoDriverMetrics } from './mongodb-driver-metrics';

describe('driver diagnostics', () => {
  it('uses each checkout duration directly, bounds labels, and keeps commands separate from query counts', async () => {
    const metrics = new MetricsService();
    const client = new EventEmitter();
    try {
      attachMongoDriverMetrics(client as never, metrics);
      attachMongoDriverMetrics(client as never, metrics);
      client.emit('connectionCheckOutStarted', {});
      client.emit('connectionCheckOutStarted', {});
      client.emit('connectionCheckedOut', {
        address: 'private-host',
        connectionId: 1,
        durationMS: 1014,
      });
      client.emit('connectionCheckOutFailed', {
        durationMS: 1050,
        reason: 'timeout',
      });
      client.emit('commandSucceeded', {
        commandName: 'find',
        duration: 12,
        reply: { private: 'never-export' },
      });
      client.emit('commandFailed', {
        commandName: 'arbitrary-untrusted',
        duration: 8,
        failure: new Error('never-export'),
      });
      client.emit('connectionCheckedIn', {
        address: 'private-host',
        connectionId: 1,
      });
      const exported = await metrics.getMetrics();
      expect(exported).toContain(
        'student_portal_mongodb_pool_checkout_seconds_sum{outcome="success"} 1.014',
      );
      expect(exported).toContain(
        'student_portal_mongodb_pool_checkout_seconds_sum{outcome="timeout"} 1.05',
      );
      expect(exported).toContain('student_portal_mongodb_pool_waiters 0');
      expect(exported).toContain('student_portal_mongodb_pool_checked_out 0');
      expect(exported).toContain('command="other",outcome="failure"');
      expect(exported).not.toContain('private-host');
      expect(exported).not.toContain('never-export');
      expect((await metrics.getSummary()).database.totalQueries).toBe(0);
    } finally {
      metrics.onModuleDestroy();
      metrics.getRegistry().clear();
    }
  });
});
