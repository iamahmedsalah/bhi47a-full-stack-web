import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import {
  ValidationPipe,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { AuthGuard, PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import mongoose, { Types, type Connection } from 'mongoose';
import request from 'supertest';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Session } from 'node:inspector';
import {
  performance,
  monitorEventLoopDelay,
  PerformanceObserver,
} from 'node:perf_hooks';
import { MetricsService } from '../src/core/metrics/metrics.service';
import { createHttpMetricsMiddleware } from '../src/core/metrics/http-metrics.middleware';
import { getRequestQueryContext } from '../src/core/metrics/request-query-context';
import { createMongooseMetricsPlugin } from '../src/database/mongoose-metrics.plugin';
import { JwtStrategy } from '../src/modules/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/modules/auth/guards/roles.guard';
import { PermissionsGuard } from '../src/modules/auth/guards/permissions.guard';
import {
  AuthSessionStore,
  AuthSessionSchema,
  sessionDigest,
  type SessionClaims,
} from '../src/modules/auth/services/auth-session-store.service';
import { UsersService } from '../src/modules/users/users.service';
import { UserSchema } from '../src/modules/users/schemas/user.schema';
import { StudentProfileSchema } from '../src/modules/students/schemas/student-profile.schema';
import { CourseSchema } from '../src/modules/courses/schemas/course.schema';
import { CourseRegistrationSchema } from '../src/modules/registrations/schemas/course-registration.schema';
import { QuizSchema } from '../src/modules/quizzes/schemas/quiz.schema';
import { QuizSubmissionSchema } from '../src/modules/quizzes/schemas/quiz-submission.schema';
import { QuizAttemptSchema } from '../src/modules/quizzes/schemas/quiz-attempt.schema';
import { QuizzesController } from '../src/modules/quizzes/quizzes.controller';
import { QuizzesService } from '../src/modules/quizzes/quizzes.service';
import { NotificationSchema } from '../src/modules/notifications/schemas/notification.schema';
import { NotificationsController } from '../src/modules/notifications/notifications.controller';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { ComplaintSchema } from '../src/modules/complaints/schemas/complaint.schema';

// Never imports AppModule, deployment .env files or production data. No deletes,
// collection drops or index removals, including teardown. Synthetic rows remain.
describe('performance remediation: real JWT, isolated MongoDB, HTTP concurrency', () => {
  let connection: Connection;
  let app: INestApplication;
  const metrics = new MetricsService();
  const prefix = 'remediation_' + randomUUID().replaceAll('-', '');
  const output = resolve(process.cwd(), '../../outputs/api-performance-review');
  const ids = Array.from({ length: 12 }, () => new Types.ObjectId());
  const courseId = new Types.ObjectId();
  const quizId = new Types.ObjectId();
  const secret = 'synthetic-local-performance-secret-at-least-32-bytes';
  const config = new ConfigService({ JWT_SECRET: secret });
  const jwt = new JwtService({ secret });
  let optimized = true;
  let users: mongoose.Model<mongoose.mongo.Document>;
  let profiles: mongoose.Model<mongoose.mongo.Document>;
  let registrations: mongoose.Model<mongoose.mongo.Document>;
  let complaints: mongoose.Model<mongoose.mongo.Document>;
  let sessions: AuthSessionStore;
  let cookies: string[];
  let claims: SessionClaims[];
  const observations: Array<{
    route: string;
    queries: number;
    dbMs: number;
    operations: Record<string, number>;
  }> = [];
  const report: Record<string, unknown> = {
    environment:
      'credential-free localhost MongoDB 7; synthetic fixtures; same Node process and pool',
    scope:
      'real controllers/services, Passport JWT signature/expiry, database session/account policy, roles and permissions; no production app rate limits or CSRF middleware',
    baseline:
      'test-only original Passport guard called twice on quizzes; original extra hydrated notification identity lookup; all other code identical',
    fixture: {
      students: ids.length,
      courses: 2,
      complaints: 1200,
      retention:
        'no database deletion or collection dropping; unique fixture collections retained',
    },
    methodology: {
      warmupsPerMode: 20,
      requestsPerBlock: 240,
      rounds: 2,
      concurrency: [1, 5, 10],
      mix: '50% quiz list, 50% notification feed; 12 round-robin student sessions; alternating before/after order',
    },
  };
  const samples: Array<Record<string, unknown>> = [];
  const gc: Array<{ duration: number; kind: number }> = [];
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries())
      gc.push({
        duration: entry.duration,
        kind: (entry as unknown as { detail: { kind: number } }).detail.kind,
      });
  });
  const poolWaits: number[] = [];
  const waiting: number[] = [];
  let maximumWaiters = 0;
  const quantile = (values: number[], fraction: number) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.length
      ? sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]
      : 0;
  };
  function model(name: string, schema: mongoose.Schema) {
    return connection.model<mongoose.mongo.Document>(
      name,
      schema.clone(),
      prefix + '_' + name,
    );
  }
  const get = (route: string, identity = 0, cookie = cookies[identity]) =>
    request(app.getHttpServer())
      .get('/api/students/me/' + route)
      .set('Cookie', cookie);
  beforeAll(async () => {
    const uri = new URL(process.env.MONGODB_URI ?? '');
    if (
      uri.protocol !== 'mongodb:' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(uri.hostname) ||
      !/(?:test|e2e)$/.test(uri.pathname) ||
      uri.username ||
      uri.password ||
      uri.search
    ) {
      throw new Error(
        'Explicit credential-free localhost test MongoDB is required',
      );
    }
    connection = await mongoose
      .createConnection(uri.href, {
        autoIndex: true,
        maxPoolSize: 5,
        minPoolSize: 1,
      })
      .asPromise();
    connection.plugin(createMongooseMetricsPlugin(metrics));
    connection.getClient().on('connectionCheckOutStarted', () => {
      waiting.push(performance.now());
      maximumWaiters = Math.max(maximumWaiters, waiting.length);
    });
    const checked = () => {
      const start = waiting.shift();
      if (start !== undefined) poolWaits.push(performance.now() - start);
    };
    connection
      .getClient()
      .on('connectionCheckedOut', checked)
      .on('connectionCheckOutFailed', checked);
    users = model('users', UserSchema);
    profiles = model('profiles', StudentProfileSchema);
    registrations = model('registrations', CourseRegistrationSchema);
    const courses = model('courses', CourseSchema);
    const quizzes = model('quizzes', QuizSchema);
    const submissions = model('submissions', QuizSubmissionSchema);
    const attempts = model('attempts', QuizAttemptSchema);
    const notifications = model('notifications', NotificationSchema);
    complaints = model('complaints', ComplaintSchema);
    const sessionModel = connection.model(
      'sessions',
      AuthSessionSchema.clone(),
      prefix + '_sessions',
    );
    await Promise.all(
      Object.values(connection.models).map((entry) => entry.init()),
    );
    await users.collection.insertMany(
      ids.map((_id, i) => ({
        _id,
        name: 'Synthetic ' + i,
        email: `fixture${i}@example.invalid`,
        studentCode: 'PERF' + i,
        role: 'student',
        isActive: true,
        tokenVersion: 0,
        mustChangePassword: false,
        permissions: [],
      })),
    );
    await profiles.collection.insertMany(
      ids.map((userId, i) => ({
        userId,
        studentCode: 'PERF' + i,
        level: i % 2 ? '2' : '1',
        department: 'BIS',
        semester: 'first',
        academicYear: '2026-2027',
        fixtureUnusedContext: 'x'.repeat(32_000),
      })),
    );
    await registrations.collection.insertMany(
      ids.map((studentId) => ({
        studentId,
        status: 'approved',
        courses: ['PERF101', 'PERF-INACTIVE'],
        academicYear: '2026-2027',
        semester: 'first',
        createdAt: new Date(),
        fixtureUnusedContext: 'x'.repeat(16_000),
      })),
    );
    await courses.collection.insertMany([
      { _id: courseId, code: 'PERF101', isActive: true, name: 'Fixture' },
      { code: 'PERF-INACTIVE', isActive: false },
    ]);
    await quizzes.collection.insertMany([
      {
        _id: quizId,
        courseId,
        courseCode: 'PERF101',
        title: 'Synthetic quiz',
        isPublished: true,
        publishResults: false,
        durationMinutes: 30,
        totalMarks: 10,
        questions: [{ id: 'q1', correctAnswer: 'never-in-list' }],
        createdAt: new Date(),
      },
      { courseId, title: 'Unpublished', isPublished: false },
    ]);
    await submissions.collection.insertMany(
      ids.map((studentId) => ({
        studentId,
        quizId,
        score: 7,
        percentage: 70,
        isPassed: true,
        totalMarks: 10,
        submittedAt: new Date(),
      })),
    );
    await notifications.collection.insertMany([
      {
        title: 'All',
        body: 'Fixture',
        targetType: 'all',
        readBy: [{ userId: ids[0], readAt: new Date() }],
        createdAt: new Date(),
      },
      {
        title: 'Private first',
        body: 'Fixture',
        targetType: 'student',
        targetStudentId: ids[0],
        createdAt: new Date(),
      },
      {
        title: 'Level two',
        body: 'Fixture',
        targetType: 'level',
        targetLevel: '2',
        createdAt: new Date(),
      },
      {
        title: 'Hidden first',
        body: 'Fixture',
        targetType: 'all',
        hiddenBy: [{ userId: ids[0], hiddenAt: new Date() }],
        createdAt: new Date(),
      },
    ]);
    await complaints.collection.insertMany(
      Array.from({ length: 1200 }, (_, i) => ({
        ticketNumber: 'PERF-' + i,
        subject: 'Synthetic',
        status: i % 2 ? 'open' : 'closed',
        createdAt: new Date(Date.now() - i * 1000),
        description: 'fixture'.repeat(100),
      })),
    );
    sessions = new AuthSessionStore(sessionModel, config);
    claims = ids.map((id) => ({
      sub: String(id),
      sid: randomBytes(32).toString('base64url'),
      tokenVersion: 0,
      iss: 'student-portal',
      aud: 'student-portal-web',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400,
    }));
    cookies = claims.map(
      (claim) => 'access_token=' + jwt.sign({ ...claim, role: 'student' }),
    );
    await Promise.all(claims.map((claim) => sessions.register(claim)));
    const userService = new UsersService(users as never);
    const notificationService = new NotificationsService(
      notifications as never,
      users as never,
      profiles as never,
      { registerWorker: () => undefined } as never,
    );
    const currentFilter = (
      notificationService as unknown as {
        buildStudentNotificationFilter(id: string): Promise<unknown>;
      }
    ).buildStudentNotificationFilter.bind(notificationService);
    // Exact old lookup; shares the current filter construction to avoid a second
    // implementation of visibility rules. Test-only, never shipped in the API.
    jest
      .spyOn(
        notificationService as never,
        'buildStudentNotificationFilter' as never,
      )
      .mockImplementation((async (id: string) => {
        if (!optimized) {
          const student = await users.findById(id);
          if (!student) throw new Error('Missing fixture student');
        }
        return currentFilter(id);
      }) as never);
    const quizService = new QuizzesService(
      quizzes as never,
      submissions as never,
      attempts as never,
      courses as never,
      registrations as never,
      profiles as never,
      notificationService,
      {} as never,
      metrics,
    );
    const reflector = new Reflector();
    const legacy = new (AuthGuard('jwt'))();
    const updated = new JwtAuthGuard(reflector);
    const delegate = {
      canActivate: (context: ExecutionContext) =>
        optimized ? updated.canActivate(context) : legacy.canActivate(context),
    };
    const module = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [QuizzesController, NotificationsController],
      providers: [
        { provide: QuizzesService, useValue: quizService },
        { provide: NotificationsService, useValue: notificationService },
        {
          provide: JwtStrategy,
          useValue: new JwtStrategy(config, userService, sessions),
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(delegate)
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.use(createHttpMetricsMiddleware(metrics));
    app.use(
      (
        _req: unknown,
        res: { once(event: string, callback: () => void): void },
        next: () => void,
      ) => {
        const context = getRequestQueryContext()!.request;
        res.once('finish', () =>
          observations.push({
            route: context.route!,
            queries: context.count,
            dbMs: context.durationSeconds * 1000,
            operations: Object.fromEntries(
              [...context.operations].map(([name, count]) => [
                name.replace(prefix + '_', ''),
                count,
              ]),
            ),
          }),
        );
        next();
      },
    );
    app.useGlobalGuards(
      delegate,
      new RolesGuard(reflector),
      new PermissionsGuard(reflector),
    );
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.listen(0, '127.0.0.1');
    observer.observe({ entryTypes: ['gc'] });
    await mkdir(output, { recursive: true });
  }, 120_000);
  afterAll(async () => {
    observer.disconnect();
    jest.restoreAllMocks();
    await app?.close();
    await connection?.close();
    metrics.onModuleDestroy();
    metrics.getRegistry().clear();
  });
  it('preserves contracts, student isolation, unpublished scores and permission rejection', async () => {
    for (const route of ['quizzes', 'notifications']) {
      optimized = false;
      const before = await get(route).expect(200);
      const oldObservation = observations.at(-1)!;
      optimized = true;
      const after = await get(route).expect(200);
      const current = observations.at(-1)!;
      expect(after.body).toEqual(before.body);
      expect(current.queries).toBe(oldObservation.queries - 1);
      if (route === 'quizzes') {
        expect(after.body).toHaveLength(1);
        expect(after.body[0].submission.score).toBeUndefined();
        expect(JSON.stringify(after.body)).not.toContain('never-in-list');
      }
      report[route + 'QueryCounts'] = {
        before: oldObservation,
        after: current,
      };
    }
    const first = await get('notifications').expect(200);
    const second = await get('notifications', 1).expect(200);
    expect(JSON.stringify(first.body)).toContain('Private first');
    expect(JSON.stringify(first.body)).not.toContain('Hidden first');
    expect(JSON.stringify(first.body)).not.toContain('Level two');
    expect(JSON.stringify(second.body)).not.toContain('Private first');
    expect(JSON.stringify(second.body)).toContain('Level two');
    await get('quizzes', 0, 'access_token=invalid').expect(401);
    await get(
      'quizzes',
      0,
      'access_token=' +
        jwt.sign({ ...claims[0], exp: Math.floor(Date.now() / 1000) - 1 }),
    ).expect(401);
    await users.updateOne({ _id: ids[10] }, { $set: { role: 'staff' } });
    await get('quizzes', 10).expect(403);
    await users.updateOne({ _id: ids[10] }, { $set: { role: 'student' } });
  });
  it('validates each new request against revocation and current account policy', async () => {
    optimized = true;
    await get('quizzes', 11).expect(200);
    await sessions.revoke(claims[11], '');
    await get('quizzes', 11).expect(401);
    await users.updateOne({ _id: ids[10] }, { $set: { isActive: false } });
    await get('notifications', 10).expect(401);
    await users.updateOne(
      { _id: ids[10] },
      { $set: { isActive: true, tokenVersion: 1 } },
    );
    await get('quizzes', 10).expect(401);
    await users.updateOne(
      { _id: ids[10] },
      { $set: { tokenVersion: 0, lockedUntil: new Date(Date.now() + 60_000) } },
    );
    await get('quizzes', 10).expect(401);
    await users.updateOne({ _id: ids[10] }, { $unset: { lockedUntil: '' } });
    // New SID preserves revocation tombstone; never unrevokes the old fixture.
    claims[11] = { ...claims[11], sid: randomBytes(32).toString('base64url') };
    await sessions.register(claims[11]);
    cookies[11] =
      'access_token=' + jwt.sign({ ...claims[11], role: 'student' });
    await get('quizzes', 11).expect(200);
  });
  it('records actual query plans and projection sizes without adding indexes', async () => {
    function summary(plan: mongoose.mongo.Document) {
      const stages = new Set<string>();
      const indexes = new Set<string>();
      const walk = (value: unknown) => {
        if (!value || typeof value !== 'object') return;
        const node = value as Record<string, unknown>;
        if (typeof node.stage === 'string') stages.add(node.stage);
        if (typeof node.indexName === 'string') indexes.add(node.indexName);
        Object.entries(node)
          .filter(([key]) => key !== 'rejectedPlans')
          .forEach(([, item]) => walk(item));
      };
      walk(plan.queryPlanner.winningPlan);
      return {
        stages: [...stages],
        indexes: [...indexes],
        docsExamined: plan.executionStats.totalDocsExamined,
        keysExamined: plan.executionStats.totalKeysExamined,
        returned: plan.executionStats.nReturned,
      };
    }
    const plans = {
      session: summary(
        await connection
          .db!.collection(prefix + '_sessions')
          .find({
            _id: sessionDigest(claims[0].sid!),
            revokedAt: null,
            expiresAt: { $gt: new Date() },
          })
          .explain('executionStats'),
      ),
      user: summary(
        await users.findById(ids[0]).lean().explain('executionStats'),
      ),
      profile: summary(
        await profiles
          .findOne({ userId: ids[0] })
          .select('level department semester academicYear')
          .lean()
          .explain('executionStats'),
      ),
      complaintsDefault: summary(
        await complaints
          .find({})
          .sort({ createdAt: -1, _id: -1 })
          .limit(20)
          .lean()
          .explain('executionStats'),
      ),
      complaintsOpen: summary(
        await complaints
          .find({ status: 'open' })
          .sort({ createdAt: -1, _id: -1 })
          .limit(20)
          .lean()
          .explain('executionStats'),
      ),
      complaintsDeep: summary(
        await complaints
          .find({})
          .sort({ createdAt: -1, _id: -1 })
          .skip(1000)
          .limit(20)
          .lean()
          .explain('executionStats'),
      ),
    };
    expect(plans.session.docsExamined).toBe(1);
    expect(plans.complaintsDefault.stages).not.toContain('SORT');
    expect(plans.complaintsDefault.docsExamined).toBe(20);
    report.plans = plans;
    const profileBefore = await profiles.findOne({ userId: ids[0] }).lean();
    const profileAfter = await profiles
      .findOne({ userId: ids[0] })
      .select('level department semester academicYear')
      .lean();
    const registrationBefore = await registrations
      .findOne({ studentId: ids[0] })
      .lean();
    const registrationAfter = await registrations
      .findOne({ studentId: ids[0] })
      .select('courses')
      .lean();
    report.projectionJsonBytes = {
      profile: {
        before: Buffer.byteLength(JSON.stringify(profileBefore)),
        after: Buffer.byteLength(JSON.stringify(profileAfter)),
      },
      registration: {
        before: Buffer.byteLength(JSON.stringify(registrationBefore)),
        after: Buffer.byteLength(JSON.stringify(registrationAfter)),
      },
      limitation:
        'Synthetic unused context; JSON serialized document size, not wire bytes or production savings',
    };
    report.indexes = {
      sessions: (
        await connection.db!.collection(prefix + '_sessions').indexes()
      ).map(({ name, key, expireAfterSeconds }) => ({
        name,
        key,
        expireAfterSeconds,
      })),
      complaints: (await complaints.collection.indexes()).map(
        ({ name, key }) => ({ name, key }),
      ),
    };
  });
  it('benchmarks both modes with matched fixtures, warmups, mix and concurrency', async () => {
    const inspector = new Session();
    inspector.connect();
    const post = (method: string) =>
      new Promise<Record<string, unknown>>((accept, reject) =>
        inspector.post(method, (error, result) =>
          error ? reject(error) : accept(result as Record<string, unknown>),
        ),
      );
    await post('Profiler.enable');
    await post('Profiler.start');
    try {
      for (const mode of [false, true]) {
        optimized = mode;
        for (let i = 0; i < 20; i++)
          await get(i % 2 ? 'quizzes' : 'notifications', i % ids.length).expect(
            200,
          );
      }
      for (const concurrency of [1, 5, 10]) {
        for (let round = 0; round < 2; round++) {
          for (const mode of round % 2 ? [true, false] : [false, true]) {
            optimized = mode;
            const delay = monitorEventLoopDelay({ resolution: 10 });
            delay.enable();
            const cpu = process.cpuUsage();
            const elu = performance.eventLoopUtilization();
            const memoryBefore = process.memoryUsage();
            const gcStart = gc.length;
            const observationStart = observations.length;
            const poolStart = poolWaits.length;
            const start = performance.now();
            let next = 0;
            const latencies: number[] = [];
            let errors = 0;
            await Promise.all(
              Array.from({ length: concurrency }, async () => {
                while (next < 240) {
                  const i = next++;
                  const began = performance.now();
                  const result = await get(
                    i % 2 ? 'quizzes' : 'notifications',
                    i % ids.length,
                  );
                  latencies.push(performance.now() - began);
                  if (result.status !== 200) errors++;
                }
              }),
            );
            const elapsed = performance.now() - start;
            await new Promise<void>((done) => setImmediate(done));
            delay.disable();
            const processCpu = process.cpuUsage(cpu);
            const observed = observations.slice(observationStart);
            const pauses = gc.slice(gcStart);
            const wait = poolWaits.slice(poolStart);
            const sample = {
              mode: mode ? 'after' : 'before',
              round: round + 1,
              concurrency,
              requests: 240,
              elapsedMs: elapsed,
              p50Ms: quantile(latencies, 0.5),
              p95Ms: quantile(latencies, 0.95),
              p99Ms: quantile(latencies, 0.99),
              requestsPerSecond: 240_000 / elapsed,
              errors,
              dbOperationsPerRequest:
                observed.reduce((sum, item) => sum + item.queries, 0) /
                observed.length,
              summedDbMsPerRequest:
                observed.reduce((sum, item) => sum + item.dbMs, 0) /
                observed.length,
              poolCheckoutMeanMs:
                wait.reduce((sum, value) => sum + value, 0) / wait.length,
              poolCheckoutP95Ms: quantile(wait, 0.95),
              cpuMs: (processCpu.user + processCpu.system) / 1000,
              cpuOneCoreRatio:
                (processCpu.user + processCpu.system) / (elapsed * 1000),
              eventLoopUtilization:
                performance.eventLoopUtilization(elu).utilization,
              eventLoopP99Ms: delay.percentile(99) / 1e6,
              eventLoopMaxMs: delay.max / 1e6,
              memoryBefore,
              memoryAfter: process.memoryUsage(),
              gc: {
                count: pauses.length,
                totalPauseMs: pauses.reduce(
                  (sum, item) => sum + item.duration,
                  0,
                ),
                p95PauseMs: quantile(
                  pauses.map((item) => item.duration),
                  0.95,
                ),
                maxPauseMs: Math.max(0, ...pauses.map((item) => item.duration)),
                kinds: pauses.map((item) => item.kind),
              },
            };
            samples.push(sample);
            expect(errors).toBe(0);
            expect(observed).toHaveLength(240);
            expect(sample.dbOperationsPerRequest).toBe(mode ? 6 : 7);
          }
        }
      }
    } finally {
      const profile = await post('Profiler.stop');
      await writeFile(
        resolve(output, 'local-benchmark.cpuprofile'),
        JSON.stringify(profile.profile),
      );
      inspector.disconnect();
    }
    report.samples = samples;
    report.maximumPoolWaiters = maximumWaiters;
    report.runtime = {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      mongodb: (await connection.db!.admin().serverInfo()).version,
      poolSize: 5,
      cpuProfile: 'local-benchmark.cpuprofile',
      measurements:
        'client HTTP latency; summed overlapping query time is not wall latency; shared load generator/server process CPU and heap; pool waits matched FIFO; no forced GC',
    };
    await writeFile(
      resolve(output, 'local-benchmark.json'),
      JSON.stringify(report, null, 2),
    );
  }, 240_000);
});
