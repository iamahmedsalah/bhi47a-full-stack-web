import type { Connection } from 'mongoose';

// Coalesce probes only while a ping is running. Never cache a healthy response
// after completion: an outage must still fail the next readiness probe.
const probes = new WeakMap<Connection, Promise<number>>();

export function pingDatabase(connection: Connection): Promise<number> {
  const pending = probes.get(connection);
  if (pending) return pending;
  const probe = (async () => {
    if (!connection.db) throw new Error('Database is unavailable');
    const start = process.hrtime.bigint();
    await connection.db.admin().ping({ timeoutMS: 3000 });
    return (
      Math.round((Number(process.hrtime.bigint() - start) / 1e6) * 100) / 100
    );
  })();
  probes.set(connection, probe);
  void probe
    .finally(() => {
      if (probes.get(connection) === probe) probes.delete(connection);
    })
    .catch(() => undefined);
  return probe;
}
