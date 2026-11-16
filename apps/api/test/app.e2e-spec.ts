import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { createHash, randomBytes } from 'node:crypto';
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
import { defineCourseAssignmentAcceptance } from './course-assignment-acceptance';
import { defineStaffProfileAcceptance } from './staff-profile-acceptance';
import { QuizzesService } from '../src/modules/quizzes/quizzes.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { QuizQuestionExcelService } from '../src/modules/quizzes/services/quiz-question-excel.service';
import {
  AdmissionPeriod,
  type AdmissionPeriodDocument,
} from '../src/modules/admissions/schemas/admission-period.schema';
import { PERMISSIONS } from '@student-portal/shared';
import { createFixtureIndexes } from './fixture-indexes';

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
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    users = module.get(getModelToken(User.name));
    sessions = module.get(getModelToken('AuthSession'));
    actions = module.get(getModelToken('AuthAction'));
    await createFixtureIndexes(users);
    await createFixtureIndexes(sessions);
    await createFixtureIndexes(actions);
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

  beforeEach(async () => {
    // Browser acceptance cases reuse these synthetic accounts. Each case needs
    // its own action budget now that the production rate-limit guard is active.
    // Delete only counters belonging to this suite's generated fixture IDs.
    const keys = ids.flatMap((id) =>
      [
        'auth-security',
        'passkey-security',
        'google-link',
        'google-verify-otp',
        'change-password',
      ].map(
        (rule) => `${rule}:v2:${createHash('sha256').update(id).digest('hex')}`,
      ),
    );
    await users.db
      .collection<{ _id: string }>('rate_limits')
      .deleteMany({ _id: { $in: keys } });
  });

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
  defineCourseAssignmentAcceptance({
    app: () => app!,
    users: () => users,
    origin: () => origin,
    accounts,
    ids,
    password,
  });
  defineStaffProfileAcceptance({
    app: () => app!,
    users: () => users,
    origin: () => origin,
    accounts,
    ids,
    password,
  });
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

  it('persists separate release settings and opens saved results without a publishing worker', async () => {
    const db = users.db.db!;
    const courseId = new Types.ObjectId();
    const profileId = new Types.ObjectId();
    const registrationId = new Types.ObjectId();
    const studentId = new Types.ObjectId(accounts.get('student')!.userId);
    const courseCode = `QR${randomBytes(5).toString('hex').toUpperCase()}`;
    let createdQuizId: Types.ObjectId | undefined;
    try {
      await db.collection('courses').insertOne({
        _id: courseId,
        code: courseCode,
        name: 'Synthetic release course',
        isActive: true,
      });
      await db.collection('student_profiles').insertOne({
        _id: profileId,
        userId: studentId,
        studentCode,
        fullName: 'Synthetic release student',
        level: '1',
        academicYear: '2026-2027',
        semester: 'first',
      });
      await db.collection('course_registrations').insertOne({
        _id: registrationId,
        studentId,
        courses: [courseCode],
        status: 'approved',
        academicYear: '2026-2027',
        semester: 'first',
      });
      const account = accounts.get('admin')!;
      const signedIn = await request(app!.getHttpServer())
        .post('/api/auth/admin/login')
        .set('Origin', origin)
        .send({ email: account.identifier, password })
        .expect(200);
      const admin = {
        cookie: (signedIn.headers['set-cookie'] as unknown as string[])
          .map((value) => value.split(';')[0])
          .join('; '),
        csrf: signedIn.body.csrfToken as string,
      };
      const payload = {
        courseId: String(courseId),
        title: 'Scheduled release fixture',
        durationMinutes: 1,
        isPublished: false,
        resultsReleaseMode: 'after_close',
        reviewReleaseMode: 'after_close',
        endsAt: new Date(Date.now() + 180000).toISOString(),
        questions: [
          {
            id: 'q1',
            text: 'Two plus two?',
            type: 'mcq',
            options: ['4', '5'],
            correctOptionIndex: 0,
            points: 2,
          },
        ],
      };
      await authenticatedPost('/api/admin/quizzes', admin)
        .send({ ...payload, resultsReleaseMode: 'timer' })
        .expect(400);
      const { endsAt: _endsAt, ...missingClose } = payload;
      await authenticatedPost('/api/admin/quizzes', admin)
        .send(missingClose)
        .expect(400);
      const created = await authenticatedPost('/api/admin/quizzes', admin)
        .send(payload)
        .expect(201);
      createdQuizId = new Types.ObjectId(created.body._id as string);
      expect(created.body).toMatchObject({
        resultsReleaseMode: 'after_close',
        reviewReleaseMode: 'after_close',
        publishResults: false,
        allowReview: false,
      });
      await db
        .collection('quizzes')
        .updateOne({ _id: createdQuizId }, { $set: { isPublished: true } });
      await db.collection('quiz_submissions').insertOne({
        quizId: createdQuizId,
        courseId,
        studentId,
        studentCode,
        score: 2,
        totalMarks: 2,
        percentage: 100,
        isPassed: true,
        submittedAt: new Date(),
        durationSeconds: 10,
        answers: [
          {
            questionId: 'q1',
            selectedOptionIndex: 0,
            isCorrect: true,
            pointsAwarded: 2,
          },
        ],
      });
      const student = await login();
      const list = () =>
        request(app!.getHttpServer())
          .get('/api/students/me/quizzes')
          .set('Cookie', student.cookie);
      const review = () =>
        request(app!.getHttpServer())
          .get(`/api/students/me/quizzes/${String(createdQuizId)}/review`)
          .set('Cookie', student.cookie);
      const hidden = await list().expect(200);
      expect(
        hidden.body.find(
          (item: { _id: string }) => item._id === String(createdQuizId),
        ),
      ).toMatchObject({ publishResults: false, canReview: false });
      expect(JSON.stringify(hidden.body)).not.toContain('"score"');
      await review().expect(403);
      await request(app!.getHttpServer())
        .get(`/api/students/me/quizzes/${String(createdQuizId)}/review`)
        .expect(401);
      await request(app!.getHttpServer())
        .patch(`/api/admin/quizzes/${String(createdQuizId)}`)
        .set('Cookie', admin.cookie)
        .send({ publishResults: true })
        .expect(403);
      await request(app!.getHttpServer())
        .patch(`/api/admin/quizzes/${String(createdQuizId)}`)
        .set('Cookie', student.cookie)
        .set('x-csrf-token', student.csrf)
        .send({ publishResults: true })
        .expect(403);
      await db
        .collection('quizzes')
        .updateOne(
          { _id: createdQuizId },
          { $set: { endsAt: new Date(Date.now() - 1) } },
        );
      const released = await list().expect(200);
      expect(
        released.body.find(
          (item: { _id: string }) => item._id === String(createdQuizId),
        ),
      ).toMatchObject({
        publishResults: true,
        canReview: true,
        isEnded: true,
        submission: { score: 2 },
      });
      const answers = await review().expect(200);
      expect(answers.body.questions[0].correctOptionIndex).toBe(0);
      // A fresh service with no cache or queue worker reads the persisted modes.
      const restarted = new QuizzesService(
        app!.get(getModelToken('Quiz')),
        app!.get(getModelToken('QuizSubmission')),
        app!.get(getModelToken('QuizAttempt')),
        app!.get(getModelToken('Course')),
        app!.get(getModelToken('CourseRegistration')),
        app!.get(getModelToken('StudentProfile')),
        app!.get(NotificationsService),
        app!.get(QuizQuestionExcelService),
      );
      expect(
        (
          await restarted.getQuizReview(
            String(createdQuizId),
            String(studentId),
          )
        ).submission.score,
      ).toBe(2);
      expect(
        await db.collection('quizzes').findOne({ _id: createdQuizId }),
      ).toMatchObject({ publishResults: false, allowReview: false });
      await request(app!.getHttpServer())
        .patch(`/api/admin/quizzes/${String(createdQuizId)}`)
        .set('Cookie', admin.cookie)
        .set('x-csrf-token', admin.csrf)
        .send({ resultsReleaseMode: 'manual', publishResults: false })
        .expect(200);
      await review().expect(403);
    } finally {
      if (createdQuizId) {
        await db
          .collection('quiz_submissions')
          .deleteMany({ quizId: createdQuizId });
        await db.collection('quizzes').deleteOne({ _id: createdQuizId });
      }
      await db
        .collection('course_registrations')
        .deleteOne({ _id: registrationId });
      await db.collection('student_profiles').deleteOne({ _id: profileId });
      await db.collection('courses').deleteOne({ _id: courseId });
    }
  }, 30000);
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

  it('protects admission configuration, validates windows and atomically rejects concurrent stale edits', async () => {
    const path = '/api/admin/admissions/periods';
    const periods = app!.get<Model<AdmissionPeriodDocument>>(
      getModelToken(AdmissionPeriod.name),
    );
    await createFixtureIndexes(periods);
    const code = `E2E-${String(new Types.ObjectId())}`.toUpperCase();
    const payload = {
      code,
      academicYear: '2026-2027',
      name: 'Synthetic admission intake',
      opensAt: '2026-10-30T22:00:00Z',
      closesAt: '2026-10-31T00:00:00Z',
    };
    const signIn = async (role: 'admin' | 'staff') => {
      const response = await request(app!.getHttpServer())
        .post('/api/auth/admin/login')
        .set('Origin', origin)
        .send({ email: accounts.get(role)!.identifier, password })
        .expect(200);
      return {
        cookie: (response.headers['set-cookie'] as unknown as string[])
          .map((value) => value.split(';')[0])
          .join('; '),
        csrf: response.body.csrfToken as string,
      };
    };
    const admin = await signIn('admin');
    const staff = await signIn('staff');
    const patch = (id: string, body: object, auth = admin) =>
      request(app!.getHttpServer())
        .patch(`${path}/${id}`)
        .set('Origin', origin)
        .set('Cookie', auth.cookie)
        .set('x-csrf-token', auth.csrf)
        .send(body);
    const create = (body: object) =>
      request(app!.getHttpServer())
        .post(path)
        .set('Origin', origin)
        .set('Cookie', admin.cookie)
        .set('x-csrf-token', admin.csrf)
        .send(body);
    const staffId = accounts.get('staff')!.userId;
    const originalPermissions = (await users.findById(staffId).lean())!
      .permissions;
    try {
      await request(app!.getHttpServer()).get(path).expect(401);
      const student = await login();
      await request(app!.getHttpServer())
        .get(path)
        .set('Cookie', student.cookie)
        .expect(403);
      await request(app!.getHttpServer())
        .get(path)
        .set('Cookie', staff.cookie)
        .expect(403);
      await users.updateOne(
        { _id: staffId },
        { $set: { permissions: [PERMISSIONS.REGISTRATION_WRITE] } },
      );
      await request(app!.getHttpServer())
        .get(path)
        .set('Cookie', staff.cookie)
        .expect(403);
      await create({ ...payload, opensAt: '2026-10-30T22:00' }).expect(400);
      await create({ ...payload, closesAt: payload.opensAt }).expect(400);
      await create({ ...payload, isEnabled: 'false' }).expect(400);
      const before = await users.countDocuments();
      const created = await create(payload).expect(201);
      const id = created.body._id as string;
      expect(created.body).toMatchObject({
        code,
        isEnabled: false,
        status: 'disabled',
        revision: 0,
      });
      expect(created.body.history).toBeUndefined();
      expect(await users.countDocuments()).toBe(before);
      await create(payload).expect(409);
      await patch(id, { revision: 0, academicYear: '2027-2028' }).expect(400);
      await request(app!.getHttpServer())
        .patch(`${path}/${id}`)
        .set('Origin', origin)
        .set('Cookie', admin.cookie)
        .send({ revision: 0, isEnabled: true })
        .expect(403);
      await users.updateOne(
        { _id: staffId },
        { $set: { permissions: [PERMISSIONS.ADMISSIONS_PERIODS_READ] } },
      );
      await request(app!.getHttpServer())
        .get(path)
        .set('Cookie', staff.cookie)
        .expect(200);
      await patch(id, { revision: 0, isEnabled: true }, staff).expect(403);
      await users.updateOne(
        { _id: staffId },
        { $set: { permissions: [PERMISSIONS.ADMISSIONS_PERIODS_MANAGE] } },
      );
      await request(app!.getHttpServer())
        .get(path)
        .set('Cookie', staff.cookie)
        .expect(200);
      const raced = await Promise.all([
        patch(id, { revision: 0, name: 'Concurrent editor A' }, staff),
        patch(id, { revision: 0, name: 'Concurrent editor B' }),
      ]);
      expect(raced.map((response) => response.status).sort()).toEqual([
        200, 409,
      ]);
      const saved = await periods.findById(id).select('+history').lean();
      expect(saved!.revision).toBe(1);
      expect(saved!.history).toHaveLength(2);
      expect(saved!.history[1].revision).toBe(1);
      await patch(id, { revision: 1, isEnabled: true }, staff).expect(200);
      await users.updateOne({ _id: staffId }, { $set: { permissions: [] } });
      await patch(id, { revision: 2, isEnabled: false }, staff).expect(403);
    } finally {
      await periods.deleteMany({ code });
      await users.updateOne(
        { _id: staffId },
        { $set: { permissions: originalPermissions } },
      );
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
