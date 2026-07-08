/**
 * Database seed script.
 * Run with: pnpm --filter @student-portal/api run seed
 */
import * as mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dns from 'node:dns';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

type DbCollection = mongoose.mongo.Collection<mongoose.mongo.BSON.Document>;

type Role = 'admin' | 'staff' | 'student';

type MockStudent = {
  studentCode: string;
  fullName: string;
  nationalId: string;
  academicEmail: string;
  department: string;
  level: string;
  group: string;
  section: string;
  academicYear: string;
  semester: string;
  seatNumber: string;
  examBuilding: string;
  examFloor: string;
  examRoom: string;
  phone: string;
};

type MockCourse = {
  name: string;
  code: string;
  level: string;
  academicLevel: string;
  semester: string;
  department: string;
  creditHours: number;
  prerequisites: string[];
  type: string;
  isActive: boolean;
};

type SeedData = {
  staffPermissions: string[];
  students: MockStudent[];
  courses: MockCourse[];
};

function loadSeedData(): SeedData {
  const seedDataPath = path.resolve(__dirname, './seed.data.json');
  const raw = fs.readFileSync(seedDataPath, 'utf8');

  return JSON.parse(raw) as SeedData;
}

function maskNationalId(nationalId: string) {
  return `${nationalId.slice(0, 3)}****${nationalId.slice(-3)}`;
}

function usernameFromUser(data: {
  email?: string;
  studentCode?: string;
  name: string;
}) {
  return (
    data.email?.split('@')[0] ||
    data.studentCode ||
    data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 32)
  );
}

async function hashPassword(value: string) {
  return bcrypt.hash(value, 12);
}

async function generateSeedUserCode(
  usersCollection: DbCollection,
  role: Role,
  studentCode?: string,
): Promise<string> {
  if (role === 'student') {
    return `STD-${studentCode}`;
  }

  const prefix = role === 'admin' ? 'ADM-' : 'STF-';
  const lastUser = await usersCollection
    .find({ role, userCode: new RegExp(`^${prefix}`) })
    .sort({ userCode: -1 })
    .limit(1)
    .toArray();

  let nextNumber = 1;
  if (lastUser && lastUser.length > 0 && lastUser[0].userCode) {
    const parts = lastUser[0].userCode.split('-');
    const num = Number.parseInt(parts[1], 10);
    if (Number.isFinite(num)) {
      nextNumber = num + 1;
    }
  }

  return `${prefix}${String(nextNumber).padStart(4, '0')}`;
}

async function upsertUser(
  usersCollection: DbCollection,
  data: {
    role: Role;
    name: string;
    password: string;
    email?: string;
    studentCode?: string;
    phone?: string;
    nationalId?: string;
    mustChangePassword?: boolean;
    permissions?: string[];
  },
) {
  const now = new Date();

  const filter = data.email
    ? { email: data.email.toLowerCase() }
    : { studentCode: data.studentCode };

  const existing = await usersCollection.findOne(filter);

  if (existing?._id) {
    const updateSet: Record<string, any> = {
      name: data.name,
      phone: data.phone,
      permissions: data.permissions ?? existing.permissions ?? [],
      updatedAt: now,
    };

    if (!existing.userCode) {
      updateSet.userCode = await generateSeedUserCode(
        usersCollection,
        data.role,
        data.studentCode,
      );
    }

    if (data.nationalId) {
      updateSet.nationalId = data.nationalId;
      updateSet.nationalIdMasked = maskNationalId(data.nationalId);
      if (!existing.nationalIdHash) {
        updateSet.nationalIdHash = await hashPassword(data.nationalId);
      }
    }

    await usersCollection.updateOne({ _id: existing._id }, { $set: updateSet });

    return existing._id;
  }

  const passwordHash = await hashPassword(data.password);

  const nationalIdHash = data.nationalId
    ? await hashPassword(data.nationalId)
    : undefined;

  const generatedUserCode = await generateSeedUserCode(
    usersCollection,
    data.role,
    data.studentCode,
  );

  const result = await usersCollection.insertOne({
    role: data.role,
    userCode: generatedUserCode,
    username: usernameFromUser(data),
    name: data.name,
    email: data.email?.toLowerCase(),
    phone: data.phone,
    studentCode: data.studentCode,
    passwordHash,
    nationalIdHash,
    nationalIdMasked: data.nationalId
      ? maskNationalId(data.nationalId)
      : undefined,
    nationalId: data.nationalId,
    mustChangePassword: data.mustChangePassword ?? false,
    tokenVersion: 0,
    isActive: true,
    permissions: data.permissions ?? [],
    fcmTokens: [],
    failedLoginAttempts: 0,
    loginAttempts: 0,
    theme: 'system',
    createdAt: now,
    updatedAt: now,
  });

  return result.insertedId;
}

async function createMongoConnection() {
  const mongoUri =
    process.env.DB_URI ||
    process.env.MONGODB_URI ||
    'mongodb://localhost:27017/student-portal';

  console.log('Connecting to MongoDB...');

  const connection = await mongoose.createConnection(mongoUri).asPromise();

  if (!connection.db) {
    await connection.close();

    throw new Error(
      'MongoDB database instance is undefined. Make sure your MONGODB_URI includes a database name, for example /student-portal.',
    );
  }

  console.log('Connected to MongoDB');

  return connection;
}

function applyDnsOverrides() {
  const dnsServers = String(process.env.DNS_SERVERS || '')
    .split(',')
    .map((server) => server.trim())
    .filter(Boolean);

  if (dnsServers.length === 0) {
    return;
  }

  try {
    dns.setServers(dnsServers);
    console.log(`Applied DNS overrides: ${dnsServers.join(', ')}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Failed to apply custom DNS servers: ${message}`);
  }
}

async function seed() {
  applyDnsOverrides();

  const seedData = loadSeedData();

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@institute.edu';
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminName = process.env.ADMIN_NAME || 'System Admin';

  const staffEmail = process.env.STAFF_EMAIL || 'staff@institute.edu';
  const staffPassword = process.env.STAFF_PASSWORD || 'StaffPass12345!';

  if (!adminPassword || adminPassword.length < 12) {
    throw new Error(
      'ADMIN_PASSWORD is required for seeding and must be at least 12 characters.',
    );
  }

  const connection = await createMongoConnection();

  try {
    const db = connection.db;

    if (!db) {
      throw new Error('MongoDB database instance is undefined');
    }

    const usersCollection = db.collection('users');
    const profilesCollection = db.collection('student_profiles');
    const coursesCollection = db.collection('courses');
    const gradesCollection = db.collection('grades');
    const academicEmailsCollection = db.collection('academic_emails');
    const examSchedulesCollection = db.collection('exam_schedules');
    const complaintsCollection = db.collection('complaints');

    const adminId = await upsertUser(usersCollection, {
      role: 'admin',
      name: adminName,
      email: adminEmail,
      password: adminPassword,
    });

    await upsertUser(usersCollection, {
      role: 'staff',
      name: 'Student Affairs Staff',
      email: staffEmail,
      password: staffPassword,
      permissions: seedData.staffPermissions,
    });

    const courseIds = new Map<string, mongoose.Types.ObjectId>();

    for (const course of seedData.courses) {
      const now = new Date();

      const result = await coursesCollection.findOneAndUpdate(
        { code: course.code },
        {
          $setOnInsert: {
            createdAt: now,
          },
          $set: {
            name: course.name,
            code: course.code,
            level: course.level,
            academicLevel: course.academicLevel,
            semester: course.semester,
            department: course.department,
            creditHours: course.creditHours,
            prerequisites: course.prerequisites,
            type: course.type,
            isActive: course.isActive,
            updatedAt: now,
          },
        },
        {
          upsert: true,
          returnDocument: 'after',
        },
      );

      if (result?._id) {
        courseIds.set(course.code, result._id);
      }
    }

    for (const student of seedData.students) {
      const now = new Date();

      const userId = await upsertUser(usersCollection, {
        role: 'student',
        name: student.fullName,
        studentCode: student.studentCode,
        password: student.nationalId,
        nationalId: student.nationalId,
        phone: student.phone,
        mustChangePassword: true,
      });

      await profilesCollection.updateOne(
        { studentCode: student.studentCode },
        {
          $setOnInsert: {
            userId,
            studentCode: student.studentCode,
            createdAt: now,
          },
          $set: {
            fullName: student.fullName,
            nationalIdMasked: maskNationalId(student.nationalId),
            nationalId: student.nationalId,
            academicEmail: student.academicEmail,
            department: student.department,
            level: student.level,
            group: student.group,
            section: student.section,
            academicYear: student.academicYear,
            semester: student.semester,
            enrollmentStatus: 'active',
            seatNumber: student.seatNumber,
            examBuilding: student.examBuilding,
            examFloor: student.examFloor,
            examRoom: student.examRoom,
            updatedAt: now,
          },
        },
        { upsert: true },
      );

      await academicEmailsCollection.updateOne(
        { studentCode: student.studentCode },
        {
          $setOnInsert: {
            studentId: userId,
            studentCode: student.studentCode,
            createdAt: now,
          },
          $set: {
            studentName: student.fullName,
            academicEmail: student.academicEmail,
            status: 'active',
            lastUpdatedBy: adminId,
            updatedAt: now,
          },
        },
        { upsert: true },
      );

      for (const course of seedData.courses) {
        const courseId = courseIds.get(course.code);

        if (!courseId) {
          continue;
        }

        await gradesCollection.updateOne(
          {
            studentCode: student.studentCode,
            courseCode: course.code,
            examType: 'midterm',
          },
          {
            $setOnInsert: {
              studentId: userId,
              studentCode: student.studentCode,
              courseId,
              courseName: course.name,
              courseCode: course.code,
              examType: 'midterm',
              grade: student.studentCode === '111111' ? 42 : 38,
              maxGrade: 50,
              status: 'present',
              academicYear: student.academicYear,
              semester: student.semester,
              isPublished: true,
              createdAt: now,
            },
            $set: {
              updatedAt: now,
            },
          },
          { upsert: true },
        );
      }
    }

    await examSchedulesCollection.updateOne(
      { title: 'Level 1 Midterm Schedule' },
      {
        $setOnInsert: {
          title: 'Level 1 Midterm Schedule',
          examType: 'midterm',
          academicYear: '2024-2025',
          semester: 'first',
          fileUrl: 'https://example.com/mock-level-1-midterm.pdf',
          isPublished: true,
          createdAt: new Date(),
        },
        $set: {
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );

    const firstStudent = seedData.students[0];

    if (firstStudent) {
      const firstStudentUser = await usersCollection.findOne({
        studentCode: firstStudent.studentCode,
      });

      await complaintsCollection.updateOne(
        { ticketNumber: 'TKT-MOCK-0001' },
        {
          $setOnInsert: {
            ticketNumber: 'TKT-MOCK-0001',
            studentId: firstStudentUser?._id,
            studentCode: firstStudent.studentCode,
            studentName: firstStudent.fullName,
            type: 'academic',
            department: 'academic_advising',
            assignedGroup: 'Academic Advising',
            title: 'Mock academic advising request',
            description:
              'Seeded ticket to test complaint filters, drawer, replies, and staff visibility.',
            priority: 'medium',
            status: 'open',
            replies: [],
            internalNotes: [],
            statusHistory: [
              {
                fromStatus: 'new',
                toStatus: 'open',
                changedByName: 'seed',
                changedAt: new Date(),
              },
            ],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      );
    }

    console.log('Seed complete');
    console.log(`Admin: ${adminEmail}`);
    console.log(`Staff: ${staffEmail} / ${staffPassword}`);
    console.log('Mock student login: 111111 / 11122233344455');
  } finally {
    await connection.close();
  }
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
