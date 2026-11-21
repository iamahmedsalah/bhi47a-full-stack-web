import { ControlAttemptsService } from '../../src/modules/control/services/control-attempts.service';
import { ControlEditorCheckpointSchema } from '../../src/modules/control/schemas/control-editor-checkpoint.schema';
import { ControlEditorCheckpointService } from '../../src/modules/control/services/control-editor-checkpoint.service';
import { StudentProfileSchema } from '../../src/modules/students/schemas/student-profile.schema';
import type { Row as ExcelRow } from 'exceljs';
import { ControlReportsService } from '../../src/modules/control/services/control-reports.service';
import { EXAM_TYPE_VALUES, PERMISSIONS } from '@student-portal/shared';
import { SystemSettingsSchema } from '../../src/modules/complaints/schemas/system-settings.schema';
import { StudentAcademicProfileSchema } from '../../src/modules/registrations/schemas/student-academic-profile.schema';
import mongoose, { Types } from 'mongoose';
import type { Connection } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
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
import { CourseQuizSchema } from '../../src/modules/grades/schemas/course-quiz.schema';
import { UserSchema } from '../../src/modules/users/schemas/user.schema';
import { CourseRegistrationSchema } from '../../src/modules/registrations/schemas/course-registration.schema';
import { CourseStaffAssignmentSchema } from '../../src/modules/attendance/schemas/course-staff-assignment.schema';
import { ControlAccessService } from '../../src/modules/control/services/control-access.service';
import { ControlSheetsService } from '../../src/modules/control/services/control-sheets.service';
import { ControlGradesService } from '../../src/modules/control/services/control-grades.service';
import { GradingSchemeService } from '../../src/modules/control/services/grading-scheme.service';
import { ControlWorkbookService } from '../../src/modules/control/services/control-workbook.service';
import { ControlGraceService } from '../../src/modules/control/services/control-grace.service';
import { GradesService } from '../../src/modules/grades/grades.service';
import type { AuthenticatedUser } from '../../src/modules/auth/types/authenticated-request';

describe('Control real replica-set persistence, approval and Grades visibility', () => {
  let connection: Connection;
  let checkpoints: ControlEditorCheckpointService;
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
    const checkpointCollection = `${prefix}_ControlEditorCheckpoint`;
    ownedCollections.push(checkpointCollection);
    // Preserve the schema's string _id instead of adding Document's ObjectId.
    const checkpointModel = connection.model(
      'ControlEditorCheckpoint',
      ControlEditorCheckpointSchema,
      checkpointCollection,
    );
    const settingsModel = model('SystemSettings', SystemSettingsSchema);
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
        settingsModel,
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
    checkpoints = new ControlEditorCheckpointService(
      checkpointModel,
      access,
      sheets,
    );
    grades = new GradesService(
      grade as never,
      model('CourseQuiz', CourseQuizSchema) as never,
      userModel as never,
      courseModel as never,
      studentProfile as never,
      academicProfile as never,
      settingsModel as never,
      sheetModel as never,
      {} as never,
      audit as never,
    );
    // Production responds after commit; this fixture explicitly drains durable
    // work before assertions about academic effects and notifications.
    jest
      .spyOn(grades, 'scheduleControlReleases')
      .mockReturnValue({ scheduled: true });
    const publish = grades.publishGrades.bind(grades);
    jest.spyOn(grades, 'publishGrades').mockImplementation(async (...args) => {
      const result = await publish(...args);
      await grades.processControlReleases();
      return result;
    });
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
      studentProfile as never,
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
      new ControlAttemptsService(grade as never, access, sheets, schemeService),
      connection.model('StudentProfile') as never,
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

  it('isolates resume positions by actor and sheet and clears them without changing grades', async () => {
    const midterm = await open();
    const final = await open('final');
    const position = {
      expectedActorId: actor._id,
      studentId: studentId.toHexString(),
      field: 'raw',
      sort: 'code',
      descending: true,
      filter: 'all',
      onlyMissing: false,
      search: '',
    } as const;
    const gradeCount = await gradeModel.countDocuments();
    await checkpoints.save(actor, midterm.sheet.id, position);
    expect(await checkpoints.get(actor, midterm.sheet.slug)).toMatchObject({
      studentId: position.studentId,
      descending: true,
    });
    expect(await checkpoints.get(reviewer, midterm.sheet.id)).toBeNull();
    expect(await checkpoints.get(actor, final.sheet.id)).toBeNull();
    await expect(
      checkpoints.save(reviewer, midterm.sheet.id, position),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      checkpoints.get(
        {
          ...reviewer,
          role: 'staff',
          permissions: [
            PERMISSIONS.CONTROL_ACCESS,
            PERMISSIONS.CONTROL_SHEETS_VIEW,
          ],
        },
        midterm.sheet.id,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await checkpoints.save(actor, midterm.sheet.id, {
      ...position,
      studentId: null,
    });
    expect(await checkpoints.get(actor, midterm.sheet.id)).toMatchObject({
      studentId: null,
    });
    expect(await gradeModel.countDocuments()).toBe(gradeCount);
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

  it('versions result policies and rejects stale policy updates', async () => {
    const policySheet = await open();
    const initialPolicy = await grades.getControlPolicy(policySheet.sheet.id);
    expect(initialPolicy.rules).toMatchObject({
      passPercentage: 50,
      finalMinimumPercentage: 0,
      retake: 'best',
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
  });

  it('requires independent approval, keeps drafts hidden, and honors the Grades open/close window', async () => {
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
    const doctor: AuthenticatedUser = {
      ...actor,
      role: 'staff',
      permissions: [
        PERMISSIONS.CONTROL_ACCESS,
        PERMISSIONS.CONTROL_SHEETS_VIEW,
        PERMISSIONS.CONTROL_SCOPE_ALL,
        PERMISSIONS.CONTROL_GRADES_ENTER,
      ],
    };
    const control: AuthenticatedUser = {
      ...reviewer,
      role: 'staff',
      permissions: [
        PERMISSIONS.CONTROL_ACCESS,
        PERMISSIONS.CONTROL_SHEETS_VIEW,
        PERMISSIONS.CONTROL_SCOPE_ALL,
        PERMISSIONS.CONTROL_GRADES_REVIEW_EDIT,
        PERMISSIONS.CONTROL_SHEETS_REVIEW,
      ],
    };
    expect(
      (await sheets.getSheet(doctor, detail.sheet.id)).capabilities.canEdit,
    ).toBe(false);
    expect(
      (await sheets.getSheet(control, detail.sheet.id)).capabilities.canEdit,
    ).toBe(true);
    const beforeCorrection = await gradeModel
      .findOne({
        courseId,
        studentId,
        academicYear: year,
        examType: 'midterm',
        cleared: { $ne: true },
      })
      .lean();
    expect(beforeCorrection).not.toBeNull();
    await expect(
      marks.applyChanges(doctor, detail.sheet.id, {
        changes: [
          change({
            score: 12,
            status: 'present',
            expectedRev: beforeCorrection!.rev ?? 0,
          }),
        ],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const corrected = await marks.applyChanges(control, detail.sheet.id, {
      changes: [
        change({
          score: 12,
          status: 'present',
          expectedRev: beforeCorrection!.rev ?? 0,
        }),
      ],
    });
    expect(corrected.summary.ok).toBe(1);
    const restored = await marks.applyChanges(control, detail.sheet.id, {
      changes: [
        change({
          score: ['absent', 'banned', 'excused', 'incomplete'].includes(
            beforeCorrection!.status,
          )
            ? null
            : beforeCorrection!.grade,
          status: beforeCorrection!.status,
          expectedRev: corrected.results[0].entry!.rev,
        }),
      ],
    });
    expect(restored.summary.ok).toBe(1);
    detail = await sheets.getSheet(actor, detail.sheet.id);
    detail = await workbook.review(actor, detail.sheet.id, {
      action: 'SUBMIT_APPROVAL',
      expectedRevision: detail.sheet.revision,
      reason: 'Control review complete',
    });
    expect(detail.sheet.workflowState).toBe('PENDING_APPROVAL');
    await expect(
      marks.applyChanges(actor, detail.sheet.id, {
        changes: [
          change({ score: 12, expectedRev: restored.results[0].entry!.rev }),
        ],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      workbook.review(
        { ...actor, role: 'staff', permissions: Object.values(PERMISSIONS) },
        detail.sheet.id,
        {
          action: 'APPROVE',
          expectedRevision: detail.sheet.revision,
          reason: 'Self approve',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const reviewOnlyTA: AuthenticatedUser = {
      ...reviewer,
      role: 'staff',
      permissions: [
        PERMISSIONS.CONTROL_ACCESS,
        PERMISSIONS.CONTROL_SHEETS_VIEW,
        PERMISSIONS.CONTROL_SCOPE_ALL,
        PERMISSIONS.CONTROL_SHEETS_REVIEW,
      ],
    };
    await expect(
      workbook.review(reviewOnlyTA, detail.sheet.id, {
        action: 'APPROVE',
        expectedRevision: detail.sheet.revision,
        reason: 'Unauthorized TA approval',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await workbook.review(
      {
        ...reviewOnlyTA,
        permissions: [
          PERMISSIONS.CONTROL_ACCESS,
          PERMISSIONS.CONTROL_SHEETS_VIEW,
          PERMISSIONS.CONTROL_SCOPE_ALL,
          PERMISSIONS.CONTROL_SHEETS_APPROVE,
        ],
      },
      detail.sheet.id,
      {
        action: 'APPROVE',
        expectedRevision: detail.sheet.revision,
        reason: 'Independent approval',
      },
    );
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

  it('persists component visibility and a matching student/course exception', async () => {
    windowOpen = true;
    try {
      await grades.updateGradesSettings({
        gradesPublishedExamTypes: ['final'],
      });
      expect(await grades.findStudentResults(String(studentId))).toHaveLength(
        0,
      );
      await grades.updateGradesSettings({
        gradesVisibilityRules: [
          {
            courseCode: 'SYNTH101',
            studentCode: 'SYNTH260001',
            examType: 'midterm',
            isVisible: true,
          },
        ],
      });
      expect(await grades.findStudentResults(String(studentId))).toHaveLength(
        1,
      );
    } finally {
      await grades.updateGradesSettings({
        gradesPublishedExamTypes: [...EXAM_TYPE_VALUES],
        gradesVisibilityRules: [],
      });
      windowOpen = false;
    }
  });

  it('persists course-level visibility for an enrolled higher-level student', async () => {
    windowOpen = true;
    const profiles = connection.collection(`${prefix}_StudentProfile`);
    const courses = connection.collection(`${prefix}_Course`);
    try {
      await profiles.updateOne({ userId: studentId }, { $set: { level: '3' } });
      await courses.updateOne(
        { _id: courseId },
        { $set: { academicLevel: '1' } },
      );
      await grades.updateGradesSettings({
        gradesLevelBasis: 'student',
        gradesPublishedLevels: ['1'],
      });
      expect(await grades.findStudentResults(String(studentId))).toHaveLength(
        0,
      );
      await grades.updateGradesSettings({ gradesLevelBasis: 'course' });
      expect(await grades.findStudentResults(String(studentId))).toHaveLength(
        1,
      );
    } finally {
      await profiles.updateOne({ userId: studentId }, { $set: { level: '1' } });
      await courses.updateOne(
        { _id: courseId },
        { $unset: { academicLevel: '' } },
      );
      await grades.updateGradesSettings({
        gradesLevelBasis: 'student',
        gradesPublishedLevels: ['1', '2', '3', '4'],
      });
      windowOpen = false;
    }
  });

  it('withholds published results during a tuition hold and restores them after removal', async () => {
    windowOpen = true;
    const profiles = connection.collection(`${prefix}_StudentProfile`);
    const quizzes = connection.collection(`${prefix}_CourseQuiz`);
    try {
      await quizzes.insertOne({
        studentId,
        courseId,
        courseCode: 'SYNTH101',
        academicYear: '2097-2098',
        isPublished: true,
        quizzes: [],
      });
      await profiles.updateOne(
        { userId: studentId },
        { $set: { isBlocked: true, tuitionFeesStatus: 'unpaid' } },
      );
      const blocked =
        await GradesService.prototype.getStudentResultsStatus.call(
          grades,
          String(studentId),
        );
      expect(blocked).toMatchObject({
        isOpen: false,
        reason: 'tuition_blocked',
      });
      expect(await grades.findStudentResults(String(studentId))).toEqual([]);
      expect(await grades.findStudentQuizzes(String(studentId))).toEqual([]);
      await profiles.updateOne(
        { userId: studentId },
        { $set: { isBlocked: false, tuitionFeesStatus: 'paid' } },
      );
      const restored =
        await GradesService.prototype.getStudentResultsStatus.call(
          grades,
          String(studentId),
        );
      expect(restored.isOpen).toBe(true);
      expect(restored.visibilityVersion).not.toBe(blocked.visibilityVersion);
      expect(await grades.findStudentQuizzes(String(studentId))).toHaveLength(
        1,
      );
      expect(
        await grades.publishGrades(
          {
            academicYear: '2097-2098',
            isPublished: false,
          },
          actor._id,
        ),
      ).toEqual({ count: 0 });
      expect(await quizzes.findOne({ studentId })).toMatchObject({
        isPublished: true,
      });
      await grades.updateGradesSettings({
        gradesSystemOpen: false,
        gradesPublishedLevels: [],
        gradesPublishedExamTypes: [],
        gradesOpenAt: '2099-01-01T00:00:00Z',
      });
      expect(await grades.findStudentQuizzes(String(studentId))).toHaveLength(
        1,
      );
      await quizzes.updateOne({ studentId }, { $set: { isPublished: false } });
      expect(await grades.findStudentQuizzes(String(studentId))).toEqual([]);
      await grades.updateGradesSettings({
        gradesSystemOpen: true,
        gradesPublishedLevels: ['1', '2', '3', '4'],
        gradesPublishedExamTypes: ['coursework', 'midterm', 'final'],
        gradesOpenAt: null,
      });
      expect(await grades.findStudentResults(String(studentId))).toHaveLength(
        1,
      );
    } finally {
      await quizzes.deleteMany({ studentId });
      await grades.updateGradesSettings({
        gradesSystemOpen: true,
        gradesPublishedLevels: ['1', '2', '3', '4'],
        gradesPublishedExamTypes: ['coursework', 'midterm', 'final'],
        gradesOpenAt: null,
      });
      await profiles.updateOne(
        { userId: studentId },
        { $set: { isBlocked: false, tuitionFeesStatus: 'paid' } },
      );
      windowOpen = false;
    }
  });

  it('persists the master override without changing release evidence', async () => {
    windowOpen = true;
    try {
      await grades.updateGradesSettings({ gradesSystemOpen: false });
      expect(await grades.findStudentResults(String(studentId))).toHaveLength(
        0,
      );
      expect(await auditModel.countDocuments({ action: 'PUBLISH' })).toBe(1);
    } finally {
      await grades.updateGradesSettings({ gradesSystemOpen: true });
      windowOpen = false;
    }
  });

  it('persists and clears a validated Cairo-compatible publication window', async () => {
    windowOpen = true;
    try {
      await grades.updateGradesSettings({
        gradesOpenAt: '2098-01-01T00:00:00Z',
        gradesCloseAt: '2099-01-01T00:00:00Z',
      });
      expect(await grades.findStudentResults(String(studentId))).toHaveLength(
        0,
      );
      await expect(
        grades.updateGradesSettings({ gradesOpenAt: '2100-01-01T00:00:00Z' }),
      ).rejects.toThrow('Closing time must be after opening time');
      await grades.updateGradesSettings({
        gradesOpenAt: null,
        gradesCloseAt: null,
      });
      expect(await grades.getGradesSettings()).toMatchObject({
        gradesOpenAt: undefined,
        gradesCloseAt: undefined,
      });
      expect(await grades.findStudentResults(String(studentId))).toHaveLength(
        1,
      );
    } finally {
      await grades.updateGradesSettings({
        gradesOpenAt: null,
        gradesCloseAt: null,
      });
      windowOpen = false;
    }
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
    expect(imported).toMatchObject({ valid: 0, skipped: 1, errors: [] });
    expect(await auditModel.countDocuments({ source: 'XLSX' })).toBe(1);
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
    const newerEdit = await marks.applyChanges(actor, detail.sheet.id, {
      changes: [
        change({
          score: 19,
          attendanceMark: 5,
          quizzesMark: 14,
          expectedRev: 1,
        }),
      ],
    });
    expect(newerEdit.summary).toMatchObject({ ok: 1, invalid: 0, conflict: 0 });
    expect(newerEdit.results[0].entry).toMatchObject({ score: 19, rev: 2 });
    await expect(
      workbook.commit(actor, detail.sheet.id, preview.previewId),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      (await workbook.workbook(actor, detail.sheet.id)).rows[0].components
        .coursework?.score,
    ).toBe(19);
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
      detail = await workbook.review(actor, detail.sheet.id, {
        action: 'SUBMIT_APPROVAL',
        expectedRevision: detail.sheet.revision,
        reason: 'Control review complete',
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
    const approved = await sheets.listCourses(actor, {
      academicYear: year,
      semester: 'first',
    });
    const finalBefore = approved.items
      .find((entry) => entry.code === 'SYNTH101')
      ?.components.find((entry) => entry.key === 'final');
    expect(finalBefore).toMatchObject({
      workflowState: 'APPROVED',
      releaseActive: false,
    });
    expect(
      (await workbook.workbook(actor, finalBefore!.sheetId!)).componentStates,
    ).toEqual({
      coursework: 'APPROVED',
      midterm: 'APPROVED',
      final: 'APPROVED',
    });
    await grades.publishGrades(
      { ...scope, releaseDigests: preview.releaseDigests },
      reviewer._id,
    );
    windowOpen = true;
    const published = await sheets.listCourses(actor, {
      academicYear: year,
      semester: 'first',
    });
    expect(
      published.items
        .find((entry) => entry.code === 'SYNTH101')
        ?.components.find((entry) => entry.key === 'final'),
    ).toMatchObject({ releaseActive: true });
    const result = await grades.findStudentResults(String(studentId));
    expect(result).toHaveLength(2);
    expect(result.some((grade) => grade.examType === 'coursework')).toBe(false);
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
    detail = await workbook.review(actor, detail.sheet.id, {
      action: 'SUBMIT_APPROVAL',
      expectedRevision: detail.sheet.revision,
      reason: 'Control review complete',
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
  it.each([true, false])(
    'approves confirmed blank exams and publishes complete students (financial hold: %s)',
    async (financialHold) => {
      const id = new Types.ObjectId();
      const code = 'HOLD-' + randomUUID().slice(0, 8).toUpperCase();
      const entered = new Types.ObjectId(),
        held = new Types.ObjectId();
      await connection.models.Course.collection.insertOne({
        _id: id,
        code,
        name: 'Financial deferral fixture',
        isActive: true,
        department: 'BIS',
        level: '1',
        semester: 'first',
        creditHours: 3,
      });
      await connection.models.User.collection.insertMany(
        [entered, held].map((studentId, i) => ({
          _id: studentId,
          name: 'Hold fixture ' + i,
          studentCode: code + i,
          role: 'student',
          isActive: true,
        })),
      );
      await connection.models.CourseRegistration.collection.insertMany(
        [entered, held].map((studentId) => ({
          studentId,
          courses: [code],
          academicYear: year,
          semester: 'first',
          status: 'approved',
        })),
      );
      await connection.models.StudentProfile.collection.insertOne({
        userId: held,
        isBlocked: financialHold,
        tuitionFeesStatus: financialHold ? 'unpaid' : 'paid',
      });
      await gradeModel.collection.insertMany(
        (['coursework', 'midterm', 'final'] as const).flatMap((component) =>
          [entered, held]
            .filter(
              (studentId) =>
                studentId === entered || component === 'coursework',
            )
            .map((studentId) => ({
              studentId,
              studentCode: code + (studentId === entered ? 0 : 1),
              courseId: id,
              courseCode: code,
              academicYear: year,
              semester: 'first',
              examType: component,
              grade:
                component === 'coursework'
                  ? 17
                  : component === 'midterm'
                    ? 25
                    : 38,
              maxGrade:
                component === 'coursework'
                  ? 20
                  : component === 'midterm'
                    ? 30
                    : 50,
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
      for (const component of ['coursework', 'midterm', 'final'] as const) {
        let detail = await sheets.openSheet(actor, {
          courseId: String(id),
          academicYear: year,
          semester: 'first',
          component,
        });
        for (const action of ['SUBMIT', 'SUBMIT_APPROVAL', 'APPROVE'] as const)
          detail = await workbook.review(actor, detail.sheet.id, {
            action,
            expectedRevision: detail.sheet.revision,
            allowMissing: true,
          });
        const snapshot = await connection.models.ControlSheet.findById(
          detail.sheet.id,
        ).lean<{
          tuitionDeferredStudentIds: string[];
          unenteredStudentIds: string[];
        }>();
        expect(snapshot?.tuitionDeferredStudentIds).toEqual(
          component === 'coursework' || !financialHold ? [] : [String(held)],
        );
        expect(snapshot?.unenteredStudentIds).toEqual(
          component === 'coursework' ? [] : [String(held)],
        );
      }
      const scope = {
        academicYear: year,
        semester: 'first' as const,
        courseCode: code,
        examType: 'final' as const,
        isPublished: true,
      };
      const preview = await grades.previewControlRelease(scope);
      expect(preview.sheets[0].students).toBe(1);
      await grades.publishGrades(
        { ...scope, releaseDigests: preview.releaseDigests },
        actor._id,
      );
      // Removing the financial hold does not fabricate a grade or a new result.
      await connection.models.StudentProfile.updateOne(
        { userId: held },
        { $set: { isBlocked: false, tuitionFeesStatus: 'paid' } },
      );
      expect(
        await gradeModel.countDocuments({
          courseId: id,
          studentId: held,
          examType: { $in: ['midterm', 'final'] },
        }),
      ).toBe(0);
      const release = await connection
        .db!.collection('control_releases')
        .findOne({ 'scope.courseId': id, 'scope.component': 'final' });
      expect(release?.results).toHaveLength(1);
      expect(String(release?.results[0].studentId)).toBe(String(entered));
      expect(release?.results[0].result.total).toBe(80);
      expect(
        (await grades.previewControlRelease(scope)).sheets[0].students,
      ).toBe(1);
    },
  );
  it('applies midterm grace once, caps marks and safely retries concurrent requests', async () => {
    const id = new Types.ObjectId();
    const code = 'GRACE-' + randomUUID().slice(0, 8).toUpperCase();
    const students = Array.from({ length: 8 }, () => new Types.ObjectId());
    await connection.models.Course.collection.insertOne({
      _id: id,
      code,
      name: 'Grace fixture',
      isActive: true,
      department: 'BIS',
      level: '1',
      semester: 'first',
      creditHours: 3,
    });
    await connection.models.User.collection.insertMany(
      students.map((_id, i) => ({
        _id,
        studentCode: code + i,
        name: 'Grace student ' + i,
        role: 'student',
        isActive: true,
      })),
    );
    await connection.models.CourseRegistration.collection.insertMany(
      students.map((studentId) => ({
        studentId,
        courses: [code],
        academicYear: year,
        semester: 'first',
        status: 'approved',
      })),
    );
    await connection.models.StudentProfile.collection.insertOne({
      userId: students[6],
      isBlocked: true,
      tuitionFeesStatus: 'unpaid',
    });
    await gradeModel.collection.insertMany(
      [0, 1, 28, 30, 0, 0, 10].map((grade, i) => ({
        studentId: students[i],
        studentCode: code + i,
        courseId: id,
        courseCode: code,
        academicYear: year,
        semester: 'first',
        examType: 'midterm',
        grade,
        maxGrade: 30,
        status: i === 4 ? 'absent' : i === 5 ? 'banned' : 'present',
        rev: 1,
        isPublished: false,
      })),
    );
    const detail = await sheets.openSheet(actor, {
      courseId: String(id),
      academicYear: year,
      semester: 'first',
      component: 'midterm',
    });
    const grace = new ControlGraceService(
      connection.models.ControlSheet as never,
      gradeModel,
      connection.models.StudentProfile as never,
      auditModel,
      new ControlAccessService(
        connection.models.Course as never,
        connection.models.CourseStaffAssignment as never,
      ),
      sheets,
      new GradingSchemeService(
        connection.models.GradingScheme as never,
        gradeModel,
        auditModel,
      ),
    );
    const preview = await grace.preview(actor, detail.sheet.id, {
      amount: 5,
      expectedRevision: detail.sheet.revision,
    });
    expect(preview.counts).toMatchObject({
      changed: 3,
      capped: 1,
      absentOrBanned: 2,
      held: 1,
      unentered: 1,
    });
    const dto = {
      amount: 5,
      expectedRevision: detail.sheet.revision,
      digest: preview.digest,
      operationId: randomUUID(),
    };
    const [first, retry] = await Promise.all([
      grace.apply(actor, detail.sheet.id, dto),
      grace.apply(actor, detail.sheet.id, dto),
    ]);
    expect(first).toEqual(retry);
    const stored = await gradeModel
      .find({ courseId: id })
      .sort({ studentCode: 1 })
      .lean();
    expect(stored.map((mark) => mark.grade)).toEqual([5, 6, 30, 30, 0, 0, 10]);
    expect(stored.map((mark) => mark.rev)).toEqual([2, 2, 2, 1, 1, 1, 1]);
    expect(
      await gradeModel.countDocuments({ courseId: id, studentId: students[7] }),
    ).toBe(0);
    expect(
      await auditModel.countDocuments({ courseId: id, action: 'GRACE' }),
    ).toBe(4);
    await expect(
      grace.apply(actor, detail.sheet.id, {
        ...dto,
        operationId: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      (await sheets.getSheet(actor, detail.sheet.id)).sheet.grace,
    ).toMatchObject({ amount: 5, changed: 3 });
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
          maxGrade:
            component === 'final' ? 50 : component === 'midterm' ? 30 : 20,
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
      let submitted = await workbook.review(actor, detail.sheet.id, {
        action: 'SUBMIT',
        expectedRevision: view.revision,
        reason: 'Synthetic scale submission',
      });
      submitted = await workbook.review(actor, detail.sheet.id, {
        action: 'SUBMIT_APPROVAL',
        expectedRevision: submitted.sheet.revision,
        reason: 'Control scale review complete',
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
    const output = fileURLToPath(
      new URL('../../../../outputs/control-scale/', import.meta.url),
    );
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
  it('commits a 501-row XLSX in two idempotent batches without changing the default scheme version', async () => {
    const largeCourse = new Types.ObjectId();
    const code = 'BATCH-' + randomUUID().slice(0, 8).toUpperCase();
    const students = Array.from({ length: 501 }, (_, i) => ({
      _id: new Types.ObjectId(),
      name: 'Synthetic batch ' + i,
      studentCode: code + '-' + String(i).padStart(4, '0'),
      email: code + '-' + i + '@example.invalid',
      role: 'student',
      isActive: true,
    }));
    await connection.models.Course.collection.insertOne({
      _id: largeCourse,
      code,
      name: 'Synthetic import course',
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
    const detail = await sheets.openSheet(actor, {
      courseId: String(largeCourse),
      academicYear: year,
      semester: 'first',
      component: 'midterm',
    });
    const { default: ExcelJS } = await import('exceljs');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(
      await workbook.template(actor, detail.sheet.id, 'midterm'),
    );
    expect(book.worksheets).toHaveLength(1);
    const page = book.worksheets[0];
    for (let row = 2; row <= 502; row++) page.getCell('C' + row).value = 15;
    const bytes = Buffer.from(await book.xlsx.writeBuffer());
    const first = await workbook.previewFile(actor, detail.sheet.id, bytes, 0);
    const initialSecond = await workbook.previewFile(
      actor,
      detail.sheet.id,
      bytes,
      1,
    );
    expect(first.valid).toBe(500);
    expect(initialSecond.valid).toBe(1);
    const firstResult = await workbook.commit(
      actor,
      detail.sheet.id,
      first.previewId,
    );
    expect(firstResult).toMatchObject({ summary: { ok: 500 } });
    await expect(
      workbook.commit(actor, detail.sheet.id, first.previewId),
    ).resolves.toEqual(firstResult);
    await expect(
      workbook.commit(actor, detail.sheet.id, initialSecond.previewId),
    ).rejects.toThrow('Preview is stale');
    const second = await workbook.previewFile(actor, detail.sheet.id, bytes, 1);
    const result = await workbook.commit(
      actor,
      detail.sheet.id,
      second.previewId,
    );
    expect(result).toMatchObject({ summary: { ok: 1 } });
    expect(await gradeModel.countDocuments({ courseId: largeCourse })).toBe(
      501,
    );
    expect(
      await auditModel.countDocuments({
        courseId: largeCourse,
        source: 'XLSX',
      }),
    ).toBe(501);
    expect(
      (await workbook.workbook(actor, detail.sheet.id)).rows.filter(
        (row) => row.score === 15,
      ),
    ).toHaveLength(501);
  }, 120000);
  it.each(['absent', 'banned', 'incomplete'] as const)(
    'publishes a %s final with retained contributions and no student coursework payload',
    async (status) => {
      const learner = new Types.ObjectId(),
        course = new Types.ObjectId();
      const code = `SYNTH-${status.toUpperCase()}`;
      await connection.models.User.collection.insertOne({
        _id: learner,
        role: 'student',
        studentCode: code,
        name: 'Synthetic status learner',
      });
      await connection.models.Course.collection.insertOne({
        _id: course,
        code,
        name: 'Synthetic exam status',
        creditHours: 3,
        academicLevel: '1',
        isActive: true,
      });
      await connection.models.StudentProfile.collection.insertOne({
        userId: learner,
        studentCode: code,
        fullName: 'Synthetic status learner',
        academicYear: year,
        semester: 'first',
        level: '1',
        isBlocked: false,
      });
      await connection.models.CourseRegistration.collection.insertOne({
        studentId: learner,
        academicYear: year,
        semester: 'first',
        courses: [code],
        status: 'approved',
      });
      await connection.models.StudentAcademicProfile.collection.insertOne({
        studentId: learner,
        academicLevel: '1',
        semester: 'first',
        gpa: 0,
        completedCourses: [],
        failedCourses: [],
        lowGradeCourses: [],
        academicWarnings: 0,
        completedCreditHours: 0,
      });
      for (const component of ['coursework', 'midterm', 'final'] as const) {
        let detail = await sheets.openSheet(actor, {
          courseId: String(course),
          academicYear: year,
          semester: 'first',
          component,
        });
        const saved = await marks.applyChanges(actor, detail.sheet.id, {
          changes: [
            {
              studentId: String(learner),
              score:
                component === 'final'
                  ? null
                  : component === 'midterm'
                    ? 15
                    : 17,
              status: component === 'final' ? status : 'present',
              expectedRev: 0,
              opId: randomUUID(),
              ...(component === 'coursework'
                ? { attendanceMark: 4, quizzesMark: 13 }
                : {}),
            },
          ],
        });
        expect(saved.results[0].result).toBe('ok');
        detail = await sheets.getSheet(actor, detail.sheet.id);
        detail = await workbook.review(actor, detail.sheet.id, {
          action: 'SUBMIT',
          expectedRevision: detail.sheet.revision,
          reason: 'Synthetic status submission',
        });
        detail = await workbook.review(actor, detail.sheet.id, {
          action: 'SUBMIT_APPROVAL',
          expectedRevision: detail.sheet.revision,
          reason: 'Control review complete',
        });
        await workbook.review(actor, detail.sheet.id, {
          action: 'APPROVE',
          expectedRevision: detail.sheet.revision,
          reason: 'Synthetic admin self approval',
        });
      }
      const scope = {
        academicYear: year,
        semester: 'first' as const,
        courseCode: code,
        examType: 'final' as const,
        isPublished: true,
      };
      const preview = await grades.previewControlRelease(scope);
      await grades.publishGrades(
        { ...scope, releaseDigests: preview.releaseDigests },
        actor._id,
      );
      await grades.updateGradesSettings({
        gradesSystemOpen: true,
        gradesLevelBasis: 'course',
        gradesPublishedLevels: ['1'],
        gradesPublishedExamTypes: ['midterm', 'final'],
        gradesOpenAt: null,
        gradesCloseAt: null,
      });
      windowOpen = true;
      try {
        const visible = await grades.findStudentResults(String(learner));
        expect(visible).toHaveLength(2);
        expect(visible.some((grade) => grade.examType === 'coursework')).toBe(
          false,
        );
        expect(
          visible.find((grade) => grade.examType === 'midterm'),
        ).toMatchObject({ grade: 15, status: 'present' });
        const final = visible.find((grade) => grade.examType === 'final');
        expect(final).toMatchObject({
          grade: 0,
          status,
          officialResult: {
            official: status !== 'incomplete',
            total: status === 'incomplete' ? null : 32,
            totalMax: 100,
            passed: false,
            gradePoints: status === 'incomplete' ? null : 0,
            letterGrade:
              status === 'incomplete' ? 'IC' : status === 'banned' ? 'FX' : 'F',
          },
        });
        expect(final).not.toHaveProperty('officialResult.components');
      } finally {
        windowOpen = false;
      }
    },
    60000,
  );
  it('resets only one course/term, keeps enrolments and audit, and withdraws snapshots', async () => {
    const dto = {
      courseCode: 'SYNTH-INCOMPLETE',
      academicYear: year,
      semester: 'first' as const,
      confirmation: 'SYNTH-INCOMPLETE',
      reason: 'Remove synthetic course test marks',
    };
    await expect(
      grades.resetControlCourse({ ...dto, confirmation: 'WRONG' }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    const course = await connection.models.Course.findOne({
      code: dto.courseCode,
    })
      .select('_id')
      .lean<{ _id: Types.ObjectId }>();
    if (!course) throw new Error('Synthetic reset course fixture is missing');
    const before = await gradeModel.countDocuments({
      courseCode: 'SYNTH101',
      cleared: { $ne: true },
    });
    const historyCount = await connection
      .db!.collection('control_releases')
      .countDocuments({ 'scope.courseId': course._id });
    const leaseId = new Types.ObjectId('0000000000000000000000c1');
    await connection.db!.collection('control_reconciliation_leases').updateOne(
      { _id: leaseId },
      {
        $set: {
          token: 'synthetic-busy-reset',
          expiresAt: new Date(Date.now() + 60000),
        },
      },
      { upsert: true },
    );
    try {
      await expect(grades.resetControlCourse(dto, actor)).rejects.toMatchObject(
        { response: { code: 'CONTROL_RESET_BUSY' } },
      );
      expect(
        await gradeModel.countDocuments({
          courseCode: dto.courseCode,
          cleared: { $ne: true },
        }),
      ).toBe(3);
    } finally {
      await connection
        .db!.collection('control_reconciliation_leases')
        .deleteOne({ _id: leaseId, token: 'synthetic-busy-reset' });
    }
    const result = await grades.resetControlCourse(dto, actor);
    expect(result.cleared).toBe(3);
    expect(
      await gradeModel.countDocuments({
        courseCode: dto.courseCode,
        cleared: { $ne: true },
      }),
    ).toBe(0);
    expect(
      await gradeModel.countDocuments({
        courseCode: 'SYNTH101',
        cleared: { $ne: true },
      }),
    ).toBe(before);
    expect(
      await connection
        .db!.collection('control_release_pointers')
        .countDocuments({ 'scope.courseId': course._id, active: true }),
    ).toBe(0);
    expect(
      await connection
        .db!.collection('control_releases')
        .countDocuments({ 'scope.courseId': course._id }),
    ).toBe(historyCount);
    const summary = await sheets.listCourses(actor, {
      academicYear: year,
      semester: 'first',
    });
    expect(
      summary.items
        .find((entry) => entry.code === dto.courseCode)
        ?.components.every(
          (entry) =>
            entry.workflowState === 'DRAFT' &&
            !entry.releaseActive &&
            entry.entered === 0,
        ),
    ).toBe(true);
    expect(
      await auditModel.countDocuments({
        courseId: course._id,
        action: 'CLEAR',
        reason: dto.reason,
      }),
    ).toBe(3);
    expect(
      await connection.models.CourseRegistration.countDocuments({
        courses: dto.courseCode,
      }),
    ).toBe(1);
    await grades.processControlReleases();
  });
  it('exports real course and level reports with fees and missing registration', async () => {
    const reportCourse = new Types.ObjectId();
    const code = 'REPORT-' + randomUUID().slice(0, 8).toUpperCase();
    const enrolled = new Types.ObjectId(),
      unregistered = new Types.ObjectId();
    await connection.models.Course.collection.insertOne({
      _id: reportCourse,
      code,
      name: 'Report course',
      isActive: true,
      level: '4',
      academicLevel: '4',
      semester: 'second',
      creditHours: 3,
    });
    await connection.models.User.collection.insertMany(
      [enrolled, unregistered].map((_id, index) => ({
        _id,
        role: 'student',
        studentCode: `${code}-${index}`,
        name: 'Report student',
      })),
    );
    await connection.models.StudentProfile.collection.insertMany(
      [enrolled, unregistered].map((userId, index) => ({
        userId,
        studentCode: `${code}-${index}`,
        fullName: 'Report student',
        level: '4',
        academicYear: year,
        semester: 'second',
        tuitionFeesStatus: index === 0 ? 'unpaid' : 'paid',
        isBlocked: index === 0,
      })),
    );
    await connection.models.CourseRegistration.collection.insertOne({
      studentId: enrolled,
      courses: [code],
      academicYear: year,
      semester: 'second',
      status: 'approved',
    });
    await gradeModel.collection.insertOne({
      studentId: enrolled,
      courseId: reportCourse,
      courseCode: code,
      examType: 'midterm',
      grade: 15,
      maxGrade: 20,
      status: 'present',
      academicYear: year,
      semester: 'second',
      rev: 1,
      isPublished: false,
    });
    const detail = await sheets.openSheet(actor, {
      courseId: String(reportCourse),
      component: 'midterm',
      academicYear: year,
      semester: 'second',
    });
    const access = new ControlAccessService(
      connection.models.Course as never,
      connection.models.CourseStaffAssignment as never,
    );
    const reports = new ControlReportsService(
      access,
      sheets,
      workbook,
      connection.models.Course as never,
      connection.models.StudentProfile as never,
      gradeModel,
      connection.models.CourseRegistration as never,
    );
    const { default: ExcelJS } = await import('exceljs');
    const courseBook = new ExcelJS.Workbook();
    await courseBook.xlsx.load(
      await reports.export(actor, detail.sheet.id, {
        type: 'course',
        academicYear: year,
        semester: 'second',
      }),
    );
    expect(courseBook.worksheets).toHaveLength(2);
    expect(courseBook.worksheets[0].getCell('G2').value).toBe(15);
    expect(courseBook.worksheets[0].getCell('M2').value).toBe('غير مسدد');
    const table = new ExcelJS.Workbook();
    await table.xlsx.load(
      await reports.export(actor, detail.sheet.id, {
        type: 'round-table',
        level: '4',
        academicYear: year,
        semester: 'second',
      }),
    );
    const page = table.worksheets[0];
    const dataRows: ExcelRow[] = [];
    page.eachRow((row, index) => {
      if (index > 1) dataRows.push(row);
    });
    expect(
      dataRows.find((row) => row.getCell(1).text === `${code}-0`)?.getCell(5)
        .text,
    ).toBe('مسجل');
    expect(
      dataRows.find((row) => row.getCell(1).text === `${code}-1`)?.getCell(5)
        .text,
    ).toBe('غير مسجل');
  });
});
