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
  CourseStaffAssignment,
  CourseStaffAssignmentDocument,
} from '../schemas/course-staff-assignment.schema';
import { Course, CourseDocument } from '../../courses/schemas/course.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import {
  CreateAttendanceSessionDto,
  CreateCourseStaffAssignmentDto,
  UpdateSessionLocationDto,
  QueryAttendanceSessionsDto,
} from '../dto/attendance-session.dto';
import { AttendanceTokenService } from './attendance-token.service';
import { AttendanceRealtimeService } from './attendance-realtime.service';
import { ATTENDANCE_CONFIG_DEFAULTS } from '@student-portal/shared';
import {
  attendanceSessionFilter,
  attendanceSessionScope,
  type AttendanceViewer,
} from './attendance-query';

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
  location?: {
    venueName?: string;
    latitude: number;
    longitude: number;
    radiusMeters: number;
  };
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
  sessions: SessionDetailsResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  filters: {
    levels: string[];
    courses: { code: string; name?: string; level: string }[];
  };
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

      const isCourseDoctor =
        course.doctorId &&
        course.doctorId.toString() === currentUser._id.toString();

      const isCourseTA =
        Array.isArray((course as any).teachingAssistantIds) &&
        (course as any).teachingAssistantIds.some(
          (taId: any) => taId.toString() === currentUser._id.toString(),
        );

      if (!assignment && !isCourseDoctor && !isCourseTA) {
        throw new ForbiddenException(
          `غير مصرح لك ببدء حضور للمقرر [${courseCode}]؛ لست مدرجاً في طاقم التدريس الخاص به.`,
        );
      } else if (assignment) {
        academicPosition = assignment.academicPosition;
      } else if (isCourseTA) {
        academicPosition = 'instructor';
      } else {
        academicPosition = 'doctor';
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
      dto.lateThresholdMinutes ?? ATTENDANCE_CONFIG_DEFAULTS.LATE_AFTER_MINUTES;

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
      ...(dto.location &&
      typeof dto.location.latitude === 'number' &&
      typeof dto.location.longitude === 'number'
        ? {
            location: {
              venueName: dto.location.venueName?.trim() || undefined,
              latitude: dto.location.latitude,
              longitude: dto.location.longitude,
              radiusMeters: dto.location.radiusMeters || 100,
            },
          }
        : {}),
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
   * Updates or toggles the geofencing location of an active attendance session.
   */
  async updateSessionLocation(
    sessionId: string,
    currentUser: { _id: string; role: string },
    dto: UpdateSessionLocationDto,
  ) {
    if (!Types.ObjectId.isValid(sessionId)) {
      throw new BadRequestException('معرّف الجلسة غير صالح');
    }

    const session = await this.sessionModel.findById(sessionId).exec();
    if (!session) {
      throw new NotFoundException('جلسة الحضور غير موجودة');
    }

    if (
      currentUser.role !== 'admin' &&
      session.createdBy.toString() !== currentUser._id
    ) {
      throw new ForbiddenException('غير مصرح لك بتعديل موقع هذه الجلسة');
    }

    if (session.status !== 'OPEN') {
      throw new BadRequestException('لا يمكن تعديل موقع جلسة مغلقة أو منتهية');
    }

    if (dto.enabled === false) {
      session.location = undefined;
    } else if (
      typeof dto.latitude === 'number' &&
      typeof dto.longitude === 'number'
    ) {
      session.location = {
        venueName: dto.venueName?.trim() || session.location?.venueName,
        latitude: dto.latitude,
        longitude: dto.longitude,
        radiusMeters: dto.radiusMeters || session.location?.radiusMeters || 100,
      };
    }

    await session.save();

    return session;
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

    if (!Types.ObjectId.isValid(currentUser._id)) {
      return [];
    }

    const userObjectId = new Types.ObjectId(currentUser._id);

    // 1. Staff explicit assignments
    const assignments = await this.staffAssignmentModel
      .find({
        staffId: userObjectId,
        isActive: true,
      })
      .sort({ courseCode: 1 })
      .lean();

    // 2. Courses where staff member is assigned as doctorId OR teaching assistant
    const teachingCourses = await this.courseModel
      .find({
        $or: [
          { doctorId: userObjectId },
          { teachingAssistantIds: userObjectId },
        ],
        isActive: true,
      })
      .sort({ level: 1, code: 1 })
      .lean();

    const seenCodes = new Set<string>();
    const result: any[] = [];

    for (const a of assignments) {
      if (!seenCodes.has(a.courseCode)) {
        seenCodes.add(a.courseCode);
        result.push(a);
      }
    }

    for (const c of teachingCourses) {
      if (!seenCodes.has(c.code)) {
        seenCodes.add(c.code);
        const isDoc =
          c.doctorId && c.doctorId.toString() === userObjectId.toString();
        result.push({
          courseCode: c.code,
          courseName: c.nameAr || c.name,
          level: c.level,
          semester: c.semester,
          academicPosition: isDoc
            ? ('doctor' as const)
            : ('instructor' as const),
          groups: ['1', '2'],
          sections: ['1', '2', '3', '4'],
        });
      }
    }

    return result;
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
  async getAdminOverview(
    query = new QueryAttendanceSessionsDto(),
  ): Promise<AdminOverviewResponse> {
    return this.getSessionOverview({ _id: '', role: 'admin' }, query);
  }

  async getSessionOverview(
    user: AttendanceViewer,
    query: QueryAttendanceSessionsDto,
  ): Promise<AdminOverviewResponse> {
    const now = new Date();
    const scope = attendanceSessionScope(user);
    const filter = attendanceSessionFilter(user, query, now);
    const limit = Math.min(100, Math.max(1, Math.trunc(query.limit || 20)));
    const total = await this.sessionModel.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);
    const page = Math.min(
      Math.max(1, Math.trunc(query.page || 1)),
      Math.max(1, totalPages),
    );
    const recordScope: import('mongoose').PipelineStage[] =
      user.role === 'admin'
        ? []
        : [
            {
              $lookup: {
                from: 'attendance_sessions',
                localField: 'sessionId',
                foreignField: '_id',
                pipeline: [{ $match: scope }, { $project: { _id: 1 } }],
                as: 'ownedSession',
              },
            },
            { $match: { 'ownedSession.0': { $exists: true } } },
          ];
    type Counts = {
      _id: Types.ObjectId;
      total: number;
      present: number;
      late: number;
      excused: number;
    };
    const countFields = {
      total: { $sum: 1 },
      present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
      late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
      excused: { $sum: { $cond: [{ $eq: ['$status', 'excused'] }, 1, 0] } },
    };
    const [
      totalSessions,
      activeSessions,
      recentSessions,
      recordCounts,
      levels,
      courses,
    ] = await Promise.all([
      this.sessionModel.countDocuments(scope),
      this.sessionModel.countDocuments({
        ...scope,
        status: 'OPEN',
        expiresAt: { $gt: now },
      }),
      this.sessionModel
        .find(filter)
        .sort({ startsAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.recordModel.aggregate<Counts>([
        ...recordScope,
        { $group: { _id: null, ...countFields } },
      ]),
      this.sessionModel.distinct('level', scope),
      this.sessionModel.aggregate<{
        _id: { code: string; level: string };
        name?: string;
      }>([
        { $match: scope },
        {
          $group: {
            _id: { code: '$courseCode', level: '$level' },
            name: { $first: '$courseName' },
          },
        },
        { $sort: { '_id.code': 1, '_id.level': 1 } },
      ]),
    ]);
    const counts = await this.recordModel.aggregate<Counts>([
      {
        $match: {
          sessionId: { $in: recentSessions.map((session) => session._id) },
        },
      },
      { $group: { _id: '$sessionId', ...countFields } },
    ]);
    const statsMap = new Map(
      counts.map((entry) => [entry._id.toString(), entry]),
    );
    const globalCounts = recordCounts[0];
    return {
      kpi: {
        totalSessions,
        activeSessions,
        totalCheckedIn: globalCounts?.total || 0,
        presentCount: globalCounts?.present || 0,
        lateCount: globalCounts?.late || 0,
      },
      sessions: recentSessions.map((session) => {
        const stats = statsMap.get(session._id.toString());
        return {
          ...session,
          status:
            session.status === 'OPEN' && session.expiresAt <= now
              ? 'EXPIRED'
              : session.status,
          stats: {
            presentCount: stats?.present || 0,
            lateCount: stats?.late || 0,
            excusedCount: stats?.excused || 0,
            totalCheckedIn: stats?.total || 0,
          },
        };
      }),
      total,
      page,
      limit,
      totalPages,
      filters: {
        levels: levels.map(String).sort(),
        courses: courses.map((course) => ({
          code: course._id.code,
          level: String(course._id.level),
          name: course.name,
        })),
      },
    };
  }
}
