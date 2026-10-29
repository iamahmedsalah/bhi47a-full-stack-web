import { ConfigService } from '@nestjs/config';
import mongoose from 'mongoose';
import type { Connection, Model } from 'mongoose';
import { randomBytes } from 'node:crypto';
import {
  AuthSessionSchema,
  AuthSessionStore,
  sessionDigest,
  type AuthSessionRecord,
  type SessionClaims,
} from '../src/modules/auth/services/auth-session-store.service';

describe('session registration idempotency (isolated MongoDB)', () => {
  let connection: Connection;
  let records: Model<AuthSessionRecord>;
  let store: AuthSessionStore;
  const userId = randomBytes(12).toString('hex');
  const claims = (): SessionClaims => ({
    sub: userId,
    tokenVersion: 0,
    sid: randomBytes(32).toString('base64url'),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    iss: 'student-portal',
    aud: 'student-portal-web',
  });

  beforeAll(async () => {
    const uri = process.env.MONGODB_URI ?? '';
    if (
      !/^mongodb:\/\/(localhost|127\.0\.0\.1):\d+\/[^?]*(test|e2e)$/.test(uri)
    ) {
      throw new Error(
        'Session persistence tests require an isolated localhost test/e2e database',
      );
    }
    connection = mongoose.createConnection(uri, {
      serverSelectionTimeoutMS: 3000,
      maxPoolSize: 5,
    });
    await connection.asPromise();
    records = connection.model('AuthSession', AuthSessionSchema);
    await records.init();
    store = new AuthSessionStore(records, new ConfigService());
  });

  afterAll(async () => {
    if (records) await records.deleteMany({ userId });
    await connection?.close();
  });

  it('persists one session across concurrent registrations, including separate service instances', async () => {
    const token = claims();
    const secondStore = new AuthSessionStore(records, new ConfigService());
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        (index % 2 ? store : secondStore).register(token),
      ),
    );
    const filter = { _id: sessionDigest(token.sid!), userId };
    expect(await records.countDocuments(filter)).toBe(1);
    const initial = await records.findOne(filter).lean();
    await secondStore.register({ ...token, exp: token.exp + 3600 });
    const retried = await records.findOne(filter).lean();
    expect(retried?.createdAt).toEqual(initial?.createdAt);
    expect(retried?.expiresAt).toEqual(initial?.expiresAt);
  });

  it('cannot recreate a revoked session through retries', async () => {
    const token = claims();
    await store.register(token);
    await store.revoke(token, '');
    const outcomes = await Promise.allSettled(
      Array.from({ length: 5 }, () => store.register(token)),
    );
    expect(outcomes.every((outcome) => outcome.status === 'rejected')).toBe(
      true,
    );
    expect(
      await records.countDocuments({ _id: sessionDigest(token.sid!) }),
    ).toBe(1);
    await expect(store.assertActive(token, '')).rejects.toThrow();
  });
});
