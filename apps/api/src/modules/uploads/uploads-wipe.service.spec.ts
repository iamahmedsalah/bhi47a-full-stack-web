import { Types } from 'mongoose';
import { UploadsWipeService } from './uploads-wipe.service';

type MockCollection = {
  countDocuments: jest.Mock;
  deleteMany: jest.Mock;
  updateMany: jest.Mock;
  find: jest.Mock;
  aggregate: jest.Mock;
  distinct: jest.Mock;
};

function createMockDb(
  overrides: Partial<Record<string, Partial<MockCollection>>> = {},
) {
  const collections = new Map<string, MockCollection>();

  const getCollection = (name: string): MockCollection => {
    let col = collections.get(name);
    if (!col) {
      const ov = overrides[name] ?? {};
      col = {
        countDocuments: ov.countDocuments ?? jest.fn().mockResolvedValue(0),
        deleteMany:
          ov.deleteMany ?? jest.fn().mockResolvedValue({ deletedCount: 0 }),
        updateMany:
          ov.updateMany ?? jest.fn().mockResolvedValue({ modifiedCount: 0 }),
        find:
          ov.find ??
          jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue([]),
          }),
        aggregate:
          ov.aggregate ??
          jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue([]),
          }),
        distinct: ov.distinct ?? jest.fn().mockResolvedValue([]),
      };
      collections.set(name, col);
    }
    return col;
  };

  return {
    collections,
    getCollection,
    connection: {
      db: { collection: jest.fn((name: string) => getCollection(name)) },
    },
  };
}

describe('UploadsWipeService', () => {
  const logger = { log: jest.fn(), warn: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('aggregates real counts across separated quizzes and QR attendance collections in getWipeSummary', async () => {
    const mock = createMockDb({
      users: { countDocuments: jest.fn().mockResolvedValue(120) },
      grades: {
        aggregate: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([
            {
              _id: { academicYear: '2024-2025', examType: 'midterm' },
              count: 40,
            },
            {
              _id: { academicYear: '2024-2025', examType: 'final' },
              count: 35,
            },
            {
              _id: { academicYear: '2023-2024', examType: 'total' },
              count: 25,
            },
          ]),
        }),
      },
      quizzes: {
        countDocuments: jest.fn().mockResolvedValue(12),
        distinct: jest.fn().mockResolvedValue(['2025-2026']),
      },
      quiz_attempts: { countDocuments: jest.fn().mockResolvedValue(300) },
      quiz_submissions: { countDocuments: jest.fn().mockResolvedValue(280) },
      course_quizzes: {
        countDocuments: jest.fn().mockResolvedValue(0),
        distinct: jest.fn().mockResolvedValue([]),
      },
      attendance_sessions: {
        countDocuments: jest
          .fn()
          .mockResolvedValueOnce(18)
          .mockResolvedValueOnce(2),
        distinct: jest.fn().mockResolvedValue(['2025-2026']),
      },
      attendance_records: { countDocuments: jest.fn().mockResolvedValue(650) },
      attendance: {
        countDocuments: jest.fn().mockResolvedValue(0),
        distinct: jest.fn().mockResolvedValue([]),
      },
      complaints: {
        countDocuments: jest
          .fn()
          .mockResolvedValueOnce(50)
          .mockResolvedValueOnce(32),
      },
      control_sheets: {
        countDocuments: jest
          .fn()
          .mockResolvedValueOnce(10)
          .mockResolvedValueOnce(4),
      },
      student_profiles: {
        aggregate: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([
            { _id: '1', count: 50 },
            { _id: '2', count: 70 },
          ]),
        }),
      },
    });

    const service = new UploadsWipeService(
      logger as never,
      mock.connection as never,
    );
    const summary = await service.getWipeSummary();

    expect(summary.gradesCount).toBe(100);
    expect(summary.gradesByYear).toEqual([
      { academicYear: '2024-2025', count: 75 },
      { academicYear: '2023-2024', count: 25 },
    ]);
    expect(summary.gradesByExamType).toEqual({
      midterm: 40,
      final: 35,
      total: 25,
    });
    expect(summary.quizzesCount).toBe(592);
    expect(summary.quizzesBreakdown).toEqual({
      quizzes: 12,
      quizAttempts: 300,
      quizSubmissions: 280,
      legacyCourseQuizzes: 0,
    });
    expect(summary.attendanceCount).toBe(668);
    expect(summary.attendanceBreakdown).toEqual({
      sessions: 18,
      openSessions: 2,
      records: 650,
      legacyAttendance: 0,
    });
    expect(summary.protectedControlSheetsCount).toBe(4);
    expect(summary.availableAcademicYears).toEqual([
      '2025-2026',
      '2024-2025',
      '2023-2024',
    ]);
  });

  it('protects IN_REVIEW/PENDING_APPROVAL/APPROVED/locked Control grades by default and excludes them from deletion', async () => {
    const courseId = new Types.ObjectId();
    const sheetId = new Types.ObjectId();
    const protectedGradeId = new Types.ObjectId();

    const gradesFind = jest
      .fn()
      // 1st call: grades governed by protected sheet
      .mockReturnValueOnce({
        toArray: jest.fn().mockResolvedValue([{ _id: protectedGradeId }]),
      })
      // 2nd call: grades with controlApprovedRev / published control flag
      .mockReturnValueOnce({
        toArray: jest.fn().mockResolvedValue([]),
      });

    const mock = createMockDb({
      control_sheets: {
        find: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([
            {
              _id: sheetId,
              courseId,
              academicYear: '2024-2025',
              semester: 'first',
              component: 'midterm',
            },
          ]),
        }),
      },
      grades: {
        find: gradesFind,
        deleteMany: jest.fn().mockResolvedValue({ deletedCount: 14 }),
      },
    });

    const cacheService = { delPattern: jest.fn().mockResolvedValue(undefined) };
    const service = new UploadsWipeService(
      logger as never,
      mock.connection as never,
      cacheService as never,
    );

    const res = await service.executeWipe(
      {
        target: 'grades',
        academicYears: ['2024-2025'],
        semester: 'first',
        examTypes: ['midterm'],
      },
      'admin-1',
    );

    expect(res.success).toBe(true);
    expect(res.deletedCounts.grades).toBe(14);
    expect(res.protectedControlGradesCount).toBe(1);
    expect(mock.getCollection('grades').deleteMany).toHaveBeenCalledWith({
      academicYear: { $in: ['2024-2025'] },
      semester: 'first',
      examType: { $in: ['midterm'] },
      _id: { $nin: [protectedGradeId] },
    });
    // Must not touch control_sheets or append-only grade_audit_logs
    expect(
      mock.getCollection('control_sheets').deleteMany,
    ).not.toHaveBeenCalled();
    expect(mock.collections.has('grade_audit_logs')).toBe(false);
    expect(cacheService.delPattern).toHaveBeenCalledWith('grades:*');
  });

  it('deletes Control sheets/import batches/petitions when includeApprovedControl is explicitly true, while NEVER deleting grade_audit_logs', async () => {
    const sheetId = new Types.ObjectId();

    const mock = createMockDb({
      control_sheets: {
        find: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([{ _id: sheetId }]),
        }),
        deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      },
      control_import_batches: {
        deleteMany: jest.fn().mockResolvedValue({ deletedCount: 2 }),
      },
      control_petitions: {
        deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      },
      grades: {
        deleteMany: jest.fn().mockResolvedValue({ deletedCount: 25 }),
      },
    });

    const service = new UploadsWipeService(
      logger as never,
      mock.connection as never,
    );

    const res = await service.executeWipe(
      {
        target: 'grades',
        academicYears: ['2023-2024'],
        includeApprovedControl: true,
      },
      'admin-1',
    );

    expect(res.deletedCounts).toEqual({
      grades: 25,
      controlSheets: 1,
      controlImportBatches: 2,
      controlPetitions: 1,
    });
    expect(mock.getCollection('grades').deleteMany).toHaveBeenCalledWith({
      academicYear: { $in: ['2023-2024'] },
    });
    expect(mock.collections.has('grade_audit_logs')).toBe(false);
  });

  it('filters quiz_attempts and quiz_submissions via parent quizIds when wiping quizzes by academicYear', async () => {
    const quizId = new Types.ObjectId();
    const mock = createMockDb({
      quizzes: {
        find: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([{ _id: quizId }]),
        }),
        deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      },
      quiz_attempts: {
        deleteMany: jest.fn().mockResolvedValue({ deletedCount: 20 }),
      },
      quiz_submissions: {
        deleteMany: jest.fn().mockResolvedValue({ deletedCount: 19 }),
      },
    });

    const service = new UploadsWipeService(
      logger as never,
      mock.connection as never,
    );

    const res = await service.executeWipe(
      {
        target: 'quizzes',
        quizScope: 'attempts_and_submissions',
        academicYears: ['2024-2025'],
      },
      'admin-1',
    );

    expect(mock.getCollection('quiz_attempts').deleteMany).toHaveBeenCalledWith(
      {
        quizId: { $in: [quizId] },
      },
    );
    expect(
      mock.getCollection('quiz_submissions').deleteMany,
    ).toHaveBeenCalledWith({
      quizId: { $in: [quizId] },
    });
    // Definitions must remain untouched when scope is attempts_and_submissions
    expect(mock.getCollection('quizzes').deleteMany).not.toHaveBeenCalled();
    expect(res.totalDeleted).toBe(39);
  });

  it('protects OPEN QR attendance sessions by default and joins attendance_records by sessionId', async () => {
    const closedSessionId = new Types.ObjectId();
    const mock = createMockDb({
      attendance_sessions: {
        countDocuments: jest.fn().mockResolvedValue(1),
        find: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([{ _id: closedSessionId }]),
        }),
        deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      },
      attendance_records: {
        deleteMany: jest.fn().mockResolvedValue({ deletedCount: 45 }),
      },
    });

    const service = new UploadsWipeService(
      logger as never,
      mock.connection as never,
    );

    const res = await service.executeWipe(
      {
        target: 'attendance',
        attendanceScope: 'qr_sessions_and_records',
        academicYears: ['2025-2026'],
      },
      'admin-1',
    );

    expect(res.protectedOpenSessionsCount).toBe(1);
    expect(
      mock.getCollection('attendance_sessions').deleteMany,
    ).toHaveBeenCalledWith({
      academicYear: { $in: ['2025-2026'] },
      status: { $ne: 'OPEN' },
    });
    expect(
      mock.getCollection('attendance_records').deleteMany,
    ).toHaveBeenCalledWith({
      sessionId: { $in: [closedSessionId] },
    });
  });

  it('performs strictly read-only dry-run in previewWipe without ever calling deleteMany', async () => {
    const mock = createMockDb({
      grades: {
        countDocuments: jest.fn().mockResolvedValue(100),
        aggregate: jest
          .fn()
          .mockReturnValueOnce({
            toArray: jest.fn().mockResolvedValue([
              {
                _id: { academicYear: '2023-2024', examType: 'midterm' },
                count: 30,
              },
            ]),
          })
          .mockReturnValueOnce({
            toArray: jest.fn().mockResolvedValue([{ total: 28 }]),
          }),
      },
    });

    const service = new UploadsWipeService(
      logger as never,
      mock.connection as never,
    );

    const preview = await service.previewWipe({
      target: 'grades',
      academicYears: ['2023-2024'],
      examTypes: ['midterm'],
    });

    expect(preview.totalToDelete).toBe(30);
    expect(preview.remainingSafeCount).toBe(70);
    expect(preview.affectedStudentsCount).toBe(28);
    expect(mock.getCollection('grades').deleteMany).not.toHaveBeenCalled();
  });
});
