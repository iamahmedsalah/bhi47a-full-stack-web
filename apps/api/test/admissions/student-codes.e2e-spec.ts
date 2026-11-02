import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type ClientSession, type Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { PERMISSIONS, formatStudentCode } from '@student-portal/shared';
import { AppModule } from '../../src/app.module';
import { StudentCodeStore } from '../../src/modules/student-codes/student-code-store.service';
import { StudentCodesService } from '../../src/modules/student-codes/student-codes.service';
import { StudentCodeAllocator } from '../../src/modules/student-codes/student-code-allocator.service';
import {
  User,
  type UserDocument,
} from '../../src/modules/users/schemas/user.schema';

describe('Student-code registry on the isolated replica set', () => {
  let app: INestApplication;
  let store: StudentCodeStore;
  let service: StudentCodesService;
  let allocator: StudentCodeAllocator;
  let users: Model<UserDocument>;
  const ownedIds: Types.ObjectId[] = [];
  const ownedYears: string[] = [];
  const rawGrades: Types.ObjectId[] = [];
  const password = 'SyntheticAdmissionTests123!';
  const actor = new Types.ObjectId();
  let passwordHash: string;
  let nextPrefix = 61;

  beforeAll(async () => {
    if (
      !/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/student-codes-(test|e2e)\?replicaSet=admissions-test$/.test(
        process.env.MONGODB_URI ?? '',
      )
    )
      throw new Error('Isolated replica-set test database required.');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    store = module.get(StudentCodeStore);
    service = module.get(StudentCodesService);
    allocator = module.get(StudentCodeAllocator);
    users = module.get(getModelToken(User.name));
    await users.createIndexes();
    await store.profiles.createIndexes();
    await store.periods.createIndexes();
    await store.prepareWrites();
    passwordHash = await bcrypt.hash(password, 4);
    expect(
      (await store.connection.db!.admin().command({ hello: 1 })).setName,
    ).toBe('admissions-test');
  }, 120000);

  afterAll(async () => {
    if (store) {
      await store.entries.deleteMany({ academicYear: { $in: ownedYears } });
      await store.years.deleteMany({ academicYear: { $in: ownedYears } });
      await store.audits.deleteMany({ academicYear: { $in: ownedYears } });
      await store.periods.deleteMany({ academicYear: { $in: ownedYears } });
      await store.profiles.deleteMany({ userId: { $in: ownedIds } });
      await users.deleteMany({ _id: { $in: ownedIds } });
      await store.connection
        .collection('auth_sessions')
        .deleteMany({ userId: { $in: ownedIds } });
      await store.connection
        .collection('grades')
        .deleteMany({ _id: { $in: rawGrades } });
    }
    await app?.close();
  }, 30000);

  async function year() {
    const yearPrefix = String(nextPrefix++);
    const academicYear = `20${Number(yearPrefix) - 1}-20${yearPrefix}`;
    ownedYears.push(academicYear);
    await store.periods.create({
      code: `SYNTH-${yearPrefix}`,
      academicYear,
      name: 'Synthetic intake',
      opensAt: new Date('2026-01-01Z'),
      closesAt: new Date('2026-12-01Z'),
      isEnabled: false,
    });
    return { academicYear, yearPrefix };
  }
  async function student(
    studentCode: string,
    academicYear: string,
    session?: ClientSession,
    active = true,
  ) {
    const id = new Types.ObjectId();
    ownedIds.push(id);
    await users.create(
      [
        {
          _id: id,
          role: 'student',
          name: 'Synthetic registry owner',
          studentCode,
          passwordHash,
          mustChangePassword: true,
          isActive: active,
        },
      ],
      { ...(session ? { session } : {}) },
    );
    await store.profiles.create(
      [
        {
          userId: id,
          studentCode,
          fullName: 'Synthetic registry owner',
          level: '1',
          semester: '1',
          academicYear,
          enrollmentStatus: active ? 'active' : 'inactive',
        },
      ],
      { ...(session ? { session } : {}) },
    );
    return String(id);
  }
  const preview = (input: { academicYear: string; yearPrefix: string }) =>
    service.audit({ ...input, page: 1, limit: 100 });
  const initialize = async (input: {
    academicYear: string;
    yearPrefix: string;
  }) =>
    service.initialize(
      {
        ...input,
        fingerprint: (await preview(input)).fingerprint,
        confirmed: true,
        reason: 'Synthetic reviewed identity inventory.',
      },
      String(actor),
    );
  const allocate = (
    input: { academicYear: string },
    requestId = String(new Types.ObjectId()),
  ) =>
    allocator.allocate(
      input.academicYear,
      requestId,
      String(actor),
      async (code, session) => ({
        studentId: await student(code, input.academicYear, session),
      }),
    );
  const recover = async (
    input: { academicYear: string; yearPrefix: string },
    sequence: number,
  ) =>
    service.recover(
      formatStudentCode(input.yearPrefix, sequence),
      {
        ...input,
        fingerprint: (await preview(input)).fingerprint,
        confirmed: true,
        neverAssignedConfirmed: true,
        reason: 'Synthetic external records verified: never assigned.',
      },
      String(actor),
    );

  it('previews without writes, backfills inactive holders and leaves numeric gaps unverified', async () => {
    const input = await year();
    const id = await student(
      formatStudentCode(input.yearPrefix, 3),
      input.academicYear,
      undefined,
      false,
    );
    expect(store.entries.schema.path('currentStudentId').instance).toBe(
      'ObjectId',
    );
    const scanned = await preview(input);
    expect(scanned.summary).toMatchObject({
      ASSIGNED: 1,
      MISSING: 2,
      AVAILABLE: 0,
    });
    expect(scanned.canInitialize).toBe(true);
    expect(
      await store.entries.countDocuments({ academicYear: input.academicYear }),
    ).toBe(0);
    await initialize(input);
    await initialize(input);
    expect(
      await store.entries.countDocuments({ academicYear: input.academicYear }),
    ).toBe(1);
    expect(
      (await store.years.findOne({ academicYear: input.academicYear }).lean())!
        .nextSequence,
    ).toBe(4);
    expect(
      (await store.entries.findOne({ currentStudentId: id }).lean())!
        .assignmentHistory[0],
    ).toMatchObject({ source: 'legacy' });
    expect((await users.findById(id).lean())!.isActive).toBe(false);
  });
  it('allocates 50 distinct codes with matching accounts, profiles and audit events concurrently', async () => {
    const input = await year();
    await initialize(input);
    const results = await Promise.all(
      Array.from({ length: 50 }, () => allocate(input)),
    );
    expect(new Set(results.map((result) => result.studentCode)).size).toBe(50);
    expect(
      await store.entries.countDocuments({
        academicYear: input.academicYear,
        status: 'ASSIGNED',
      }),
    ).toBe(50);
    expect(
      await store.profiles.countDocuments({ academicYear: input.academicYear }),
    ).toBe(50);
    expect(
      await store.audits.countDocuments({
        academicYear: input.academicYear,
        action: 'ASSIGNED',
      }),
    ).toBe(50);
    expect(
      (await store.years.findOne({ academicYear: input.academicYear }).lean())!
        .nextSequence,
    ).toBe(51);
  });
  it('makes ten concurrent calls for the same request idempotent', async () => {
    const input = await year();
    await initialize(input);
    const requestId = String(new Types.ObjectId());
    const results = await Promise.all(
      Array.from({ length: 10 }, () => allocate(input, requestId)),
    );
    expect(new Set(results.map((result) => result.studentId)).size).toBe(1);
    expect(
      await store.profiles.countDocuments({ academicYear: input.academicYear }),
    ).toBe(1);
    expect(
      (await store.years.findOne({ academicYear: input.academicYear }).lean())!
        .nextSequence,
    ).toBe(2);
  });
  it('rolls back account/profile/registry/counter/audit writes when the caller fails', async () => {
    const input = await year();
    await initialize(input);
    await expect(
      allocator.allocate(
        input.academicYear,
        String(new Types.ObjectId()),
        String(actor),
        async (code, session) => {
          await student(code, input.academicYear, session);
          throw new Error('Synthetic failure before request finalization');
        },
      ),
    ).rejects.toThrow('Synthetic failure');
    expect(
      await users.countDocuments({
        studentCode: new RegExp(`^${input.yearPrefix}`),
      }),
    ).toBe(0);
    expect(
      await store.profiles.countDocuments({ academicYear: input.academicYear }),
    ).toBe(0);
    expect(
      await store.entries.countDocuments({ academicYear: input.academicYear }),
    ).toBe(0);
    expect(
      await store.audits.countDocuments({
        academicYear: input.academicYear,
        action: 'ASSIGNED',
      }),
    ).toBe(0);
    expect(
      (await store.years.findOne({ academicYear: input.academicYear }).lean())!
        .nextSequence,
    ).toBe(1);
  });
  it('checks approval prerequisites before reserving a code or creating a student', async () => {
    const input = await year();
    await initialize(input);
    const writer = jest.fn();
    await expect(
      allocator.allocate(
        input.academicYear,
        String(new Types.ObjectId()),
        String(actor),
        writer,
        () => Promise.reject(new Error('Synthetic group is full')),
      ),
    ).rejects.toThrow('Synthetic group is full');
    expect(writer).not.toHaveBeenCalled();
    expect(
      await store.entries.countDocuments({ academicYear: input.academicYear }),
    ).toBe(0);
    expect(
      (await store.years.findOne({ academicYear: input.academicYear }).lean())!
        .nextSequence,
    ).toBe(1);
  });

  it('rejects a callback that does not create both parts of the student identity', async () => {
    const input = await year();
    await initialize(input);
    await expect(
      allocator.allocate(
        input.academicYear,
        String(new Types.ObjectId()),
        String(actor),
        () => Promise.resolve({ studentId: String(new Types.ObjectId()) }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await store.entries.countDocuments({ academicYear: input.academicYear }),
    ).toBe(0);
  });
  it('consumes the lowest explicitly recovered never-held gaps before advancing the counter', async () => {
    const input = await year();
    await student(formatStudentCode(input.yearPrefix, 3), input.academicYear);
    await initialize(input);
    await recover(input, 2);
    await recover(input, 1);
    expect((await allocate(input)).studentCode).toBe(
      formatStudentCode(input.yearPrefix, 1),
    );
    expect((await allocate(input)).studentCode).toBe(
      formatStudentCode(input.yearPrefix, 2),
    );
    expect(
      (await store.years.findOne({ academicYear: input.academicYear }).lean())!
        .nextSequence,
    ).toBe(4);
  });
  it('quarantines historical code references instead of assigning them to a new holder', async () => {
    const input = await year();
    const code = formatStudentCode(input.yearPrefix, 1);
    const id = new Types.ObjectId();
    rawGrades.push(id);
    await store.connection.collection('grades').insertOne({
      _id: id,
      studentCode: code,
      studentId: new Types.ObjectId(),
      score: 5,
    });
    await initialize(input);
    expect((await allocate(input)).studentCode).toBe(
      formatStudentCode(input.yearPrefix, 2),
    );
    expect(
      (await store.entries.findOne({ studentCode: code }).lean())!.status,
    ).toBe('REQUIRES_REVIEW');
    expect(
      (await store.connection.collection('grades').findOne({ _id: id }))!.score,
    ).toBe(5);
  });
  it('never reuses released, reserved or previously held entries', async () => {
    const input = await year();
    await initialize(input);
    await store.entries.create({
      academicYear: input.academicYear,
      yearPrefix: input.yearPrefix,
      studentCode: formatStudentCode(input.yearPrefix, 1),
      sequence: 1,
      status: 'RELEASED',
      assignmentHistory: [
        {
          studentId: new Types.ObjectId(),
          source: 'legacy',
          observedAt: new Date(),
        },
      ],
    });
    await store.entries.create({
      academicYear: input.academicYear,
      yearPrefix: input.yearPrefix,
      studentCode: formatStudentCode(input.yearPrefix, 2),
      sequence: 2,
      status: 'RESERVED',
    });
    await store.entries.create({
      academicYear: input.academicYear,
      yearPrefix: input.yearPrefix,
      studentCode: formatStudentCode(input.yearPrefix, 3),
      sequence: 3,
      status: 'AVAILABLE',
      assignmentHistory: [
        {
          studentId: new Types.ObjectId(),
          source: 'legacy',
          observedAt: new Date(),
        },
      ],
    });
    expect((await allocate(input)).studentCode).toBe(
      formatStudentCode(input.yearPrefix, 4),
    );
    expect(
      (await store.entries
        .findOne({ studentCode: formatStudentCode(input.yearPrefix, 1) })
        .lean())!.assignmentHistory,
    ).toHaveLength(1);
  });
  it('rejects exhaustion without widening the six-digit code and can use a verified lower gap', async () => {
    const input = await year();
    await student(
      formatStudentCode(input.yearPrefix, 9999),
      input.academicYear,
    );
    await initialize(input);
    await expect(allocate(input)).rejects.toMatchObject({
      response: { code: 'CODE_SEQUENCE_EXHAUSTED' },
    });
    await recover(input, 9998);
    expect((await allocate(input)).studentCode).toBe(
      formatStudentCode(input.yearPrefix, 9998),
    );
    expect(
      (await store.years.findOne({ academicYear: input.academicYear }).lean())!
        .nextSequence,
    ).toBe(10000);
  });
  it('rejects stale previews, malformed legacy codes, alias conflicts and orphaned profiles', async () => {
    const input = await year();
    const stale = await preview(input);
    await student(formatStudentCode(input.yearPrefix, 1), input.academicYear);
    await expect(
      service.initialize(
        {
          ...input,
          fingerprint: stale.fingerprint,
          reason: 'Synthetic reviewed stale preview.',
          confirmed: true,
        },
        String(actor),
      ),
    ).rejects.toMatchObject({ response: { code: 'CODE_PREVIEW_CHANGED' } });
    const bad = await year();
    await student(`${bad.yearPrefix}12345`, bad.academicYear);
    expect((await preview(bad)).summary.REQUIRES_REVIEW).toBe(1);
    await expect(initialize(bad)).rejects.toMatchObject({ status: 409 });
    const orphan = await year();
    const orphanId = new Types.ObjectId();
    ownedIds.push(orphanId);
    await store.profiles.create({
      userId: orphanId,
      studentCode: formatStudentCode(orphan.yearPrefix, 1),
      fullName: 'Synthetic orphan',
      level: '1',
      semester: '1',
      academicYear: orphan.academicYear,
    });
    expect((await preview(orphan)).items[0].reason).toBe('ORPHANED_PROFILE');
    const alias = await year();
    const aliasId = new Types.ObjectId();
    ownedIds.push(aliasId);
    await users.create({
      _id: aliasId,
      role: 'staff',
      name: 'Synthetic alias',
      username: formatStudentCode(alias.yearPrefix, 1),
      passwordHash,
    });
    expect((await preview(alias)).items[0].reason).toBe('ALIAS_CONFLICT');
  });
  it('protects every HTTP endpoint with current permissions, admin role, CSRF and strict confirmation', async () => {
    const base = '/api/admin/student-codes';
    const input = await year();
    const sessions = new Map<
      string,
      { cookie: string; csrf: string; id: Types.ObjectId }
    >();
    for (const role of ['admin', 'staff', 'student'] as const) {
      const id = new Types.ObjectId();
      ownedIds.push(id);
      const email = `${String(id)}@example.test`;
      await users.create({
        _id: id,
        role,
        name: 'Synthetic admission actor',
        email,
        ...(role === 'student'
          ? { studentCode: `98${String(id).slice(-4).replace(/[a-f]/g, '1')}` }
          : {}),
        passwordHash,
        mustChangePassword: false,
      });
      const signed = await request(app.getHttpServer())
        .post(`/api/auth/${role === 'student' ? 'student' : 'admin'}/login`)
        .set('Origin', 'http://localhost:3000')
        .send(
          role === 'student'
            ? {
                studentCode: (await users.findById(id).lean())!.studentCode,
                password,
              }
            : { email, password },
        )
        .expect(200);
      sessions.set(role, {
        cookie: (signed.headers['set-cookie'] as unknown as string[])
          .map((value) => value.split(';')[0])
          .join('; '),
        csrf: signed.body.csrfToken as string,
        id,
      });
    }
    const get = (role?: string) => {
      const req = request(app.getHttpServer())
        .get(`${base}/audit`)
        .query(input);
      return role ? req.set('Cookie', sessions.get(role)!.cookie) : req;
    };
    const post = (path: string, body: object, role = 'admin', csrf = true) =>
      request(app.getHttpServer())
        .post(`${base}/${path}`)
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', sessions.get(role)!.cookie)
        .set('x-csrf-token', csrf ? sessions.get(role)!.csrf : 'invalid')
        .send(body);
    await get().expect(401);
    await get('student').expect(403);
    await get('staff').expect(403);
    await users.updateOne(
      { _id: sessions.get('staff')!.id },
      { $set: { permissions: [PERMISSIONS.STUDENT_CODES_READ] } },
    );
    await get('staff').expect(200);
    const payload = {
      ...input,
      fingerprint: (await preview(input)).fingerprint,
      reason: 'Synthetic reviewed configuration.',
      confirmed: true,
    };
    await post('years/initialize', payload, 'staff').expect(403);
    await post('years/initialize', payload, 'admin', false).expect(403);
    await post('years/initialize', { ...payload, confirmed: 'true' }).expect(
      400,
    );
    await post('years/initialize', {
      ...payload,
      studentCode: '269034',
    }).expect(400);
    await post('years/initialize', payload).expect(201);
    const code = formatStudentCode(input.yearPrefix, 1);
    await post(`${code}/hold`, payload, 'staff').expect(403);
    await post(`${code}/hold`, payload, 'admin', false).expect(403);
    await request(app.getHttpServer())
      .get(`${base}/${code}/history`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`${base}/${code}/history`)
      .set('Cookie', sessions.get('student')!.cookie)
      .expect(403);
    await request(app.getHttpServer())
      .get(`${base}/${code}/history`)
      .set('Cookie', sessions.get('staff')!.cookie)
      .expect(200);
    await post(
      `${code}/recover`,
      { ...payload, neverAssignedConfirmed: true },
      'staff',
    ).expect(403);
    await post(`${code}/recover`, {
      ...payload,
      neverAssignedConfirmed: 'true',
    }).expect(400);
    await post(
      `${code}/recover`,
      { ...payload, neverAssignedConfirmed: true },
      'admin',
      false,
    ).expect(403);
    await users.updateOne(
      { _id: sessions.get('staff')!.id },
      { $set: { permissions: [] } },
    );
    await get('staff').expect(403);
    await request(app.getHttpServer())
      .post(`${base}/allocate`)
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', sessions.get('admin')!.cookie)
      .set('x-csrf-token', sessions.get('admin')!.csrf)
      .send({})
      .expect(404);
  });
  it('allows only one concurrent recovery and refuses historical references or previous holders', async () => {
    const input = await year();
    await student(formatStudentCode(input.yearPrefix, 4), input.academicYear);
    await initialize(input);
    const body = {
      ...input,
      fingerprint: (await preview(input)).fingerprint,
      reason: 'Synthetic human verified gap.',
      confirmed: true as const,
      neverAssignedConfirmed: true as const,
    };
    const code = formatStudentCode(input.yearPrefix, 1);
    const results = await Promise.allSettled([
      service.recover(code, body, String(actor)),
      service.recover(code, body, String(actor)),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      await store.audits.countDocuments({
        studentCode: code,
        action: 'RECOVERED',
      }),
    ).toBe(1);
    const blocked = formatStudentCode(input.yearPrefix, 2);
    const gradeId = new Types.ObjectId();
    rawGrades.push(gradeId);
    await store.connection
      .collection('grades')
      .insertOne({ _id: gradeId, studentCode: blocked });
    await expect(recover(input, 2)).rejects.toMatchObject({
      response: { code: 'CODE_RECOVERY_UNSAFE' },
    });
    await expect(recover(input, 4)).rejects.toMatchObject({
      response: { code: 'CODE_RECOVERY_UNSAFE' },
    });
  });
  it('resolves a deleted owner into a historical hold without making the code reusable', async () => {
    const input = await year();
    await initialize(input);
    const assigned = await allocate(input);
    const old = await preview(input);
    await expect(
      service.holdPreviousOwner(
        assigned.studentCode,
        {
          ...input,
          fingerprint: old.fingerprint,
          reason: 'Synthetic reviewed owner hold',
          confirmed: true,
        },
        String(actor),
      ),
    ).rejects.toThrow();
    await store.profiles.deleteMany({
      userId: new Types.ObjectId(assigned.studentId),
    });
    await users.deleteOne({ _id: assigned.studentId });
    const current = await preview(input);
    expect(
      current.items.find((row) => row.studentCode === assigned.studentCode)!
        .reason,
    ).toBe('PREVIOUS_OWNER_MISSING');
    await expect(
      service.holdPreviousOwner(
        assigned.studentCode,
        {
          ...input,
          fingerprint: old.fingerprint,
          reason: 'Synthetic reviewed owner hold',
          confirmed: true,
        },
        String(actor),
      ),
    ).rejects.toMatchObject({ response: { code: 'CODE_PREVIEW_CHANGED' } });
    await service.holdPreviousOwner(
      assigned.studentCode,
      {
        ...input,
        fingerprint: current.fingerprint,
        reason: 'Synthetic reviewed owner hold',
        confirmed: true,
      },
      String(actor),
    );
    const entry = await store.entries
      .findOne({ studentCode: assigned.studentCode })
      .lean();
    expect(entry!.status).toBe('RELEASED');
    expect(entry!.assignmentHistory).toHaveLength(1);
    expect(entry!.currentStudentId).toBeUndefined();
    expect((await allocate(input)).studentCode).not.toBe(assigned.studentCode);
    await expect(recover(input, 1)).rejects.toThrow();
    expect(
      await store.audits.countDocuments({
        studentCode: assigned.studentCode,
        action: 'PREVIOUS_OWNER_HELD',
      }),
    ).toBe(1);
  });
});
