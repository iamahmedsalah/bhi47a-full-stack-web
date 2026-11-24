import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import mongoose from 'mongoose';
import { CacheService } from '../src/core/cache/cache.service';
import {
  AttendanceRecord,
  AttendanceRecordSchema,
} from '../src/modules/attendance/schemas/attendance-record.schema';
import {
  AttendanceSession,
  AttendanceSessionSchema,
} from '../src/modules/attendance/schemas/attendance-session.schema';
import { AttendanceCheckInService } from '../src/modules/attendance/services/attendance-checkin.service';
import { AttendanceRealtimeService } from '../src/modules/attendance/services/attendance-realtime.service';
import { AttendanceTokenService } from '../src/modules/attendance/services/attendance-token.service';
import {
  CourseRegistration,
  CourseRegistrationSchema,
} from '../src/modules/registrations/schemas/course-registration.schema';
import {
  StudentProfile,
  StudentProfileSchema,
} from '../src/modules/students/schemas/student-profile.schema';
import { User, UserSchema } from '../src/modules/users/schemas/user.schema';
import { createFixtureIndexes } from './fixture-indexes';

jest.setTimeout(90_000);

describe('Concurrent attendance check-ins (MongoDB)', () => {
  it('records 100 students on a shared network and preserves one record per student', async () => {
    const uri = new URL(process.env.MONGODB_URI ?? '');
    if (
      uri.protocol !== 'mongodb:' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(uri.hostname) ||
      !/\/(?:[\w-]*[-_])?(?:test|e2e)$/.test(uri.pathname) ||
      uri.username ||
      uri.password ||
      uri.search
    ) {
      throw new Error('Attendance fixtures require a loopback E2E database');
    }
    const connection = await mongoose
      .createConnection(uri.href, {
        dbName: `attendance-${randomUUID()}-e2e`,
        autoIndex: false,
        autoCreate: false,
        maxPoolSize: 20,
        serverSelectionTimeoutMS: 3000,
        writeConcern: { w: 1, journal: false },
      })
      .asPromise();
    const cache = new CacheService(new ConfigService({ NODE_ENV: 'test' }));

    try {
      const sessions = connection.model(
        AttendanceSession.name,
        AttendanceSessionSchema,
      );
      const records = connection.model(
        AttendanceRecord.name,
        AttendanceRecordSchema,
      );
      const registrations = connection.model(
        CourseRegistration.name,
        CourseRegistrationSchema,
      );
      const profiles = connection.model(
        StudentProfile.name,
        StudentProfileSchema,
      );
      const users = connection.model(User.name, UserSchema);
      await createFixtureIndexes(records);

      const tokens = new AttendanceTokenService();
      const realtime = new AttendanceRealtimeService();
      const service = new AttendanceCheckInService(
        sessions,
        records,
        registrations,
        profiles,
        tokens,
        realtime,
        users,
        cache,
      );
      const session = await sessions.create({
        courseCode: 'CS101',
        level: '1',
        academicYear: '2026-2027',
        semester: 'first',
        createdBy: new mongoose.Types.ObjectId(),
        createdByName: 'Test instructor',
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + 600_000),
        sessionSecret: tokens.generateSessionSecret(),
        qrRotationSeconds: 60,
      });
      const students = Array.from({ length: 100 }, (_, index) => ({
        _id: new mongoose.Types.ObjectId().toString(),
        name: `Test student ${index}`,
        studentCode: `ST${index}`,
      }));
      await registrations.insertMany(
        students.map(({ _id }) => ({
          studentId: new mongoose.Types.ObjectId(_id),
          courses: [session.courseCode],
          academicYear: session.academicYear,
          semester: session.semester,
          source: 'student',
          status: 'approved',
          totalCreditHours: 3,
        })),
      );
      const sessionId = session._id.toString();
      const { token } = tokens.generateRotatingToken(
        sessionId,
        session.sessionSecret,
        session.qrRotationSeconds,
      );
      const checkIn = (
        student: (typeof students)[number],
        deviceId = student._id,
      ) =>
        service.checkIn(
          student,
          { token, deviceId, deviceFingerprint: 'same-phone-model' },
          '192.0.2.1',
        );

      const first = await checkIn(students[0]);
      expect(first.alreadyCheckedIn).toBe(false);
      await expect(checkIn(students[1], students[0]._id)).rejects.toMatchObject(
        {
          response: expect.objectContaining({
            code: 'ATTENDANCE_DEVICE_ALREADY_USED',
          }),
        },
      );

      const attempts = await Promise.all([
        ...students.slice(1).map((student) => checkIn(student)),
        checkIn(students[1]),
      ]);
      expect(attempts.filter((result) => result.alreadyCheckedIn)).toHaveLength(
        1,
      );
      await expect(checkIn(students[0])).resolves.toMatchObject({
        alreadyCheckedIn: true,
        checkedInAt: first.checkedInAt,
      });
      const stored = await records.distinct('studentId', {
        sessionId: session._id,
      });
      expect(stored.map(String).sort()).toEqual(
        students.map(({ _id }) => _id).sort(),
      );
      await expect(
        records.countDocuments({ sessionId: session._id }),
      ).resolves.toBe(students.length);
    } finally {
      await cache.onModuleDestroy();
      try {
        await connection.dropDatabase();
      } finally {
        await connection.close();
      }
    }
  });
});
