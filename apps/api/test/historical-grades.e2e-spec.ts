import mongoose, { Types } from 'mongoose';
import type { Connection } from 'mongoose';
import { GradeImporter } from '../src/modules/uploads/importers/grade.importer';
import { GradeSchema } from '../src/modules/grades/schemas/grade.schema';
import { UserSchema } from '../src/modules/users/schemas/user.schema';
import { CourseSchema } from '../src/modules/courses/schemas/course.schema';
import { createFixtureIndexes } from './fixture-indexes';

describe('historical grades persistence', () => {
  let connection: Connection;
  let importer: GradeImporter;
  const studentId = new Types.ObjectId(),
    courseId = new Types.ObjectId();
  const databaseName = `historical-${Date.now()}-e2e`;
  const mark = {
    studentCode: '00123',
    courseCode: '111',
    examType: 'midterm',
    grade: 25,
    academicYear: '2023-2024',
    semester: 'first',
    status: 'present',
  };
  beforeAll(async () => {
    const uri =
      process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27019/student-portal-e2e';
    const parsed = new URL(uri);
    if (
      parsed.protocol !== 'mongodb:' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      !/(?:test|e2e)$/.test(parsed.pathname)
    )
      throw new Error(
        'Historical tests require an isolated credential-free localhost test database',
      );
    connection = await mongoose
      .createConnection(uri, {
        dbName: databaseName,
        autoCreate: false,
        autoIndex: false,
      })
      .asPromise();
    const grades = connection.model('Grade', GradeSchema);
    await createFixtureIndexes(grades);
    const users = connection.model('User', UserSchema),
      courses = connection.model('Course', CourseSchema);
    await users.collection.insertOne({
      _id: studentId,
      studentCode: '00123',
      role: 'student',
      name: 'Synthetic historical student',
    });
    await courses.collection.insertOne({
      _id: courseId,
      code: '111',
      name: 'Synthetic historical course',
    });
    importer = new GradeImporter(
      users as never,
      courses as never,
      grades as never,
      {
        hasControlSheet: async (
          id: Types.ObjectId,
          academicYear: string,
          semester: string,
        ) =>
          Boolean(
            await connection
              .db!.collection('control_sheets')
              .findOne({ courseId: id, academicYear, semester }),
          ),
      } as never,
    );
  });
  afterAll(async () => {
    if (
      connection?.name === databaseName &&
      /^historical-\d+-e2e$/.test(databaseName)
    )
      await connection.dropDatabase();
    await connection?.close();
  });
  it('persists hidden marks and retries without duplicates or replacement', async () => {
    const actor = String(new Types.ObjectId());
    expect(await importer.commitHistorical([mark], actor)).toMatchObject({
      successCount: 1,
      errors: [],
    });
    expect(await importer.commitHistorical([mark], actor)).toMatchObject({
      successCount: 1,
      errors: [],
    });
    expect(
      (await importer.commitHistorical([{ ...mark, grade: 24 }], actor))
        .successCount,
    ).toBe(0);
    const grades = connection.db!.collection('grades');
    expect(await grades.countDocuments({})).toBe(1);
    expect(await grades.findOne({ studentId })).toMatchObject({
      grade: 25,
      maxGrade: 30,
      historicalImport: true,
      isPublished: false,
    });
    expect(
      (
        await importer.commitHistorical(
          [{ ...mark, academicYear: '2999-3000' }],
          actor,
        )
      ).successCount,
    ).toBe(0);
    await connection.db!.collection('control_sheets').insertOne({
      courseId,
      academicYear: mark.academicYear,
      semester: mark.semester,
    });
    expect(
      (
        await importer.commitHistorical(
          [{ ...mark, examType: 'final', grade: 40 }],
          actor,
        )
      ).successCount,
    ).toBe(0);
    expect(await grades.countDocuments({})).toBe(1);
  });
});
