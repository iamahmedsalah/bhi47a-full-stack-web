/** Dry-run by default. Never reseeds or edits registrations, grades or course files. */
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  COURSE_326_CURRICULA,
  normalizeDepartment,
} from '@student-portal/shared';

dotenv.config({
  path: path.resolve(__dirname, '../../../../.env'),
  quiet: true,
});

interface Backup {
  version: 1;
  database: string;
  courseId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

async function main() {
  const args = process.argv.slice(2);
  const argument = (name: string) =>
    args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  const uri = process.env.DB_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error('DB_URI or MONGODB_URI is required');
  const connection = await mongoose
    .createConnection(uri, { serverSelectionTimeoutMS: 10000 })
    .asPromise();
  try {
    const db = connection.db;
    if (!db) throw new Error('Database is unavailable');
    const courses = db.collection('courses');
    const course = await courses.findOne({ code: '326' });
    if (!course)
      throw new Error('Course 326 does not exist. No course was created.');
    const after = {
      curricula: COURSE_326_CURRICULA.map((item) => ({ ...item })),
      offeredTerms: ['first', 'second'],
    };
    const before: Record<string, unknown> = {};
    for (const key of Object.keys(after))
      if (Object.hasOwn(course, key)) before[key] = course[key];
    const restorePath = argument('--restore');
    if (restorePath) {
      const backup = mongoose.mongo.BSON.EJSON.parse(
        await fs.readFile(path.resolve(restorePath), 'utf8'),
      ) as Backup;
      if (
        backup.version !== 1 ||
        backup.database !== db.databaseName ||
        backup.courseId !== course._id.toHexString()
      )
        throw new Error('Backup does not match this database and course');
      const current = Object.fromEntries(
        Object.keys(after).map((key) => [key, course[key]]),
      );
      if (JSON.stringify(current) !== JSON.stringify(backup.after))
        throw new Error(
          'Course placements changed since migration; refusing to overwrite them',
        );
      const unset = Object.fromEntries(
        Object.keys(after)
          .filter((key) => !Object.hasOwn(backup.before, key))
          .map((key) => [key, '']),
      );
      console.log(
        JSON.stringify(
          {
            mode: args.includes('--apply') ? 'restore' : 'restore-preview',
            database: db.databaseName,
            course: '326',
            fields: backup.before,
          },
          null,
          2,
        ),
      );
      if (args.includes('--apply')) {
        const restored = await courses.updateOne(
          { _id: course._id, ...current },
          {
            $set: backup.before,
            ...(Object.keys(unset).length ? { $unset: unset } : {}),
          },
        );
        if (!restored.matchedCount)
          throw new Error(
            'Concurrent change detected; restore was not applied',
          );
      }
      return;
    }
    // Report only: registrations may reflect approved historical exceptions.
    const report = await db
      .collection('course_registrations')
      .aggregate([
        { $match: { courses: '326' } },
        {
          $lookup: {
            from: 'student_profiles',
            localField: 'studentId',
            foreignField: 'userId',
            as: 'profile',
          },
        },
        {
          $project: {
            academicYear: 1,
            semester: 1,
            status: 1,
            studentCode: { $arrayElemAt: ['$profile.studentCode', 0] },
            department: { $arrayElemAt: ['$profile.department', 0] },
          },
        },
      ])
      .toArray();
    const issues = report.flatMap((registration) => {
      const department = normalizeDepartment(
        registration.department as string | undefined,
      );
      const expected = COURSE_326_CURRICULA.find(
        (item) => item.department === department,
      );
      return !expected || expected.semester !== registration.semester
        ? [
            {
              registrationId: registration._id.toString(),
              studentCode: registration.studentCode,
              academicYear: registration.academicYear,
              semester: registration.semester,
              department: registration.department,
              status: registration.status,
              reason: expected
                ? 'TERM_MISMATCH'
                : 'UNKNOWN_OR_UNSUPPORTED_DEPARTMENT',
            },
          ]
        : [];
    });
    const changed = JSON.stringify(before) !== JSON.stringify(after);
    console.log(
      JSON.stringify(
        {
          mode: args.includes('--apply') ? 'apply' : 'preview',
          database: db.databaseName,
          course: '326',
          before,
          after,
          changed,
          historicalIssues: issues,
        },
        null,
        2,
      ),
    );
    if (!args.includes('--apply') || !changed) return;
    const backupPath = argument('--backup');
    if (!backupPath)
      throw new Error('--backup <file> is required with --apply');
    const backup: Backup = {
      version: 1,
      database: db.databaseName,
      courseId: course._id.toHexString(),
      before,
      after,
    };
    await fs.writeFile(
      path.resolve(backupPath),
      mongoose.mongo.BSON.EJSON.stringify(backup, undefined, 2),
      { flag: 'wx', mode: 0o600 },
    );
    const unchanged = Object.fromEntries(
      Object.keys(after).map((key) => [
        key,
        Object.hasOwn(before, key) ? before[key] : { $exists: false },
      ]),
    );
    const result = await courses.updateOne(
      { _id: course._id, ...unchanged },
      { $set: after },
    );
    if (!result.matchedCount)
      throw new Error(
        'Concurrent change detected. Backup was saved; no migration was applied.',
      );
    console.log(
      'Course 326 placements updated. Existing registrations and course files were preserved. Course list caches expire within 120 seconds.',
    );
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  // Avoid logging connection strings or driver errors containing credentials.
  console.error(
    error instanceof Error &&
      !/mongodb|password|credential/i.test(error.message)
      ? error.message
      : 'Migration failed. Check the database connection and supplied arguments.',
  );
  process.exitCode = 1;
});
