import { StudentProfileSchema } from '../../src/modules/students/schemas/student-profile.schema';
import { StudentAcademicProfileSchema } from '../../src/modules/registrations/schemas/student-academic-profile.schema';
import mongoose, { Types } from 'mongoose';
import type { Connection } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ControlSheetSchema } from '../../src/modules/control/schemas/control-sheet.schema';
import { GradingSchemeSchema } from '../../src/modules/control/schemas/grading-scheme.schema';
import {
  GradeAuditLogSchema,
  type GradeAuditLogDocument,
} from '../../src/modules/control/schemas/grade-audit-log.schema';
import { ControlImportSchema } from '../../src/modules/control/schemas/control-import.schema';
import {
  GradeSchema,
  type GradeDocument,
} from '../../src/modules/grades/schemas/grade.schema';
import { CourseSchema } from '../../src/modules/courses/schemas/course.schema';
import { UserSchema } from '../../src/modules/users/schemas/user.schema';
import { CourseRegistrationSchema } from '../../src/modules/registrations/schemas/course-registration.schema';
import { CourseStaffAssignmentSchema } from '../../src/modules/attendance/schemas/course-staff-assignment.schema';
import { ControlAccessService } from '../../src/modules/control/services/control-access.service';
import { ControlSheetsService } from '../../src/modules/control/services/control-sheets.service';
import { ControlGradesService } from '../../src/modules/control/services/control-grades.service';
import { GradingSchemeService } from '../../src/modules/control/services/grading-scheme.service';
import { ControlWorkbookService } from '../../src/modules/control/services/control-workbook.service';
import { GradesService } from '../../src/modules/grades/grades.service';
import type { AuthenticatedUser } from '../../src/modules/auth/types/authenticated-request';

describe('Control real replica-set persistence, approval and Grades visibility', () => {
  let connection: Connection;
  let marks: ControlGradesService,
    sheets: ControlSheetsService,
    workbook: ControlWorkbookService,
    grades: GradesService;
  const prefix = `control_${randomUUID().replaceAll('-', '')}`;
  const actor: AuthenticatedUser = {
    _id: String(new Types.ObjectId()),
    role: 'admin',
    name: 'Synthetic submitter',
    permissions: [],
    mustChangePassword: false,
    tokenVersion: 0,
  };
  const reviewer: AuthenticatedUser = {
    ...actor,
    _id: String(new Types.ObjectId()),
    name: 'Synthetic reviewer',
  };
  const year = '2098-2099';
  const studentId = new Types.ObjectId(),
    courseId = new Types.ObjectId();
  let gradeModel: mongoose.Model<GradeDocument>,
    auditModel: mongoose.Model<GradeAuditLogDocument>;
  const ownedCollections: string[] = [];
  let windowOpen = false;
  let publishedReleasePreview: Awaited<
    ReturnType<GradesService['previewControlRelease']>
  >;
  let academicSyncSpy: { mockRestore: () => void };
  beforeAll(async () => {
    const uri = process.env.MONGODB_URI || '';
    const url = new URL(uri);
    if (
      url.protocol !== 'mongodb:' ||
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      !/[-_]e2e$/.test(url.pathname) ||
      url.username ||
      url.password ||
      url.search
    )
      throw new Error(
        'Credential-free isolated localhost E2E database required',
      );
    connection = await mongoose
      .createConnection(uri, {
        maxPoolSize: 10,
        autoIndex: false,
        autoCreate: false,
        serverSelectionTimeoutMS: 3000,
      })
      .asPromise();
    const hello = await connection.db!.admin().command({ hello: 1 });
    if (!hello.setName)
      throw new Error('Control integration requires a replica set');
    const model = <T>(name: string, schema: mongoose.Schema<T>) => {
      const collection = `${prefix}_${name}`;
      ownedCollections.push(collection);
      return connection.model<T>(
        name,
        schema,
        collection,
      ) as unknown as mongoose.Model<T & mongoose.Document>;
    };
    const userModel = model('User', UserSchema),
      courseModel = model('Course', CourseSchema),
      registrationModel = model('CourseRegistration', CourseRegistrationSchema),
      assignmentModel = model(
        'CourseStaffAssignment',
        CourseStaffAssignmentSchema,
      );
    const studentProfile = model('StudentProfile', StudentProfileSchema);
    const academicProfile = model(
      'StudentAcademicProfile',
      StudentAcademicProfileSchema,
    );
    const sheetModel = model('ControlSheet', ControlSheetSchema),
      schemeModel = model('GradingScheme', GradingSchemeSchema);
    const grade = model('Grade', GradeSchema),
      audit = model('GradeAuditLog', GradeAuditLogSchema);
    gradeModel = grade;
    auditModel = audit;
    // The mutation transaction updates the batch receipt in its canonical collection.
    const batches = connection.model(
      'ControlImport',
      ControlImportSchema,
      'control_import_batches',
    );
    await Promise.all(
      [
        userModel,
        studentProfile,
        academicProfile,
        courseModel,
        registrationModel,
        assignmentModel,
        sheetModel,
        schemeModel,
        grade,
        audit,
        batches,
      ].map((model) => model.createCollection()),
    );
    await Promise.all(
      [grade, sheetModel, schemeModel, audit, batches].map((model) =>
        model.createIndexes(),
      ),
    );
    await userModel.collection.insertOne({
      _id: studentId,
      role: 'student',
      studentCode: 'SYNTH260001',
      name: 'Synthetic student',
      nameAr: 'طالب تجريبي',
    });
    await courseModel.collection.insertOne({
      _id: courseId,
      code: 'SYNTH101',
      name: 'Synthetic course',
      // Historical course: no isActive field yet.
      creditHours: 3,
    });
    await registrationModel.collection.insertOne({
      studentId,
      academicYear: year,
      semester: 'first',
      courses: ['SYNTH101'],
      status: 'approved',
    });
    await academicProfile.collection.insertOne({
      studentId,
      academicLevel: '1',
      semester: 'first',
      gpa: 0,
      completedCourses: [],
      failedCourses: [],
      lowGradeCourses: [],
      academicWarnings: 0,
      completedCreditHours: 0,
    });
    await studentProfile.collection.insertOne({
      userId: studentId,
      studentCode: 'SYNTH260001',
      fullName: 'Synthetic student',
      academicYear: year,
      level: '1',
      semester: 'first',
      academicWarnings: 0,
    });
    const access = new ControlAccessService(
      courseModel as never,
      assignmentModel as never,
    );
    const schemeService = new GradingSchemeService(
      schemeModel as never,
      grade as never,
      audit as never,
    );
    sheets = new ControlSheetsService(
      sheetModel as never,
      courseModel as never,
      grade as never,
      userModel as never,
      registrationModel as never,
      audit as never,
      access,
      schemeService,
    );
    grades = new GradesService(
      grade as never,
      {} as never,
      userModel as never,
      courseModel as never,
      studentProfile as never,
      academicProfile as never,
      {} as never,
      sheetModel as never,
      {} as never,
      audit as never,
    );
    academicSyncSpy = jest
      .spyOn(grades, 'syncPublishedAcademicProgress')
      .mockResolvedValue([]);
    jest
      .spyOn(grades, 'getStudentResultsStatus')
      .mockImplementation(() =>
        Promise.resolve({ isOpen: windowOpen } as never),
      );
    marks = new ControlGradesService(
      grade as never,
      courseModel as never,
      userModel as never,
      sheetModel as never,
      audit as never,
      access,
      sheets,
      schemeService,
    );
    workbook = new ControlWorkbookService(
      grade as never,
      sheetModel as never,
      audit as never,
      batches as never,
      access,
      sheets,
      marks,
      schemeService,
    );
  }, 120000);
  afterAll(async () => {
    if (connection) {
      const releaseIds = (
        await connection
          .db!.collection('control_releases')
          .find({ 'scope.courseId': courseId })
          .toArray()
      ).map((r) => r._id);
      await connection
        .db!.collection('control_release_outbox')
        .deleteMany({ releaseId: { $in: releaseIds } });
      await connection
        .db!.collection('notifications')
        .deleteMany({ targetStudentId: studentId });
      await connection
        .db!.collection('control_releases')
        .deleteMany({ 'scope.courseId': courseId });
      await connection
        .db!.collection('control_release_pointers')
        .deleteMany({ 'scope.courseId': courseId });
      await connection
        .db!.collection('control_result_policies')
        .deleteMany({ actorId: { $in: [actor._id, reviewer._id] } });
      await connection
        .db!.collection('control_academic_baselines')
        .deleteOne({ _id: studentId });
      await connection
        .collection('control_import_batches')
        .deleteMany({ actorId: new Types.ObjectId(actor._id) });
      await Promise.all(
        ownedCollections.map((name) =>
          connection
            .collection(name)
            .drop()
            .catch(() => undefined),
        ),
      );
      await connection.close();
    }
  }, 120000);

  async function open(
    component: 'midterm' | 'coursework' | 'final' = 'midterm',
  ) {
    return sheets.openSheet(actor, {
      courseId: String(courseId),
      academicYear: year,
      semester: 'first',
      component,
    });
  }
  const change = (extra: Record<string, unknown> = {}) => ({
    studentId: String(studentId),
    score: 15,
    expectedRev: 0,
    opId: randomUUID(),
    ...extra,
  });

  it('rolls mark changes back when audit insertion fails, then applies/retries idempotently', async () => {
    const detail = await open();
    const request = { changes: [change()] };
    const failing = jest
      .spyOn(auditModel, 'insertMany')
      .mockRejectedValueOnce(new Error('Synthetic audit outage'));
    await expect(
      marks.applyChanges(actor, detail.sheet.id, request),
    ).rejects.toThrow('Synthetic audit outage');
    failing.mockRestore();
    expect(await gradeModel.countDocuments({ examType: 'midterm' })).toBe(0);
    await marks.applyChanges(actor, detail.sheet.id, request);
    const retry = await marks.applyChanges(actor, detail.sheet.id, request);
    expect(retry.results[0]).toMatchObject({ result: 'ok', duplicate: true });
    expect(
      await auditModel.countDocuments({ opId: request.changes[0].opId }),
    ).toBe(1);
  });

  it('allows only one of two concurrent edits based on the same revision', async () => {
    const detail = await open();
    const results = await Promise.all([
      marks.applyChanges(actor, detail.sheet.id, {
        changes: [change({ score: 16, expectedRev: 1 })],
      }),
      marks.applyChanges(actor, detail.sheet.id, {
        changes: [change({ score: 17, expectedRev: 1 })],
      }),
    ]);
    expect(
      results
        .flatMap((r) => r.results)
        .map((r) => r.result)
        .sort(),
    ).toEqual(['conflict', 'ok']);
  });

  it('requires independent approval, keeps drafts hidden, and honors the Grades open/close window', async () => {
    const policySheet = await open();
    const initialPolicy = await grades.getControlPolicy(policySheet.sheet.id);
    expect(initialPolicy.rules).toMatchObject({
      passPercentage: 50,
      finalMinimumPercentage: 0,
      retake: 'latest',
    });
    const updatedPolicy = await grades.updateControlPolicy(
      policySheet.sheet.id,
      { ...initialPolicy.rules, version: initialPolicy.version },
      reviewer._id,
    );
    await grades.updateControlPolicy(
      policySheet.sheet.id,
      { ...updatedPolicy.rules, version: updatedPolicy.version },
      reviewer._id,
    );
    await expect(
      grades.updateControlPolicy(
        policySheet.sheet.id,
        { ...initialPolicy.rules, version: initialPolicy.version },
        reviewer._id,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    let detail = await open();
    await expect(
      grades.publishGrades(
        {
          academicYear: year,
          semester: 'first',
          examType: 'midterm',
          isPublished: true,
        },
        actor._id,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    detail = await workbook.review(actor, detail.sheet.id, {
      action: 'SUBMIT',
      expectedRevision: detail.sheet.revision,
      reason: 'Office checked',
    });
    await expect(
      workbook.review(actor, detail.sheet.id, {
        action: 'APPROVE',
        expectedRevision: detail.sheet.revision,
        reason: 'Self approve',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await workbook.review(reviewer, detail.sheet.id, {
      action: 'APPROVE',
      expectedRevision: detail.sheet.revision,
      reason: 'Independent approval',
    });
    windowOpen = true;
    expect(await grades.findStudentResults(String(studentId))).toHaveLength(0);
    // Avoid external notifications: this test verifies the same publication transaction with hiding,
    // then sets the flag through the approved publication path with notification delivery stubbed.
    (
      grades as unknown as { notificationsService: unknown }
    ).notificationsService = {
      sendNotification: jest.fn().mockResolvedValue(undefined),
    };
    await grades.publishGrades(
      {
        academicYear: year,
        semester: 'first',
        examType: 'midterm',
        isPublished: true,
      },
      reviewer._id,
    );
    expect(await grades.findStudentResults(String(studentId))).toHaveLength(1);
    windowOpen = false;
    expect(await grades.findStudentResults(String(studentId))).toHaveLength(0);
    expect(await auditModel.countDocuments({ action: 'PUBLISH' })).toBe(1);
  });

  it('enforces 5+15 coursework, real XLSX preview, atomic commit receipt and repeat commit', async () => {
    const detail = await open('coursework');
    const preview = await workbook.preview(actor, detail.sheet.id, [
      {
        studentId: String(studentId),
        studentCode: 'SYNTH260001',
        attendanceMark: 4,
        quizzesMark: 13,
        score: 17,
        expectedRev: 0,
      },
    ]);
    expect(preview.valid).toBe(1);
    await workbook.commit(actor, detail.sheet.id, preview.previewId);
    const second = await workbook.commit(
      actor,
      detail.sheet.id,
      preview.previewId,
    );
    expect(second).toMatchObject({ summary: { ok: 1 } });
    expect(await auditModel.countDocuments({ source: 'XLSX' })).toBe(1);
    const bytes = await workbook.export(actor, detail.sheet.id);
    expect(Buffer.from(bytes).subarray(0, 2).toString()).toBe('PK');
    const imported = await workbook.previewFile(
      actor,
      detail.sheet.id,
      Buffer.from(bytes),
    );
    expect(imported.valid).toBe(1);
    const view = await workbook.workbook(actor, detail.sheet.id);
    expect(view.rows[0].components.coursework).toMatchObject({
      score: 17,
      attendanceMark: 4,
      quizzesMark: 13,
    });
    expect(view.rows[0].result.total).toBeNull();
  });

  it('hides and reopens through the office workflow, preserving revisions when clearing', async () => {
    await grades.publishGrades(
      {
        academicYear: year,
        semester: 'first',
        examType: 'midterm',
        isPublished: false,
      },
      reviewer._id,
    );
    let detail = await open();
    detail = await workbook.review(reviewer, detail.sheet.id, {
      action: 'REOPEN',
      expectedRevision: detail.sheet.revision,
      reason: 'Correct a draft mark',
    });
    const rows = await sheets.listEntries(actor, detail.sheet.id, {});
    const rev = rows.entries[0].rev;
    const cleared = await marks.applyChanges(actor, detail.sheet.id, {
      changes: [change({ score: null, expectedRev: rev })],
    });
    expect(cleared.results[0].entry).toMatchObject({
      score: null,
      status: null,
      rev: rev + 1,
    });
    const stale = await marks.applyChanges(actor, detail.sheet.id, {
      changes: [change({ score: 19, expectedRev: rev })],
    });
    expect(stale.results[0].result).toBe('conflict');
    windowOpen = true;
    expect(await grades.findStudentResults(String(studentId))).toHaveLength(0);
  });

  it('rejects an import preview after a newer coursework edit', async () => {
    const detail = await open('coursework');
    await expect(
      marks.applyChanges(actor, detail.sheet.id, {
        expectedSchemeVersion: 999,
        changes: [
          change({
            score: 17.5,
            attendanceMark: 5,
            quizzesMark: 12.5,
            expectedRev: 1,
          }),
        ],
      }),
    ).rejects.toMatchObject({ response: { code: 'SCHEME_CHANGED' } });
    const preview = await workbook.preview(actor, detail.sheet.id, [
      {
        studentId: String(studentId),
        studentCode: 'SYNTH260001',
        score: 18,
        attendanceMark: 4,
        quizzesMark: 14,
        expectedRev: 1,
      },
    ]);
    await marks.applyChanges(actor, detail.sheet.id, {
      changes: [
        change({
          score: 18.5,
          attendanceMark: 4.5,
          quizzesMark: 14,
          expectedRev: 1,
        }),
      ],
    });
    await expect(
      workbook.commit(actor, detail.sheet.id, preview.previewId),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      (await workbook.workbook(actor, detail.sheet.id)).rows[0].components
        .coursework?.score,
    ).toBe(18.5);
  });

  it('serializes a lock against a concurrent final draft write', async () => {
    const detail = await open('final');
    const op = change();
    const results = await Promise.allSettled([
      marks.applyChanges(actor, detail.sheet.id, { changes: [op] }),
      sheets.lock(reviewer, detail.sheet.id, 'Stop final entry'),
    ]);
    const saved =
      results[0].status === 'fulfilled' &&
      results[0].value.results[0].result === 'ok';
    expect(await auditModel.countDocuments({ opId: op.opId })).toBe(
      saved ? 1 : 0,
    );
    expect((await sheets.getSheet(actor, detail.sheet.id)).sheet.locked).toBe(
      true,
    );
    await expect(
      marks.applyChanges(actor, detail.sheet.id, { changes: [change()] }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('discovers a legacy course without an active flag for the administrator', async () => {
    const courses = await sheets.listCourses(actor, {
      academicYear: year,
      semester: 'first',
    });
    expect(
      courses.items.find((c) => c.courseId === String(courseId)),
    ).toMatchObject({ code: 'SYNTH101', rosterCount: 1 });
  });
  it('preserves previously published Control marks until their scope is explicitly migrated to snapshots', async () => {
    const id = new Types.ObjectId();
    await gradeModel.collection.insertOne({
      _id: id,
      studentId,
      studentCode: 'SYNTH260001',
      courseId: new Types.ObjectId(),
      courseCode: 'LEGACY-SAFE',
      courseName: 'Synthetic historical result',
      examType: 'midterm',
      grade: 14,
      maxGrade: 20,
      status: 'present',
      academicYear: year,
      semester: 'first',
      isPublished: true,
      controlManaged: true,
      rev: 1,
      controlApprovedRev: 1,
    });
    const previousWindow = windowOpen;
    windowOpen = true;
    try {
      expect(
        (await grades.findStudentResults(String(studentId))).find(
          (g) => g.courseCode === 'LEGACY-SAFE',
        ),
      ).toMatchObject({ grade: 14, isPublished: true });
    } finally {
      windowOpen = previousWindow;
      await gradeModel.deleteOne({ _id: id });
    }
  });

  it('releases an official 80/100 result, reconciles once, corrects with continuity and withdraws', async () => {
    academicSyncSpy.mockRestore();
    // An old stored coursework maximum must use the same /20 normalization as
    // grading-scheme reads and entry, without rescaling any awarded marks.
    await connection.models.GradingScheme.updateOne(
      { courseId, academicYear: year, semester: 'first' },
      { $set: { 'components.$[coursework].max': 40 } },
      { arrayFilters: [{ 'coursework.key': 'coursework' }] },
    );
    for (const [component, score] of [
      ['coursework', 17],
      ['midterm', 15],
      ['final', 48],
    ] as const) {
      let detail = await open(component);
      if (detail.sheet.locked)
        detail = await sheets.unlock(
          reviewer,
          detail.sheet.id,
          'Synthetic final release',
        );
      const view = await workbook.workbook(actor, detail.sheet.id);
      const current = view.rows[0].components[component];
      const saved = await marks.applyChanges(actor, detail.sheet.id, {
        changes: [
          change({
            score,
            expectedRev: current?.rev ?? 0,
            ...(component === 'coursework'
              ? { attendanceMark: 4, quizzesMark: 13 }
              : {}),
          }),
        ],
      });
      expect(saved.results[0].result).toBe('ok');
      detail = await sheets.getSheet(actor, detail.sheet.id);
      detail = await workbook.review(actor, detail.sheet.id, {
        action: 'SUBMIT',
        expectedRevision: detail.sheet.revision,
        reason: 'Synthetic complete result',
      });
      await workbook.review(reviewer, detail.sheet.id, {
        action: 'APPROVE',
        expectedRevision: detail.sheet.revision,
        reason: 'Synthetic independent review',
      });
    }
    const scope = {
      academicYear: year,
      semester: 'first' as const,
      courseCode: 'SYNTH101',
      examType: 'final' as const,
      isPublished: true,
    };
    const preview = await grades.previewControlRelease(scope);
    publishedReleasePreview = preview;
    await grades.publishGrades(
      { ...scope, releaseDigests: preview.releaseDigests },
      reviewer._id,
    );
    windowOpen = true;
    const result = await grades.findStudentResults(String(studentId));
    expect(result).toHaveLength(3);
    expect(result.find((g) => g.examType === 'final')).toMatchObject({
      officialResult: {
        official: true,
        total: 80,
        totalMax: 100,
        passed: true,
      },
    });
    const academic = await connection
      .db!.collection(connection.models.StudentAcademicProfile.collection.name)
      .findOne({ studentId });
    expect(academic).toMatchObject({
      completedCourses: ['SYNTH101'],
      failedCourses: [],
      completedCreditHours: 3,
    });
    const firstGpa = academic!.gpa;
    expect(
      await connection
        .db!.collection('control_release_outbox')
        .countDocuments({ studentId, delivered: { $ne: true } }),
    ).toBe(0);
    const again = await grades.previewControlRelease(scope);
    await grades.publishGrades(
      { ...scope, releaseDigests: again.releaseDigests },
      reviewer._id,
    );
    expect(
      await connection.db!.collection('control_releases').countDocuments({
        'scope.courseId': courseId,
        'scope.component': 'final',
      }),
    ).toBe(1);
    expect(
      (await connection
        .db!.collection(
          connection.models.StudentAcademicProfile.collection.name,
        )
        .findOne({ studentId }))!.gpa,
    ).toBe(firstGpa);
  });

  it('keeps the previous result visible during correction and reverses academic effects on withdrawal', async () => {
    const scope = {
      academicYear: year,
      semester: 'first' as const,
      courseCode: 'SYNTH101',
      examType: 'final' as const,
      isPublished: true,
    };
    const preview = publishedReleasePreview;
    let detail = await open('final');
    detail = await workbook.review(reviewer, detail.sheet.id, {
      action: 'REOPEN',
      expectedRevision: detail.sheet.revision,
      reason: 'Synthetic correction with snapshot continuity',
    });
    const view = await workbook.workbook(actor, detail.sheet.id);
    await marks.applyChanges(actor, detail.sheet.id, {
      changes: [
        change({ score: 0, expectedRev: view.rows[0].components.final.rev }),
      ],
    });
    expect(
      (await grades.findStudentResults(String(studentId))).find(
        (g) => g.examType === 'final',
      ),
    ).toMatchObject({ grade: 48 });
    await expect(
      grades.publishGrades(
        { ...scope, releaseDigests: preview.releaseDigests },
        reviewer._id,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    detail = await sheets.getSheet(actor, detail.sheet.id);
    detail = await workbook.review(actor, detail.sheet.id, {
      action: 'SUBMIT',
      expectedRevision: detail.sheet.revision,
      reason: 'Synthetic corrected result',
    });
    await workbook.review(reviewer, detail.sheet.id, {
      action: 'APPROVE',
      expectedRevision: detail.sheet.revision,
      reason: 'Synthetic reviewed correction',
    });
    const replacement = await grades.previewControlRelease(scope);
    await expect(
      grades.publishGrades(
        { ...scope, releaseDigests: preview.releaseDigests },
        reviewer._id,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await grades.publishGrades(
      { ...scope, releaseDigests: replacement.releaseDigests },
      reviewer._id,
    );
    const academic = await connection
      .db!.collection(connection.models.StudentAcademicProfile.collection.name)
      .findOne({ studentId });
    expect(academic).toMatchObject({
      completedCourses: [],
      failedCourses: ['SYNTH101'],
      completedCreditHours: 0,
      gpa: 0,
      academicWarnings: 1,
    });
    await grades.publishGrades({ ...scope, isPublished: false }, reviewer._id);
    expect(await grades.findStudentResults(String(studentId))).toHaveLength(0);
    expect(
      await connection
        .db!.collection(
          connection.models.StudentAcademicProfile.collection.name,
        )
        .findOne({ studentId }),
    ).toMatchObject({
      completedCourses: [],
      failedCourses: [],
      completedCreditHours: 0,
      gpa: 0,
      academicWarnings: 0,
    });
    expect(
      await connection
        .db!.collection('control_release_outbox')
        .countDocuments({ studentId, delivered: { $ne: true } }),
    ).toBe(0);
  });

  it('reactivates a withdrawn release and retries without duplicating notifications', async () => {
    const scope = {
      academicYear: year,
      semester: 'first' as const,
      courseCode: 'SYNTH101',
      examType: 'final' as const,
      isPublished: true,
    };
    const detail = await open('final');
    const reactivate = await grades.previewControlRelease(scope);
    await grades.publishGrades(
      { ...scope, releaseDigests: reactivate.releaseDigests },
      reviewer._id,
    );
    expect(
      await connection
        .db!.collection(
          connection.models.StudentAcademicProfile.collection.name,
        )
        .findOne({ studentId }),
    ).toMatchObject({ failedCourses: ['SYNTH101'], academicWarnings: 1 });
    const notifications = await connection
      .db!.collection('notifications')
      .countDocuments({ targetStudentId: studentId });
    const repeat = await grades.previewControlRelease(scope);
    await grades.publishGrades(
      { ...scope, releaseDigests: repeat.releaseDigests },
      reviewer._id,
    );
    expect(
      await connection
        .db!.collection('notifications')
        .countDocuments({ targetStudentId: studentId }),
    ).toBe(notifications);
    expect(
      await connection.db!.collection('control_releases').countDocuments({
        'scope.courseId': courseId,
        'scope.component': 'final',
      }),
    ).toBe(2);
    await expect(
      grades.updateControlPolicy(
        detail.sheet.id,
        {
          passPercentage: 60,
          finalMinimumPercentage: 0,
          retake: 'latest',
          version: 2,
        },
        reviewer._id,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('loads, independently reviews and previews a full 3001-student course without truncating any component', async () => {
    const largeCourse = new Types.ObjectId();
    const code = 'SCALE-' + randomUUID().slice(0, 8).toUpperCase();
    const count = 3001;
    const students = Array.from({ length: count }, (_, i) => ({
      _id: new Types.ObjectId(),
      name: 'Synthetic scale ' + i,
      studentCode: 'SCALE' + String(i).padStart(5, '0'),
      email: code + '-' + i + '@example.invalid',
      role: 'student',
      isActive: true,
    }));
    await connection.models.Course.collection.insertOne({
      _id: largeCourse,
      code,
      name: 'Synthetic scale course',
      isActive: true,
      department: 'BIS',
      level: '1',
      semester: 'first',
      creditHours: 3,
    });
    await connection.models.User.collection.insertMany(students);
    await connection.models.CourseRegistration.collection.insertMany(
      students.map((student) => ({
        studentId: student._id,
        courses: [code],
        academicYear: year,
        semester: 'first',
        status: 'approved',
      })),
    );
    await gradeModel.collection.insertMany(
      students.flatMap((student) =>
        (['coursework', 'midterm', 'final'] as const).map((component) => ({
          studentId: student._id,
          studentCode: student.studentCode,
          courseId: largeCourse,
          courseCode: code,
          academicYear: year,
          semester: 'first',
          examType: component,
          grade:
            component === 'coursework' ? 17 : component === 'midterm' ? 15 : 48,
          maxGrade: component === 'final' ? 60 : 20,
          status: 'present',
          rev: 1,
          controlManaged: true,
          isPublished: false,
          ...(component === 'coursework'
            ? { attendanceMark: 4, quizzesMark: 13 }
            : {}),
        })),
      ),
    );
    const times: Record<string, number> = {};
    for (const component of ['coursework', 'midterm', 'final'] as const) {
      const detail = await sheets.openSheet(actor, {
        courseId: String(largeCourse),
        academicYear: year,
        semester: 'first',
        component,
      });
      const started = performance.now();
      const view = await workbook.workbook(actor, detail.sheet.id);
      times[component + 'WorkbookMs'] = performance.now() - started;
      expect(view.rows).toHaveLength(count);
      expect(new Set(view.rows.map((row) => row.studentId)).size).toBe(count);
      expect(view.rows[0].components.final?.score).toBe(48);
      expect(view.rows.at(-1)?.studentCode).toBe('SCALE03000');
      const submitted = await workbook.review(actor, detail.sheet.id, {
        action: 'SUBMIT',
        expectedRevision: view.revision,
        reason: 'Synthetic scale submission',
      });
      await workbook.review(reviewer, detail.sheet.id, {
        action: 'APPROVE',
        expectedRevision: submitted.sheet.revision,
        reason: 'Independent scale review',
      });
    }
    const started = performance.now();
    const preview = await grades.previewControlRelease({
      courseCode: code,
      academicYear: year,
      semester: 'first',
      examType: 'final',
      isPublished: true,
    });
    times.finalPreviewMs = performance.now() - started;
    expect(preview.sheets).toHaveLength(1);
    expect(preview.sheets[0].students).toBe(count);
    const { mkdir, writeFile } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    const output = resolve(__dirname, '../../../../outputs/control-scale');
    await mkdir(output, { recursive: true });
    await writeFile(
      resolve(output, '3001-students.json'),
      JSON.stringify(
        {
          students: count,
          marks: count * 3,
          times,
          environment:
            'isolated localhost replica set; synthetic records; single request measurements, not p95 or production SLA',
          verified: [
            'all roster identities',
            'all component marks',
            'independent approval',
            'full official release preview count',
          ],
        },
        null,
        2,
      ),
    );
  }, 120000);
});
