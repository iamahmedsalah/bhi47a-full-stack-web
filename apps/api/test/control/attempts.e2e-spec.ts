import mongoose, { Types } from 'mongoose';
import type { Connection, Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import {
  GradeSchema,
  type GradeDocument,
} from '../../src/modules/grades/schemas/grade.schema';
import { ControlSheetSchema } from '../../src/modules/control/schemas/control-sheet.schema';
import { GradingSchemeSchema } from '../../src/modules/control/schemas/grading-scheme.schema';
import { GradeAuditLogSchema } from '../../src/modules/control/schemas/grade-audit-log.schema';
import { CourseSchema } from '../../src/modules/courses/schemas/course.schema';
import { UserSchema } from '../../src/modules/users/schemas/user.schema';
import { CourseRegistrationSchema } from '../../src/modules/registrations/schemas/course-registration.schema';
import { CourseStaffAssignmentSchema } from '../../src/modules/attendance/schemas/course-staff-assignment.schema';
import { ControlAttemptsService } from '../../src/modules/control/services/control-attempts.service';
import { ControlAccessService } from '../../src/modules/control/services/control-access.service';
import { ControlSheetsService } from '../../src/modules/control/services/control-sheets.service';
import { GradingSchemeService } from '../../src/modules/control/services/grading-scheme.service';
import { ControlAttemptStore } from '../../src/modules/control/control-attempt.store';
import { ControlReleaseStore } from '../../src/modules/grades/control-release.store';
import type { AuthenticatedUser } from '../../src/modules/auth/types/authenticated-request';
import type { ControlSheet } from '../../src/modules/control/schemas/control-sheet.schema';
import { createFixtureIndexes } from '../fixture-indexes';

describe('Whole attempts and final-only IC persistence', () => {
  let db: Connection,
    grades: Model<GradeDocument>,
    service: ControlAttemptsService;
  let store: ControlAttemptStore, releases: ControlReleaseStore;
  let sheets: ControlSheetsService;
  const actor = {
    _id: String(new Types.ObjectId()),
    role: 'admin',
    permissions: [],
    name: 'Test admin',
    mustChangePassword: false,
    tokenVersion: 0,
  } satisfies AuthenticatedUser;
  const components = ['coursework', 'midterm', 'final'] as const;
  const database = `attempts-${randomUUID()}-e2e`;
  beforeAll(async () => {
    const url = new URL(process.env.MONGODB_URI || '');
    if (
      url.protocol !== 'mongodb:' ||
      !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.search ||
      !/e2e$/.test(url.pathname)
    )
      throw new Error(
        'Isolated credential-free localhost replica set required',
      );
    db = await mongoose
      .createConnection(url.toString(), {
        dbName: database,
        autoIndex: false,
        autoCreate: false,
        serverSelectionTimeoutMS: 3000,
      })
      .asPromise();
    if (!(await db.db!.admin().command({ hello: 1 })).setName)
      throw new Error('Replica set required');
    const models = [
      db.model('Grade', GradeSchema),
      db.model('ControlSheet', ControlSheetSchema),
      db.model('GradingScheme', GradingSchemeSchema),
      db.model('GradeAuditLog', GradeAuditLogSchema),
      db.model('Course', CourseSchema),
      db.model('User', UserSchema),
      db.model('CourseRegistration', CourseRegistrationSchema),
      db.model('CourseStaffAssignment', CourseStaffAssignmentSchema),
    ];
    await Promise.all(models.map((model) => createFixtureIndexes(model)));
    grades = db.model<GradeDocument>('Grade');
    const access = new ControlAccessService(
      db.model('Course') as never,
      db.model('CourseStaffAssignment') as never,
    );
    const schemes = new GradingSchemeService(
      db.model('GradingScheme') as never,
      grades,
      db.model('GradeAuditLog') as never,
    );
    sheets = new ControlSheetsService(
      db.model('ControlSheet') as never,
      db.model('Course') as never,
      grades,
      db.model('User') as never,
      db.model('CourseRegistration') as never,
      db.model('GradeAuditLog') as never,
      access,
      schemes,
    );
    service = new ControlAttemptsService(grades, access, sheets, schemes);
    store = new ControlAttemptStore(db);
    releases = new ControlReleaseStore(db);
    await releases.prepare();
  }, 120000);
  afterAll(async () => {
    if (db) {
      if (
        db.name !== database ||
        !database.startsWith('attempts-') ||
        !database.endsWith('-e2e')
      )
        throw new Error('Unexpected fixture database');
      await db.dropDatabase();
      await db.close();
    }
  }, 120000);
  async function fixture(
    finalStatus: 'present' | 'incomplete',
    scores: [number, number, number],
    semester: 'first' | 'summer' = 'summer',
  ) {
    const studentId = new Types.ObjectId(),
      courseId = new Types.ObjectId();
    const code = String(courseId).slice(-8).toUpperCase(),
      studentCode = String(studentId).slice(-8);
    await db.model('User').collection.insertOne({
      _id: studentId,
      studentCode,
      name: 'Attempt student',
      role: 'student',
    });
    await db.model('Course').collection.insertOne({
      _id: courseId,
      code,
      name: 'Attempt course',
      creditHours: 3,
    });
    await db.model('CourseRegistration').collection.insertOne({
      studentId,
      academicYear: '2098-2099',
      semester,
      status: 'approved',
      courses: [code],
    });
    await grades.collection.insertMany(
      components.map((examType, index) => ({
        studentId,
        studentCode,
        courseId,
        courseCode: code,
        courseName: 'Attempt course',
        academicYear: '2097-2098',
        semester: 'first',
        examType,
        grade: scores[index],
        maxGrade: [20, 30, 50][index],
        status: index === 2 ? finalStatus : 'present',
        rev: 1,
        historicalImport: true,
        isPublished: false,
      })),
    );
    const target = await sheets.openSheet(actor, {
      courseId: String(courseId),
      academicYear: '2098-2099',
      semester,
      component: 'final',
    });
    return {
      studentId,
      studentCode,
      courseId,
      code,
      target,
      scope: {
        courseId,
        courseCode: code,
        academicYear: '2098-2099',
        semester,
      },
    };
  }
  it('copies only original IC contributions atomically, retries safely, and undoes copies without touching either final', async () => {
    const f = await fixture('incomplete', [17, 25, 0]);
    const sourceBefore = await grades
      .find({ courseId: f.courseId, academicYear: '2097-2098' })
      .lean();
    const preview = await service.preview(actor, f.target.sheet.id, 1);
    expect(preview.icSources).toHaveLength(1);
    const source = preview.icSources[0].source;
    const finalId = source.marks.find((m) => m.component === 'final')!.id;
    await grades.collection.insertOne({
      studentId: f.studentId,
      studentCode: f.studentCode,
      ...f.scope,
      examType: 'final',
      grade: 40,
      maxGrade: 50,
      status: 'present',
      rev: 1,
      controlManaged: true,
      isPublished: false,
    });
    await service.carry(actor, f.target.sheet.id, finalId, source.fingerprint);
    await service.carry(actor, f.target.sheet.id, finalId, source.fingerprint);
    const copies = await grades
      .find({ ...f.scope, carriedFrom: { $exists: true } })
      .sort({ examType: 1 })
      .lean();
    expect(copies.map((m) => [m.examType, m.grade, m.isPublished])).toEqual([
      ['coursework', 17, false],
      ['midterm', 25, false],
    ]);
    expect(
      await grades
        .find({ courseId: f.courseId, academicYear: '2097-2098' })
        .lean(),
    ).toEqual(sourceBefore);
    expect(
      (await service.preview(actor, f.target.sheet.id, 1)).carriedTotal,
    ).toBe(1);
    await service.undoCarry(
      actor,
      f.target.sheet.id,
      String(f.studentId),
      source.fingerprint,
    );
    expect(
      await grades.countDocuments({
        ...f.scope,
        carriedFrom: { $exists: true },
      }),
    ).toBe(0);
    expect(await grades.countDocuments({ courseId: f.courseId })).toBe(4);
    expect(
      await db
        .model('GradeAuditLog')
        .countDocuments({ courseId: f.courseId, action: 'CREATE' }),
    ).toBe(2);
    expect(
      await db
        .model('GradeAuditLog')
        .countDocuments({ courseId: f.courseId, action: 'CLEAR' }),
    ).toBe(2);
  });
  it('rejects stale source, mismatched maximums and non-summer carry without creating marks', async () => {
    const f = await fixture('incomplete', [17, 25, 0]);
    const source = (await service.preview(actor, f.target.sheet.id, 1))
      .icSources[0].source;
    const finalId = source.marks.find((m) => m.component === 'final')!.id;
    await expect(
      service.carry(actor, f.target.sheet.id, finalId, '0'.repeat(64)),
    ).rejects.toMatchObject({ response: { code: 'IC_SOURCE_CHANGED' } });
    await grades.updateOne(
      { _id: source.marks.find((m) => m.component === 'midterm')!.id },
      { $set: { maxGrade: 20 } },
    );
    const changed = (await service.preview(actor, f.target.sheet.id, 1))
      .icSources[0].source;
    await expect(
      service.carry(actor, f.target.sheet.id, finalId, changed.fingerprint),
    ).rejects.toMatchObject({ response: { code: 'IC_SCHEME_MISMATCH' } });
    expect(await grades.countDocuments(f.scope)).toBe(0);
    const other = await fixture('incomplete', [17, 25, 0], 'first');
    await expect(
      service.carry(actor, other.target.sheet.id, finalId, changed.fingerprint),
    ).rejects.toMatchObject({ response: { code: 'IC_SUMMER_ONLY' } });
  });
  it('rolls back both copies when a contributing sheet is locked', async () => {
    const f = await fixture('incomplete', [17, 25, 0]);
    for (const component of ['coursework', 'midterm'] as const) {
      await sheets.openSheet(actor, {
        courseId: String(f.courseId),
        academicYear: f.scope.academicYear,
        semester: 'summer',
        component,
      });
    }
    await db
      .model('ControlSheet')
      .updateOne(
        { ...f.scope, component: 'midterm' },
        { $set: { locked: true } },
      );
    const source = (await service.preview(actor, f.target.sheet.id, 1))
      .icSources[0].source;
    await expect(
      service.carry(
        actor,
        f.target.sheet.id,
        source.marks.find((m) => m.component === 'final')!.id,
        source.fingerprint,
      ),
    ).rejects.toMatchObject({ response: { code: 'SHEET_LOCKED' } });
    expect(await grades.countDocuments(f.scope)).toBe(0);
    expect(
      await db
        .model('GradeAuditLog')
        .countDocuments({ courseId: f.courseId, action: 'CREATE' }),
    ).toBe(0);
  });
  it('can retain a higher attempt by reviewer choice, then activate it after a fresh approval', async () => {
    const f = await fixture('present', [20, 10, 40]);
    await grades.collection.insertMany(
      components.map((examType, i) => ({
        ...f.scope,
        studentId: f.studentId,
        studentCode: f.studentCode,
        courseName: 'Attempt course',
        examType,
        grade: [10, 30, 40][i],
        maxGrade: [20, 30, 50][i],
        status: 'present',
        rev: 1,
        controlManaged: true,
        controlApprovedRev: 1,
        isPublished: false,
      })),
    );
    for (const component of ['coursework', 'midterm'] as const)
      await sheets.openSheet(actor, {
        courseId: String(f.courseId),
        academicYear: f.scope.academicYear,
        semester: 'summer',
        component,
      });
    await db
      .model('ControlSheet')
      .updateMany(f.scope, { $set: { workflowState: 'APPROVED' } });
    const preview = await store.preview(f.scope);
    expect(preview.comparisons[0].canAcceptNew).toBe(true);
    const sheet = await db
      .model('ControlSheet')
      .findById(f.target.sheet.id)
      .lean<ControlSheet & { _id: Types.ObjectId }>();
    const session = await db.startSession();
    try {
      await session.withTransaction(() =>
        store.approve(
          f.scope,
          sheet!._id,
          actor._id,
          preview.digest,
          [String(f.studentId)],
          session,
        ),
      );
      const retained = await releases.preview(sheet!);
      await session.withTransaction(() =>
        store.approve(
          f.scope,
          sheet!._id,
          actor._id,
          preview.digest,
          [],
          session,
        ),
      );
      expect((await releases.preview(sheet!)).digest).not.toBe(retained.digest);
      await session.withTransaction(() =>
        releases.activate(sheet!, actor._id, session),
      );
    } finally {
      await session.endSession();
    }
    const visible = await releases.studentMarks(f.studentId);
    expect(visible).toHaveLength(3);
    expect(
      visible.find((mark) => mark.examType === 'final')?.officialResult?.total,
    ).toBe(80);
    expect(
      visible.every((mark) => mark.academicYear === f.scope.academicYear),
    ).toBe(true);
  });
  it('requires reviewed whole-attempt digest, keeps a lower outcome, and blocks stale publication', async () => {
    const f = await fixture('present', [20, 25, 45]);
    await grades.collection.insertMany(
      components.map((examType, i) => ({
        ...f.scope,
        studentId: f.studentId,
        studentCode: f.studentCode,
        courseName: 'Attempt course',
        examType,
        grade: [10, 20, 30][i],
        maxGrade: [20, 30, 50][i],
        status: 'present',
        rev: 1,
        controlManaged: true,
        controlApprovedRev: 1,
        isPublished: false,
      })),
    );
    const comparison = await store.preview(f.scope);
    expect(comparison.comparisons[0].canAcceptNew).toBe(false);
    const transaction = async (digest?: string, keep: string[] = []) => {
      const session = await db.startSession();
      try {
        await session.withTransaction(() =>
          store.approve(
            f.scope,
            new Types.ObjectId(f.target.sheet.id),
            actor._id,
            digest,
            keep,
            session,
          ),
        );
      } finally {
        await session.endSession();
      }
    };
    await expect(transaction()).rejects.toMatchObject({
      response: { code: 'ATTEMPT_REVIEW_REQUIRED' },
    });
    await transaction(comparison.digest);
    const final = await grades
      .findOne({ ...f.scope, examType: 'final' })
      .lean();
    expect(final?.attemptReview?.decision).toBe('keep_previous');
    await store.assertReviewed(f.scope);
    // Build an actual approved release and prove hidden historical grades are not implicitly published.
    for (const component of ['coursework', 'midterm'] as const)
      await sheets.openSheet(actor, {
        courseId: String(f.courseId),
        academicYear: f.scope.academicYear,
        semester: f.scope.semester,
        component,
      });
    await db
      .model('ControlSheet')
      .updateMany(f.scope, { $set: { workflowState: 'APPROVED' } });
    const sheet = await db
      .model('ControlSheet')
      .findById(f.target.sheet.id)
      .lean<ControlSheet & { _id: Types.ObjectId }>();
    const session = await db.startSession();
    try {
      await session.withTransaction(() =>
        releases.activate(sheet!, actor._id, session),
      );
    } finally {
      await session.endSession();
    }
    expect(await releases.studentMarks(f.studentId)).toHaveLength(0);
    expect(
      await grades.countDocuments({
        ...f.scope,
        attemptReview: { $exists: true },
      }),
    ).toBe(1);
    await grades.updateOne(
      { ...f.scope, examType: 'coursework' },
      { $inc: { rev: 1 } },
    );
    await expect(store.assertReviewed(f.scope)).rejects.toMatchObject({
      response: { code: 'ATTEMPT_REVIEW_CHANGED' },
    });
    expect(
      await db
        .model('GradeAuditLog')
        .countDocuments({ courseId: f.courseId, action: 'APPROVE' }),
    ).toBeGreaterThan(0);
  });
});
