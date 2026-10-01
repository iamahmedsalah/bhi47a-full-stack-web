import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AttendanceSession,
  AttendanceSessionDocument,
} from '../schemas/attendance-session.schema';
import {
  AttendanceRecord,
  AttendanceRecordDocument,
} from '../schemas/attendance-record.schema';
import {
  CourseRegistration,
  CourseRegistrationDocument,
} from '../../registrations/schemas/course-registration.schema';
import {
  StudentProfile,
  StudentProfileDocument,
} from '../../students/schemas/student-profile.schema';
import { AttendanceTokenService } from './attendance-token.service';
import { AttendanceRealtimeService } from './attendance-realtime.service';
import { CheckInAttendanceDto } from '../dto/attendance-session.dto';

interface MongoDuplicateKeyError {
  code: number;
}

function isDuplicateKeyError(err: unknown): err is MongoDuplicateKeyError {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: number }).code === 11000
  );
}

@Injectable()
export class AttendanceCheckInService {
  constructor(
    @InjectModel(AttendanceSession.name)
    private sessionModel: Model<AttendanceSessionDocument>,
    @InjectModel(AttendanceRecord.name)
    private recordModel: Model<AttendanceRecordDocument>,
    @InjectModel(CourseRegistration.name)
    private registrationModel: Model<CourseRegistrationDocument>,
    @InjectModel(StudentProfile.name)
    private studentProfileModel: Model<StudentProfileDocument>,
    private tokenService: AttendanceTokenService,
    private realtimeService: AttendanceRealtimeService,
  ) {}

  /**
   * Executes the strict check-in verification pipeline for a student.
   *
   * 1. Authenticated student identity (from JWT).
   * 2. Extract and validate rotating QR token against session secret.
   * 3. Validate session state (OPEN, within start/expiry).
   * 4. Verify student academic enrollment in this course.
   * 5. Handle duplicate scans idempotently.
   * 6. Calculate PRESENT vs LATE using SERVER TIME.
   * 7. Atomically record check-in with DB unique constraint.
   * 8. Emit live event to staff monitor.
   */
  async checkIn(
    studentUser: { _id: string; name: string; studentCode?: string },
    payload: string | CheckInAttendanceDto,
  ) {
    const rawToken = typeof payload === 'string' ? payload : payload?.token;
    const deviceId =
      typeof payload === 'object' && payload?.deviceId
        ? payload.deviceId.trim()
        : undefined;
    const latitude =
      typeof payload === 'object' && typeof payload?.latitude === 'number'
        ? payload.latitude
        : undefined;
    const longitude =
      typeof payload === 'object' && typeof payload?.longitude === 'number'
        ? payload.longitude
        : undefined;

    if (!rawToken || typeof rawToken !== 'string') {
      throw new BadRequestException('رمز الحضور مفقود أو غير صالح');
    }

    const isManualCode = this.tokenService.isManualCode(rawToken);
    let session: AttendanceSessionDocument | null = null;

    if (isManualCode) {
      const sessionSuffix =
        this.tokenService.getManualCodeSessionSuffix(rawToken);
      const openSessions = await this.sessionModel
        .find({ status: 'OPEN', expiresAt: { $gt: new Date() } })
        .select('+sessionSecret')
        .sort({ startsAt: -1 })
        .limit(100)
        .exec();

      session =
        openSessions.find((candidate) => {
          if (
            !candidate._id.toString().toUpperCase().endsWith(sessionSuffix!)
          ) {
            return false;
          }
          return this.tokenService.validateManualCode(
            rawToken,
            candidate._id.toString(),
            candidate.sessionSecret,
            candidate.qrRotationSeconds,
          ).valid;
        }) ?? null;
    } else {
      const parts = rawToken.split('.');
      if (parts.length !== 3 || !Types.ObjectId.isValid(parts[0])) {
        throw new BadRequestException('صيغة رمز الحضور غير صالحة');
      }

      session = await this.sessionModel
        .findById(parts[0])
        .select('+sessionSecret')
        .exec();
    }

    if (!session) {
      throw new NotFoundException('جلسة الحضور غير موجودة أو تم حذفها');
    }

    // 3. Verify session lifecycle state
    const now = new Date();

    if (session.status === 'CLOSED') {
      throw new BadRequestException('عذراً، جلسة الحضور أغلقت من قبل المحاضر');
    }

    if (session.status === 'EXPIRED' || now > session.expiresAt) {
      if (session.status === 'OPEN') {
        session.status = 'EXPIRED';
        await session.save();
      }
      throw new BadRequestException(
        'انتهت الفترة الزمنية المسموح بها لتسجيل الحضور لهذه الجلسة',
      );
    }

    // 4. Validate cryptographic rotating token
    const tokenResult = isManualCode
      ? this.tokenService.validateManualCode(
          rawToken,
          session._id.toString(),
          session.sessionSecret,
          session.qrRotationSeconds,
        )
      : this.tokenService.validateToken(
          rawToken,
          session.sessionSecret,
          session.qrRotationSeconds,
        );

    if (!tokenResult.valid) {
      throw new BadRequestException(
        tokenResult.message || 'رمز الحضور غير صالح أو منتهي الصلاحية',
      );
    }

    // 5. Verify Student Profile & Code
    const studentProfile = await this.studentProfileModel
      .findOne({ userId: new Types.ObjectId(studentUser._id) })
      .lean();

    const studentCode =
      studentProfile?.studentCode || studentUser.studentCode || '';
    const studentName = studentProfile?.fullName || studentUser.name;

    if (
      studentProfile &&
      studentProfile.enrollmentStatus &&
      studentProfile.enrollmentStatus !== 'active'
    ) {
      throw new ForbiddenException(
        'حالة قيد الطالب غير نشطة، يرجى مراجعة شؤون الطلاب.',
      );
    }

    // 6. Verify Course Enrollment
    const courseCode = session.courseCode;
    const isEnrolled = await this.registrationModel.exists({
      studentId: new Types.ObjectId(studentUser._id),
      courses: courseCode,
      status: 'approved',
    });

    if (!isEnrolled) {
      // Check if institute has any registrations recorded yet for this student
      const hasAnyRegistration = await this.registrationModel.exists({
        studentId: new Types.ObjectId(studentUser._id),
      });

      // If student has registered courses but this course is not one of them, block check-in
      if (hasAnyRegistration) {
        throw new ForbiddenException(
          `عذراً، لست مسجلاً في مقرر [${courseCode}] لهذا الفصل الدراسي.`,
        );
      }
    }

    // 7. Check if already checked in (Idempotency)
    const existingRecord = await this.recordModel
      .findOne({
        sessionId: session._id,
        studentId: new Types.ObjectId(studentUser._id),
      })
      .lean();

    if (existingRecord) {
      return {
        alreadyCheckedIn: true,
        status: existingRecord.status,
        checkedInAt: existingRecord.checkedInAt,
        sessionType: existingRecord.sessionType,
        courseCode: session.courseCode,
        courseName: session.courseName,
        message: 'تم تسجيل حضورك مسبقاً في هذه المحاضرة بنجاح.',
      };
    }

    // 7.1 Anti-Proxy Device Lock: Ensure one physical device cannot check in for multiple students in the same session
    if (deviceId) {
      const deviceUsedByOther = await this.recordModel
        .findOne({
          sessionId: session._id,
          deviceId,
          studentId: { $ne: new Types.ObjectId(studentUser._id) },
        })
        .lean();

      if (deviceUsedByOther) {
        throw new ForbiddenException(
          'تم استخدام هذا الجهاز مسبقاً لتسجيل حضور طالب آخر في هذه المحاضرة. لا يُسمح بتسجيل الحضور بالنيابة.',
        );
      }
    }

    // 7.2 Geofencing Proof: If session specifies hall coordinates, verify student proximity
    if (
      typeof session.location?.latitude === 'number' &&
      typeof session.location?.longitude === 'number'
    ) {
      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        throw new BadRequestException(
          'يجب تفعيل خدمة تحديد الموقع الجغرافي (GPS) للتحقق من تواجدك داخل القاعة.',
        );
      }

      const distanceMeters = this.calculateHaversineDistance(
        latitude,
        longitude,
        session.location.latitude,
        session.location.longitude,
      );

      const maxAllowedRadius = session.location.radiusMeters || 100;
      if (distanceMeters > maxAllowedRadius) {
        throw new ForbiddenException(
          `أنت خارج النطاق الجغرافي المسموح به للمحاضرة (${Math.round(distanceMeters)} متر عن القاعة).`,
        );
      }
    }

    // 8. Determine attendance status using SERVER TIME
    const lateThresholdMs = session.lateThresholdMinutes * 60 * 1000;
    const isLate = now.getTime() > session.startsAt.getTime() + lateThresholdMs;
    const attendanceStatus = isLate ? 'late' : 'present';

    // 9. Atomic insert into database (protected by UNIQUE(sessionId, studentId))
    try {
      const record = await this.recordModel.create({
        sessionId: session._id,
        studentId: new Types.ObjectId(studentUser._id),
        studentCode,
        studentName,
        courseCode,
        sessionType: session.sessionType,
        status: attendanceStatus,
        method: 'qr',
        deviceId,
        checkedInAt: now,
      });

      // 10. Emit real-time update to staff monitor
      this.realtimeService.publishEvent(session._id.toString(), {
        type: 'CHECK_IN',
        record: {
          id: record._id.toString(),
          studentId: studentUser._id,
          studentCode,
          studentName,
          status: record.status,
          method: record.method,
          checkedInAt: record.checkedInAt,
        },
        timestamp: now,
      });

      return {
        alreadyCheckedIn: false,
        status: record.status,
        checkedInAt: record.checkedInAt,
        sessionType: session.sessionType,
        courseCode: session.courseCode,
        courseName: session.courseName,
        message:
          record.status === 'present'
            ? 'تم تسجيل حضورك بنجاح!'
            : 'تم تسجيلك كحاضر متأخر.',
      };
    } catch (err: unknown) {
      if (isDuplicateKeyError(err)) {
        // Race condition duplicate handled cleanly
        const duplicate = await this.recordModel
          .findOne({
            sessionId: session._id,
            studentId: new Types.ObjectId(studentUser._id),
          })
          .lean();

        return {
          alreadyCheckedIn: true,
          status: duplicate?.status || 'present',
          checkedInAt: duplicate?.checkedInAt || now,
          sessionType: session.sessionType,
          courseCode: session.courseCode,
          courseName: session.courseName,
          message: 'تم تسجيل حضورك مسبقاً في هذه الجلسة بنجاح.',
        };
      }
      throw err;
    }
  }

  /**
   * Retrieves active, live attendance sessions that the student is eligible to join.
   */
  async getStudentLiveSessions(studentUser: {
    _id: string;
    studentCode?: string;
  }) {
    let studentCode = studentUser.studentCode;
    let studentLevel = '1';

    // Find student profile to get studentCode and level
    const student = await this.studentProfileModel
      .findOne({
        $or: [
          { userId: new Types.ObjectId(studentUser._id) },
          ...(Types.ObjectId.isValid(studentUser._id)
            ? [{ _id: new Types.ObjectId(studentUser._id) }]
            : []),
        ],
      })
      .lean();

    if (student) {
      studentCode = student.studentCode || studentCode;
      studentLevel = student.level || '1';
    }

    const now = new Date();

    // Find all OPEN and non-expired sessions
    const openSessions = await this.sessionModel
      .find({
        status: 'OPEN',
        expiresAt: { $gt: now },
        $or: [
          { level: studentLevel },
          { level: Number(studentLevel) },
          { level: { $exists: false } },
        ],
      })
      .sort({ startsAt: -1 })
      .lean();

    if (!openSessions.length) {
      return { sessions: [] };
    }

    // Check which sessions student has already checked in to
    const sessionIds = openSessions.map((s) => s._id.toString());
    const checkedRecords = await this.recordModel
      .find({
        sessionId: { $in: sessionIds },
        $or: [
          { studentId: new Types.ObjectId(studentUser._id) },
          ...(studentCode ? [{ studentCode }] : []),
        ],
      })
      .lean();

    const checkedSessionMap = new Map<string, any>();
    for (const rec of checkedRecords) {
      checkedSessionMap.set(rec.sessionId.toString(), rec);
    }

    const liveSessions = openSessions.map((s) => {
      const rec = checkedSessionMap.get(s._id.toString());
      const remainingSeconds = Math.max(
        0,
        Math.floor((new Date(s.expiresAt).getTime() - now.getTime()) / 1000),
      );

      return {
        _id: s._id.toString(),
        courseCode: s.courseCode,
        courseName: s.courseName,
        sessionType: s.sessionType,
        level: s.level,
        group: s.group,
        section: s.section,
        createdByName: s.createdByName,
        academicPosition: s.academicPosition,
        startsAt: s.startsAt,
        expiresAt: s.expiresAt,
        durationMinutes: s.sessionDurationMinutes,
        remainingSeconds,
        alreadyCheckedIn: Boolean(rec),
        checkedInStatus: rec ? rec.status : null,
      };
    });

    return { sessions: liveSessions };
  }

  /**
   * Calculates the great-circle distance between two geographic coordinates using the Haversine formula (in meters).
   */
  private calculateHaversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371e3; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) *
        Math.cos(phi2) *
        Math.sin(deltaLambda / 2) *
        Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }
}
