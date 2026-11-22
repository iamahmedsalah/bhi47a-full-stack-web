import {
  formatStaffDisplayName,
  type StaffDisplayLike,
} from '@student-portal/shared';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import {
  AttendanceRecord,
  AttendanceRecordDocument,
} from '../schemas/attendance-record.schema';
import {
  AttendanceSession,
  AttendanceSessionDocument,
} from '../schemas/attendance-session.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import {
  CourseRegistration,
  CourseRegistrationDocument,
} from '../../registrations/schemas/course-registration.schema';
import {
  attendanceEnrollmentFilter,
  ATTENDANCE_NOT_ENROLLED,
} from './attendance-enrollment';
import {
  ManualMarkAttendanceDto,
  ManualStudentCheckInDto,
  QueryAttendanceRecordsDto,
  QueryAttendanceSessionsDto,
} from '../dto/attendance-session.dto';
import { AttendanceRealtimeService } from './attendance-realtime.service';
import {
  attendanceInstructor,
  findAttendanceInstructors,
  loadAttendanceInstructors,
} from './attendance-instructor';
import {
  createAttendanceRecord,
  isStandaloneTransactionError,
} from './attendance-record-write';
import {
  attendanceSessionFilter,
  attendanceSessionScope,
  type AttendanceViewer,
} from './attendance-query';
import {
  createAttendanceWorkbook,
  type AttendanceExportEntry,
} from './attendance-workbook';

@Injectable()
export class AttendanceReportService {
  private readonly logger = new Logger(AttendanceReportService.name);

  constructor(
    @InjectModel(AttendanceRecord.name)
    private recordModel: Model<AttendanceRecordDocument>,
    @InjectModel(AttendanceSession.name)
    private sessionModel: Model<AttendanceSessionDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    private realtimeService: AttendanceRealtimeService,
    @InjectModel(CourseRegistration.name)
    private registrationModel: Model<CourseRegistrationDocument>,
  ) {}

  async deleteSession(sessionId: string, user: AttendanceViewer) {
    const id = new Types.ObjectId(sessionId);
    let result: { deletedCount: number };
    try {
      result = await this.sessionModel.db.transaction(async (session) => {
        const deleted = await this.sessionModel.deleteOne(
          { _id: id, ...attendanceSessionScope(user) },
          { session },
        );
        if (deleted.deletedCount === 0) {
          throw new NotFoundException('Attendance session not found');
        }
        const { deletedCount } = await this.recordModel.deleteMany(
          { sessionId: id },
          { session },
        );
        return { deletedCount };
      });
    } catch (error) {
      if (!isStandaloneTransactionError(error)) throw error;
      throw new ServiceUnavailableException(
        'Deleting attendance sessions requires a MongoDB replica set',
      );
    }

    this.realtimeService.closeSessionStream(id.toString());
    this.logger.log(
      `User ${user._id} deleted attendance session ${id.toString()} with ${result.deletedCount} records`,
    );
    return result;
  }

  async deleteSessionRecords(
    sessionId: string,
    user: AttendanceViewer,
    recordIds: string[],
  ) {
    const sessionObjectId = new Types.ObjectId(sessionId);
    const session = await this.sessionModel.exists({
      _id: sessionObjectId,
      ...attendanceSessionScope(user),
    });
    if (!session) throw new NotFoundException('Attendance session not found');

    const { deletedCount } = await this.recordModel.deleteMany({
      sessionId: sessionObjectId,
      _id: { $in: recordIds.map((id) => new Types.ObjectId(id)) },
    });
    if (deletedCount > 0) {
      this.logger.log(
        `User ${user._id} deleted ${deletedCount} attendance records from session ${sessionId}`,
      );
    }
    return { deletedCount };
  }

  async exportAttendance(
    user: AttendanceViewer,
    query: QueryAttendanceSessionsDto,
    sessionId?: string,
  ) {
    const matchingInstructors = sessionId
      ? []
      : await findAttendanceInstructors(this.userModel, query.search);
    let filter = attendanceSessionFilter(
      user,
      query,
      new Date(),
      matchingInstructors,
    );
    if (sessionId) {
      if (!Types.ObjectId.isValid(sessionId))
        throw new BadRequestException('Invalid session ID');
      const session = await this.sessionModel.findById(sessionId).lean();
      if (!session) throw new NotFoundException('Attendance session not found');
      if (user.role !== 'admin' && session.createdBy.toString() !== user._id)
        throw new ForbiddenException(
          'You can export only your own attendance sessions',
        );
      filter = { _id: new Types.ObjectId(sessionId) };
    }
    const sessionModel = this.sessionModel;
    const recordModel = this.recordModel;
    const creatorIds = await sessionModel.distinct('createdBy', filter);
    const instructors = await loadAttendanceInstructors(
      this.userModel,
      creatorIds.map((createdBy) => ({ createdBy })),
    );
    async function* entries(): AsyncGenerator<AttendanceExportEntry> {
      const sessions = sessionModel
        .find(filter)
        .sort({ startsAt: -1, _id: -1 })
        .lean()
        .cursor();
      try {
        for await (const session of sessions) {
          const records = recordModel
            .find({ sessionId: session._id })
            .sort({ checkedInAt: 1, _id: 1 })
            .lean()
            .cursor();
          try {
            const instructor = attendanceInstructor(session, instructors);
            yield {
              session: {
                ...session,
                createdByName:
                  query.lang === 'ar'
                    ? instructor.createdByNameAr
                    : instructor.createdByNameEn,
              },
              records,
            };
          } finally {
            await records.close();
          }
        }
      } finally {
        await sessions.close();
      }
    }
    return createAttendanceWorkbook(entries(), query.lang || 'en');
  }

  /**
   * Retrieves paginated attendee records for a specific session.
   */
  async getSessionRecords(
    sessionId: string,
    query: QueryAttendanceRecordsDto,
  ): Promise<{
    items: (AttendanceRecord & { _id: Types.ObjectId })[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    if (!Types.ObjectId.isValid(sessionId)) {
      throw new BadRequestException('معرّف الجلسة غير صالح');
    }

    const filter: FilterQuery<AttendanceRecordDocument> = {
      sessionId: new Types.ObjectId(sessionId),
    };

    if (query.status && query.status !== 'all') {
      filter.status = query.status;
    }

    if (query.search?.trim()) {
      const searchRegex = new RegExp(
        query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      filter.$or = [{ studentName: searchRegex }, { studentCode: searchRegex }];
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(200, Math.max(1, query.limit || 50));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.recordModel
        .find(filter)
        .sort({ checkedInAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.recordModel.countDocuments(filter),
    ]);

    // Resolve both languages for existing records without rewriting audit history.
    const markerIds = [
      ...new Set(
        items.flatMap((item) =>
          item.markedBy ? [item.markedBy.toString()] : [],
        ),
      ),
    ];
    const markers = markerIds.length
      ? await this.userModel
          .find({ _id: { $in: markerIds } })
          .select('name nameAr role staffType titlePrefix')
          .lean()
      : [];
    const markersById = new Map(
      markers.map((marker) => [marker._id.toString(), marker]),
    );

    return {
      items: items.map((item) => {
        const marker =
          item.markedBy && markersById.get(item.markedBy.toString());
        return {
          ...item,
          markedByNameAr: marker
            ? formatStaffDisplayName(marker, 'ar')
            : item.markedByNameAr || item.markedByName,
          markedByNameEn: marker
            ? formatStaffDisplayName(marker, 'en')
            : item.markedByNameEn || item.markedByName,
        };
      }),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Staff manual correction of student attendance status with complete audit log.
   */
  async manualUpdateRecord(
    recordId: string,
    staffUser: { _id: string; name: string } & StaffDisplayLike,
    dto: ManualMarkAttendanceDto,
  ) {
    if (!Types.ObjectId.isValid(recordId)) {
      throw new BadRequestException('معرّف السجل غير صالح');
    }

    const record = await this.recordModel.findById(recordId);
    if (!record) {
      throw new NotFoundException('سجل الحضور غير موجود');
    }

    const previousStatus = record.status;
    record.status = dto.status;
    if (dto.note) {
      record.note = dto.note;
    }
    record.markedBy = new Types.ObjectId(staffUser._id);
    record.markedByName = staffUser.name;
    record.markedByNameAr = formatStaffDisplayName(staffUser, 'ar');
    record.markedByNameEn = formatStaffDisplayName(staffUser, 'en');

    record.auditTrail.push({
      action: 'MANUAL_STATUS_OVERRIDE',
      modifiedBy: new Types.ObjectId(staffUser._id),
      modifiedByName: staffUser.name,
      previousStatus,
      newStatus: dto.status,
      reason: dto.reason || 'Manual modification by academic staff',
      timestamp: new Date(),
    });

    await record.save();

    // Broadcast change
    this.realtimeService.publishEvent(record.sessionId.toString(), {
      type: 'STATUS_CHANGE',
      record: {
        id: record._id.toString(),
        studentId: record.studentId.toString(),
        studentCode: record.studentCode,
        studentName: record.studentName,
        status: record.status,
        method: record.method,
        checkedInAt: record.checkedInAt,
        note: record.note,
        markedByName: record.markedByName,
        markedByNameAr: record.markedByNameAr,
        markedByNameEn: record.markedByNameEn,
      },
      timestamp: new Date(),
    });

    return record;
  }

  /**
   * Allows staff to manually mark a student present when phone/camera fails.
   */
  async manualStudentCheckIn(
    sessionId: string,
    staffUser: { _id: string; name: string } & StaffDisplayLike,
    dto: ManualStudentCheckInDto,
  ) {
    if (!Types.ObjectId.isValid(sessionId)) {
      throw new BadRequestException('معرّف الجلسة غير صالح');
    }

    const session = await this.sessionModel.findById(sessionId).lean();
    if (!session) {
      throw new NotFoundException('جلسة الحضور غير موجودة');
    }

    const studentUser = await this.userModel
      .findOne({
        role: 'student',
        $or: [
          { studentCode: dto.studentCode.trim() },
          { userCode: dto.studentCode.trim() },
        ],
      })
      .lean();

    if (!studentUser) {
      throw new NotFoundException(
        `لم يتم العثور على طالب بالكود [${dto.studentCode}]`,
      );
    }

    const isEnrolled = await this.registrationModel.exists(
      attendanceEnrollmentFilter(studentUser._id, session),
    );
    if (!isEnrolled) {
      throw new ForbiddenException(ATTENDANCE_NOT_ENROLLED);
    }

    // Check duplicate
    const existing = await this.recordModel.findOne({
      sessionId: session._id,
      studentId: studentUser._id,
    });

    const now = new Date();

    if (existing) {
      existing.status = dto.status;
      existing.note = dto.reason;
      existing.markedBy = new Types.ObjectId(staffUser._id);
      existing.markedByName = staffUser.name;
      existing.markedByNameAr = formatStaffDisplayName(staffUser, 'ar');
      existing.markedByNameEn = formatStaffDisplayName(staffUser, 'en');
      existing.auditTrail.push({
        action: 'MANUAL_OVERRIDE_EXISTING',
        modifiedBy: new Types.ObjectId(staffUser._id),
        modifiedByName: staffUser.name,
        newStatus: dto.status,
        reason: dto.reason || 'Manual registration by staff member',
        timestamp: now,
      });
      await existing.save();
      return existing;
    }

    const newRecord = await createAttendanceRecord(
      this.sessionModel,
      this.recordModel,
      {
        sessionId: session._id,
        studentId: studentUser._id,
        studentCode: studentUser.studentCode || dto.studentCode,
        studentName: studentUser.name,
        courseCode: session.courseCode,
        sessionType: session.sessionType,
        status: dto.status,
        method: 'manual',
        checkedInAt: now,
        markedBy: new Types.ObjectId(staffUser._id),
        markedByName: staffUser.name,
        markedByNameAr: formatStaffDisplayName(staffUser, 'ar'),
        markedByNameEn: formatStaffDisplayName(staffUser, 'en'),
        note: dto.reason,
        auditTrail: [
          {
            action: 'MANUAL_STAFF_REGISTRATION',
            modifiedBy: new Types.ObjectId(staffUser._id),
            modifiedByName: staffUser.name,
            newStatus: dto.status,
            reason: dto.reason || 'Manual registration by staff member',
            timestamp: now,
          },
        ],
      },
    );

    this.realtimeService.publishEvent(session._id.toString(), {
      type: 'CHECK_IN',
      record: {
        id: newRecord._id.toString(),
        studentId: studentUser._id.toString(),
        studentCode: newRecord.studentCode,
        studentName: newRecord.studentName,
        status: newRecord.status,
        method: newRecord.method,
        checkedInAt: newRecord.checkedInAt,
        note: newRecord.note,
        markedByName: newRecord.markedByName,
        markedByNameAr: newRecord.markedByNameAr,
        markedByNameEn: newRecord.markedByNameEn,
      },
      timestamp: now,
    });

    return newRecord;
  }

  /**
   * Retrieves individual session-by-session history for a student.
   */
  async getStudentAttendanceHistory(studentId: string) {
    const records = await this.recordModel
      .find({ studentId: new Types.ObjectId(studentId) })
      .sort({ checkedInAt: -1 })
      .lean();

    const totalSessions = records.length;
    const presentCount = records.filter((r) => r.status === 'present').length;
    const lateCount = records.filter((r) => r.status === 'late').length;
    const excusedCount = records.filter((r) => r.status === 'excused').length;
    const absentCount = records.filter((r) => r.status === 'absent').length;

    const attendanceRate =
      totalSessions > 0
        ? Math.round(((presentCount + lateCount) / totalSessions) * 100)
        : 100;

    // Aggregate course-by-course attendance
    const coursesMap = new Map<
      string,
      {
        courseCode: string;
        totalSessions: number;
        presentCount: number;
        lateCount: number;
        absentCount: number;
        excusedCount: number;
        attendanceRate: number;
      }
    >();

    for (const r of records) {
      const code = r.courseCode;
      if (!coursesMap.has(code)) {
        coursesMap.set(code, {
          courseCode: code,
          totalSessions: 0,
          presentCount: 0,
          lateCount: 0,
          absentCount: 0,
          excusedCount: 0,
          attendanceRate: 100,
        });
      }
      const entry = coursesMap.get(code)!;
      entry.totalSessions += 1;
      if (r.status === 'present') entry.presentCount += 1;
      else if (r.status === 'late') entry.lateCount += 1;
      else if (r.status === 'excused') entry.excusedCount += 1;
      else if (r.status === 'absent') entry.absentCount += 1;
    }

    for (const entry of coursesMap.values()) {
      entry.attendanceRate =
        entry.totalSessions > 0
          ? Math.round(
              ((entry.presentCount + entry.lateCount) / entry.totalSessions) *
                100,
            )
          : 100;
    }

    return {
      summary: {
        totalSessions,
        presentCount,
        lateCount,
        excusedCount,
        absentCount,
        attendanceRate,
      },
      courses: Array.from(coursesMap.values()),
      records,
    };
  }

  /**
   * Retrieves summary report for a course across sessions.
   */
  async getCourseReport(courseCode: string) {
    const sessions = await this.sessionModel
      .find({ courseCode: courseCode.trim().toUpperCase() })
      .sort({ startsAt: -1 })
      .limit(30)
      .lean();

    const sessionIds = sessions.map((s) => s._id);

    const records = await this.recordModel
      .find({ sessionId: { $in: sessionIds } })
      .lean();

    return {
      courseCode,
      totalSessionsHeld: sessions.length,
      sessions: sessions.map((s) => {
        const sessionRecords = records.filter(
          (r) => r.sessionId.toString() === s._id.toString(),
        );
        return {
          id: s._id,
          date: s.startsAt,
          sessionType: s.sessionType,
          status: s.status,
          totalAttendees: sessionRecords.length,
          present: sessionRecords.filter((r) => r.status === 'present').length,
          late: sessionRecords.filter((r) => r.status === 'late').length,
        };
      }),
    };
  }
}
