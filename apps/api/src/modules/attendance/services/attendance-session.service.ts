import {
  BadRequestException,
  ConflictException,
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
  CourseStaffAssignment,
  CourseStaffAssignmentDocument,
} from '../schemas/course-staff-assignment.schema';
import {
  Course,
  CourseDocument,
} from '../../courses/schemas/course.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import {
  CreateAttendanceSessionDto,
  CreateCourseStaffAssignmentDto,
} from '../dto/attendance-session.dto';
import { AttendanceTokenService } from './attendance-token.service';
import { AttendanceRealtimeService } from './attendance-realtime.service';
import { ATTENDANCE_CONFIG_DEFAULTS } from '@student-portal/shared';

export interface SessionDetailsResponse {
  _id: Types.ObjectId | string;
  courseCode: string;
  courseName?: string;
  sessionType: string;
  level: string;
  group?: string;
  section?: string;
  academicYear: string;
  semester: string;
  createdBy: Types.ObjectId | string;
  createdByName: string;
  academicPosition: string;
  status: string;
  startsAt: Date;
  expiresAt: Date;
  closedAt?: Date;
  lateThresholdMinutes: number;
  sessionDurationMinutes: number;
  qrRotationSeconds: number;
  stats: {
    totalCheckedIn: number;
    presentCount: number;
    lateCount: number;
    excusedCount: number;
  };
}

export interface AdminOverviewResponse {
  kpi: {
    totalSessions: number;
    activeSessions: number;
    totalCheckedIn: number;
    presentCount: number;
    lateCount: number;
  };
  sessions: any[];
}

@Injectable()
export class AttendanceSessionService {
  constructor(
    @InjectModel(AttendanceSession.name)
    private sessionModel: Model<AttendanceSessionDocument>,
    @InjectModel(AttendanceRecord.name)
    private recordModel: Model<AttendanceRecordDocument>,
    @InjectModel(CourseStaffAssignment.name)
    private staffAssignmentModel: Model<CourseStaffAssignmentDocument>,
    @InjectModel(Course.name)
    private courseModel: Model<CourseDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    private tokenService: AttendanceTokenService,
    private realtimeService: AttendanceRealtimeService,
  ) {}

  /**
   * Starts a new class attendance session with cryptographic rotating token generation.
   */
  async createSession(
    currentUser: { _id: string; name: string; role: string },
    dto: CreateAttendanceSessionDto,
    baseUrl: string = '',
  ) {
    const courseCode = dto.courseCode.trim().toUpperCase();

    // 1. Verify Course exists
    const course = await this.courseModel.findOne({ code: courseCode }).lean();
    if (!course) {
      throw new NotFoundException(`المقرر الدراسي [${courseCode}] غير موجود`);
    }

    // 2. Staff Assignment Validation
    let academicPosition: 'doctor' | 'instructor' = 'doctor';
    if (currentUser.role === 'staff') {
      const assignment = await this.staffAssignmentModel
        .findOne({
          staffId: new Types.ObjectId(currentUser._id),
          courseCode,
          isActive: true,
        })
        .lean();

      if (!assignment) {
        // Fallback: Check if user is assigned in Course or has admin permission
        // If strict assignment required, reject unauthorized staff:
        const hasAssignment = await this.staffAssignmentModel.exists({
          staffId: new Types.ObjectId(currentUser._id),
          courseCode,
        });

        if (!hasAssignment) {
          // Allow creation only if assigned or explicitly granted
          // To make onboarding smooth, if no assignment exists yet institute-wide, allow with default role
          const totalAssignments =
            await this.staffAssignmentModel.countDocuments();
          if (totalAssignments > 0) {
            throw new ForbiddenException(
              `غير مصرح لك ببدء حضور للمقرر [${courseCode}]؛ لست مدرجاً في طاقم التدريس الخاص به.`,
            );
          }
        }
      } else {
        academicPosition = assignment.academicPosition;
      }
    }

    // 3. Prevent duplicate active sessions for the same course and section/group
    const existingActive = await this.sessionModel
      .findOne({
        courseCode,
        status: 'OPEN',
        ...(dto.group ? { group: dto.group } : {}),
        ...(dto.section ? { section: dto.section } : {}),
      })
      .select('+sessionSecret')
      .exec();

    const now = new Date();

    if (existingActive) {
      // Check if actually expired
      if (existingActive.expiresAt > now) {
        // Return existing active session with fresh QR token
        const qrPayload = this.tokenService.generateRotatingToken(
          existingActive._id.toString(),
          existingActive.sessionSecret,
          existingActive.qrRotationSeconds,
          baseUrl,
        );

        return {
          session: existingActive,
          qr: qrPayload,
          isExisting: true,
        };
      } else {
        // Automatically close expired session
        existingActive.status = 'EXPIRED';
        await existingActive.save();
      }
    }

    // 4. Create new AttendanceSession
    const sessionDurationMinutes =
      dto.sessionDurationMinutes ??
      ATTENDANCE_CONFIG_DEFAULTS.SESSION_DURATION_MINUTES;
    const qrRotationSeconds =
      dto.qrRotationSeconds ?? ATTENDANCE_CONFIG_DEFAULTS.QR_ROTATION_SECONDS;
    const lateThresholdMinutes =
      dto.lateThresholdMinutes ??
      ATTENDANCE_CONFIG_DEFAULTS.LATE_AFTER_MINUTES;

    const startsAt = now;
    const expiresAt = new Date(
      startsAt.getTime() + sessionDurationMinutes * 60 * 1000,
    );

    const sessionSecret = this.tokenService.generateSessionSecret();

    const newSession = await this.sessionModel.create({
      courseCode,
      courseName: course.nameAr || course.name,
      sessionType: dto.sessionType || 'lecture',
      level: dto.level || course.level || '1',
      group: dto.group,
      section: dto.section,
      academicYear: dto.academicYear || '2026-2027',
      semester: dto.semester || course.semester || 'first',
      createdBy: new Types.ObjectId(currentUser._id),
      createdByName: currentUser.name,
      academicPosition,
      status: 'OPEN',
      startsAt,
      expiresAt,
      sessionSecret,
      lateThresholdMinutes,
      sessionDurationMinutes,
      qrRotationSeconds,
    });

    const qrPayload = this.tokenService.generateRotatingToken(
      newSession._id.toString(),
      sessionSecret,
      qrRotationSeconds,
      baseUrl,
    );

    return {
      session: newSession,
      qr: qrPayload,
      isExisting: false,
    };
  }

  /**
   * Retrieves active session details with real-time attendee statistics.
   */
  async getSessionDetails(sessionId: string): Promise<SessionDetailsResponse> {
    if (!Types.ObjectId.isValid(sessionId)) {
      throw new BadRequestException('معرّف الجلسة غير صالح');
    }

    const session = await this.sessionModel.findById(sessionId).lean();
    if (!session) {
      throw new NotFoundException('جلسة الحضور غير موجودة');
    }

    // Check expiration
    const now = new Date();
    let currentStatus = session.status;
    if (session.status === 'OPEN' && session.expiresAt <= now) {
      await this.sessionModel.findByIdAndUpdate(sessionId, {
        $set: { status: 'EXPIRED' },
      });
      currentStatus = 'EXPIRED';
    }

    // Aggregate counts
    const [presentCount, lateCount, excusedCount, totalCheckedIn] =
      await Promise.all([
        this.recordModel.countDocuments({ sessionId, status: 'present' }),
        this.recordModel.countDocuments({ sessionId, status: 'late' }),
        this.recordModel.countDocuments({ sessionId, status: 'excused' }),
        this.recordModel.countDocuments({ sessionId }),
      ]);

    return {
      ...session,
      status: currentStatus,
      stats: {
        totalCheckedIn,
        presentCount,
        lateCount,
        excusedCount,
      },
    };
  }

  /**
   * Gets the current rotating QR payload for an open session.
   */
  async getCurrentQr(sessionId: string, baseUrl: string = '') {
    if (!Types.ObjectId.isValid(sessionId)) {
      throw new BadRequestException('معرّف الجلسة غير صالح');
    }

    const session = await this.sessionModel
      .findById(sessionId)
      .select('+sessionSecret')
      .exec();

    if (!session) {
      throw new NotFoundException('جلسة الحضور غير موجودة');
    }

    const now = new Date();
    if (session.status !== 'OPEN' || session.expiresAt <= now) {
      if (session.status === 'OPEN') {
        session.status = 'EXPIRED';
        await session.save();
      }
      throw new BadRequestException(
        'جلسة الحضور مغلقة أو انتهت مدة صلاحيتها؛ لا يمكن توليد رمز QR جديد.',
      );
    }

    return this.tokenService.generateRotatingToken(
      session._id.toString(),
      session.sessionSecret,
      session.qrRotationSeconds,
      baseUrl,
    );
  }

  /**
   * Closes an active attendance session.
   */
  async closeSession(
    sessionId: string,
    currentUser: { _id: string; role: string },
  ) {
    if (!Types.ObjectId.isValid(sessionId)) {
      throw new BadRequestException('معرّف الجلسة غير صالح');
    }

    const session = await this.sessionModel.findById(sessionId);
    if (!session) {
      throw new NotFoundException('جلسة الحضور غير موجودة');
    }

    if (currentUser.role === 'staff') {
      if (session.createdBy.toString() !== currentUser._id) {
        throw new ForbiddenException(
          'غير مصرح لك بإغلاق جلسة حضور بدأها عضو هيئة تدريس آخر',
        );
      }
    }

    session.status = 'CLOSED';
    session.closedAt = new Date();
    session.closedBy = new Types.ObjectId(currentUser._id);
    await session.save();

    // Inform real-time subscribers
    this.realtimeService.closeSessionStream(sessionId);

    return {
      success: true,
      message: 'تم إغلاق جلسة الحضور بنجاح ومنع تسجيل أي طلاب إضافيين.',
      session,
    };
  }

  /**
   * Retrieves list of courses/classes assigned to the current staff member or all for admins.
   */
  async getStaffClasses(currentUser: { _id: string; role: string }) {
    if (currentUser.role === 'admin') {
      const courses = await this.courseModel
        .find({ isActive: true })
        .sort({ level: 1, code: 1 })
        .lean();
      return courses.map((c) => ({
        courseCode: c.code,
        courseName: c.nameAr || c.name,
        level: c.level,
        semester: c.semester,
        academicPosition: 'doctor' as const,
        groups: ['1', '2'],
        sections: ['1', '2', '3', '4'],
      }));
    }

    // Staff query
    const assignments = await this.staffAssignmentModel
      .find({
        staffId: new Types.ObjectId(currentUser._id),
        isActive: true,
      })
      .sort({ courseCode: 1 })
      .lean();

    if (assignments.length > 0) {
      return assignments;
    }

    // Fallback: If no explicit assignment rows exist yet, return active courses to keep dev/testing usable
    const allCourses = await this.courseModel
      .find({ isActive: true })
      .limit(10)
      .lean();

    return allCourses.map((c) => ({
      courseCode: c.code,
      courseName: c.nameAr || c.name,
      level: c.level,
      semester: c.semester,
      academicPosition: 'doctor' as const,
      groups: [],
      sections: [],
    }));
  }

  /**
   * Assigns a staff member (Doctor or Instructor) to a course offering.
   */
  async assignStaffToCourse(
    adminId: string,
    dto: CreateCourseStaffAssignmentDto,
  ) {
    const courseCode = dto.courseCode.trim().toUpperCase();

    const [staff, course] = await Promise.all([
      this.userModel.findById(dto.staffId).lean(),
      this.courseModel.findOne({ code: courseCode }).lean(),
    ]);

    if (!staff || staff.role !== 'staff') {
      throw new NotFoundException('عضو هيئة التدريس غير موجود');
    }

    if (!course) {
      throw new NotFoundException(`المقرر الدراسي [${courseCode}] غير موجود`);
    }

    const academicYear = dto.academicYear || '2026-2027';
    const semester = dto.semester || course.semester || 'first';

    const assignment = await this.staffAssignmentModel.findOneAndUpdate(
      {
        staffId: new Types.ObjectId(dto.staffId),
        courseCode,
        academicPosition: dto.academicPosition,
        academicYear,
        semester,
      },
      {
        $set: {
          staffName: staff.name,
          staffUserCode: staff.userCode,
          courseName: course.nameAr || course.name,
          groups: dto.groups || [],
          sections: dto.sections || [],
          isActive: true,
          assignedBy: new Types.ObjectId(adminId),
        },
      },
      { upsert: true, new: true },
    );

    return assignment;
  }

  /**
   * Retrieves system-wide attendance KPI statistics and recent sessions for administrators.
   */
  async getAdminOverview(): Promise<AdminOverviewResponse> {
    const [
      totalSessions,
      activeSessions,
      recentSessions,
      totalRecords,
      presentRecords,
      lateRecords,
    ] = await Promise.all([
      this.sessionModel.countDocuments(),
      this.sessionModel.countDocuments({ status: 'OPEN' }),
      this.sessionModel.find().sort({ startsAt: -1 }).limit(30).lean(),
      this.recordModel.countDocuments(),
      this.recordModel.countDocuments({ status: 'present' }),
      this.recordModel.countDocuments({ status: 'late' }),
    ]);

    const sessionIds = recentSessions.map((s) => s._id);
    const sessionRecords = await this.recordModel
      .find({ sessionId: { $in: sessionIds } })
      .select('sessionId status')
      .lean();

    const sessionStatsMap = new Map<
      string,
      { present: number; late: number; total: number }
    >();
    for (const r of sessionRecords) {
      const sId = r.sessionId.toString();
      if (!sessionStatsMap.has(sId)) {
        sessionStatsMap.set(sId, { present: 0, late: 0, total: 0 });
      }
      const entry = sessionStatsMap.get(sId)!;
      entry.total += 1;
      if (r.status === 'present') entry.present += 1;
      if (r.status === 'late') entry.late += 1;
    }

    const sessionsWithStats = recentSessions.map((s) => {
      const stats = sessionStatsMap.get(s._id.toString()) || {
        present: 0,
        late: 0,
        total: 0,
      };
      return {
        ...s,
        stats: {
          presentCount: stats.present,
          lateCount: stats.late,
          totalCheckedIn: stats.total,
        },
      };
    });

    return {
      kpi: {
        totalSessions,
        activeSessions,
        totalCheckedIn: totalRecords,
        presentCount: presentRecords,
        lateCount: lateRecords,
      },
      sessions: sessionsWithStats,
    };
  }
}
