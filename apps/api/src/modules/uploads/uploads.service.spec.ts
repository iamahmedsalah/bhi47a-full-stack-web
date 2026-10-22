import { Types } from 'mongoose';
import { UploadsService } from './uploads.service';

describe('UploadsService student data wipe', () => {
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
      advisingCaseId: { $in: [caseId] },
    });
    expect(
      getCollection('advising_audit_logs').deleteMany,
    ).toHaveBeenCalledWith({
      advisingCaseId: { $in: [caseId] },
    });
    expect(
      getCollection('course_recommendations').deleteMany,
    ).toHaveBeenCalledWith({
      $or: [
        { studentId: { $in: [studentId] } },
        { advisingCaseId: { $in: [caseId] } },
      ],
    });
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
    });
    expect(getCollection('grades').deleteMany).toHaveBeenCalledWith({});
    expect(collections.has('course_quizzes')).toBe(false);
  });

  it('wipes quizzes alone without deleting grades', async () => {
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
      deletedCounts: { quizzes: 3 },
    });
    expect(getCollection('course_quizzes').deleteMany).toHaveBeenCalledWith({});
    expect(collections.has('grades')).toBe(false);
  });
});
