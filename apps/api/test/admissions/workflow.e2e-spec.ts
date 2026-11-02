import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as ExcelJS from 'exceljs';
import { PERMISSIONS } from '@student-portal/shared';
import { AppModule } from '../../src/app.module';
import { PasswordHasher } from '../../src/security/password-hasher';
import {
  AdmissionSecurity,
  admissionHash,
} from '../../src/modules/admissions/admission-security.service';
import { AdmissionWorkflowService } from '../../src/modules/admissions/admission-workflow.service';
import { AdmissionSpreadsheets } from '../../src/modules/admissions/admission-spreadsheets.service';
import { StudentCodesService } from '../../src/modules/student-codes/student-codes.service';
import { StudentCodeMappingsService } from '../../src/modules/student-codes/student-code-mappings.service';
import { StudentCodeAllocator } from '../../src/modules/student-codes/student-code-allocator.service';
import { AdmissionPeriodsService } from '../../src/modules/admissions/admission-periods.service';
import { StudentsService } from '../../src/modules/students/students.service';
import type { AuthenticatedUser } from '../../src/modules/auth/types/authenticated-request';

describe('Complete admission workflow on the isolated replica set', () => {
  let app: INestApplication,
    workflow: AdmissionWorkflowService,
    security: AdmissionSecurity,
    sheets: AdmissionSpreadsheets,
    codes: StudentCodesService,
    mappings: StudentCodeMappingsService,
    allocator: StudentCodeAllocator,
    periods: AdmissionPeriodsService;
  let students: StudentsService;
  const extraYears = ['2093-2094', '2095-2096', '2096-2097'];
  const academicYear = '2087-2088',
    yearPrefix = '88',
    actorId = new Types.ObjectId();
  const actor: AuthenticatedUser = {
    _id: String(actorId),
    role: 'admin',
    name: 'Synthetic admissions reviewer',
    permissions: [],
    mustChangePassword: false,
    tokenVersion: 0,
  };
  let periodId: string,
    accessId: string,
    hash: string,
    serial = 0;
  const identities: string[] = [],
    actors: Types.ObjectId[] = [actorId];
  beforeAll(async () => {
    if (
      !/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/student-codes-(test|e2e)\?replicaSet=admissions-test$/.test(
        process.env.MONGODB_URI ?? '',
      )
    )
      throw new Error('Isolated replica set required.');
    hash = await bcrypt.hash('SyntheticAdmissions123!', 4);
    // Real persistence/transactions; low-cost fixture hashing isolates concurrency from bcrypt load.
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PasswordHasher)
      .useValue({
        hash: () => Promise.resolve(hash),
        verify: (plain: string, encoded: string) =>
          bcrypt.compare(plain, encoded),
      })
      .compile();
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
    workflow = module.get(AdmissionWorkflowService);
    security = module.get(AdmissionSecurity);
    sheets = module.get(AdmissionSpreadsheets);
    codes = module.get(StudentCodesService);
    mappings = module.get(StudentCodeMappingsService);
    allocator = module.get(StudentCodeAllocator);
    periods = module.get(AdmissionPeriodsService);
    students = module.get(StudentsService);
    await workflow.store.users.createIndexes();
    await workflow.store.profiles.createIndexes();
    await workflow.store.prepareWrites();
    await workflow.prepare();
    await workflow.academics.createCollection();
    await workflow.store.users.create({
      _id: actorId,
      role: 'admin',
      name: actor.name,
      email: 'admissions-test@example.test',
      passwordHash: hash,
      mustChangePassword: false,
    });
    const period = await workflow.store.periods.create({
      code: 'SYNTH-WORKFLOW-88',
      academicYear,
      name: 'Synthetic admission workflow',
      opensAt: new Date(Date.now() - 60_000),
      closesAt: new Date(Date.now() + 86400_000),
      isEnabled: true,
    });
    periodId = String(period._id);
    const preview = await codes.audit({
      academicYear,
      yearPrefix,
      page: 1,
      limit: 20,
    });
    await codes.initialize(
      {
        academicYear,
        yearPrefix,
        fingerprint: preview.fingerprint,
        reason: 'Synthetic reviewed intake mapping',
        confirmed: true,
      },
      actor._id,
    );
    const invitation = await workflow.createAccess(
      {
        admissionPeriodId: periodId,
        label: 'Synthetic invitation',
        method: 'BOTH',
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        maxRegistrations: 1000,
      },
      actor,
    );
    accessId = String(invitation._id);
  }, 180000);
  afterAll(async () => {
    if (workflow) {
      const requests = await workflow.requests
        .find({ academicYear })
        .select('studentId')
        .lean();
      const ids = requests.flatMap((item) =>
        item.studentId ? [item.studentId] : [],
      );
      await workflow.academics.deleteMany({ studentId: { $in: ids } });
      await workflow.store.profiles.deleteMany({
        academicYear: { $in: [academicYear, ...extraYears] },
      });
      await workflow.store.users.deleteMany({
        _id: { $in: [...ids, ...actors] },
      });
      await workflow.store.connection
        .collection('auth_sessions')
        .deleteMany({ userId: { $in: [...ids, ...actors] } });
      await workflow.requests.deleteMany({
        academicYear: { $in: [academicYear, ...extraYears] },
      });
      await workflow.access.deleteMany({
        academicYear: { $in: [academicYear, ...extraYears] },
      });
      await workflow.groups.deleteMany({ academicYear });
      await workflow.batches.deleteMany({ uploadedBy: actorId });
      await workflow.store.entries.deleteMany({
        academicYear: { $in: [academicYear, ...extraYears] },
      });
      await workflow.store.audits.deleteMany({
        academicYear: { $in: [academicYear, ...extraYears] },
      });
      await workflow.store.years.deleteMany({
        academicYear: { $in: [academicYear, ...extraYears] },
      });
      await workflow.store.periods.deleteMany({
        academicYear: { $in: [academicYear, ...extraYears] },
      });
    }
    await app?.close();
  }, 30000);
  const identity = () => {
    const value = `300010101${String(++serial).padStart(5, '0')}`;
    identities.push(value);
    return value;
  };
  const applicant = () => ({
    fullName: 'Synthetic applicant',
    fullNameAr: 'متقدم تجريبي',
    address: 'Synthetic address only',
    phone: '01012345678',
    guardians: [
      {
        name: 'Synthetic guardian',
        phone: '01112345678',
        relationship: 'Parent',
      },
    ],
    studentType: 'NEW' as const,
  });
  const approval = (groupId?: string) => ({
    revision: 0,
    level: '1' as const,
    semester: '1' as const,
    department: 'GENERAL',
    groupId,
    passedCourses: [],
    confirmed: true as const,
  });
  async function pending() {
    const nationalId = identity();
    return workflow.requests.create({
      ...applicant(),
      admissionPeriodId: periodId,
      admissionAccessId: accessId,
      academicYear,
      publicReference: `ADM-${new Types.ObjectId().toHexString().toUpperCase()}`,
      statusSecretHash: admissionHash('synthetic'),
      nationalIdEncrypted: security.encrypt(nationalId),
      nationalIdLookup: security.hmac('national-id', nationalId),
      nationalIdMasked: '300********001',
      submittedAt: new Date(),
    });
  }
  it('submits no student/code, safely retries, encrypts identity and keeps duplicate receipts private', async () => {
    const invitation = await workflow.createAccess(
      {
        admissionPeriodId: periodId,
        label: 'Submission fixture',
        method: 'BOTH',
        pin: '123456789',
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        maxRegistrations: 10,
      },
      actor,
    );
    const session = await workflow.validateAccess({
      accessId: String(invitation._id),
      pin: invitation.pin,
    });
    const dto = {
      ...applicant(),
      nationalId: identity(),
      admissionSession: session.admissionSession,
      submissionKey: 'a'.repeat(32),
      captchaToken: '',
    };
    const before = await workflow.store.users.countDocuments({
      role: 'student',
    });
    const receipt = await workflow.submit(dto);
    expect(await workflow.submit(dto)).toEqual(receipt);
    expect(await workflow.store.users.countDocuments({ role: 'student' })).toBe(
      before,
    );
    const saved = await workflow.requests
      .findOne({ publicReference: receipt.publicReference })
      .select('+nationalIdEncrypted')
      .lean();
    expect(saved!.studentCode).toBeUndefined();
    expect(saved!.nationalIdEncrypted).not.toContain(dto.nationalId);
    expect(saved!.nationalIdEncrypted.startsWith('v1.')).toBe(true);
    expect(await workflow.publicStatus(receipt)).toEqual(
      expect.objectContaining({ status: 'PENDING' }),
    );
    await expect(
      workflow.publicStatus({ ...receipt, secret: 'x'.repeat(43) }),
    ).rejects.toThrow();
    const duplicate = await workflow.submit({
      ...dto,
      submissionKey: 'b'.repeat(32),
    });
    expect(duplicate).not.toEqual(receipt);
    const second = await workflow.requests
      .findOne({ publicReference: duplicate.publicReference })
      .lean();
    expect(second!.duplicateReviewRequired).toBe(true);
    await expect(
      workflow.approve(String(second!._id), approval(), actor),
    ).rejects.toMatchObject({
      response: { code: 'ADMISSION_DUPLICATE_REVIEW' },
    });
    expect(JSON.stringify(await workflow.publicStatus(duplicate))).not.toMatch(
      /nationalId|guardian|duplicate|fullName/,
    );
  });
  it('allows exactly one concurrent use, revokes open sessions and rejects expired invitations', async () => {
    const invite = await workflow.createAccess(
      {
        admissionPeriodId: periodId,
        label: 'One-use fixture',
        method: 'QR',
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        maxRegistrations: 1,
      },
      actor,
    );
    const validated = await workflow.validateAccess({ token: invite.token });
    const results = await Promise.allSettled(
      ['c', 'd'].map((letter) =>
        workflow.submit({
          ...applicant(),
          nationalId: identity(),
          admissionSession: validated.admissionSession,
          submissionKey: letter.repeat(32),
          captchaToken: '',
        }),
      ),
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const another = await workflow.createAccess(
      {
        admissionPeriodId: periodId,
        label: 'Revocation fixture',
        method: 'QR',
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        maxRegistrations: 10,
      },
      actor,
    );
    const open = await workflow.validateAccess({ token: another.token });
    await workflow.revokeAccess(String(another._id), actor);
    await expect(
      workflow.submit({
        ...applicant(),
        nationalId: identity(),
        admissionSession: open.admissionSession,
        submissionKey: 'e'.repeat(32),
        captchaToken: '',
      }),
    ).rejects.toThrow();
    await workflow.access.updateOne(
      { _id: invite._id },
      { $set: { expiresAt: new Date(0) } },
    );
    await expect(
      workflow.validateAccess({ token: invite.token }),
    ).rejects.toThrow();
  });
  it('locks repeated invalid PINs without storing their plaintext', async () => {
    const invite = await workflow.createAccess(
      {
        admissionPeriodId: periodId,
        label: 'Lockout fixture',
        method: 'PIN',
        pin: '987654321',
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        maxRegistrations: 10,
      },
      actor,
    );
    for (let i = 0; i < 10; i++)
      await expect(
        workflow.validateAccess({
          accessId: String(invite._id),
          pin: '00000000',
        }),
      ).rejects.toThrow();
    await expect(
      workflow.validateAccess({
        accessId: String(invite._id),
        pin: '987654321',
      }),
    ).rejects.toThrow();
    const stored = await workflow.access
      .findById(invite._id)
      .select('+pinHash')
      .lean();
    expect(stored!.pinHash).not.toContain('987654321');
    expect(stored!.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });
  it('approves 50 distinct applicants concurrently with matching identities and exactly one code each', async () => {
    const requests = await Promise.all(
      Array.from({ length: 50 }, () => pending()),
    );
    const results = await Promise.all(
      requests.map((item) =>
        workflow.approve(String(item._id), approval(), actor),
      ),
    );
    expect(new Set(results.map((item) => item.studentCode)).size).toBe(50);
    for (const item of results) {
      expect(item.status).toBe('APPROVED');
      expect(item.studentCode).toMatch(/^88\d{4}$/);
      expect(
        await workflow.store.profiles.exists({
          userId: admissionId(item.studentId!),
          studentCode: item.studentCode,
        }),
      ).toBeTruthy();
    }
  }, 180000);
  it('approves one request ten times with one identity, one code and one seat', async () => {
    const item = await pending(),
      group = await workflow.createGroup(
        {
          name: 'One seat',
          academicYear,
          level: '1',
          department: 'GENERAL',
          capacity: 1,
        },
        actor,
      );
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        workflow.approve(String(item._id), approval(String(group._id)), actor),
      ),
    );
    expect(
      new Set(results.map((result) => String(result.studentId))).size,
    ).toBe(1);
    expect((await workflow.groups.findById(group._id).lean())!.enrolled).toBe(
      1,
    );
    expect(
      await workflow.store.entries.countDocuments({
        registrationRequestId: item._id,
      }),
    ).toBe(1);
    const next = await pending(),
      before = (await workflow.store.years.findOne({ academicYear }).lean())!
        .nextSequence;
    await expect(
      workflow.approve(String(next._id), approval(String(group._id)), actor),
    ).rejects.toMatchObject({ response: { code: 'ADMISSION_GROUP_FULL' } });
    expect(
      (await workflow.store.years.findOne({ academicYear }).lean())!
        .nextSequence,
    ).toBe(before);
    expect(
      await workflow.store.entries.exists({ registrationRequestId: next._id }),
    ).toBeNull();
  }, 180000);
  it('computes waiting-list positions, requires rejection reason, enforces terminal states and stale edits', async () => {
    const first = await pending(),
      second = await pending(),
      reason = 'Synthetic reviewed waiting list';
    await workflow.decide(
      String(first._id),
      'WAITLISTED',
      { revision: 0, reason, confirmed: true },
      actor,
    );
    await workflow.decide(
      String(second._id),
      'WAITLISTED',
      { revision: 0, reason, confirmed: true },
      actor,
    );
    expect(
      (await workflow.detail(String(first._id), actor)).waitlistPosition,
    ).toBe(1);
    expect(
      (await workflow.detail(String(second._id), actor)).waitlistPosition,
    ).toBe(2);
    await expect(
      workflow.decide(
        String(first._id),
        'REJECTED',
        { revision: 1, reason, confirmed: true },
        actor,
      ),
    ).rejects.toThrow();
    await expect(
      workflow.decide(
        String(first._id),
        'REJECTED',
        { revision: 1, reasonCode: 'OTHER', confirmed: true },
        actor,
      ),
    ).rejects.toThrow();
    await workflow.decide(
      String(first._id),
      'REJECTED',
      { revision: 1, reason, reasonCode: 'OTHER', confirmed: true },
      actor,
    );
    expect(
      (await workflow.detail(String(second._id), actor)).waitlistPosition,
    ).toBe(1);
    await expect(
      workflow.decide(
        String(first._id),
        'PENDING',
        { revision: 2, reason, confirmed: true },
        actor,
      ),
    ).rejects.toThrow();
    await expect(
      workflow.update(
        String(second._id),
        { ...applicant(), revision: 0 },
        actor,
      ),
    ).rejects.toThrow();
  });
  it('cancels officially once, frees the seat, disables sessions and keeps historic ownership blocked', async () => {
    const item = await pending(),
      group = await workflow.createGroup(
        {
          name: 'Cancel fixture',
          academicYear,
          level: '1',
          department: 'GENERAL',
          capacity: 1,
        },
        actor,
      );
    const approved = await workflow.approve(
      String(item._id),
      approval(String(group._id)),
      actor,
    );
    const dto = {
      revision: 1,
      reason: 'Synthetic official cancellation',
      confirmed: true as const,
    };
    expect(await workflow.cancelApproved(String(item._id), dto, actor)).toEqual(
      { status: 'CANCELLED', codeReleased: false },
    );
    await workflow.cancelApproved(String(item._id), dto, actor);
    expect((await workflow.groups.findById(group._id).lean())!.enrolled).toBe(
      0,
    );
    const user = await workflow.store.users.findById(approved.studentId).lean();
    expect(user!.isActive).toBe(false);
    expect(user!.tokenVersion).toBe(1);
    expect(user!.studentCode).toBe(approved.studentCode);
    expect(
      (await workflow.store.entries
        .findOne({ studentCode: approved.studentCode })
        .lean())!.status,
    ).toBe('ASSIGNED');
    expect(
      await workflow.store.audits.countDocuments({
        requestId: item._id,
        action: 'CANCELLED_CODE_HELD',
      }),
    ).toBe(1);
  });
  it('previews and applies valid spreadsheet rows once; rejects formulas, stale revisions and code edits', async () => {
    const a = await pending(),
      b = await pending(),
      c = await pending();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      (await sheets.workbook(
        { page: 1, limit: 20 },
        true,
      )) as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
    const sheet = workbook.getWorksheet('Requests')!;
    sheet.addRow([
      String(a._id),
      0,
      'WAITLIST',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'Synthetic waitlist reason',
    ]);
    sheet.addRow([
      String(b._id),
      0,
      'WAITLIST',
      '880001',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'Must reject code mutation',
    ]);
    sheet.addRow([
      String(c._id),
      0,
      { formula: '1+1' },
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'Must reject formula',
    ]);
    const file = {
      originalname: 'requests.xlsx',
      mimetype:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    };
    const preview = await sheets.preview(file, actor);
    expect(preview.rows.map((row) => row.state)).toEqual([
      'VALID',
      'INVALID',
      'INVALID',
    ]);
    const result = await sheets.apply(String(preview._id), actor);
    expect(result.rows.map((row) => row.state)).toEqual([
      'APPLIED',
      'INVALID',
      'INVALID',
    ]);
    expect((await sheets.apply(String(preview._id), actor)).rows).toEqual(
      result.rows,
    );
    expect(
      (await workflow.requests.findById(a._id).lean())!.history.filter(
        (event) => event.action === 'WAITLISTED',
      ),
    ).toHaveLength(1);
  });
  it('protects every route, CSRF, fresh permission revocation and strict update payloads', async () => {
    const id = String((await pending())._id),
      base = '/api/admin/admissions';
    const endpoints = [
      ['get', '/academic-years'],
      ['get', '/requests'],
      ['get', `/requests/${id}`],
      ['patch', `/requests/${id}`],
      ...['approve', 'reject', 'waitlist', 'pending', 'cancel'].map(
        (action) => ['post', `/requests/${id}/${action}`],
      ),
      ['get', '/access'],
      ['post', '/access'],
      ['post', `/access/${accessId}/revoke`],
      ['get', '/groups'],
      ['post', '/groups'],
      ['patch', `/groups/${id}`],
      ['get', '/xlsx/export'],
      ['get', '/xlsx/template'],
      ['post', '/xlsx/preview'],
      ['get', `/xlsx/batches/${id}`],
      ['post', `/xlsx/batches/${id}/apply`],
    ];
    const staffId = new Types.ObjectId();
    actors.push(staffId);
    await workflow.store.users.create({
      _id: staffId,
      role: 'staff',
      name: 'Synthetic admissions staff',
      email: 'admissions-staff@example.test',
      passwordHash: hash,
      permissions: [],
      mustChangePassword: false,
    });
    const signed = await request(app.getHttpServer())
      .post('/api/auth/admin/login')
      .set('Origin', 'http://localhost:3000')
      .send({
        email: 'admissions-staff@example.test',
        password: 'SyntheticAdmissions123!',
      })
      .expect(200);
    const cookie = (signed.headers['set-cookie'] as unknown as string[])
        .map((value) => value.split(';')[0])
        .join('; '),
      csrf = signed.body.csrfToken as string;
    for (const [method, path] of endpoints) {
      const anonymous = request(app.getHttpServer());
      const staff = request(app.getHttpServer());
      const send = (client: ReturnType<typeof request>) =>
        method === 'get'
          ? client.get(base + path)
          : method === 'patch'
            ? client.patch(base + path)
            : client.post(base + path);
      await send(anonymous).expect(401);
      await send(staff)
        .set('Cookie', cookie)
        .set('x-csrf-token', csrf)
        .send({})
        .expect(403);
    }
    await workflow.store.users.updateOne(
      { _id: staffId },
      {
        $set: {
          permissions: [
            PERMISSIONS.ADMISSIONS_REQUESTS_READ,
            PERMISSIONS.ADMISSIONS_REQUESTS_UPDATE,
          ],
        },
      },
    );
    await request(app.getHttpServer())
      .get(`${base}/requests/${id}`)
      .set('Cookie', cookie)
      .expect(200)
      .expect((response) => {
        expect(response.body.nationalId).toBeUndefined();
        expect(response.body.nationalIdEncrypted).toBeUndefined();
      });
    await request(app.getHttpServer())
      .patch(`${base}/requests/${id}`)
      .set('Cookie', cookie)
      .send({ ...applicant(), revision: 0 })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`${base}/requests/${id}`)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .send({
        ...applicant(),
        revision: 0,
        nationalId: identity(),
        role: 'admin',
      })
      .expect(400);
    await workflow.store.users.updateOne(
      { _id: staffId },
      { $set: { permissions: Object.values(PERMISSIONS) } },
    );
    for (const path of [
      `${base}/requests/${id}`,
      `${base}/access/${accessId}`,
      `${base}/groups/${id}`,
      `${base}/periods/${periodId}`,
    ]) {
      await request(app.getHttpServer())
        .delete(path)
        .set('Cookie', cookie)
        .set('x-csrf-token', csrf)
        .send({ revision: 0, confirmed: true })
        .expect(403);
    }
    await request(app.getHttpServer())
      .get('/api/admin/student-codes/mappings/preview')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/admin/student-codes/mappings/preview')
      .set('Cookie', cookie)
      .expect(403);
    await workflow.store.users.updateOne(
      { _id: staffId },
      { $set: { permissions: [] } },
    );
    await request(app.getHttpServer())
      .get(`${base}/requests`)
      .set('Cookie', cookie)
      .expect(403);
  }, 120000);
  async function legacyStudent(
    code: string,
    year: string,
    session?: import('mongoose').ClientSession,
  ) {
    const student = new Types.ObjectId();
    actors.push(student);
    await workflow.store.users.create(
      [
        {
          _id: student,
          role: 'student',
          name: 'Synthetic retained identity',
          studentCode: code,
          username: code,
          userCode: `STD-${code}`,
          passwordHash: hash,
        },
      ],
      { ...(session ? { session } : {}) },
    );
    await workflow.store.profiles.create(
      [
        {
          userId: student,
          studentCode: code,
          fullName: 'Synthetic retained identity',
          academicYear: year,
          level: '1',
          semester: '1',
        },
      ],
      { ...(session ? { session } : {}) },
    );
    return { studentId: String(student) };
  }
  it('rejects a guardian phone matching the student phone on public submit and staff edits', async () => {
    const values = {
      ...applicant(),
      phone: '01012345678',
      guardians: [
        {
          name: 'Synthetic guardian',
          relationship: 'Parent',
          phone: '01012345678',
        },
      ],
    };
    await expect(
      workflow.submit({
        ...values,
        nationalId: identity(),
        admissionSession: 'not-needed-before-validation',
        submissionKey: 'z'.repeat(32),
        captchaToken: '',
      }),
    ).rejects.toMatchObject({
      response: { code: 'ADMISSION_GUARDIAN_PHONE_MATCH' },
    });
    const item = await pending();
    await expect(
      workflow.update(String(item._id), { ...values, revision: 0 }, actor),
    ).rejects.toMatchObject({
      response: { code: 'ADMISSION_GUARDIAN_PHONE_MATCH' },
    });
    expect((await workflow.requests.findById(item._id).lean())!.revision).toBe(
      0,
    );
  });
  it('continues after codes imported since initialization instead of filling unverified gaps', async () => {
    await legacyStudent('881234', academicYear);
    const assigned = await allocator.allocate(
      academicYear,
      String(new Types.ObjectId()),
      actor._id,
      (code, session) => legacyStudent(code, academicYear, session),
    );
    expect(assigned.studentCode).toBe('881235');
  });
  it('initializes a new intake using its ending year, independent of the host date', async () => {
    const year = extraYears[0];
    await workflow.store.periods.create({
      code: 'SYNTH-AUTO-94',
      academicYear: year,
      name: 'Synthetic ending-year intake',
      opensAt: new Date(Date.now() - 60000),
      closesAt: new Date(Date.now() + 86400000),
      isEnabled: true,
    });
    const assigned = await allocator.allocate(
      year,
      String(new Types.ObjectId()),
      actor._id,
      (code, session) => legacyStudent(code, year, session),
    );
    expect(assigned.studentCode).toBe('940001');
  });
  it('previews and atomically corrects old mappings without renumbering either previous holder', async () => {
    const [yearA, yearB] = extraYears.slice(1);
    const a = await legacyStudent('950010', yearA),
      b = await legacyStudent('960100', yearB);
    for (const [year, prefix, sequence, student] of [
      [yearA, '95', 10, a.studentId],
      [yearB, '96', 100, b.studentId],
    ] as const) {
      await workflow.store.years.create({
        academicYear: year,
        yearPrefix: prefix,
        nextSequence: sequence + 1,
        initializedAt: new Date(),
        initializedBy: actorId,
        initializationReason: 'Synthetic old first-year policy',
      });
      await workflow.store.entries.create({
        academicYear: year,
        yearPrefix: prefix,
        sequence,
        studentCode: `${prefix}${String(sequence).padStart(4, '0')}`,
        status: 'ASSIGNED',
        currentStudentId: admissionId(student),
        assignmentHistory: [
          {
            studentId: admissionId(student),
            observedAt: new Date(),
            source: 'legacy',
          },
        ],
      });
    }
    await expect(
      allocator.allocate(
        yearA,
        String(new Types.ObjectId()),
        actor._id,
        (code, session) => legacyStudent(code, yearA, session),
      ),
    ).rejects.toMatchObject({
      response: { code: 'CODE_YEAR_PREFIX_MISMATCH' },
    });
    const preview = await mappings.preview();
    expect(
      preview.items.find((item) => item.academicYear === yearA),
    ).toMatchObject({
      currentPrefix: '95',
      expectedPrefix: '96',
      nextCode: '960101',
    });
    expect(
      preview.items.find((item) => item.academicYear === yearB),
    ).toMatchObject({
      currentPrefix: '96',
      expectedPrefix: '97',
      nextCode: '970101',
    });
    await mappings.correct(
      {
        fingerprint: preview.fingerprint,
        reason: 'Synthetic reviewed end-year correction',
        confirmed: true,
      },
      actor._id,
    );
    expect(
      (await workflow.store.users.findById(a.studentId).lean())!.studentCode,
    ).toBe('950010');
    expect(
      (await workflow.store.users.findById(b.studentId).lean())!.studentCode,
    ).toBe('960100');
    expect(
      (
        await allocator.allocate(
          yearA,
          String(new Types.ObjectId()),
          actor._id,
          (code, session) => legacyStudent(code, yearA, session),
        )
      ).studentCode,
    ).toBe('960101');
    expect(
      (
        await allocator.allocate(
          yearB,
          String(new Types.ObjectId()),
          actor._id,
          (code, session) => legacyStudent(code, yearB, session),
        )
      ).studentCode,
    ).toBe('970101');
    await expect(
      mappings.correct(
        {
          fingerprint: preview.fingerprint,
          reason: 'Synthetic stale correction',
          confirmed: true,
        },
        actor._id,
      ),
    ).rejects.toThrow();
    expect(
      await workflow.store.audits.countDocuments({
        academicYear: { $in: [yearA, yearB] },
        action: 'MAPPING_CORRECTED',
      }),
    ).toBe(2);
  });
  it('deletes a period by archiving its history and revoking invitations while keeping existing applications', async () => {
    const year = extraYears[0],
      period = (await workflow.store.periods
        .findOne({ academicYear: year })
        .lean())!;
    const invite = await workflow.createAccess(
      {
        admissionPeriodId: String(period._id),
        label: 'Archive fixture',
        method: 'QR',
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        maxRegistrations: 10,
      },
      actor,
    );
    const opened = await workflow.validateAccess({ token: invite.token });
    const receipt = await workflow.submit({
      ...applicant(),
      nationalId: identity(),
      admissionSession: opened.admissionSession,
      submissionKey: 'q'.repeat(32),
      captchaToken: '',
    });
    await periods.delete(
      String(period._id),
      { revision: period.revision, confirmed: true },
      actor._id,
    );
    expect(
      (await workflow.store.periods
        .findById(period._id)
        .select('+history')
        .lean())!.deletedAt,
    ).toBeTruthy();
    expect((await workflow.access.findById(invite._id).lean())!.status).toBe(
      'REVOKED',
    );
    expect((await workflow.publicStatus(receipt)).status).toBe('PENDING');
    expect(
      (await periods.list({ page: 1, limit: 20, search: 'SYNTH-AUTO-94' }))
        .items,
    ).toHaveLength(0);
    await expect(
      workflow.validateAccess({ token: invite.token }),
    ).rejects.toThrow();
    await expect(
      workflow.createAccess(
        {
          admissionPeriodId: String(period._id),
          label: 'Must reject archived period',
          method: 'QR',
          expiresAt: new Date(Date.now() + 600000).toISOString(),
          maxRegistrations: 10,
        },
        actor,
      ),
    ).rejects.toThrow();
  });
  it('allows administrators to archive requests and rejects staff even with all admission grants', async () => {
    const item = await pending();
    const staff: AuthenticatedUser = {
      ...actor,
      role: 'staff',
      permissions: Object.values(PERMISSIONS),
    };
    const input = {
      revision: 0,
      reason: 'Synthetic reviewed archive',
      confirmed: true as const,
    };
    await expect(
      workflow.deleteRequest(String(item._id), input, staff),
    ).rejects.toThrow();
    await workflow.deleteRequest(String(item._id), input, actor);
    expect((await workflow.requests.findById(item._id).lean())!.status).toBe(
      'REJECTED',
    );
    await expect(workflow.detail(String(item._id), actor)).rejects.toThrow();
    await expect(
      workflow.approve(String(item._id), approval(), actor),
    ).rejects.toThrow();
    await expect(workflow.deleteAccess(accessId, staff)).rejects.toThrow();
  });
  it('archives empty groups without allowing them to be reopened through an update', async () => {
    const group = await workflow.createGroup(
      {
        name: 'Archived group fixture',
        academicYear,
        level: '1',
        department: 'GENERAL',
        capacity: 2,
      },
      actor,
    );
    const id = String(group._id);
    await workflow.deleteGroup(id, actor);
    expect((await workflow.groups.findById(id).lean())!.deletedAt).toBeTruthy();
    await expect(
      workflow.updateGroup(
        id,
        { revision: 1, capacity: 2, isEnabled: true },
        actor,
      ),
    ).rejects.toThrow();
    await expect(workflow.getGroupStudents(id)).rejects.toThrow();
  });
  it('protects admission identities and history from the general student delete action', async () => {
    const item = await pending();
    const approved = await workflow.approve(
      String(item._id),
      approval(),
      actor,
    );
    await expect(
      students.deleteStudent(String(approved.studentId)),
    ).rejects.toMatchObject({
      response: { code: 'STUDENT_ADMISSION_HISTORY_HELD' },
    });
    expect(
      await workflow.requests.exists({ _id: item._id, status: 'APPROVED' }),
    ).toBeTruthy();
    expect(
      await workflow.store.profiles.exists({
        studentCode: approved.studentCode,
      }),
    ).toBeTruthy();
    await expect(
      students.create({ studentCode: approved.studentCode } as Parameters<
        StudentsService['create']
      >[0]),
    ).rejects.toMatchObject({
      response: { code: 'STUDENT_CODE_MANAGED_BY_ADMISSIONS' },
    });
  });
  it('explains inactive periods even when an invitation is marked ACTIVE, without exposing PIN secrets', async () => {
    for (const [suffix, patch, status, error] of [
      [
        'disabled',
        { isEnabled: false },
        'PERIOD_DISABLED',
        'ADMISSION_PERIOD_DISABLED',
      ],
      [
        'scheduled',
        { opensAt: new Date(Date.now() + 60_000) },
        'PERIOD_SCHEDULED',
        'ADMISSION_PERIOD_SCHEDULED',
      ],
      [
        'closed',
        { closesAt: new Date(Date.now() - 60_000) },
        'PERIOD_CLOSED',
        'ADMISSION_PERIOD_CLOSED',
      ],
    ] as const) {
      const period = await workflow.store.periods.create({
        code: `SYNTH-AVAIL-${suffix}`,
        academicYear,
        name: 'Synthetic availability',
        opensAt: new Date(Date.now() - 120_000),
        closesAt: new Date(Date.now() + 86400_000),
        isEnabled: true,
      });
      const invitation = await workflow.createAccess(
        {
          admissionPeriodId: String(period._id),
          method: 'PIN',
          label: `Synthetic ${suffix}`,
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          maxRegistrations: 3,
        },
        actor,
      );
      await workflow.store.periods.updateOne(
        { _id: period._id },
        { $set: patch },
      );
      const row = (
        await workflow.listAccess({ page: 1, limit: 100 })
      ).items.find((value) => String(value._id) === String(invitation._id))!;
      expect(row.status).toBe('ACTIVE');
      expect(row.effectiveStatus).toBe(status);
      expect(row.canOpen).toBe(false);
      expect(JSON.stringify(row)).not.toMatch(
        /pinHash|pinCipher|tokenHash|tokenCipher/,
      );
      await expect(
        workflow.validateAccess({ pin: invitation.pin }),
      ).rejects.toMatchObject({ response: { code: error } });
    }
  });
  it('reports a PIN-key mismatch to managers without attempting an unsafe public PIN fallback', async () => {
    const invitation = await workflow.createAccess(
      {
        admissionPeriodId: periodId,
        method: 'PIN',
        label: 'Synthetic key diagnostic',
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        maxRegistrations: 3,
      },
      actor,
    );
    await workflow.access.updateOne(
      { _id: invitation._id },
      { $set: { pinHash: 'synthetic-key-mismatch' } },
    );
    const row = (await workflow.listAccess({ page: 1, limit: 100 })).items.find(
      (value) => String(value._id) === String(invitation._id),
    )!;
    expect(row.pinConfigurationIssue).toBe(true);
    expect(JSON.stringify(row)).not.toContain(invitation.pin);
    await expect(
      workflow.validateAccess({ pin: invitation.pin }),
    ).rejects.toThrow();
  });
});

function admissionId(id: string | Types.ObjectId) {
  return new Types.ObjectId(String(id));
}
