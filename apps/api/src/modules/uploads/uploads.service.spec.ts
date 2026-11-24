import { Types } from 'mongoose';
import { UploadsService } from './uploads.service';

describe('UploadsService student data wipe', () => {
  it('requires the current immutable identity when an academic upload contains a reused code', async () => {
    const owner = new Types.ObjectId();
    const ownerLookup = jest.fn().mockResolvedValue(null);
    const connection = {
      db: {
        collection: (name: string) =>
          name === 'student_code_registry'
            ? {
                find: () => ({
                  limit: () => ({
                    toArray: () =>
                      Promise.resolve([
                        { studentCode: '280001', currentStudentId: owner },
                      ]),
                  }),
                }),
              }
            : { findOne: ownerLookup },
      },
    };
    const importer = { type: 'grades' };
    const service = new UploadsService(
      { log: jest.fn(), warn: jest.fn() } as never,
      connection as never,
      importer as never,
      importer as never,
      importer as never,
      importer as never,
      importer as never,
      importer as never,
      importer as never,
    );
    await expect(
      service.assertReusedIdentity(
        [{ studentCode: '280001', total: 95 }],
        'grades',
      ),
    ).rejects.toMatchObject({
      response: { code: 'CODE_REUSED_IDENTITY_REQUIRED' },
    });
    await expect(
      service.assertReusedIdentity(
        [{ studentCode: '280001', studentId: String(owner), total: 95 }],
        'grades',
      ),
    ).resolves.toBeUndefined();
    await expect(
      service.assertReusedIdentity(
        [{ studentCode: '280001', nationalId: '30001010100001' }],
        'grades',
      ),
    ).rejects.toThrow();
    ownerLookup.mockResolvedValue({ _id: owner });
    await expect(
      service.assertReusedIdentity(
        [{ studentCode: '280001', nationalId: '30001010100001' }],
        'grades',
      ),
    ).resolves.toBeUndefined();
  });
  it('deletes advising child records through their persisted foreign key', async () => {
    const studentId = new Types.ObjectId();
    const caseId = new Types.ObjectId();
    const planId = new Types.ObjectId();
    const collections = new Map<string, Record<string, jest.Mock>>();

    const getCollection = (name: string) => {
      let collection = collections.get(name);
      if (!collection) {
        const rows =
          name === 'users'
            ? [{ _id: studentId, studentCode: 'S001' }]
            : name === 'advising_cases'
              ? [{ _id: caseId }]
              : name === 'advising_plans'
                ? [{ _id: planId }]
                : [];
        collection = {
          find: jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue(rows),
          }),
          deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
          updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
        };
        collections.set(name, collection);
      }
      return collection;
    };

    const connection = {
      db: { collection: jest.fn((name: string) => getCollection(name)) },
    };
    const logger = { log: jest.fn(), warn: jest.fn() };
    const importer = (type: string) => ({
      type,
      validate: jest.fn(),
      commit: jest.fn(),
    });
    const service = new UploadsService(
      logger as never,
      connection as never,
      importer('students') as never,
      importer('courses') as never,
      importer('grades') as never,
      importer('quizzes') as never,
      importer('attendance') as never,
      importer('academic-emails') as never,
      importer('academic-warnings') as never,
    );

    await service.wipeData('students', 'admin-id');

    expect(getCollection('advising_notes').deleteMany).toHaveBeenCalledWith({
      $or: [
        { advisingCaseId: { $in: [caseId] } },
        { caseId: { $in: [caseId] } },
      ],
    });
    expect(
      getCollection('advising_audit_logs').deleteMany,
    ).toHaveBeenCalledWith({
      $or: [
        { advisingCaseId: { $in: [caseId] } },
        { caseId: { $in: [caseId] } },
      ],
    });
    expect(
      getCollection('course_recommendations').deleteMany,
    ).toHaveBeenCalledWith({
      $or: [
        { studentId: { $in: [studentId] } },
        { advisingCaseId: { $in: [caseId] } },
        { caseId: { $in: [caseId] } },
      ],
    });
    expect(getCollection('quiz_submissions').deleteMany).toHaveBeenCalledWith({
      studentId: { $in: [studentId] },
    });
    expect(getCollection('attendance_records').deleteMany).toHaveBeenCalledWith(
      {
        studentId: { $in: [studentId] },
      },
    );
  });

  it('wipes grades alone without deleting quizzes', async () => {
    const collections = new Map<string, Record<string, jest.Mock>>();
    const getCollection = (name: string) => {
      let collection = collections.get(name);
      if (!collection) {
        collection = {
          deleteMany: jest.fn().mockResolvedValue({ deletedCount: 5 }),
        };
        collections.set(name, collection);
      }
      return collection;
    };

    const connection = {
      db: { collection: jest.fn((name: string) => getCollection(name)) },
    };
    const logger = { log: jest.fn(), warn: jest.fn() };
    const importer = (type: string) => ({
      type,
      validate: jest.fn(),
      commit: jest.fn(),
    });
    const service = new UploadsService(
      logger as never,
      connection as never,
      importer('students') as never,
      importer('courses') as never,
      importer('grades') as never,
      importer('quizzes') as never,
      importer('attendance') as never,
      importer('academic-emails') as never,
      importer('academic-warnings') as never,
    );

    const res = await service.wipeData('grades', 'admin-id');
    expect(res).toEqual({
      success: true,
      target: 'grades',
      deletedCounts: { grades: 5 },
      totalDeleted: 5,
      protectedControlGradesCount: 0,
    });
    expect(getCollection('grades').deleteMany).toHaveBeenCalledWith({});
    expect(collections.has('course_quizzes')).toBe(false);
  });

  it('wipes all quiz collections (new and legacy) without deleting grades', async () => {
    const collections = new Map<string, Record<string, jest.Mock>>();
    const getCollection = (name: string) => {
      let collection = collections.get(name);
      if (!collection) {
        collection = {
          deleteMany: jest.fn().mockResolvedValue({ deletedCount: 3 }),
        };
        collections.set(name, collection);
      }
      return collection;
    };

    const connection = {
      db: { collection: jest.fn((name: string) => getCollection(name)) },
    };
    const logger = { log: jest.fn(), warn: jest.fn() };
    const importer = (type: string) => ({
      type,
      validate: jest.fn(),
      commit: jest.fn(),
    });
    const service = new UploadsService(
      logger as never,
      connection as never,
      importer('students') as never,
      importer('courses') as never,
      importer('grades') as never,
      importer('quizzes') as never,
      importer('attendance') as never,
      importer('academic-emails') as never,
      importer('academic-warnings') as never,
    );

    const res = await service.wipeData('quizzes', 'admin-id');
    expect(res).toEqual({
      success: true,
      target: 'quizzes',
      deletedCounts: {
        quizzes: 3,
        quizAttempts: 3,
        quizSubmissions: 3,
        courseQuizzes: 3,
      },
      totalDeleted: 12,
    });
    expect(getCollection('quizzes').deleteMany).toHaveBeenCalledWith({});
    expect(getCollection('quiz_attempts').deleteMany).toHaveBeenCalledWith({});
    expect(getCollection('quiz_submissions').deleteMany).toHaveBeenCalledWith(
      {},
    );
    expect(getCollection('course_quizzes').deleteMany).toHaveBeenCalledWith({});
    expect(collections.has('grades')).toBe(false);
  });
});
