import { ServiceUnavailableException } from '@nestjs/common';
import { ConnectionHolder } from './common/rate-limit/connection-holder';
import { HealthController } from './health.controller';

describe('API readiness', () => {
  const original = ConnectionHolder.connection;
  const controller = new HealthController();
  const ping = jest.fn();

  afterEach(() => {
    ConnectionHolder.connection = original;
    ping.mockReset();
  });

  function connection(readyState: number, withDb = true) {
    ConnectionHolder.connection = {
      readyState,
      ...(withDb && { db: { admin: () => ({ ping }) } }),
    } as unknown as NonNullable<typeof ConnectionHolder.connection>;
  }

  it('returns 503 when MongoDB is disconnected', async () => {
    connection(0);
    await expect(controller.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(ping).not.toHaveBeenCalled();
  });

  it('returns 503 when a connected database fails its ping', async () => {
    connection(1);
    ping.mockRejectedValue(new Error('database timeout'));
    await expect(controller.check()).rejects.toMatchObject({ status: 503 });
  });

  it('requires a usable database handle', async () => {
    connection(1, false);
    await expect(controller.check()).rejects.toMatchObject({ status: 503 });
  });

  it('reports readiness only after a successful bounded ping', async () => {
    connection(1);
    ping.mockResolvedValue({ ok: 1 });
    await expect(controller.check()).resolves.toMatchObject({
      status: 'ok',
      database: { status: 'connected' },
    });
    expect(ping).toHaveBeenCalledWith({ timeoutMS: 3000 });
  });
});
