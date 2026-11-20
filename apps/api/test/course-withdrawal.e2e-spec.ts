import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import mongoose, { Types } from 'mongoose';
import type { Connection } from 'mongoose';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { CoursesController } from '../src/modules/courses/courses.controller';
import { CoursesService } from '../src/modules/courses/courses.service';
import { CourseSchema } from '../src/modules/courses/schemas/course.schema';
import { StudentProfileSchema } from '../src/modules/students/schemas/student-profile.schema';
import { UserSchema } from '../src/modules/users/schemas/user.schema';
import {
  CourseRegistrationSchema,
  type CourseRegistrationDocument,
} from '../src/modules/registrations/schemas/course-registration.schema';
import { MaterialStorageModule } from '../src/modules/material-storage/material-storage.module';
import { RolesGuard } from '../src/modules/auth/guards/roles.guard';
import { PermissionsGuard } from '../src/modules/auth/guards/permissions.guard';

// Real MongoDB writes and HTTP controllers with synthetic local test identities.
describe('course withdrawal from Excel (isolated MongoDB)', () => {
  let connection: Connection;
  let app: INestApplication;
  let registrations: mongoose.Model<CourseRegistrationDocument>;
  const ids = [new Types.ObjectId(), new Types.ObjectId()];
  const targetId = new Types.ObjectId();
  const secondTargetId = new Types.ObjectId();
  const prefix = 'withdrawal_' + randomUUID().replaceAll('-', '');
  beforeAll(async () => {
    const uri = new URL(process.env.MONGODB_URI ?? '');
    if (
      uri.protocol !== 'mongodb:' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(uri.hostname) ||
      !/(?:test|e2e)$/.test(uri.pathname) ||
      uri.username ||
      uri.password ||
      uri.search
    )
      throw new Error('Credential-free localhost test/e2e database required');
    connection = await mongoose
      .createConnection(uri.href, { autoIndex: false, autoCreate: false })
      .asPromise();
    const courses = connection.model(
      'WithdrawalCourse',
      CourseSchema,
      prefix + '_courses',
    );
    const students = connection.model(
      'WithdrawalStudent',
      StudentProfileSchema,
      prefix + '_students',
    );
    const users = connection.model(
      'WithdrawalUser',
      UserSchema,
      prefix + '_users',
    );
    registrations = connection.model(
      'WithdrawalRegistration',
      CourseRegistrationSchema,
      prefix + '_registrations',
    ) as unknown as mongoose.Model<CourseRegistrationDocument>;
    await Promise.all(
      Object.values(connection.models).map((model) => model.createCollection()),
    );
    // Enforce the uniqueness this workflow requires. Query-plan/index coverage
    // for the full schemas remains in targeted-performance.e2e-spec.ts.
    await registrations.collection.createIndex(
      { studentId: 1, academicYear: 1, semester: 1 },
      { unique: true },
    );
    await courses.collection.insertMany([
      {
        _id: targetId,
        code: 'PERF-TARGET',
        name: 'Synthetic course',
        creditHours: 3,
      },
      {
        _id: secondTargetId,
        code: 'PERF-SECOND',
        name: 'Synthetic second course',
        creditHours: 3,
      },
    ]);
    await students.collection.insertMany(
      ids.map((userId, index) => ({ userId, studentCode: `PERF-${index}` })),
    );
    const service = new CoursesService(
      courses as never,
      {} as never,
      registrations,
      students as never,
      users as never,
      new ConfigService(),
    );
    const module = await Test.createTestingModule({
      imports: [MaterialStorageModule],
      controllers: [CoursesController],
      providers: [{ provide: CoursesService, useValue: service }],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(
      (
        req: { headers: Record<string, string>; user?: unknown },
        _res: unknown,
        next: () => void,
      ) => {
        req.user = {
          _id: String(ids[0]),
          role: req.headers['x-test-role'] ?? 'admin',
          permissions: [],
        };
        next();
      },
    );
    app.useGlobalGuards(
      new RolesGuard(new Reflector()),
      new PermissionsGuard(new Reflector()),
    );
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  }, 60000);
  afterAll(async () => {
    await app?.close();
    if (connection) {
      for (const model of Object.values(connection.models))
        await model.collection.drop();
      await connection.close();
    }
  });

  it('withdraws an Excel roster only from the selected course and term; retries and concurrent requests preserve credits', async () => {
    await registrations.deleteMany({ studentId: { $in: ids.slice(0, 2) } });
    const base = {
      studentId: ids[0],
      academicYear: '2026-2027',
      semester: 'first',
      courses: ['perf-target', 'PERF-SECOND'],
      totalCreditHours: 6,
      source: 'system',
      status: 'approved',
    };
    await registrations.create([
      base,
      { ...base, semester: 'second' },
      { ...base, academicYear: '2025-2026' },
      { ...base, studentId: ids[1] },
    ]);
    const url = `/api/admin/courses/${String(targetId)}/withdraw-students-excel`;
    const sheet = Buffer.from('student_code\nPERF-0\nPERF-0\nDOES-NOT-EXIST');
    const upload = () =>
      request(app.getHttpServer())
        .post(url)
        .query({ academicYear: '2026-2027', semester: 'first' })
        .attach('file', sheet, 'students.csv');
    await request(app.getHttpServer())
      .post(url)
      .set('x-test-role', 'staff')
      .query({ academicYear: '2026-2027', semester: 'first' })
      .attach('file', sheet, 'students.csv')
      .expect(403);
    await request(app.getHttpServer())
      .post(url)
      .attach('file', sheet, 'students.csv')
      .expect(400);
    await request(app.getHttpServer())
      .post(url)
      .query({ academicYear: 'all', semester: 'first' })
      .attach('file', sheet, 'students.csv')
      .expect(400);
    const responses = await Promise.all([upload(), upload()]);
    expect(responses.map((item) => item.status)).toEqual([201, 201]);
    expect(responses.map((item) => item.body.withdrawnCount).sort()).toEqual([
      0, 1,
    ]);
    for (const response of responses) {
      expect(response.body).toMatchObject({
        totalRows: 3,
        duplicateCount: 1,
        errorCount: 1,
      });
    }
    const saved = await registrations
      .findOne({
        studentId: ids[0],
        academicYear: '2026-2027',
        semester: 'first',
      })
      .lean();
    expect(saved).toMatchObject({
      courses: ['PERF-SECOND'],
      totalCreditHours: 3,
      status: 'approved',
    });
    const audited = await registrations
      .findById(saved!._id)
      .select('+administrativeChanges')
      .lean();
    expect(audited?.administrativeChanges).toHaveLength(1);
    expect(audited?.administrativeChanges?.[0]).toMatchObject({
      action: 'withdraw',
      courseCode: 'PERF-TARGET',
      actorId: ids[0],
    });
    const unchanged = await registrations
      .find({
        $or: [
          { studentId: ids[1] },
          { studentId: ids[0], semester: 'second' },
          { studentId: ids[0], academicYear: '2025-2026' },
        ],
      })
      .lean();
    expect(unchanged).toHaveLength(3);
    expect(
      unchanged.every(
        (item) => item.courses.length === 2 && item.totalCreditHours === 6,
      ),
    ).toBe(true);
    expect((await upload()).body).toMatchObject({
      withdrawnCount: 0,
      notEnrolledCount: 1,
    });
    const lastCourse = await request(app.getHttpServer())
      .post(
        `/api/admin/courses/${String(secondTargetId)}/withdraw-students-excel`,
      )
      .query({ academicYear: '2026-2027', semester: 'first' })
      .attach('file', Buffer.from('student_code\nPERF-0'), 'students.csv')
      .expect(201);
    expect(lastCourse.body.withdrawnCount).toBe(1);
    expect(await registrations.findById(saved!._id).lean()).toMatchObject({
      courses: [],
      totalCreditHours: 0,
    });
  });
});
