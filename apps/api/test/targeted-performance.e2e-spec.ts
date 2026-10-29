import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import mongoose, { Types } from 'mongoose';
import type { Connection } from 'mongoose';
import request from 'supertest';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CoursesController } from '../src/modules/courses/courses.controller';
import { CoursesService } from '../src/modules/courses/courses.service';
import { CourseSchema } from '../src/modules/courses/schemas/course.schema';
import { StudentProfileSchema } from '../src/modules/students/schemas/student-profile.schema';
import { UserSchema } from '../src/modules/users/schemas/user.schema';
import {
  CourseRegistrationSchema,
  type CourseRegistrationDocument,
} from '../src/modules/registrations/schemas/course-registration.schema';
import { StudentAcademicProfileSchema } from '../src/modules/registrations/schemas/student-academic-profile.schema';
import { GpaRegistrationRuleSchema } from '../src/modules/registrations/schemas/gpa-registration-rule.schema';
import { GradeSchema } from '../src/modules/grades/schemas/grade.schema';
import { RegistrationsService } from '../src/modules/registrations/registrations.service';
import {
  ComplaintSchema,
  type ComplaintDocument,
} from '../src/modules/complaints/schemas/complaint.schema';
import { ComplaintsController } from '../src/modules/complaints/complaints.controller';
import { ComplaintsService } from '../src/modules/complaints/complaints.service';
import { RolesGuard } from '../src/modules/auth/guards/roles.guard';
import { PermissionsGuard } from '../src/modules/auth/guards/permissions.guard';
import { MetricsService } from '../src/core/metrics/metrics.service';
import { createMongooseMetricsPlugin } from '../src/database/mongoose-metrics.plugin';
import { createHttpMetricsMiddleware } from '../src/core/metrics/http-metrics.middleware';
import { getRequestQueryContext } from '../src/core/metrics/request-query-context';
import { AuthSessionSchema, type AuthSessionRecord } from '../src/modules/auth/services/auth-session-store.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// Synthetic, credential-free localhost fixtures. This is not a staging benchmark.
describe('targeted performance with isolated MongoDB and real HTTP controllers', () => {
  let connection: Connection;
  let app: INestApplication;
  const metrics = new MetricsService();
  const runId = randomUUID().replaceAll('-', '');
  const observations: Array<Record<string, unknown>> = [];
  const report: Record<string, unknown> = {
    environment: 'localhost synthetic fixtures',
    auth: 'test-only identity middleware; real role/permission guards',
    samples: 3,
    warmups: 1,
    concurrency: 1,
  };
  const ids = Array.from({ length: 500 }, () => new Types.ObjectId());
  const targetId = new Types.ObjectId();
  const historyId = new Types.ObjectId();
  const secondTargetId = new Types.ObjectId();
  let legacyValidation = false;
  let registrations: mongoose.Model<CourseRegistrationDocument>;
  let complaints: mongoose.Model<ComplaintDocument>;

  function fixtureModel<T>(
    name: string,
    schema: mongoose.Schema<T>,
    collection: string,
  ) {
    // Nest services in this repository type models using the legacy T & Document alias.
    return connection.model<T>(
      name,
      schema,
      `perf_${runId}_${collection}`,
    ) as unknown as mongoose.Model<T & mongoose.Document>;
  }

  function planSummary(plan: mongoose.mongo.Document) {
    const stages: string[] = [];
    const indexes: string[] = [];
    const walk = (value: unknown) => {
      if (value && typeof value === 'object') {
        const node = value as Record<string, unknown>;
        if (typeof node.stage === 'string') stages.push(node.stage);
        if (typeof node.indexName === 'string') indexes.push(node.indexName);
        Object.values(node).forEach(walk);
      }
    };
    walk(plan.queryPlanner.winningPlan);
    return {
      stages,
      indexes,
      totalDocsExamined: plan.executionStats.totalDocsExamined,
      totalKeysExamined: plan.executionStats.totalKeysExamined,
    };
  }

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
        'Performance fixtures require an explicit credential-free localhost test database',
      );
    }
    connection = await mongoose
      .createConnection(uri.href, { autoIndex: true, maxPoolSize: 5 })
      .asPromise();
    connection.plugin(createMongooseMetricsPlugin(metrics));
    const courses = fixtureModel('PerfCourse', CourseSchema, 'courses');
    const students = fixtureModel(
      'PerfStudent',
      StudentProfileSchema,
      'students',
    );
    const users = fixtureModel('PerfUser', UserSchema, 'users');
    const academic = fixtureModel(
      'PerfAcademic',
      StudentAcademicProfileSchema,
      'academic',
    );
    const rules = fixtureModel('PerfRule', GpaRegistrationRuleSchema, 'rules');
    const grades = fixtureModel('PerfGrade', GradeSchema, 'grades');
    registrations = fixtureModel(
      'PerfRegistration',
      CourseRegistrationSchema,
      'registrations',
    );
    complaints = fixtureModel('PerfComplaint', ComplaintSchema, 'complaints');
    await Promise.all(
      Object.values(connection.models).map((model) => model.init()),
    );
    const registrationService = new RegistrationsService(
      academic,
      rules,
      {} as never,
      registrations,
      courses,
      grades,
      {} as never,
      {} as never,
      {} as never,
      students,
      {} as never,
      {} as never,
    );
    const prefetch =
      registrationService.prepareAdministrativeEnrollment.bind(
        registrationService,
      );
    // Same current HTTP/write path; switch only the old per-student validator reads.
    jest
      .spyOn(registrationService, 'prepareAdministrativeEnrollment')
      .mockImplementation((...args) =>
        legacyValidation
          ? Promise.resolve(undefined as never)
          : prefetch(...args),
      );
    const coursesService = new CoursesService(
      courses,
      {} as never,
      registrations,
      students,
      users,
      new ConfigService(),
      undefined,
      registrationService,
      metrics,
    );
    const complaintsService = new ComplaintsService(
      complaints,
      {} as never,
      users,
      {} as never,
      {} as never,
    );
    const module = await Test.createTestingModule({
      controllers: [CoursesController, ComplaintsController],
      providers: [
        { provide: CoursesService, useValue: coursesService },
        { provide: ComplaintsService, useValue: complaintsService },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(createHttpMetricsMiddleware(metrics));
    // Never installed in the product. Existing AppModule E2E covers real JWT/session checks.
    app.use(
      (
        req: { headers: Record<string, string>; user?: unknown },
        res: { once: (event: string, callback: () => void) => void },
        next: () => void,
      ) => {
        req.user = {
          _id: String(ids[0]),
          role: req.headers['x-test-role'] ?? 'admin',
          permissions: (req.headers['x-test-permissions'] ?? '').split(','),
        };
        const context = getRequestQueryContext()!.request;
        res.once('finish', () =>
          observations.push({
            queries: context.count,
            rowQueries:
              context.stages.get('enrollment.rules')?.databaseOperations ?? 0,
            stages: Object.fromEntries(
              [...context.stages].map(([name, stage]) => [
                name,
                stage.durationSeconds * 1000,
              ]),
            ),
          }),
        );
        next();
      },
    );
    app.useGlobalGuards(
      new RolesGuard(new Reflector()),
      new PermissionsGuard(new Reflector()),
    );
    app.useGlobalFilters(
      new AllExceptionsFilter({
        warn: () => undefined,
        error: () => undefined,
      } as never),
    );
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    const courseBase = {
      name: 'Synthetic course',
      nameAr: 'مقرر تجريبي',
      nameEn: 'Synthetic course',
      level: '2',
      academicLevel: '2',
      semester: 'first',
      department: 'BIS',
      creditHours: 3,
      isActive: true,
    };
    await courses.create([
      {
        ...courseBase,
        _id: targetId,
        code: 'PERF-TARGET',
        prerequisites: ['PERF-HISTORY'],
      },
      { ...courseBase, _id: historyId, code: 'PERF-HISTORY' },
      {
        ...courseBase,
        _id: secondTargetId,
        code: 'PERF-SECOND',
        prerequisites: ['PERF-HISTORY'],
      },
    ]);
    await students.collection.insertMany(
      ids.map((userId, index) => ({
        _id: new Types.ObjectId(),
        userId,
        studentCode: `PERF-${index}`,
        level: '2',
        department: 'BIS',
        isBlocked: false,
      })),
    );
    await academic.collection.insertMany(
      ids.map((studentId) => ({
        _id: new Types.ObjectId(),
        studentId,
        academicLevel: '2',
        semester: 'first',
        gpa: 0,
        completedCourses: [],
        failedCourses: [],
        lowGradeCourses: [],
        academicWarnings: 0,
      })),
    );
    await grades.collection.insertMany(
      ids.map((studentId, index) => ({
        _id: new Types.ObjectId(),
        studentId,
        studentCode: `PERF-${index}`,
        courseId: historyId,
        courseCode: 'PERF-HISTORY',
        courseName: 'History',
        examType: 'final',
        grade: 90,
        maxGrade: 100,
        status: 'present',
        isPublished: true,
        academicYear: '2025-2026',
        semester: 'first',
      })),
    );
    await rules.collection.insertMany([
      {
        _id: new Types.ObjectId(),
        minGpa: 2,
        maxGpa: 4,
        maxCourses: 5,
        maxCreditHours: 15,
        isActive: true,
      },
      {
        _id: new Types.ObjectId(),
        minGpa: 0,
        maxGpa: 4,
        maxCourses: 6,
        maxCreditHours: 18,
        isActive: true,
      },
    ]);
    await complaints.create(
      Array.from({ length: 100 }, (_, index) => ({
        ticketNumber: `PERF-${index}`,
        studentId: ids[0],
        studentCode: 'PERF-0',
        studentName: 'Synthetic student',
        nationalId: 'synthetic',
        title: 'Synthetic complaint',
        description: 'x'.repeat(20000),
        screenshotUrl: `data:image/png;base64,${'x'.repeat(50000)}`,
        replies: [],
        status: index % 2 ? 'open' : 'closed',
        createdAt: new Date(1700000000000 + index),
      })),
    );
    const sessions = fixtureModel('PerfSession', AuthSessionSchema, 'sessions');
    await sessions.init();
    await sessions.create({
      _id: 'a'.repeat(64),
      userId: String(ids[0]),
      tokenVersion: 0,
      expiresAt: new Date(Date.now() + 60000),
    });
    report.lookupPlans = {
      academicProfile: planSummary(
        await academic.collection
          .find({ studentId: ids[0] })
          .limit(1)
          .explain('executionStats'),
      ),
      studentProfile: planSummary(
        await students.collection
          .find({ userId: ids[0] })
          .limit(1)
          .explain('executionStats'),
      ),
      courseCredits: planSummary(
        await courses.collection
          .find({ code: { $in: ['PERF-HISTORY', 'PERF-TARGET'] } })
          .explain('executionStats'),
      ),
      grades: planSummary(
        await grades.collection
          .find({ studentId: ids[0], isPublished: true })
          .explain('executionStats'),
      ),
      gpaRule: planSummary(
        await rules.collection
          .find({ isActive: true, minGpa: { $lte: 3 }, maxGpa: { $gte: 3 } })
          .sort({ minGpa: -1, _id: 1 })
          .limit(1)
          .explain('executionStats'),
      ),
      session: planSummary(
        await connection.db!.collection<AuthSessionRecord>(sessions.collection.name)
          .find({
            _id: 'a'.repeat(64),
            userId: String(ids[0]),
            tokenVersion: 0,
            revokedAt: null,
            expiresAt: { $gt: new Date() },
          })
          .limit(1)
          .explain('executionStats'),
      ),
    };
    report.complaintBsonSizes = await complaints.aggregate([
      {
        $group: {
          _id: null,
          meanBytes: { $avg: { $bsonSize: '$$ROOT' } },
          maxBytes: { $max: { $bsonSize: '$$ROOT' } },
        },
      },
    ]);
  }, 60000);

  afterAll(async () => {
    if (connection) {
      // These uniquely named collections contain only this test's own fixtures.
      await Promise.all(
        Object.values(connection.models).map((model) => model.deleteMany({})),
      );
      await connection.close();
    }
    await app?.close();
    metrics.onModuleDestroy();
    metrics.getRegistry().clear();
    const output = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../../outputs/performance/targeted-local.json',
    );
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  });

  const percentile = (values: number[], fraction: number) =>
    [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];

  it.each([25, 100, 500])(
    'compares legacy/batched validation and exact persisted outcomes for %i students',
    async (size) => {
      const results: Array<Record<string, unknown>> = [];
      for (const legacy of [true, false]) {
        legacyValidation = legacy;
        const durations: number[] = [];
        const queries: number[] = [];
        for (let sample = 0; sample < 4; sample++) {
          await registrations.deleteMany({ studentId: { $in: ids } });
          const start = performance.now();
          const response = await request(app.getHttpServer())
            .post(
              `/api/admin/courses/${String(targetId)}/enroll-students-batch`,
            )
            .send({
              rows: ids
                .slice(0, size)
                .map((_, index) => ({ studentCode: `PERF-${index}` })),
              semester: 'first',
            })
            .expect(201);
          const elapsed = performance.now() - start;
          expect(response.body).toMatchObject({
            enrolledCount: size,
            errorCount: 0,
          });
          if (sample > 0) {
            durations.push(elapsed);
            queries.push(Number(observations.at(-1)!.queries));
            expect(observations.at(-1)!.rowQueries).toBe(legacy ? size * 6 : 0);
          }
          const saved = await registrations.find().lean();
          expect(saved).toHaveLength(size);
          expect(
            saved.every(
              (row) =>
                row.courses.length === 1 &&
                row.courses[0] === 'PERF-TARGET' &&
                row.totalCreditHours === 3,
            ),
          ).toBe(true);
        }
        results.push({
          variant: legacy ? 'legacy validator' : 'batched validator',
          p50HttpMs: percentile(durations, 0.5),
          p95HttpMs: percentile(durations, 0.95),
          databaseCalls: queries,
          callsPerStudent: queries[0] / size,
        });
      }
      expect((results[1].databaseCalls as number[])[0]).toBeLessThan(
        (results[0].databaseCalls as number[])[0] / 5,
      );
      const retry = await request(app.getHttpServer())
        .post(`/api/admin/courses/${String(targetId)}/enroll-students-batch`)
        .send({
          rows: ids
            .slice(0, size)
            .map((_, index) => ({ studentCode: `PERF-${index}` })),
          semester: 'first',
        })
        .expect(201);
      expect(retry.body).toMatchObject({
        enrolledCount: 0,
        alreadyEnrolledCount: size,
        errorCount: 0,
      });
      report[`enrollment${size}`] = results;
      console.info(
        `Local synthetic enrollment ${size}: ${JSON.stringify(results)}`,
      );
    },
    120000,
  );

  it('prevents concurrent additions from exceeding the validated course limit', async () => {
    legacyValidation = false;
    await registrations.deleteMany({ studentId: { $in: ids } });
    await registrations.create({
      studentId: ids[0],
      courses: ['ONE', 'TWO', 'THREE', 'FOUR'],
      totalCreditHours: 12,
      academicYear: '2026-2027',
      semester: 'first',
      source: 'system',
      status: 'approved',
    });
    const write = registrations.bulkWrite.bind(registrations);
    let arrivals = 0;
    let release!: () => void;
    const gate = new Promise<void>((done) => {
      release = done;
    });
    const spy = jest
      .spyOn(registrations, 'bulkWrite')
      .mockImplementation(async (operations, options) => {
        if (++arrivals === 2) release();
        await gate;
        return write(operations, options);
      });
    try {
      const responses = await Promise.all(
        [targetId, secondTargetId].map((id) =>
          request(app.getHttpServer())
            .post(`/api/admin/courses/${String(id)}/enroll-students-batch`)
            .send({ rows: [{ studentCode: 'PERF-0' }], semester: 'first' }),
        ),
      );
      expect(responses.map((response) => response.status).sort()).toEqual([
        201, 409,
      ]);
      const conflict = responses.find((response) => response.status === 409)!;
      expect(conflict.body.partialWrite).toMatchObject({
        appliedCount: 0,
        rejectedCount: 1,
        uncertainCount: 0,
      });
      const saved = await registrations.findOne({ studentId: ids[0] }).lean();
      expect(saved?.courses).toHaveLength(5);
      expect(saved?.totalCreditHours).toBe(15);
    } finally {
      spy.mockRestore();
    }
  });

  it('measures complaint query and serialization separately, retains full detail, filters and permissions', async () => {
    const results = [];
    for (const view of ['full', 'summary']) {
      const rows: Array<{
        httpMs: number;
        bytes: number;
        queryMs: number;
        serializationMs: number;
      }> = [];
      for (let sample = 0; sample < 4; sample++) {
        const start = performance.now();
        const response = await request(app.getHttpServer())
          .get(`/api/admin/complaints?limit=100&view=${view}`)
          .expect(200);
        expect(response.body.total).toBe(100);
        expect(response.body.items).toHaveLength(100);
        if (view === 'summary')
          expect(response.body.items[0]).not.toHaveProperty('description');
        const stages = observations.at(-1)!.stages as Record<string, number>;
        if (sample > 0)
          rows.push({
            httpMs: performance.now() - start,
            bytes: Buffer.byteLength(response.text),
            queryMs: stages['complaints.page'],
            serializationMs: stages['response.serialization'],
          });
      }
      results.push({
        view,
        bytes: rows[0].bytes,
        p50HttpMs: percentile(
          rows.map((row) => row.httpMs),
          0.5,
        ),
        p95HttpMs: percentile(
          rows.map((row) => row.httpMs),
          0.95,
        ),
        p95QueryMs: percentile(
          rows.map((row) => row.queryMs),
          0.95,
        ),
        p95SerializationMs: percentile(
          rows.map((row) => row.serializationMs),
          0.95,
        ),
      });
    }
    expect(results[1].bytes).toBeLessThan(results[0].bytes / 10);
    const filtered = await request(app.getHttpServer())
      .get('/api/admin/complaints?view=summary&status=open&page=2&limit=10')
      .set('x-test-role', 'staff')
      .set('x-test-permissions', 'complaints.read')
      .expect(200);
    expect(filtered.body).toMatchObject({ total: 50, totalPages: 5, page: 2 });
    const id = String(filtered.body.items[0]._id);
    const detail = await request(app.getHttpServer())
      .get(`/api/admin/complaints/${id}`)
      .set('x-test-role', 'staff')
      .set('x-test-permissions', 'complaints.read')
      .expect(200);
    expect(detail.body.description).toHaveLength(20000);
    expect(detail.body.screenshotUrl).toContain('data:image');
    for (const route of [
      '/api/admin/complaints?view=summary',
      `/api/admin/complaints/${id}`,
    ]) {
      await request(app.getHttpServer())
        .get(route)
        .set('x-test-role', 'staff')
        .expect(403);
      await request(app.getHttpServer())
        .get(route)
        .set('x-test-role', 'student')
        .set('x-test-permissions', 'complaints.read')
        .expect(403);
    }
    await request(app.getHttpServer())
      .get('/api/admin/complaints?view=invalid')
      .expect(400);
    const plan = await complaints.collection
      .find({})
      .sort({ createdAt: -1, _id: -1 })
      .limit(100)
      .explain('executionStats');
    report.complaints = results;
    report.complaintPlan = planSummary(plan);
    expect(report.complaintPlan).toMatchObject({
      stages: expect.not.arrayContaining(['SORT']),
      indexes: expect.arrayContaining(['createdAt_-1__id_-1']),
    });
    console.info(`Local synthetic complaints: ${JSON.stringify(results)}`);
  }, 60000);
});
