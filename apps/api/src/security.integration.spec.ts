import type { INestApplication, Provider } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { PERMISSIONS } from '@student-portal/shared';
import { AuthModule } from './modules/auth/auth.module';
import { AuthController } from './modules/auth/auth.controller';
import { AuthService } from './modules/auth/auth.service';
import { JwtStrategy } from './modules/auth/strategies/jwt.strategy';
import { UsersService } from './modules/users/users.service';
import { StudentsController } from './modules/students/students.controller';
import { StudentsService } from './modules/students/students.service';
import { MetricsController } from './core/metrics/metrics.controller';
import { MetricsService } from './core/metrics/metrics.service';
import { HealthController } from './health.controller';
import { ConnectionHolder } from './common/rate-limit/connection-holder';
import { securityHeadersMiddleware } from './common/middleware/security-headers.middleware';

const secret = 'security-regression-test-secret-at-least-32-bytes';
const userId = '507f1f77bcf86cd799439011';

describe('HTTP security boundaries (real controllers, guards and JWT strategy)', () => {
  let app: INestApplication;
  const originalConnection = ConnectionHolder.connection;
  const originalNodeEnv = process.env.NODE_ENV;
  const jwt = new JwtService({ secret });
  const findByIdForAuth = jest.fn();
  const stats = jest.fn().mockResolvedValue({ total: 10 });
  const summary = jest.fn().mockResolvedValue({ mustChangeCount: 2 });
  const toggle = jest.fn().mockResolvedValue({ updated: 10 });
  let account: {
    _id: string;
    role: string;
    permissions: string[];
    mustChangePassword: boolean;
    tokenVersion: number;
    isActive: boolean;
    name: string;
  };

  function cookie(payload: Record<string, unknown> = {}) {
    return `access_token=${jwt.sign({ sub: userId, role: 'admin', tokenVersion: 0, ...payload })}`;
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'production';
    // Use exactly the guard registrations from production, so removing a
    // global guard fails these tests instead of silently weakening the app.
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      AuthModule,
    ) as Provider[];
    const guards = providers.filter(
      (provider) =>
        typeof provider === 'object' &&
        'provide' in provider &&
        provider.provide === APP_GUARD,
    );
    const module = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [
        StudentsController,
        AuthController,
        MetricsController,
        HealthController,
      ],
      providers: [
        ...guards,
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: new ConfigService({ JWT_SECRET: secret }),
        },
        { provide: UsersService, useValue: { findByIdForAuth } },
        {
          provide: StudentsService,
          useValue: {
            getStats: stats,
            getMustChangePasswordSummary: summary,
            toggleAllMustChangePassword: toggle,
          },
        },
        {
          provide: AuthService,
          useValue: { getMe: jest.fn().mockResolvedValue({ _id: userId }) },
        },
        {
          provide: MetricsService,
          useValue: {
            getSummary: jest.fn().mockResolvedValue({ status: 'ok' }),
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.use(securityHeadersMiddleware);
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    account = {
      _id: userId,
      role: 'admin',
      permissions: [],
      mustChangePassword: false,
      tokenVersion: 0,
      isActive: true,
      name: 'Test',
    };
    findByIdForAuth.mockImplementation(() => Promise.resolve({ ...account }));
    ConnectionHolder.connection = {
      readyState: 1,
      db: { admin: () => ({ ping: () => Promise.resolve({ ok: 1 }) }) },
    } as unknown as NonNullable<typeof ConnectionHolder.connection>;
  });

  afterAll(async () => {
    await app?.close();
    ConnectionHolder.connection = originalConnection;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it.each([
    '/api/admin/students-stats',
    '/api/admin/students-must-change-password-summary',
    '/api/admin/students',
    '/api/admin/metrics',
    '/api/metrics/summary',
    '/api/auth/me',
  ])('rejects anonymous GET %s', async (path) => {
    await request(app.getHttpServer()).get(path).expect(401);
    expect(stats).not.toHaveBeenCalled();
    expect(summary).not.toHaveBeenCalled();
  });

  it('rejects unsigned, tampered, expired and invalid-subject sessions', async () => {
    const invalid = [
      'invalid',
      jwt.sign({ sub: userId, role: 'admin' }, { secret: 'wrong-secret' }),
      jwt.sign({ sub: userId, role: 'admin' }, { expiresIn: -1 }),
      jwt.sign({ sub: { $ne: null }, role: 'admin' }),
    ];
    for (const token of invalid) {
      await request(app.getHttpServer())
        .get('/api/admin/students-stats')
        .set('Cookie', `access_token=${token}`)
        .expect(401);
    }
    expect(findByIdForAuth).not.toHaveBeenCalled();
  });

  it('uses the database role even when a signed token claims admin', async () => {
    account.role = 'student';
    account.permissions = [PERMISSIONS.STUDENTS_READ];
    await request(app.getHttpServer())
      .get('/api/admin/students-stats')
      .set('Cookie', cookie())
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/admin/students-must-change-password-summary')
      .set('Cookie', cookie())
      .expect(403);
    expect(stats).not.toHaveBeenCalled();
    expect(summary).not.toHaveBeenCalled();
  });

  it('requires staff read permissions and preserves authorized access', async () => {
    account.role = 'staff';
    await request(app.getHttpServer())
      .get('/api/admin/students-stats')
      .set('Cookie', cookie())
      .expect(403);
    account.permissions = [PERMISSIONS.STUDENTS_READ];
    await request(app.getHttpServer())
      .get('/api/admin/students-stats')
      .set('Cookie', cookie())
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/admin/students-must-change-password-summary')
      .set('Cookie', cookie())
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/admin/metrics')
      .set('Cookie', cookie())
      .expect(403);
  });

  it('denies administrators access to student-only data APIs', async () => {
    await request(app.getHttpServer())
      .get('/api/students/me/dashboard')
      .set('Cookie', cookie())
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/students/me/profile')
      .set('Cookie', cookie())
      .expect(403);
  });

  it('does not let read-only staff change the password policy', async () => {
    account.role = 'staff';
    account.permissions = [PERMISSIONS.STUDENTS_READ];
    await request(app.getHttpServer())
      .post('/api/admin/students-toggle-all-must-change-password')
      .set('Cookie', `${cookie()}; csrf_token=expected`)
      .set('x-csrf-token', 'expected')
      .send({ enabled: false })
      .expect(403);
    expect(toggle).not.toHaveBeenCalled();
  });

  it('applies revoked permissions, deactivation and token revocation on the next request', async () => {
    const session = cookie();
    account.role = 'staff';
    account.permissions = [PERMISSIONS.STUDENTS_READ];
    await request(app.getHttpServer())
      .get('/api/admin/students-stats')
      .set('Cookie', session)
      .expect(200);
    account.permissions = [];
    await request(app.getHttpServer())
      .get('/api/admin/students-stats')
      .set('Cookie', session)
      .expect(403);
    account.isActive = false;
    await request(app.getHttpServer())
      .get('/api/admin/students-stats')
      .set('Cookie', session)
      .expect(401);
    account.isActive = true;
    account.tokenVersion = 1;
    await request(app.getHttpServer())
      .get('/api/admin/students-stats')
      .set('Cookie', session)
      .expect(401);
  });

  it('validates concurrent tokens independently', async () => {
    account.tokenVersion = 1;
    findByIdForAuth.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { ...account };
    });
    const responses = await Promise.all([
      request(app.getHttpServer())
        .get('/api/admin/students-stats')
        .set('Cookie', cookie({ tokenVersion: 1 })),
      request(app.getHttpServer())
        .get('/api/admin/students-stats')
        .set('Cookie', cookie({ tokenVersion: 0 })),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 401]);
  });

  it('enforces first-login restrictions on the server', async () => {
    account.mustChangePassword = true;
    await request(app.getHttpServer())
      .get('/api/admin/students-stats')
      .set('Cookie', cookie())
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie())
      .expect(200);
  });

  it('requires matching CSRF tokens for administrative mutations', async () => {
    const path = '/api/admin/students-toggle-all-must-change-password';
    await request(app.getHttpServer())
      .post(path)
      .set('Cookie', cookie())
      .send({ enabled: true })
      .expect(403);
    await request(app.getHttpServer())
      .post(path)
      .set('Cookie', `${cookie()}; csrf_token=expected`)
      .set('x-csrf-token', 'wrong')
      .send({ enabled: true })
      .expect(403);
    expect(toggle).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .post(path)
      .set('Cookie', `${cookie()}; csrf_token=expected`)
      .set('x-csrf-token', 'expected')
      .send({ enabled: true })
      .expect(201);
    expect(toggle).toHaveBeenCalledWith(true);
  });

  it.each(['/api', '/api/health'])(
    'exposes only public status at %s',
    async (path) => {
      const response = await request(app.getHttpServer()).get(path).expect(200);
      expect(Object.keys(response.body)).toEqual(['status']);
    },
  );

  it('prevents shared caching of successful and rejected requests', async () => {
    for (const authenticated of [false, true]) {
      const req = request(app.getHttpServer()).get('/api/admin/students-stats');
      if (authenticated) req.set('Cookie', cookie());
      const response = await req.expect(authenticated ? 200 : 401);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.headers['cdn-cache-control']).toBe('no-store');
      expect(response.headers['vercel-cdn-cache-control']).toBe('no-store');
      expect(response.headers.vary).toContain('Cookie');
    }
  });
});
