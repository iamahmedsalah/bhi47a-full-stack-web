import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import {
  AuthSessionStore,
  sessionDigest,
  type SessionClaims,
} from '../modules/auth/services/auth-session-store.service';
import { AuthSessionService } from '../modules/auth/services/auth-session.service';
import { RecentAuthService } from '../modules/auth/services/recent-auth.service';
import { trustedProxySources } from '../config/trusted-proxy';
import express from 'express';
import request from 'supertest';

// Mongo operator shapes are confined to this test double, not production code.
type Row = Record<string, any>;
function records() {
  const rows: Row[] = [];
  const matches = (row: Row, filter: Row) =>
    Object.entries(filter).every(([key, value]) => {
      if (value && typeof value === 'object' && '$gt' in value)
        return row[key] > value.$gt;
      if (value && typeof value === 'object' && '$ne' in value)
        return value.$ne === null ? row[key] != null : row[key] !== value.$ne;
      return value === null ? row[key] == null : row[key] === value;
    });
  return {
    rows,
    create: jest.fn((value: Row) => {
      rows.push(value);
      return Promise.resolve(value);
    }),
    exists: jest.fn((filter: Row) =>
      Promise.resolve(rows.some((row) => matches(row, filter))),
    ),
    updateOne: jest.fn((filter: Row, update: Row, options?: Row) => {
      let row = rows.find((r) => matches(r, filter));
      if (!row && options?.upsert) {
        row = { ...filter, ...update.$setOnInsert };
        if (row) rows.push(row);
      }
      if (row) {
        Object.assign(row, update.$set);
        for (const key of Object.keys(update.$unset ?? {})) delete row[key];
      }
      return Promise.resolve({ matchedCount: row ? 1 : 0 });
    }),
    deleteMany: jest.fn((filter: Row) => {
      for (let i = rows.length - 1; i >= 0; i--)
        if (matches(rows[i], filter)) rows.splice(i, 1);
      return Promise.resolve({});
    }),
    findOneAndDelete: jest.fn((filter: Row) => {
      const index = rows.findIndex((r) => matches(r, filter));
      return Promise.resolve(index < 0 ? null : rows.splice(index, 1)[0]);
    }),
    find: jest.fn((filter: Row) => {
      const query = {
        select: (_: string) => query,
        sort: (_: Row) => query,
        limit: (_: number) => query,
        lean: () => Promise.resolve(rows.filter((row) => matches(row, filter))),
      };
      return query;
    }),
  };
}

describe('revocable session policy', () => {
  const userId = '507f1f77bcf86cd799439011';
  const config = new ConfigService({
    JWT_ISSUER: 'student-portal',
    JWT_AUDIENCE: 'student-portal-web',
  });
  function claims(): SessionClaims {
    const now = Math.floor(Date.now() / 1000);
    return {
      sub: userId,
      tokenVersion: 0,
      sid: randomBytes(32).toString('base64url'),
      iat: now,
      exp: now + 3600,
      iss: 'student-portal',
      aud: 'student-portal-web',
    };
  }
  it('fails closed without a persisted session and after logout, without storing a raw SID/JWT', async () => {
    const model = records();
    const store = new AuthSessionStore(model as never, config);
    const token = claims();
    await expect(
      store.assertActive(token, 'synthetic-raw-token'),
    ).rejects.toThrow();
    await store.register(token);
    await store.assertActive(token, 'synthetic-raw-token');
    expect(model.rows[0]._id).toBe(sessionDigest(token.sid!));
    expect(JSON.stringify(model.rows)).not.toContain(token.sid!);
    await store.revoke(token, 'synthetic-raw-token');
    await expect(
      store.assertActive(token, 'synthetic-raw-token'),
    ).rejects.toThrow();
  });
  it('isolates devices and owner-scopes revocation', async () => {
    const model = records();
    const store = new AuthSessionStore(model as never, config);
    const first = claims();
    const second = claims();
    await store.register(first);
    await store.register(second);
    await expect(
      store.revokeOwned('another-user', sessionDigest(second.sid!)),
    ).rejects.toThrow();
    await store.revoke(first, 'first');
    await store.assertActive(second, 'second');
  });
  it('registers concurrent retries once without extending expiry, then refuses to resurrect a revoked session', async () => {
    const model = records();
    const store = new AuthSessionStore(model as never, config);
    const token = claims();
    await Promise.all(Array.from({ length: 8 }, () => store.register(token)));
    expect(model.rows).toHaveLength(1);
    const createdAt = model.rows[0].createdAt;
    const expiresAt = model.rows[0].expiresAt;
    await store.register({ ...token, exp: token.exp + 3600 });
    expect(model.rows[0].createdAt).toBe(createdAt);
    expect(model.rows[0].expiresAt).toBe(expiresAt);
    await store.revoke(token, 'raw');
    await expect(store.register(token)).rejects.toThrow(
      'Session revoked or expired',
    );
    expect(model.rows).toHaveLength(1);
  });
  it('accepts a concurrent unique-index race only when the winning record is active and owned by the same user', async () => {
    const model = records();
    const store = new AuthSessionStore(model as never, config);
    const token = claims();
    await store.register(token);
    model.updateOne.mockRejectedValueOnce(
      Object.assign(new Error(), { code: 11000 }),
    );
    await store.register(token);
    model.updateOne.mockRejectedValueOnce(
      Object.assign(new Error(), { code: 11000 }),
    );
    await expect(
      store.register({ ...token, sub: 'different-user' }),
    ).rejects.toThrow();
    model.updateOne.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(store.register(token)).rejects.toThrow('database unavailable');
  });
  it('hides fabricated legacy metadata and clears it when upgrading only the current session', async () => {
    const model = records();
    const store = new AuthSessionStore(model as never, config);
    const token = claims();
    await store.register(token);
    Object.assign(model.rows[0], {
      ip: '156.204.18.92',
      location: 'Cairo',
      networkType: 'Wi-Fi',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0',
    });
    const id = sessionDigest(token.sid!);
    expect((await store.list(userId, id))[0]).toMatchObject({
      current: true,
      os: 'Windows',
      ip: undefined,
      location: undefined,
      networkType: undefined,
    });
    await store.refreshMetadata(token, {
      metadataVersion: 1,
      device: 'computer',
      ip: '127.0.0.1',
    });
    expect(model.rows[0].location).toBeUndefined();
    expect(model.rows[0].networkType).toBeUndefined();
    expect((await store.list(userId, id))[0]).toMatchObject({
      ip: undefined,
      privateIp: true,
    });
    expect(await store.list('different-user', id)).toEqual([]);
  });
  it('refreshes only the current device after a proxy fix and keeps the latest sign-in separate from creation', async () => {
    const model = records();
    const store = new AuthSessionStore(model as never, config);
    const current = claims();
    const other = claims();
    await store.register(current, {
      metadataVersion: 1,
      device: 'computer',
      ip: '172.18.0.1',
    });
    await store.register(other, {
      metadataVersion: 1,
      device: 'mobile',
      ip: '172.18.0.1',
    });
    const createdAt = model.rows[0].createdAt;
    const expiresAt = model.rows[0].expiresAt;
    const oldLogin = new Date('2026-01-01T12:00:00Z');
    model.rows[0].lastAuthenticatedAt = oldLogin;
    await store.register(current);
    expect(model.rows[0].createdAt).toBe(createdAt);
    expect(model.rows[0].expiresAt).toBe(expiresAt);
    expect(model.rows[0].lastAuthenticatedAt.getTime()).toBeGreaterThan(
      oldLogin.getTime(),
    );
    const lastLogin = model.rows[0].lastAuthenticatedAt;
    await store.refreshMetadata(current, {
      metadataVersion: 1,
      device: 'computer',
      ip: '8.8.8.8',
      networkType: 'ethernet',
      isp: 'Example ISP',
    });
    expect(model.rows[0].lastAuthenticatedAt).toBe(lastLogin);
    expect(
      (await store.list(userId, sessionDigest(current.sid!)))[0],
    ).toMatchObject({
      ip: '8.8.8.8',
      networkType: 'ethernet',
      isp: 'Example ISP',
      privateIp: false,
    });
    expect(model.rows[1].ip).toBe('172.18.0.1');
    expect(model.rows[1].isp).toBeUndefined();
    await store.revoke(current, 'raw');
    await store.refreshMetadata(current, {
      metadataVersion: 1,
      device: 'computer',
      ip: '8.8.4.4',
    });
    expect(model.rows[0].ip).toBe('8.8.8.8');
  });
  it.each([
    { iss: 'wrong' },
    { aud: 'wrong' },
    { sid: 'invalid' },
    { exp: 1 },
    { iat: Math.floor(Date.now() / 1000) + 300 },
  ])('rejects malformed/restricted claims %j', async (change) => {
    const store = new AuthSessionStore(records() as never, config);
    await expect(
      store.assertActive({ ...claims(), ...change }, 'raw'),
    ).rejects.toThrow();
  });
  it('uses an explicit legacy cutoff and revokes copied legacy tokens during that grace', async () => {
    const model = records();
    const legacy = claims();
    delete legacy.sid;
    await expect(
      new AuthSessionStore(model as never, config).assertActive(
        legacy,
        'legacy',
      ),
    ).rejects.toThrow();
    const store = new AuthSessionStore(
      model as never,
      new ConfigService({
        LEGACY_JWT_ACCEPT_UNTIL: new Date(Date.now() + 86400000).toISOString(),
      }),
    );
    await store.assertActive(legacy, 'legacy');
    await store.revoke(legacy, 'legacy');
    await expect(store.assertActive(legacy, 'legacy')).rejects.toThrow();
  });
  it('aligns cookie expiry with the signed token and persists before returning cookies', async () => {
    const jwt = new JwtService({
      secret: 'synthetic-session-secret-at-least-32-bytes',
      signOptions: { expiresIn: '1h' },
    });
    const model = records();
    const store = new AuthSessionStore(model as never, config);
    const service = new AuthSessionService({} as never, jwt, config, store);
    const token = service.generateToken(userId, 'student', 0);
    const cookie = jest.fn();
    await service.setCookieToken({ cookie } as never, token);
    expect(model.rows).toHaveLength(1);
    const options = cookie.mock.calls[0][2];
    expect(options.httpOnly).toBe(true);
    expect(options.maxAge).toBeGreaterThan(3500000);
    expect(options.maxAge).toBeLessThanOrEqual(3600000);
  });
  it('reuses a verified same-browser session across password/passkey sign-ins without merging other browsers', async () => {
    const jwt = new JwtService({
      secret: 'synthetic-session-secret-at-least-32-bytes',
      signOptions: { expiresIn: '1h' },
    });
    const model = records();
    const store = new AuthSessionStore(model as never, config);
    const service = new AuthSessionService({} as never, jwt, config, store);
    const first = service.generateToken(userId, 'student', 0);
    await service.setCookieToken({ cookie: jest.fn() } as never, first);
    const cookie = jest.fn();
    await service.setCookieToken(
      { cookie } as never,
      service.generateToken(userId, 'student', 0),
      { cookies: { access_token: first } } as never,
    );
    expect(cookie.mock.calls[0][1]).toBe(first);
    expect(model.rows).toHaveLength(1);
    await service.setCookieToken(
      { cookie: jest.fn() } as never,
      service.generateToken(userId, 'student', 0),
    );
    expect(model.rows).toHaveLength(2);
    await store.revoke(jwt.verify(first), first);
    await service.setCookieToken(
      { cookie } as never,
      service.generateToken(userId, 'student', 0),
      { cookies: { access_token: first } } as never,
    );
    expect(model.rows).toHaveLength(3);
    expect(cookie.mock.calls.at(-2)![1]).not.toBe(first);
  });
  it('does not reuse another account or an older token version from the same browser', async () => {
    const jwt = new JwtService({
      secret: 'synthetic-session-secret-at-least-32-bytes',
      signOptions: { expiresIn: '1h' },
    });
    const model = records();
    const store = new AuthSessionStore(model as never, config);
    const service = new AuthSessionService({} as never, jwt, config, store);
    const first = service.generateToken(userId, 'student', 0);
    await service.setCookieToken({ cookie: jest.fn() } as never, first);
    for (const next of [
      service.generateToken('another-account', 'student', 0),
      service.generateToken(userId, 'student', 1),
    ]) {
      const cookie = jest.fn();
      await service.setCookieToken({ cookie } as never, next, {
        cookies: { access_token: first },
      } as never);
      expect(cookie.mock.calls[0][1]).toBe(next);
    }
    expect(model.rows).toHaveLength(3);
  });
  it('refreshes already-versioned metadata on session-list requests without changing login history or other devices', async () => {
    const jwt = new JwtService({
      secret: 'synthetic-session-secret-at-least-32-bytes',
      signOptions: { expiresIn: '1h' },
    });
    const model = records();
    const store = new AuthSessionStore(model as never, config);
    const resolver = {
      resolve: jest.fn().mockResolvedValue({
        metadataVersion: 1,
        device: 'computer',
        ip: '8.8.8.8',
        networkType: 'wifi',
      }),
    };
    const service = new AuthSessionService(
      {} as never,
      jwt,
      config,
      store,
      resolver as never,
    );
    const token = service.generateToken(userId, 'student', 0);
    const current = jwt.verify<SessionClaims>(token);
    await store.register(current, {
      metadataVersion: 1,
      device: 'computer',
      ip: '172.18.0.1',
    });
    await store.register(claims(), {
      metadataVersion: 1,
      device: 'mobile',
      ip: '172.18.0.1',
    });
    const lastLogin = model.rows[0].lastAuthenticatedAt;
    const req = { ip: '8.8.8.8' };
    const result = await service.listSessions(userId, token, req as never);
    expect(resolver.resolve).toHaveBeenCalledWith(req);
    expect(result.find((session) => session.current)).toMatchObject({
      ip: '8.8.8.8',
      networkType: 'wifi',
    });
    expect(model.rows[0].lastAuthenticatedAt).toBe(lastLogin);
    expect(model.rows[1].ip).toBe('172.18.0.1');
  });
});

describe('single-use recent-auth and OIDC flows', () => {
  it('binds a Google nonce to proof, origin and token nonce and rejects replay', async () => {
    const model = records();
    const remove = model.findOneAndDelete;
    const nonceModel = {
      ...model,
      findOneAndDelete: (filter: Row) => ({ select: () => remove(filter) }),
    };
    const service = new RecentAuthService(nonceModel as never, {} as never);
    const flow = await service.googleNonce('http://localhost:3000');
    await expect(
      service.consumeGoogleNonce(
        flow.flowId,
        flow.proof,
        flow.nonce,
        'https://evil.example',
      ),
    ).rejects.toThrow();
    await expect(
      service.consumeGoogleNonce(
        flow.flowId,
        randomBytes(32).toString('base64url'),
        flow.nonce,
        'http://localhost:3000',
      ),
    ).rejects.toThrow();
    await service.consumeGoogleNonce(
      flow.flowId,
      flow.proof,
      flow.nonce,
      'http://localhost:3000',
    );
    await expect(
      service.consumeGoogleNonce(
        flow.flowId,
        flow.proof,
        flow.nonce,
        'http://localhost:3000',
      ),
    ).rejects.toThrow();
    const expired = await service.googleNonce('http://localhost:3000');
    model.rows[0].expiresAt = new Date(0);
    await expect(
      service.consumeGoogleNonce(
        expired.flowId,
        expired.proof,
        expired.nonce,
        'http://localhost:3000',
      ),
    ).rejects.toThrow();
  });
  it('binds grants to the exact session and operation and permits only one concurrent consumption', async () => {
    const model = records();
    const users = {
      findById: jest.fn().mockResolvedValue({
        isActive: true,
        role: 'student',
        mustChangePassword: false,
      }),
      validatePassword: jest.fn().mockResolvedValue(true),
      isAccountLocked: jest.fn().mockReturnValue(false),
    };
    const service = new RecentAuthService(model as never, users as never);
    await service.reauthenticate(
      'user',
      'session-one',
      'synthetic-password',
      'google-link:start',
    );
    await expect(
      service.require('user', 'session-two', 'google-link:start'),
    ).rejects.toThrow();
    await expect(
      service.require('user', 'session-one', 'google-link:remove'),
    ).rejects.toThrow();
    const results = await Promise.allSettled([
      service.require('user', 'session-one', 'google-link:start'),
      service.require('user', 'session-one', 'google-link:start'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
  it('does not issue grants for an incorrect password', async () => {
    const model = records();
    const incrementLoginAttempts = jest.fn().mockResolvedValue(undefined);
    const service = new RecentAuthService(
      model as never,
      {
        findById: () => Promise.resolve({ isActive: true }),
        validatePassword: () => Promise.resolve(false),
        isAccountLocked: () => false,
        incrementLoginAttempts,
      } as never,
    );
    await expect(
      service.reauthenticate('user', 'session', 'wrong', 'sessions:all'),
    ).rejects.toThrow();
    expect(model.rows).toHaveLength(0);
    expect(incrementLoginAttempts).toHaveBeenCalled();
  });
});

describe('trusted proxy configuration', () => {
  it('resolves different public clients behind an allowed proxy and ignores forwarded headers from an untrusted peer', async () => {
    const app = express();
    app.set('trust proxy', trustedProxySources('127.0.0.1/32,::1/128'));
    app.get('/ip', (req, res) => res.json({ ip: req.ip }));
    for (const ip of ['8.8.8.8', '8.8.4.4']) {
      const response = await request(app).get('/ip').set('X-Forwarded-For', ip);
      expect(response.body.ip).toBe(ip);
    }
    app.set('trust proxy', trustedProxySources('172.18.0.1/32'));
    const response = await request(app)
      .get('/ip')
      .set('X-Forwarded-For', '8.8.8.8');
    expect(response.body.ip).not.toBe('8.8.8.8');
  });
  it('defaults to trusting no proxy', () =>
    expect(trustedProxySources()).toBe(false));
  it.each([
    'true',
    '1',
    '*',
    '0.0.0.0/0',
    '0.0.0.0/00',
    '::/0',
    '192.0.2.1/64',
  ])('rejects unsafe proxy configuration %s', (value) =>
    expect(() => trustedProxySources(value)).toThrow(),
  );
  it('accepts only explicit IP/CIDR sources', () =>
    expect(trustedProxySources('127.0.0.1/32,::1/128')).toEqual([
      '127.0.0.1/32',
      '::1/128',
    ]));
});
