import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  PasskeyNameDto,
  PasskeyRegisterOptionsDto,
  UpdatePasskeySettingsDto,
} from './passkeys.dto';
import type { Model } from 'mongoose';
import mongoose from 'mongoose';
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
} from 'node:crypto';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { PasskeysService, passkeyPublicKeyBytes } from './passkeys.service';
import { readPasskeyConfig } from './passkeys.config';
import {
  PasskeyCredentialSchema,
  PasskeyFlowSchema,
  type PasskeyCredential,
  type PasskeyFlow,
  type PasskeySettings,
} from './passkey.schemas';
import type { UsersService } from '../../users/users.service';
import type { AuthSessionService } from '../services/auth-session.service';

const origin = 'http://localhost:3000';
const userId = '507f1f77bcf86cd799439011';
const token = 'test-session-one';
const config = () =>
  new ConfigService({
    PASSKEYS_ENABLED: 'true',
    PASSKEY_RP_ID: 'localhost',
    PASSKEY_ORIGINS: origin,
  });

// Dynamic Mongo query shapes are deliberately confined to this in-memory test double.
type Row = Record<string, any>;
function memoryModel() {
  const rows: Row[] = [];
  const matches = (row: Row, filter: Row) =>
    Object.entries(filter).every(([key, value]) =>
      value && typeof value === 'object' && '$gt' in value
        ? row[key] > value.$gt
        : row[key] === value,
    );
  const query = (value: unknown) => {
    const q = {
      select: (_: string) => q,
      sort: (_: unknown) => q,
      limit: (_: number) => q,
      lean: () => Promise.resolve(value),
    };
    return q;
  };
  return {
    rows,
    find: jest.fn((filter: Row) =>
      query(rows.filter((row) => matches(row, filter))),
    ),
    findOne: jest.fn((filter: Row) =>
      query(rows.find((row) => matches(row, filter)) ?? null),
    ),
    exists: jest.fn((filter: Row) =>
      Promise.resolve(rows.some((row) => matches(row, filter))),
    ),
    findOneAndDelete: jest.fn((filter: Row) => {
      const index = rows.findIndex((row) => matches(row, filter));
      return query(index < 0 ? null : rows.splice(index, 1)[0]);
    }),
    create: jest.fn((row: Row) => {
      if (
        rows.some(
          (existing) =>
            row.credentialId && existing.credentialId === row.credentialId,
        )
      )
        return Promise.reject(Object.assign(new Error(), { code: 11000 }));
      const stored = {
        _id: randomBytes(12).toString('hex'),
        revision: 0,
        createdAt: new Date(),
        ...row,
      };
      rows.push(stored);
      return Promise.resolve(stored);
    }),
    deleteMany: jest.fn((filter: Row) => {
      for (let i = rows.length - 1; i >= 0; i--)
        if (matches(rows[i], filter)) rows.splice(i, 1);
      return Promise.resolve({});
    }),
    deleteOne: jest.fn((filter: Row) => {
      const index = rows.findIndex((row) => matches(row, filter));
      if (index >= 0) rows.splice(index, 1);
      return Promise.resolve({ deletedCount: index < 0 ? 0 : 1 });
    }),
    updateOne: jest.fn((filter: Row, update: Row) => {
      const row = rows.find((r) => matches(r, filter));
      if (row) {
        Object.assign(row, update.$set);
        for (const [key, value] of Object.entries(update.$inc ?? {}))
          row[key] += Number(value);
      }
      return Promise.resolve({
        matchedCount: row ? 1 : 0,
        modifiedCount: row ? 1 : 0,
      });
    }),
  };
}

// A software P-256 authenticator: real COSE public key, CBOR attestation and signatures.
// This does not simulate device UI, hardware, sync providers or browser policy.
function authenticator() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const jwk = publicKey.export({ format: 'jwk' });
  const credentialId = randomBytes(32);
  const id = credentialId.toString('base64url');
  const cose = Buffer.concat([
    Buffer.from('a5010203262001215820', 'hex'),
    Buffer.from(jwk.x!, 'base64url'),
    Buffer.from('225820', 'hex'),
    Buffer.from(jwk.y!, 'base64url'),
  ]);
  const hash = (value: string | Buffer) =>
    createHash('sha256').update(value).digest();
  const clientData = (challenge: string, type: string, overrides: Row = {}) =>
    Buffer.from(
      JSON.stringify({
        type,
        challenge,
        origin,
        crossOrigin: false,
        ...overrides,
      }),
    );
  const authData = (rp: string, flags: number, counter: number) => {
    const tail = Buffer.alloc(5);
    tail[0] = flags;
    tail.writeUInt32BE(counter, 1);
    return Buffer.concat([hash(rp), tail]);
  };
  return {
    registration(
      challenge: string,
      overrides: Row = {},
    ): RegistrationResponseJSON {
      const client = clientData(challenge, 'webauthn.create', overrides);
      const length = Buffer.alloc(2);
      length.writeUInt16BE(credentialId.length);
      const data = Buffer.concat([
        authData('localhost', 0x45, 0),
        Buffer.alloc(16),
        length,
        credentialId,
        cose,
      ]);
      const size = Buffer.alloc(3);
      size[0] = 0x59;
      size.writeUInt16BE(data.length, 1);
      const attestation = Buffer.concat([
        Buffer.from(
          'a363666d74646e6f6e656761747453746d74a0686175746844617461',
          'hex',
        ),
        size,
        data,
      ]);
      return {
        id,
        rawId: id,
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          clientDataJSON: client.toString('base64url'),
          attestationObject: attestation.toString('base64url'),
          transports: ['internal'],
        },
      };
    },
    assertion(
      challenge: string,
      handle: string,
      counter = 0,
      overrides: Row = {},
    ): AuthenticationResponseJSON {
      const client = clientData(
        challenge,
        overrides.type ?? 'webauthn.get',
        overrides.client ?? {},
      );
      const data = authData(
        overrides.rp ?? 'localhost',
        overrides.flags ?? 5,
        counter,
      );
      const signature = sign(
        'sha256',
        Buffer.concat([data, hash(client)]),
        privateKey,
      );
      if (overrides.badSignature) signature[5] ^= 1;
      return {
        id,
        rawId: id,
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          clientDataJSON: client.toString('base64url'),
          authenticatorData: data.toString('base64url'),
          signature: signature.toString('base64url'),
          userHandle: handle,
        },
      };
    },
  };
}

describe('passkey policy', () => {
  it.each([
    'touchId',
    'faceId',
    'windowsHello',
    'fingerprint',
    'securityKey',
    'devicePin',
    'unspecified',
    undefined,
  ])('accepts optional display method %s', async (unlockMethod) => {
    expect(
      await validate(
        plainToInstance(PasskeyNameDto, { name: 'My key', unlockMethod }),
      ),
    ).toHaveLength(0);
  });
  it.each(['detected-face', 1, true, {}, ['touchId']])(
    'rejects invalid display method %s',
    async (unlockMethod) => {
      expect(
        await validate(
          plainToInstance(PasskeyNameDto, { name: 'My key', unlockMethod }),
        ),
      ).not.toHaveLength(0);
    },
  );
  it.each(['false', 'true', 0, 1, null, undefined])(
    'rejects non-boolean student login setting %s with implicit conversion enabled',
    async (value) => {
      const dto = plainToInstance(
        UpdatePasskeySettingsDto,
        { studentLoginEnabled: value },
        { enableImplicitConversion: true },
      );
      expect(await validate(dto)).not.toHaveLength(0);
    },
  );
  it.each([true, false])(
    'accepts boolean student login setting %s',
    async (value) => {
      const dto = plainToInstance(
        UpdatePasskeySettingsDto,
        { studentLoginEnabled: value },
        { enableImplicitConversion: true },
      );
      expect(await validate(dto)).toHaveLength(0);
      expect(dto.studentLoginEnabled).toBe(value);
    },
  );
  it.each(['localDevice', 'securityKey', 'remoteDevice', undefined])(
    'accepts optional preferredAuthenticatorType %s',
    async (preferredAuthenticatorType) => {
      expect(
        await validate(
          plainToInstance(PasskeyRegisterOptionsDto, {
            preferredAuthenticatorType,
          }),
        ),
      ).toHaveLength(0);
    },
  );
  it.each(['platform', 'usb', 123, true])(
    'rejects invalid preferredAuthenticatorType %s',
    async (preferredAuthenticatorType) => {
      expect(
        await validate(
          plainToInstance(PasskeyRegisterOptionsDto, {
            preferredAuthenticatorType,
          }),
        ),
      ).not.toHaveLength(0);
    },
  );
  it('restores public key bytes from Mongo lean Binary and Buffer records', () => {
    const bytes = Buffer.from([1, 2, 3, 4]);
    expect(passkeyPublicKeyBytes(new mongoose.mongo.Binary(bytes))).toEqual(
      new Uint8Array(bytes),
    );
    expect(passkeyPublicKeyBytes(bytes)).toEqual(new Uint8Array(bytes));
  });
  it('is disabled by default', () =>
    expect(readPasskeyConfig(new ConfigService()).enabled).toBe(false));
  it.each([
    { PASSKEY_RP_ID: 'localhost', PASSKEY_ORIGINS: 'https://*.example.com' },
    { PASSKEY_RP_ID: 'localhost', PASSKEY_ORIGINS: 'http://evil.example' },
    {
      PASSKEY_RP_ID: 'example.com',
      PASSKEY_ORIGINS: 'https://example.com/path',
    },
    {
      PASSKEY_RP_ID: 'example.com',
      PASSKEY_ORIGINS: 'https://example.com.evil.test',
    },
    {
      PASSKEY_RP_ID: 'localhost',
      PASSKEY_ORIGINS: origin,
      NODE_ENV: 'production',
    },
    {
      PASSKEY_RP_ID: 'vercel.app',
      PASSKEY_ORIGINS: 'https://portal.vercel.app',
    },
  ])('rejects unsafe configuration %j', (values) =>
    expect(() =>
      readPasskeyConfig(
        new ConfigService({ PASSKEYS_ENABLED: 'true', ...values }),
      ),
    ).toThrow(),
  );
  it('accepts the explicitly configured canonical origin within the RP after a DNS change', () => {
    const policy = readPasskeyConfig(
      new ConfigService({
        PASSKEYS_ENABLED: 'true',
        PASSKEY_RP_ID: 'bhi47.app',
        PASSKEY_ORIGINS: 'https://www.bhi47.app',
        WEB_BASE_URL: 'https://bhi47.app/',
      }),
    );
    expect(policy.origins).toEqual([
      'https://www.bhi47.app',
      'https://bhi47.app',
    ]);
  });
  it('does not grant passkey trust to an unrelated canonical domain', () => {
    const policy = readPasskeyConfig(
      new ConfigService({
        PASSKEYS_ENABLED: 'true',
        PASSKEY_RP_ID: 'example.com',
        PASSKEY_ORIGINS: 'https://example.com',
        WEB_BASE_URL: 'https://attacker.test',
      }),
    );
    expect(policy.origins).toEqual(['https://example.com']);
  });
  it('declares a unique credential index and TTL cleanup', () => {
    expect(PasskeyCredentialSchema.indexes()).toContainEqual([
      { credentialId: 1 },
      expect.objectContaining({ unique: true }),
    ]);
    expect(PasskeyFlowSchema.indexes()).toContainEqual([
      { expiresAt: 1 },
      expect.objectContaining({ expireAfterSeconds: 0 }),
    ]);
  });
});

describe('passkey service with real WebAuthn cryptography and in-memory persistence', () => {
  let credentials: ReturnType<typeof memoryModel>;
  let flows: ReturnType<typeof memoryModel>;
  let service: PasskeysService;
  let studentLoginEnabled: boolean | undefined;
  const settings = {
    findById: jest.fn(() => ({
      lean: () =>
        Promise.resolve(
          studentLoginEnabled === undefined ? null : { studentLoginEnabled },
        ),
    })),
    updateOne: jest.fn(
      (
        _filter: unknown,
        update: { $set: { studentLoginEnabled: boolean } },
      ) => {
        studentLoginEnabled = update.$set.studentLoginEnabled;
        return Promise.resolve();
      },
    ),
  };
  let user: Row;
  let users: {
    findById: jest.Mock;
    isAccountLocked: jest.Mock;
    validatePassword: jest.Mock;
    incrementLoginAttempts: jest.Mock;
  };
  const complete = jest.fn();
  beforeEach(() => {
    studentLoginEnabled = undefined;
    credentials = memoryModel();
    flows = memoryModel();
    user = {
      _id: userId,
      isActive: true,
      role: 'student',
      tokenVersion: 2,
      mustChangePassword: false,
    };
    users = {
      findById: jest.fn().mockImplementation(() => Promise.resolve(user)),
      isAccountLocked: jest.fn().mockReturnValue(false),
      validatePassword: jest.fn().mockResolvedValue(true),
      incrementLoginAttempts: jest.fn().mockResolvedValue(undefined),
    };
    complete.mockReset().mockImplementation((u: Row) =>
      Promise.resolve({
        token: 'existing-session-token',
        user: { _id: u._id, role: u.role },
      }),
    );
    service = new PasskeysService(
      config(),
      credentials as unknown as Model<PasskeyCredential>,
      flows as unknown as Model<PasskeyFlow>,
      users as unknown as UsersService,
      { completeCredentialLogin: complete } as unknown as AuthSessionService,
      settings as unknown as Model<PasskeySettings>,
    );
  });
  async function register(
    device = authenticator(),
    unlockMethod?: PasskeyCredential['unlockMethod'],
  ) {
    await service.reauthenticate(userId, token, 'correct-password', origin);
    const flow = await service.registerOptions(userId, token, origin);
    await service.registerVerify(userId, token, origin, {
      flowId: flow.flowId,
      name: 'My device',
      unlockMethod,
      response: device.registration(flow.options.challenge),
    });
    return device;
  }
  async function login(
    device: ReturnType<typeof authenticator>,
    counter = 0,
    overrides: Row = {},
    area: 'student' | 'management' | 'any' = 'any',
  ) {
    const flow = await service.loginOptions(origin, area);
    const response = device.assertion(
      flow.options.challenge,
      service.userHandle(userId).toString('base64url'),
      counter,
      overrides,
    );
    return service.loginVerify(origin, flow.flowToken, {
      flowId: flow.flowId,
      response,
    });
  }

  it('preserves the enabled default and persists admin changes without overriding server policy', async () => {
    expect(await service.capabilities()).toEqual({
      enabled: true,
      studentLoginEnabled: true,
    });
    await service.updateSettings(false, userId);
    expect(await service.capabilities()).toEqual({
      enabled: true,
      studentLoginEnabled: false,
    });
    expect(settings.updateOne).toHaveBeenLastCalledWith(
      { _id: 'global' },
      { $set: { studentLoginEnabled: false } },
      { upsert: true, runValidators: true },
    );
    await expect(service.loginOptions(origin, 'student')).rejects.toThrow();
    const disabledServer = new PasskeysService(
      new ConfigService({ PASSKEYS_ENABLED: 'false' }),
      credentials as unknown as Model<PasskeyCredential>,
      flows as unknown as Model<PasskeyFlow>,
      users as unknown as UsersService,
      {} as AuthSessionService,
      settings as unknown as Model<PasskeySettings>,
    );
    await disabledServer.updateSettings(true, userId);
    expect(await disabledServer.capabilities()).toEqual({
      enabled: false,
      studentLoginEnabled: false,
    });
  });

  it.each(['student', 'any'] as const)(
    'blocks in-flight %s student sign-ins after disabling and preserves credentials',
    async (area) => {
      const device = await register();
      const flow = await service.loginOptions(origin, area);
      await service.updateSettings(false, userId);
      await expect(
        service.loginVerify(origin, flow.flowToken, {
          flowId: flow.flowId,
          response: device.assertion(
            flow.options.challenge,
            service.userHandle(userId).toString('base64url'),
            0,
          ),
        }),
      ).rejects.toThrow();
      expect(complete).not.toHaveBeenCalled();
      expect(credentials.rows).toHaveLength(1);
      await expect(login(device, 0, {}, 'management')).rejects.toThrow();
      await service.updateSettings(true, userId);
      await login(device, 0, {}, 'student');
      expect(complete).toHaveBeenCalled();
    },
  );

  it.each(['admin', 'staff'])(
    'keeps %s passkey login available when student login is disabled',
    async (role) => {
      user.role = role;
      const device = await register();
      await service.updateSettings(false, userId);
      await login(device, 0, {}, 'management');
      expect(complete).toHaveBeenCalledWith(user);
    },
  );

  it('registers and signs in to the same user and session pathway, including valid zero counters', async () => {
    const device = await register();
    expect(credentials.rows[0].userId).toBe(userId);
    expect(credentials.rows[0].publicKey).toBeInstanceOf(Buffer);
    expect(await login(device)).toEqual({
      token: 'existing-session-token',
      user: { _id: userId, role: 'student' },
    });
    await login(device);
    expect(credentials.rows[0].revision).toBe(2);
    expect(complete).toHaveBeenCalledWith(user);
  });
  it.each(['admin', 'staff'])(
    'enrolls and authenticates an existing %s through canonical sessions',
    async (role) => {
      user.role = role;
      const device = await register();
      const result = await login(device, 0, {}, 'management');
      expect(result.user.role).toBe(role);
      expect(complete).toHaveBeenCalledWith(user);
      await expect(login(device, 0, {}, 'student')).rejects.toThrow();
    },
  );
  it('rejects a student credential at the management sign-in boundary', async () => {
    const device = await register();
    await expect(login(device, 0, {}, 'management')).rejects.toThrow();
    expect(complete).not.toHaveBeenCalled();
  });
  it('supports multiple credentials and tabs without challenge collisions', async () => {
    const first = await register();
    const second = await register();
    expect(credentials.rows).toHaveLength(2);
    const a = await service.loginOptions(origin);
    const b = await service.loginOptions(origin);
    expect(a.flowId).not.toBe(b.flowId);
    for (const [flow, device] of [
      [a, first],
      [b, second],
    ] as const)
      await service.loginVerify(origin, flow.flowToken, {
        flowId: flow.flowId,
        response: device.assertion(
          flow.options.challenge,
          service.userHandle(userId).toString('base64url'),
        ),
      });
    expect(complete).toHaveBeenCalledTimes(2);
  });
  it('requires recent reauthentication in the same session and expires it', async () => {
    await expect(
      service.registerOptions(userId, token, origin),
    ).rejects.toThrow();
    await service.reauthenticate(userId, token, 'password', origin);
    await expect(
      service.registerOptions(userId, 'another-session', origin),
    ).rejects.toThrow();
    flows.rows[0].expiresAt = new Date(0);
    await expect(
      service.registerOptions(userId, token, origin),
    ).rejects.toThrow();
  });
  it('increments failed password attempts without creating a grant', async () => {
    users.validatePassword.mockResolvedValue(false);
    await expect(
      service.reauthenticate(userId, token, 'wrong', origin),
    ).rejects.toThrow();
    expect(users.incrementLoginAttempts).toHaveBeenCalledWith(userId);
    expect(flows.rows).toHaveLength(0);
  });
  it.each([{ isActive: false }, { mustChangePassword: true }])(
    'rejects restricted user %j',
    async (restriction) => {
      const device = await register();
      Object.assign(user, restriction);
      await expect(login(device)).rejects.toThrow();
      expect(complete).not.toHaveBeenCalled();
    },
  );
  it('rejects locked and deleted accounts', async () => {
    const device = await register();
    users.isAccountLocked.mockReturnValue(true);
    await expect(login(device)).rejects.toThrow();
    users.findById.mockRejectedValue(new Error('not found'));
    await expect(login(device)).rejects.toThrow();
  });
  it.each([
    { client: { origin: 'https://evil.example' } },
    { client: { challenge: 'wrong-challenge' } },
    { type: 'webauthn.create' },
    { rp: 'evil.example' },
    { flags: 1 },
    { badSignature: true },
  ])('rejects invalid assertions %j', async (overrides) => {
    const device = await register();
    await expect(login(device, 0, overrides)).rejects.toThrow();
    expect(complete).not.toHaveBeenCalled();
  });
  it('rejects bad registration origin and duplicate credentials', async () => {
    const device = await register();
    await service.reauthenticate(userId, token, 'password', origin);
    const flow = await service.registerOptions(userId, token, origin);
    await expect(
      service.registerVerify(userId, token, origin, {
        flowId: flow.flowId,
        name: 'duplicate',
        response: device.registration(flow.options.challenge),
      }),
    ).rejects.toThrow('already registered');
    await service.reauthenticate(userId, token, 'password', origin);
    const other = await service.registerOptions(userId, token, origin);
    await expect(
      service.registerVerify(userId, token, origin, {
        flowId: other.flowId,
        name: 'bad origin',
        response: device.registration(other.options.challenge, {
          origin: 'https://evil.example',
        }),
      }),
    ).rejects.toThrow();
  });
  it('rejects untrusted HTTP origins before challenge allocation', async () => {
    await expect(
      service.loginOptions('https://evil.example'),
    ).rejects.toThrow();
    expect(flows.rows).toHaveLength(0);
  });
  it('rejects expired challenges even before TTL cleanup', async () => {
    const device = await register();
    const flow = await service.loginOptions(origin);
    flows.rows.find((r) => r.flowId === flow.flowId)!.expiresAt = new Date(0);
    await expect(
      service.loginVerify(origin, flow.flowToken, {
        flowId: flow.flowId,
        response: device.assertion(flow.options.challenge, ''),
      }),
    ).rejects.toThrow();
  });
  it('allows only one concurrent verification of a challenge', async () => {
    const device = await register();
    const flow = await service.loginOptions(origin);
    const dto = {
      flowId: flow.flowId,
      response: device.assertion(
        flow.options.challenge,
        service.userHandle(userId).toString('base64url'),
      ),
    };
    const results = await Promise.allSettled([
      service.loginVerify(origin, flow.flowToken, dto),
      service.loginVerify(origin, flow.flowToken, dto),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(complete).toHaveBeenCalledTimes(1);
  });
  it('rejects wrong browser flow secrets and mismatched user handles', async () => {
    const device = await register();
    const flow = await service.loginOptions(origin);
    const dto = {
      flowId: flow.flowId,
      response: device.assertion(flow.options.challenge, 'wrong-handle'),
    };
    await expect(
      service.loginVerify(origin, randomBytes(32).toString('base64url'), dto),
    ).rejects.toThrow();
    await expect(
      service.loginVerify(origin, flow.flowToken, dto),
    ).rejects.toThrow();
  });
  it('rejects missing or malformed credentials', async () => {
    const flow = await service.loginOptions(origin);
    await expect(
      service.loginVerify(origin, flow.flowToken, {
        flowId: flow.flowId,
        response: {} as AuthenticationResponseJSON,
      }),
    ).rejects.toThrow();
    await expect(login(authenticator())).rejects.toThrow();
  });
  it('rejects counter rollback and conflicting credential updates', async () => {
    const device = await register();
    await login(device, 5);
    await expect(login(device, 4)).rejects.toThrow();
    credentials.updateOne.mockResolvedValueOnce({
      matchedCount: 0,
      modifiedCount: 0,
    });
    await expect(login(device, 6)).rejects.toThrow();
  });
  it('owner-scopes list, rename and delete and keeps other credentials usable', async () => {
    const first = await register(authenticator(), 'faceId');
    const second = await register();
    const id = credentials.rows[0]._id as string;
    await service.reauthenticate(
      userId,
      token,
      'password',
      origin,
      'rename',
      id,
    );
    expect(credentials.rows[0].unlockMethod).toBe('faceId');
    expect(credentials.rows[1].unlockMethod).toBe('unspecified');
    await service.rename(userId, token, origin, id, 'New name', 'windowsHello');
    expect(credentials.rows[0].name).toBe('New name');
    expect(credentials.rows[0].unlockMethod).toBe('windowsHello');
    expect(credentials.updateOne).toHaveBeenLastCalledWith(
      { _id: id, userId },
      { $set: { name: 'New name', unlockMethod: 'windowsHello' } },
    );
    await expect(
      service.rename(userId, token, origin, id, 'Replay'),
    ).rejects.toThrow();
    await expect(service.remove(userId, token, origin, id)).rejects.toThrow();
    await service.list(userId);
    expect(credentials.find).toHaveBeenLastCalledWith({ userId });
    await service.reauthenticate(
      '507f1f77bcf86cd799439012',
      token,
      'password',
      origin,
      'remove',
      id,
    );
    await expect(
      service.remove('507f1f77bcf86cd799439012', token, origin, id),
    ).rejects.toThrow();
    await service.reauthenticate(
      userId,
      token,
      'password',
      origin,
      'remove',
      id,
    );
    await service.remove(userId, token, origin, id);
    await expect(login(first)).rejects.toThrow();
    await login(second);
  });

  it('supports backward-compatible registerOptions and maps preferredAuthenticatorType hints cleanly', async () => {
    await service.reauthenticate(userId, token, 'password', origin);
    const defaultFlow = await service.registerOptions(userId, token, origin);
    expect(defaultFlow.options.timeout).toBe(60_000);
    expect(defaultFlow.options.pubKeyCredParams).toEqual([
      { alg: -7, type: 'public-key' },
      { alg: -257, type: 'public-key' },
    ]);
    expect(
      defaultFlow.options.authenticatorSelection?.authenticatorAttachment,
    ).toBeUndefined();

    await service.reauthenticate(userId, token, 'password', origin);
    const localFlow = await service.registerOptions(
      userId,
      token,
      origin,
      'localDevice',
    );
    expect(
      localFlow.options.authenticatorSelection?.authenticatorAttachment,
    ).toBe('platform');
    expect(localFlow.options.hints).toEqual(['client-device']);

    await service.reauthenticate(userId, token, 'password', origin);
    const keyFlow = await service.registerOptions(
      userId,
      token,
      origin,
      'securityKey',
    );
    expect(
      keyFlow.options.authenticatorSelection?.authenticatorAttachment,
    ).toBe('cross-platform');
    expect(keyFlow.options.hints).toEqual(['security-key']);
  });
});
