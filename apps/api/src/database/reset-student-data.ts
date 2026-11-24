import * as dotenv from 'dotenv';
import * as dns from 'node:dns';
import * as mongoose from 'mongoose';
import * as path from 'node:path';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

type DbDocument = mongoose.mongo.BSON.Document;
type DbFilter = mongoose.mongo.Filter<DbDocument>;

const execute = process.argv.includes('--execute');

function applyDnsOverrides() {
  const dnsServers = String(process.env.DNS_SERVERS || '')
    .split(',')
    .map((server) => server.trim())
    .filter(Boolean);

  if (dnsServers.length > 0) {
    dns.setServers(dnsServers);
  }
}

async function resetStudentData() {
  applyDnsOverrides();
  const mongoUri = process.env.DB_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('DB_URI or MONGODB_URI is required.');
  }

  const connection = await mongoose.createConnection(mongoUri).asPromise();
  const db = connection.db;
  if (!db) {
    await connection.close();
    throw new Error('MongoDB database instance is unavailable.');
  }

  if (['admin', 'config', 'local'].includes(db.databaseName)) {
    await connection.close();
    throw new Error(`Refusing to modify reserved database: ${db.databaseName}`);
  }

  try {
    const students = await db
      .collection('users')
      .find(
        { role: 'student' },
        { projection: { _id: 1, studentCode: 1, email: 1 } },
      )
      .toArray();
    const studentIds = students.map((student) => student._id);
    const studentCodes = students
      .map((student) => student.studentCode)
      .filter((value): value is string => typeof value === 'string');
    const studentEmails = students
      .map((student) => student.email)
      .filter((value): value is string => typeof value === 'string');

    const advisingCases = await db
      .collection('advising_cases')
      .find({ studentId: { $in: studentIds } }, { projection: { _id: 1 } })
      .toArray();
    const caseIds = advisingCases.map((item) => item._id);
    const advisingPlans = await db
      .collection('advising_plans')
      .find({ studentId: { $in: studentIds } }, { projection: { _id: 1 } })
      .toArray();
    const planIds = advisingPlans.map((item) => item._id);

    const targets: Array<{
      collection: string;
      filter: DbFilter;
    }> = [
      { collection: 'advising_graphs', filter: { planId: { $in: planIds } } },
      {
        collection: 'advising_notes',
        filter: {
          $or: [
            { caseId: { $in: caseIds } },
            { advisingCaseId: { $in: caseIds } },
          ],
        },
      },
      {
        collection: 'advising_audit_logs',
        filter: {
          $or: [
            { caseId: { $in: caseIds } },
            { advisingCaseId: { $in: caseIds } },
          ],
        },
      },
      {
        collection: 'course_recommendations',
        filter: {
          $or: [
            { studentId: { $in: studentIds } },
            { caseId: { $in: caseIds } },
            { advisingCaseId: { $in: caseIds } },
          ],
        },
      },
      {
        collection: 'advising_plans',
        filter: { studentId: { $in: studentIds } },
      },
      {
        collection: 'advising_cases',
        filter: { studentId: { $in: studentIds } },
      },
      {
        collection: 'academic_advising_requests',
        filter: { studentId: { $in: studentIds } },
      },
      {
        collection: 'course_registrations',
        filter: { studentId: { $in: studentIds } },
      },
      {
        collection: 'student_academic_profiles',
        filter: { studentId: { $in: studentIds } },
      },
      {
        collection: 'student_profiles',
        filter: { userId: { $in: studentIds } },
      },
      { collection: 'grades', filter: { studentId: { $in: studentIds } } },
      {
        collection: 'course_quizzes',
        filter: { studentId: { $in: studentIds } },
      },
      {
        collection: 'quiz_attempts',
        filter: { studentId: { $in: studentIds } },
      },
      {
        collection: 'quiz_submissions',
        filter: { studentId: { $in: studentIds } },
      },
      { collection: 'attendance', filter: { studentId: { $in: studentIds } } },
      {
        collection: 'attendance_records',
        filter: { studentId: { $in: studentIds } },
      },
      {
        collection: 'chat_sessions',
        filter: { userId: { $in: studentIds } },
      },
      {
        collection: 'student_code_registry',
        filter: { currentStudentId: { $in: studentIds } },
      },
      {
        collection: 'academic_emails',
        filter: { studentId: { $in: studentIds } },
      },
      { collection: 'complaints', filter: { studentId: { $in: studentIds } } },
      {
        collection: 'notifications',
        filter: { targetStudentId: { $in: studentIds } },
      },
      { collection: 'email_logs', filter: { to: { $in: studentEmails } } },
      {
        collection: 'users',
        filter: {
          role: 'student',
          $or: [
            { _id: { $in: studentIds } },
            { studentCode: { $in: studentCodes } },
          ],
        },
      },
    ];

    const preview = Object.fromEntries(
      await Promise.all(
        targets.map(async ({ collection, filter }) => [
          collection,
          await db.collection(collection).countDocuments(filter),
        ]),
      ),
    );

    console.log(`Database: ${db.databaseName}`);
    console.log(`Student accounts found: ${students.length}`);
    console.table(preview);

    if (!execute) {
      console.log(
        'Dry run only. Re-run with --execute to delete these student-owned records.',
      );
      return;
    }

    const session = await connection.startSession();
    try {
      await session.withTransaction(async () => {
        for (const { collection, filter } of targets) {
          await db.collection(collection).deleteMany(filter, { session });
        }

        const notificationCleanup = {
          $pull: {
            readBy: { userId: { $in: studentIds } },
            hiddenBy: { userId: { $in: studentIds } },
          },
        } as unknown as mongoose.mongo.UpdateFilter<DbDocument>;

        await db
          .collection('notifications')
          .updateMany({}, notificationCleanup, { session });
      });
    } finally {
      await session.endSession();
    }

    console.log(
      `Student data reset completed for ${students.length} accounts.`,
    );
    console.log(
      'Admin/staff users, courses, schedules, rules, and system settings were preserved.',
    );
  } finally {
    await connection.close();
  }
}

resetStudentData().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
