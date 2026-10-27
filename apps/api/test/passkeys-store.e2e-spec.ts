import { ConfigService } from '@nestjs/config';
import mongoose from 'mongoose';
import type { Model, Connection } from 'mongoose';
import { randomBytes, randomUUID } from 'node:crypto';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { PasskeysService } from '../src/modules/auth/passkeys/passkeys.service';
import {
  PasskeyCredentialSchema,
  PasskeyFlowSchema,
  PasskeySettingsSchema,
  type PasskeyCredential,
  type PasskeyFlow,
} from '../src/modules/auth/passkeys/passkey.schemas';
import { UsersService } from '../src/modules/users/users.service';
import { AuthSessionService } from '../src/modules/auth/services/auth-session.service';
import { MongoRateLimiterStore } from '../src/common/rate-limit/mongo-rate-limiter.store';

describe('passkey Mongo persistence (isolated test database only)', () => {
  let connection: Connection | undefined;
  let service: PasskeysService;
  let flows: Model<PasskeyFlow>;
  let credentials: Model<PasskeyCredential>;
  let stores: MongoRateLimiterStore[];
  const origin = 'http://localhost:3000';
  const flowIds: string[] = [];
  const userId = randomBytes(12).toString('hex');

  beforeAll(async () => {
    const uri = process.env.MONGODB_URI ?? '';
    if (
      !/^mongodb:\/\/(localhost|127\.0\.0\.1):\d+\/[^?]*(test|e2e)/.test(uri)
    ) {
      throw new Error(
        'Passkey persistence tests require an explicit localhost test/e2e database',
      );
    }
    connection = mongoose.createConnection(uri, {
      serverSelectionTimeoutMS: 3000,
      connectTimeoutMS: 3000,
      socketTimeoutMS: 5000,
      maxPoolSize: 5,
      waitQueueTimeoutMS: 5000,
      monitorCommands: process.env.E2E_MONGO_DIAGNOSTICS === 'true',
    });
    await connection.asPromise();
    if (process.env.E2E_MONGO_DIAGNOSTICS === 'true') {
      connection.getClient().on('commandStarted', (event) => {
        console.log(JSON.stringify({ started: event.commandName }));
      });
      connection.getClient().on('commandSucceeded', (event) => {
        console.log(
          JSON.stringify({
            command: event.commandName,
            durationMs: event.duration,
          }),
        );
      });
    }
    credentials = connection.model(
      'PasskeyCredential',
      PasskeyCredentialSchema.clone()
        .set('autoIndex', false)
        .set('autoCreate', false),
    );
    flows = connection.model(
      'PasskeyFlow',
      PasskeyFlowSchema.clone()
        .set('autoIndex', false)
        .set('autoCreate', false),
    );
    service = new PasskeysService(
      new ConfigService({
        PASSKEYS_ENABLED: 'true',
        PASSKEY_RP_ID: 'localhost',
        PASSKEY_ORIGINS: origin,
      }),
      credentials,
      flows,
      {} as UsersService,
      {} as AuthSessionService,
      connection.model('PasskeySettings', PasskeySettingsSchema),
    );
    await service.onModuleInit();
    stores = [
      new MongoRateLimiterStore(connection),
      new MongoRateLimiterStore(connection),
    ];
    for (const store of stores) await store.initialize();
  }, 30000);

  afterAll(async () => {
    if (flows) await flows.deleteMany({ flowId: { $in: flowIds } });
    if (credentials) await credentials.deleteMany({ userId });
    await connection?.db
      ?.collection('rate_limits')
      .deleteOne({ _id: `test-${userId}` } as never);
    await connection?.close();
  });

  it('counts concurrent first requests across shared rate-limiter instances without losing increments', async () => {
    const hits = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        stores[index % 2].increment(`test-${userId}`, 60000, 8),
      ),
    );
    expect(hits.map((hit) => hit.count).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
    await connection!
      .db!.collection('rate_limits')
      .updateOne({ _id: `test-${userId}` } as never, {
        $set: { resetAt: new Date(0) },
      });
    expect((await stores[0].increment(`test-${userId}`, 60000, 8)).count).toBe(
      1,
    );
  });

  it('persists hashed browser bindings and creates the TTL index', async () => {
    const flow = await service.loginOptions(origin);
    flowIds.push(flow.flowId);
    const stored = await flows
      .findOne({ flowId: flow.flowId })
      .select('+challenge')
      .lean();
    expect(stored?.challenge).toBe(flow.options.challenge);
    expect(stored?.binding).not.toBe(flow.flowToken);
    expect(stored?.binding).toHaveLength(64);
    const indexes = await flows.collection.indexes();
    expect(indexes).toContainEqual(
      expect.objectContaining({ key: { expiresAt: 1 }, expireAfterSeconds: 0 }),
    );
  });

  it('atomically consumes only one of two concurrent verification attempts', async () => {
    const flow = await service.loginOptions(origin);
    flowIds.push(flow.flowId);
    const lookup = jest.spyOn(credentials, 'findOne');
    try {
      const dto = {
        flowId: flow.flowId,
        response: { id: randomUUID() } as AuthenticationResponseJSON,
      };
      const attempts = await Promise.allSettled([
        service.loginVerify(origin, flow.flowToken, dto),
        service.loginVerify(origin, flow.flowToken, dto),
      ]);
      // Neither nonexistent credential authenticates; only the challenge winner may query it.
      expect(attempts.every((r) => r.status === 'rejected')).toBe(true);
      expect(lookup).toHaveBeenCalledTimes(1);
      expect(await flows.countDocuments({ flowId: flow.flowId })).toBe(0);
    } finally {
      lookup.mockRestore();
    }
  });

  it('rejects expired challenges before asynchronous TTL cleanup', async () => {
    const flow = await service.loginOptions(origin);
    flowIds.push(flow.flowId);
    await flows.updateOne(
      { flowId: flow.flowId },
      { $set: { expiresAt: new Date(0) } },
    );
    const lookup = jest.spyOn(credentials, 'findOne');
    try {
      await expect(
        service.loginVerify(origin, flow.flowToken, {
          flowId: flow.flowId,
          response: { id: randomUUID() } as AuthenticationResponseJSON,
        }),
      ).rejects.toThrow();
      expect(lookup).not.toHaveBeenCalled();
    } finally {
      lookup.mockRestore();
    }
  });

  it('enforces database uniqueness and serializes zero-counter credential updates', async () => {
    const data = {
      credentialId: randomBytes(32).toString('base64url'),
      userId,
      userHandle: 'test-handle',
      publicKey: Buffer.from([1, 2, 3]),
      counter: 0,
      deviceType: 'multiDevice',
      backedUp: true,
      name: 'Persistence fixture',
    };
    const credential = await credentials.create(data);
    await expect(credentials.create(data)).rejects.toMatchObject({
      code: 11000,
    });
    const results = await Promise.all([
      credentials.updateOne(
        { _id: credential._id, counter: 0, revision: 0 },
        { $inc: { revision: 1 } },
      ),
      credentials.updateOne(
        { _id: credential._id, counter: 0, revision: 0 },
        { $inc: { revision: 1 } },
      ),
    ]);
    expect(results.reduce((sum, r) => sum + r.modifiedCount, 0)).toBe(1);
  });
});
