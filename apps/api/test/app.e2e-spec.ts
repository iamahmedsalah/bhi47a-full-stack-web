import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  User,
  type UserDocument,
} from '../src/modules/users/schemas/user.schema';
import type { AuthSessionRecord } from '../src/modules/auth/services/auth-session-store.service';
import type { AuthAction } from '../src/modules/auth/services/recent-auth.service';
import type {
  PasskeyFlow,
  PasskeySettings,
} from '../src/modules/auth/passkeys/passkey.schemas';
import { securityHeadersMiddleware } from '../src/common/middleware/security-headers.middleware';
import { definePasskeyBrowserAcceptance } from './passkey-browser-acceptance';

describe('API authentication and session boundaries (isolated MongoDB)', () => {
  let app: INestApplication | undefined;
  let users: Model<UserDocument>;
  let sessions: Model<AuthSessionRecord>;
  let actions: Model<AuthAction>;
  const ids: string[] = [];
  const accounts = new Map<string, { userId: string; identifier: string }>();
  let origin = 'http://localhost:3000';
  let frontend: Server;
  const studentCode =
    '99' +
    (BigInt('0x' + randomBytes(5).toString('hex')) % 10000000000n)
      .toString()
      .padStart(10, '0');
  const password = 'SyntheticE2ePassword123!';
  const oldClient = process.env.CLIENT_URL;
  const oldPasskey = process.env.PASSKEYS_ENABLED;

  beforeAll(async () => {
    if (
      !/^mongodb:\/\/(localhost|127\.0\.0\.1):\d+\/[^?]*(test|e2e)/.test(
        process.env.MONGODB_URI ?? '',
      )
    )
      throw new Error('Explicit localhost test/e2e database required');
    frontend = createServer((_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(
        '<!doctype html><html lang="en"><title>WebAuthn protocol acceptance</title></html>',
      );
    });
    await new Promise<void>((resolve) =>
      frontend.listen(0, 'localhost', resolve),
    );
    origin = `http://localhost:${(frontend.address() as AddressInfo).port}`;
    process.env.CLIENT_URL = origin;
    process.env.PASSKEYS_ENABLED = 'true';
    process.env.PASSKEY_RP_ID = 'localhost';
    process.env.PASSKEY_ORIGINS = origin;
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          ...process.env,
          CLIENT_URL: origin,
          PASSKEY_ORIGINS: origin,
        }),
      )
      .compile();
    app = module.createNestApplication();
    app.enableCors({ origin, credentials: true });
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.use(securityHeadersMiddleware);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    users = module.get(getModelToken(User.name));
    sessions = module.get(getModelToken('AuthSession'));
    actions = module.get(getModelToken('AuthAction'));
    await users.createIndexes();
    await sessions.createIndexes();
    await actions.createIndexes();
    const fixture = await users.create({
      name: 'Synthetic security fixture',
      role: 'student',
      studentCode,
      passwordHash: await bcrypt.hash(password, 4),
      isActive: true,
      mustChangePassword: false,
      permissions: [],
    });
    ids.push(fixture._id.toString());
    accounts.set('student', {
      userId: fixture._id.toString(),
      identifier: studentCode,
    });
    for (const role of ['admin', 'staff'] as const) {
      const identifier = `e2e-${role}-${studentCode}@example.test`;
      const user = await users.create({
        name: `Synthetic ${role}`,
        email: identifier,
        role,
        passwordHash: await bcrypt.hash(password, 4),
        isActive: true,
        mustChangePassword: false,
        permissions: [],
      });
      ids.push(user._id.toString());
      accounts.set(role, { userId: user._id.toString(), identifier });
    }
  }, 30000);

  afterAll(async () => {
    if (users) await users.deleteMany({ _id: { $in: ids } });
    if (sessions) await sessions.deleteMany({ userId: { $in: ids } });
    if (actions) await actions.deleteMany({ userId: { $in: ids } });
    await app?.close();
    if (frontend)
      await new Promise<void>((resolve, reject) =>
        frontend.close((error) => (error ? reject(error) : resolve())),
      );
    if (oldClient === undefined) delete process.env.CLIENT_URL;
    else process.env.CLIENT_URL = oldClient;
    if (oldPasskey === undefined) delete process.env.PASSKEYS_ENABLED;
    else process.env.PASSKEYS_ENABLED = oldPasskey;
  }, 10000);

  async function login() {
    const response = await request(app!.getHttpServer())
      .post('/api/auth/student/login')
      .set('Origin', origin)
      .send({ studentCode, password })
      .expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    return {
      cookie: cookies.map((value) => value.split(';')[0]).join('; '),
      csrf: response.body.csrfToken as string,
    };
  }
  function authenticatedPost(
    path: string,
    auth: { cookie: string; csrf: string },
  ) {
    return request(app!.getHttpServer())
      .post(path)
      .set('Origin', origin)
      .set('Cookie', auth.cookie)
      .set('x-csrf-token', auth.csrf);
  }

  it('boots with /api/health returning ok', async () => {
    await request(app!.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
      });
  });
  it('preserves the existing bcrypt password and rejects a copied token after logout', async () => {
    const original = await users
      .findById(ids[0])
      .select('+passwordHash')
      .lean();
    const auth = await login();
    const stored = await users.findById(ids[0]).select('+passwordHash').lean();
    expect(stored?.passwordHash).toBe(original?.passwordHash);
    await request(app!.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', auth.cookie)
      .expect(200)
      .expect((res) => {
        expect(res.body._id).toBe(ids[0]);
      });
    await request(app!.getHttpServer())
      .post('/api/auth/logout')
      .set('Origin', origin)
      .set('Cookie', auth.cookie)
      .expect(403);
    await authenticatedPost('/api/auth/logout', auth).expect(200);
    await request(app!.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', auth.cookie)
      .expect(401);
  });
  it('revokes one device without invalidating another device', async () => {
    const first = await login();
    const second = await login();
    expect(first.cookie).not.toBe(second.cookie);
    await authenticatedPost('/api/auth/logout', first).expect(200);
    await request(app!.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', second.cookie)
      .expect(200);
  });
  it('requires a single-use operation grant for logout-all and invalidates all devices', async () => {
    const first = await login();
    const second = await login();
    await authenticatedPost('/api/auth/logout-all', first).expect(403);
    await authenticatedPost('/api/auth/reauthenticate', first)
      .send({ password, operation: 'sessions:all' })
      .expect(200);
    await authenticatedPost('/api/auth/logout-all', first).expect(200);
    for (const auth of [first, second])
      await request(app!.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', auth.cookie)
        .expect(401);
  });
  it('rejects hostile origins before creating Google nonce flows', async () => {
    await request(app!.getHttpServer())
      .post('/api/auth/google/nonce')
      .set('Origin', 'https://evil.example')
      .expect(403);
    await request(app!.getHttpServer())
      .post('/api/auth/google/nonce')
      .expect(403);
  });
  it('preserves the empty-body passkey options API for existing clients', async () => {
    const response = await request(app!.getHttpServer())
      .post('/api/auth/passkeys/login/options')
      .set('Origin', origin)
      .expect(200);
    expect(response.body.flowToken).toHaveLength(43);
    await app!
      .get<Model<PasskeyFlow>>(getModelToken('PasskeyFlow'))
      .deleteOne({ flowId: response.body.flowId });
  });
  it('allows only admins to control student passkey login and validates changes', async () => {
    const path = '/api/auth/passkeys/settings';
    const model = app!.get<Model<PasskeySettings>>(
      getModelToken('PasskeySettings'),
    );
    const previous = await model.findById('global').lean();
    try {
      await request(app!.getHttpServer()).get(path).expect(401);
      const student = await login();
      await request(app!.getHttpServer())
        .get(path)
        .set('Cookie', student.cookie)
        .expect(403);
      await request(app!.getHttpServer())
        .patch(path)
        .set('Origin', origin)
        .set('Cookie', student.cookie)
        .set('x-csrf-token', student.csrf)
        .send({ studentLoginEnabled: false })
        .expect(403);
      for (const role of ['staff', 'admin']) {
        const response = await request(app!.getHttpServer())
          .post('/api/auth/admin/login')
          .set('Origin', origin)
          .send({ email: accounts.get(role)!.identifier, password })
          .expect(200);
        const cookie = (response.headers['set-cookie'] as unknown as string[])
          .map((value) => value.split(';')[0])
          .join('; ');
        const patch = (
          body: Record<string, unknown>,
          csrf = response.body.csrfToken as string,
          requestOrigin = origin,
        ) =>
          request(app!.getHttpServer())
            .patch(path)
            .set('Origin', requestOrigin)
            .set('Cookie', cookie)
            .set('x-csrf-token', csrf)
            .send(body);
        if (role === 'staff') {
          await request(app!.getHttpServer())
            .get(path)
            .set('Cookie', cookie)
            .expect(403);
          await patch({ studentLoginEnabled: false }).expect(403);
          continue;
        }
        await patch({ studentLoginEnabled: 'false' }).expect(400);
        await patch({}).expect(400);
        await patch({ studentLoginEnabled: false }, 'invalid').expect(403);
        await patch(
          { studentLoginEnabled: false },
          response.body.csrfToken,
          'https://evil.example',
        ).expect(403);
        await patch({ studentLoginEnabled: false }).expect(200);
        expect(
          (await model.findById('global').lean())?.studentLoginEnabled,
        ).toBe(false);
        const capabilities = await request(app!.getHttpServer())
          .get('/api/auth/passkeys/capabilities')
          .expect(200);
        expect(capabilities.body.studentLoginEnabled).toBe(false);
        await request(app!.getHttpServer())
          .post('/api/auth/passkeys/login/options')
          .set('Origin', origin)
          .send({ area: 'student' })
          .expect(403);
        const management = await request(app!.getHttpServer())
          .post('/api/auth/passkeys/login/options')
          .set('Origin', origin)
          .send({ area: 'management' })
          .expect(200);
        await app!
          .get<Model<PasskeyFlow>>(getModelToken('PasskeyFlow'))
          .deleteOne({ flowId: management.body.flowId });
        await patch({ studentLoginEnabled: true }).expect(200);
        await request(app!.getHttpServer())
          .get(path)
          .set('Cookie', cookie)
          .expect(200)
          .expect(({ body }) => expect(body.studentLoginEnabled).toBe(true));
      }
    } finally {
      if (previous) await model.replaceOne({ _id: 'global' }, previous);
      else await model.deleteOne({ _id: 'global' });
    }
  });

  definePasskeyBrowserAcceptance((role) => ({
    app: app!,
    origin,
    ...accounts.get(role)!,
    password,
    role,
  }));
});
