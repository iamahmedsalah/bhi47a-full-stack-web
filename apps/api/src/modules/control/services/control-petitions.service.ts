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
  CONTROL_MIDTERM_STATES,
  CONTROL_SCORELESS_STATES,
  PERMISSIONS,
  calculateGradeScale,
  computeCoursework,
  validateMark,
  type GradeStatus,
} from '@student-portal/shared';
import type { AuthenticatedUser } from '../../auth/types/authenticated-request';
import {
  buildPaginationOptions,
  createPaginatedResult,
} from '../../../common/utils/pagination.util';
import {
  Course,
  type CourseDocument,
} from '../../courses/schemas/course.schema';
import { Grade, type GradeDocument } from '../../grades/schemas/grade.schema';
import {
  StudentProfile,
  type StudentProfileDocument,
} from '../../students/schemas/student-profile.schema';
import { User, type UserDocument } from '../../users/schemas/user.schema';
import {
  ControlPetition,
  type ControlPetitionDocument,
  type ControlPetitionStatus,
  type ControlPetitionStudentItem,
} from '../schemas/control-petition.schema';
import {
  ControlSheet,
  type ControlSheetDocument,
} from '../schemas/control-sheet.schema';
import {
  GradeAuditLog,
  type GradeAuditLogDocument,
} from '../schemas/grade-audit-log.schema';
import type {
  CreateControlPetitionDto,
  DecideControlPetitionDto,
  ListControlPetitionsQueryDto,
} from '../dto/control-petition.dto';
import { ControlAccessService } from './control-access.service';
import { ControlSheetsService } from './control-sheets.service';
import { GradingSchemeService } from './grading-scheme.service';
import { toControlEntry } from '../utils/control-entry.util';

const SCORELESS = CONTROL_SCORELESS_STATES as readonly string[];
const MIDTERM_STATES = CONTROL_MIDTERM_STATES as readonly string[];
const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class ControlPetitionsService {
  constructor(
    @InjectModel(ControlPetition.name)
    private readonly petitionModel: Model<ControlPetitionDocument>,
    @InjectModel(ControlSheet.name)
    private readonly sheetModel: Model<ControlSheetDocument>,
    @InjectModel(Grade.name)
    private readonly gradeModel: Model<GradeDocument>,
    @InjectModel(GradeAuditLog.name)
    private readonly auditModel: Model<GradeAuditLogDocument>,
    @InjectModel(Course.name)
    private readonly courseModel: Model<CourseDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(StudentProfile.name)
    private readonly profileModel: Model<StudentProfileDocument>,
    private readonly access: ControlAccessService,
    private readonly sheets: ControlSheetsService,
    private readonly schemes: GradingSchemeService,
  ) {}

  async createPetition(user: AuthenticatedUser, dto: CreateControlPetitionDto) {
    this.access.assertPermission(user, PERMISSIONS.CONTROL_PETITIONS_CREATE);
    const { sheet, course } = await this.sheets.requireSheetInScope(
      user,
      dto.sheetId,
    );
    await this.access.assertCourseGradeWrite(user, sheet.courseId);
    const [scheme, rules] = await Promise.all([
      this.schemes.getScheme(
        String(sheet.courseId),
        sheet.academicYear,
        sheet.semester,
      ),
      this.schemes.requireEnabledComponent(
        String(sheet.courseId),
        sheet.academicYear,
        sheet.semester,
        sheet.component,
      ),
    ]);

    const seenStudents = new Set<string>();
    for (const item of dto.items) {
      if (seenStudents.has(item.studentId)) {
        throw new BadRequestException(
          'Student appears more than once in the same petition request',
        );
      }
      seenStudents.add(item.studentId);
    }

    const studentObjectIds = [...seenStudents].map(
      (id) => new Types.ObjectId(id),
    );
    const [students, rosterIds, heldProfiles, existingGrades, activePetitions] =
      await Promise.all([
        this.userModel
          .find({ _id: { $in: studentObjectIds }, role: 'student' })
          .select('name nameAr studentCode')
          .lean(),
        this.sheets.getRosterStudentIds(
          course.code,
          sheet.academicYear,
          sheet.semester,
          studentObjectIds,
        ),
        this.profileModel
          .find({ userId: { $in: studentObjectIds }, isBlocked: true })
          .select('userId')
          .lean(),
        this.gradeModel
          .find({
            courseId: sheet.courseId,
            academicYear: sheet.academicYear,
            semester: sheet.semester,
            examType: sheet.component,
            studentId: { $in: studentObjectIds },
          })
          .lean(),
        this.petitionModel
          .find({
            sheetId: sheet._id,
            status: 'PENDING',
            'items.studentId': { $in: studentObjectIds },
          })
          .select('items.studentId items.studentCode')
          .lean(),
      ]);

    const studentById = new Map(students.map((s) => [String(s._id), s]));
    const heldIds = new Set(heldProfiles.map((p) => String(p.userId)));
    const gradeByStudent = new Map(
      existingGrades.map((g) => [String(g.studentId), g]),
    );
    const pendingStudentIds = new Set<string>();
    for (const p of activePetitions) {
      for (const it of p.items) {
        if (it.decision === 'PENDING') {
          pendingStudentIds.add(String(it.studentId));
        }
      }
    }

    const petitionItems: ControlPetitionStudentItem[] = [];

    for (const item of dto.items) {
      const student = studentById.get(item.studentId);
      if (!student) {
        throw new BadRequestException(`Student not found: ${item.studentId}`);
      }
      if (!rosterIds.has(item.studentId)) {
        throw new BadRequestException(
          `الطالب ${student.studentCode ?? student.name} غير مسجل في هذا المقرر لهذا الفصل الدراسي`,
        );
      }
      if (heldIds.has(item.studentId)) {
        throw new ForbiddenException(
          `الطالب ${student.studentCode ?? student.name} محجوب ماليًا ولا يمكن تعديل درجته قبل رفع الحجب`,
        );
      }
      if (pendingStudentIds.has(item.studentId)) {
        throw new ConflictException(
          `يوجد طلب التماس معلّق بالفعل للطالب ${student.studentCode ?? student.name} في هذا الكشف`,
        );
      }

      const proposedStatus: GradeStatus = item.proposedStatus ?? 'present';
      const hasScore =
        item.proposedScore !== undefined && item.proposedScore !== null;

      if (
        sheet.component === 'midterm' &&
        !MIDTERM_STATES.includes(proposedStatus)
      ) {
        throw new BadRequestException(
          'الميدتيرم يقبل حالات (حاضر / غائب / محروم) فقط',
        );
      }

      let proposedScore: number | null = null;
      let proposedAttendanceMark: number | null = null;
      let proposedQuizzesMark: number | null = null;

      if (SCORELESS.includes(proposedStatus)) {
        if (hasScore) {
          throw new BadRequestException(
            `الحالة (${proposedStatus}) للطالب ${student.studentCode} لا تقبل درجة عددية`,
          );
        }
      } else {
        if (!hasScore) {
          throw new BadRequestException(
            `يجب إدخال الدرجة المقترحة للطالب ${student.studentCode}`,
          );
        }
        const markError = validateMark(item.proposedScore as number, rules);
        if (markError) {
          throw new BadRequestException(
            `درجة غير صالحة للطالب ${student.studentCode}: الحد الأقصى ${rules.max} والخطوة ${rules.step}`,
          );
        }
        proposedScore = round2(item.proposedScore as number);

        if (sheet.component === 'coursework') {
          if (
            item.proposedAttendanceMark == null ||
            item.proposedQuizzesMark == null
          ) {
            throw new BadRequestException(
              `يجب إدخال درجتي الحضور والاختبارات لأعمال السنة للطالب ${student.studentCode}`,
            );
          }
          if (
            item.proposedAttendanceMark > scheme.courseworkAttendanceMax ||
            item.proposedQuizzesMark > scheme.courseworkQuizzesMax
          ) {
            throw new BadRequestException(
              `تجاوز الحد المخصص للحضور (${scheme.courseworkAttendanceMax}) أو الاختبارات (${scheme.courseworkQuizzesMax}) للطالب ${student.studentCode}`,
            );
          }
          const computed = computeCoursework(
            item.proposedAttendanceMark,
            item.proposedQuizzesMark,
          );
          if (computed !== proposedScore) {
            throw new BadRequestException(
              `مجموع الحضور والاختبارات لا يساوي الدرجة المقترحة للطالب ${student.studentCode}`,
            );
          }
          proposedAttendanceMark = round2(item.proposedAttendanceMark);
          proposedQuizzesMark = round2(item.proposedQuizzesMark);
        }
      }

      const existing = gradeByStudent.get(item.studentId);
      if (
        sheet.workflowState === 'PARTIAL_OPEN' &&
        sheet.partialCycle?.allowedStudentIds?.includes(item.studentId)
      ) {
        throw new ConflictException(
          `لا يمكن تقديم التماس للطالب ${student.studentCode ?? student.name} لأنه مشمول حاليًا في دورة الرصد الجزئي قبل اعتمادها`,
        );
      }
      if (
        !existing ||
        existing.cleared ||
        typeof existing.controlApprovedRev !== 'number' ||
        existing.controlApprovedRev !== (existing.rev ?? 0)
      ) {
        throw new BadRequestException(
          `لا يمكن تقديم التماس على درجة الطالب ${student.studentCode ?? student.name} لأنها غير معتمدة أو ما زالت مسودة`,
        );
      }
      const currentEntry = toControlEntry(existing ?? null);
      const currentScore = currentEntry?.score ?? null;
      const currentStatus =
        (currentEntry?.status as GradeStatus | null) ?? null;
      const currentAttendanceMark =
        existing && !existing.cleared && !SCORELESS.includes(existing.status)
          ? (existing.attendanceMark ?? null)
          : null;
      const currentQuizzesMark =
        existing && !existing.cleared && !SCORELESS.includes(existing.status)
          ? (existing.quizzesMark ?? null)
          : null;

      const isUnchanged =
        currentStatus === proposedStatus &&
        currentScore === proposedScore &&
        (sheet.component !== 'coursework' ||
          (currentAttendanceMark === proposedAttendanceMark &&
            currentQuizzesMark === proposedQuizzesMark));

      if (isUnchanged) {
        throw new BadRequestException(
          `الدرجة المقترحة للطالب ${student.studentCode} مطابقة للدرجة الحالية دون أي تغيير`,
        );
      }

      petitionItems.push({
        studentId: new Types.ObjectId(item.studentId),
        studentCode: student.studentCode ?? '',
        studentName: student.name,
        studentNameAr: student.nameAr ?? null,
        currentScore,
        currentStatus,
        currentAttendanceMark,
        currentQuizzesMark,
        baselineRev: existing?.rev ?? 0,
        proposedScore,
        proposedStatus,
        proposedAttendanceMark,
        proposedQuizzesMark,
        studentReason: item.studentReason?.trim() || null,
        decision: 'PENDING',
        decisionNote: null,
        appliedRev: null,
        decidedAt: null,
      });
    }

    const created = await this.petitionModel.create({
      sheetId: sheet._id,
      courseId: course._id,
      courseCode: String(course.code).toUpperCase(),
      courseName: course.name,
      courseNameAr: course.nameAr ?? null,
      courseNameEn: course.nameEn ?? null,
      courseLevel: (course as { level?: string }).level ?? null,
      academicYear: sheet.academicYear,
      semester: sheet.semester,
      component: sheet.component,
      status: 'PENDING',
      reason: dto.reason.trim(),
      requestedBy: new Types.ObjectId(user._id),
      requestedAt: new Date(),
      requesterSeenAt: new Date(),
      items: petitionItems,
    });

    return this.getPetition(user, String(created._id));
  }

  async getSummary(
    user: AuthenticatedUser,
    query?: { academicYear?: string; semester?: string; sheetId?: string },
  ) {
    const caps = this.access.getCapabilities(user);
    if (
      !caps.canAccess ||
      (!caps.canCreatePetitions &&
        !caps.canApprovePetitions &&
        !caps.canView &&
        user.role !== 'admin')
    ) {
      return {
        pendingForApprovalCount: 0,
        unreadDecisionsCount: 0,
        sheetPendingCount: 0,
      };
    }

    const scope = await this.access.petitionScope(user, query ?? {});
    const termFilter: Record<string, unknown> = { ...scope };
    if (query?.academicYear) termFilter.academicYear = query.academicYear;
    if (query?.semester) termFilter.semester = query.semester;

    let resolvedSheetObjectId: Types.ObjectId | null = null;
    if (query?.sheetId) {
      if (Types.ObjectId.isValid(query.sheetId)) {
        resolvedSheetObjectId = new Types.ObjectId(query.sheetId);
      } else {
        const s = await this.sheetModel
          .findOne({ slug: query.sheetId.toLowerCase() })
          .select('_id')
          .lean();
        if (s) resolvedSheetObjectId = s._id;
      }
    }

    const [pendingForApprovalCount, unreadDecisionsCount, sheetPendingCount] =
      await Promise.all([
        caps.canApprovePetitions
          ? this.petitionModel.countDocuments({
              ...termFilter,
              status: 'PENDING',
              ...(user.role !== 'admin'
                ? { requestedBy: { $ne: new Types.ObjectId(user._id) } }
                : {}),
            })
          : Promise.resolve(0),
        caps.canCreatePetitions
          ? this.petitionModel.countDocuments({
              ...termFilter,
              requestedBy: new Types.ObjectId(user._id),
              status: { $ne: 'PENDING' },
              requesterSeenAt: null,
            })
          : Promise.resolve(0),
        resolvedSheetObjectId
          ? this.petitionModel.countDocuments({
              ...scope,
              sheetId: resolvedSheetObjectId,
              status: 'PENDING',
            })
          : Promise.resolve(0),
      ]);

    return {
      pendingForApprovalCount,
      unreadDecisionsCount,
      sheetPendingCount,
    };
  }

  async listPetitions(
    user: AuthenticatedUser,
    query: ListControlPetitionsQueryDto,
  ) {
    const caps = this.access.getCapabilities(user);
    if (
      !caps.canAccess ||
      (!caps.canCreatePetitions &&
        !caps.canApprovePetitions &&
        !caps.canView &&
        user.role !== 'admin')
    ) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const filter: Record<string, unknown> = {};
    const scope = await this.access.petitionScope(user, query);
    if (Object.keys(scope).length) filter.$and = [scope];
    if (query.academicYear) filter.academicYear = query.academicYear;
    if (query.semester) filter.semester = query.semester;
    if (query.component) filter.component = query.component;
    if (query.status) filter.status = query.status;
    if (query.courseId) filter.courseId = new Types.ObjectId(query.courseId);

    if (query.sheetId) {
      if (Types.ObjectId.isValid(query.sheetId)) {
        filter.sheetId = new Types.ObjectId(query.sheetId);
      } else {
        const sheet = await this.sheetModel
          .findOne({ slug: query.sheetId.toLowerCase() })
          .select('_id')
          .lean();
        if (!sheet) {
          return createPaginatedResult(
            [],
            0,
            query.page ?? 1,
            query.limit ?? 20,
          );
        }
        filter.sheetId = sheet._id;
      }
    }

    if (query.mine || (!caps.canApprovePetitions && !caps.scopeAll)) {
      filter.requestedBy = new Types.ObjectId(user._id);
    }

    const needle = query.search?.trim();
    if (needle) {
      const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [
        { courseCode: regex },
        { courseName: regex },
        { courseNameAr: regex },
        { reason: regex },
        { 'items.studentCode': regex },
        { 'items.studentName': regex },
        { 'items.studentNameAr': regex },
      ];
    }

    const { page, limit, skip } = buildPaginationOptions(query);
    const [docs, total] = await Promise.all([
      this.petitionModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.petitionModel.countDocuments(filter),
    ]);

    const actorIds = new Set<string>();
    for (const doc of docs) {
      actorIds.add(String(doc.requestedBy));
      if (doc.reviewedBy) actorIds.add(String(doc.reviewedBy));
    }
    const actors = actorIds.size
      ? await this.userModel
          .find({
            _id: { $in: [...actorIds].map((id) => new Types.ObjectId(id)) },
          })
          .select('name nameAr role staffType titlePrefix')
          .lean()
      : [];
    const actorById = new Map(actors.map((a) => [String(a._id), a]));

    const items = docs.map((doc) => this.serializePetition(doc, actorById));
    return createPaginatedResult(items, total, page, limit);
  }

  async getPetition(user: AuthenticatedUser, id: string) {
    const caps = this.access.getCapabilities(user);
    if (
      !caps.canAccess ||
      (!caps.canCreatePetitions &&
        !caps.canApprovePetitions &&
        !caps.canView &&
        user.role !== 'admin')
    ) {
      throw new ForbiddenException('Insufficient permissions');
    }

    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Petition not found');
    }

    const doc = await this.petitionModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Petition not found');
    if (
      !caps.scopeAll &&
      !caps.canApprovePetitions &&
      String(doc.requestedBy) !== user._id
    ) {
      throw new ForbiddenException('Petition is outside your assigned scope');
    }
    await this.assertPetitionScope(user, doc);

    const actorIds = [String(doc.requestedBy)];
    if (doc.reviewedBy) actorIds.push(String(doc.reviewedBy));
    const [actors, liveGrades] = await Promise.all([
      this.userModel
        .find({ _id: { $in: actorIds.map((a) => new Types.ObjectId(a)) } })
        .select('name nameAr role staffType titlePrefix')
        .lean(),
      this.gradeModel
        .find({
          courseId: doc.courseId,
          academicYear: doc.academicYear,
          semester: doc.semester,
          examType: doc.component,
          studentId: { $in: doc.items.map((it) => it.studentId) },
        })
        .select('studentId grade status rev cleared attendanceMark quizzesMark')
        .lean(),
    ]);

    const actorById = new Map(actors.map((a) => [String(a._id), a]));
    const liveByStudent = new Map(
      liveGrades.map((g) => [String(g.studentId), g]),
    );

    return this.serializePetition(doc, actorById, liveByStudent);
  }

  async decidePetition(
    user: AuthenticatedUser,
    id: string,
    dto: DecideControlPetitionDto,
  ) {
    this.access.assertPermission(user, PERMISSIONS.CONTROL_PETITIONS_APPROVE);
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Petition not found');
    }

    const target = await this.petitionModel.findById(id).lean();
    if (!target) throw new NotFoundException('Petition not found');
    await this.assertPetitionScope(user, target);
    if (target.status !== 'PENDING') {
      throw new ConflictException('تم البت في طلب الالتماس هذا مسبقًا');
    }

    if (
      user.role !== 'admin' &&
      String(target.requestedBy) === String(user._id)
    ) {
      throw new ForbiddenException(
        'مقدّم طلب الالتماس لا يمكنه اعتماد طلبه بنفسه (فصل المهام)',
      );
    }

    const decisionByStudent = new Map(
      dto.items.map((item) => [item.studentId, item]),
    );
    for (const item of target.items) {
      if (!decisionByStudent.has(String(item.studentId))) {
        throw new BadRequestException(
          `يجب تحديد القرار (موافقة أو رفض) للطالب ${item.studentCode}`,
        );
      }
    }

    const session = await this.petitionModel.db.startSession();
    try {
      await session.withTransaction(async () => {
        const petition = await this.petitionModel
          .findOne({ _id: target._id, status: 'PENDING' })
          .session(session)
          .lean();
        if (!petition) {
          throw new ConflictException('تم البت في طلب الالتماس هذا مسبقًا');
        }

        const [sheet, course, scheme] = await Promise.all([
          this.sheetModel.findById(petition.sheetId).session(session).lean(),
          this.courseModel.findById(petition.courseId).session(session).lean(),
          this.schemes.getScheme(
            String(petition.courseId),
            petition.academicYear,
            petition.semester,
            session,
          ),
        ]);
        if (!sheet || !course) {
          throw new NotFoundException('Sheet or course not found');
        }
        const rules = scheme.components.find(
          (c) => c.key === petition.component,
        );
        if (!rules) {
          throw new BadRequestException('Component rules not found');
        }

        const existingGrades = await this.gradeModel
          .find({
            courseId: petition.courseId,
            academicYear: petition.academicYear,
            semester: petition.semester,
            examType: petition.component,
            studentId: { $in: petition.items.map((it) => it.studentId) },
          })
          .session(session)
          .lean();
        const gradeByStudent = new Map(
          existingGrades.map((g) => [String(g.studentId), g]),
        );

        const now = new Date();
        const updatedItems: ControlPetitionStudentItem[] = [];
        const auditRows: Array<Record<string, unknown>> = [];
        let approvedCount = 0;
        let rejectedCount = 0;

        for (const item of petition.items) {
          const studentIdStr = String(item.studentId);
          const decisionInput = decisionByStudent.get(studentIdStr)!;
          const existing = gradeByStudent.get(studentIdStr);
          const currentEntry = toControlEntry(existing ?? null);
          const oldSnapshot = currentEntry
            ? {
                score: currentEntry.score,
                status: currentEntry.status,
                isPublished: currentEntry.isPublished,
                rev: currentEntry.rev,
                attendanceMark: existing?.attendanceMark ?? null,
                quizzesMark: existing?.quizzesMark ?? null,
              }
            : null;

          if (decisionInput.decision === 'APPROVED') {
            if (
              sheet.workflowState === 'PARTIAL_OPEN' &&
              sheet.partialCycle?.allowedStudentIds?.includes(studentIdStr)
            ) {
              throw new ConflictException(
                `الطالب ${item.studentCode} مشمول حاليًا في دورة الرصد الجزئي؛ يجب اعتماد الرصد الجزئي أولًا`,
              );
            }
            if (
              !existing ||
              existing.cleared ||
              typeof existing.controlApprovedRev !== 'number' ||
              existing.controlApprovedRev !== (existing.rev ?? 0)
            ) {
              throw new ConflictException(
                `درجة الطالب ${item.studentCode} لم تعد معتمدة أو ما زالت مسودة`,
              );
            }
            const currentRev = existing?.rev ?? 0;
            if (currentRev !== item.baselineRev) {
              throw new ConflictException(
                `تغيرت درجة الطالب ${item.studentCode} في الكشف بعد تقديم الالتماس؛ يرجى مراجعة الدرجة الحالية`,
              );
            }

            const status = item.proposedStatus;
            const score = SCORELESS.includes(status)
              ? null
              : (item.proposedScore ?? 0);
            const numericGrade = score ?? 0;
            const percentage =
              rules.max > 0 && score !== null
                ? round2((numericGrade / rules.max) * 100)
                : 0;
            const scale = calculateGradeScale(percentage, status);
            const newRev = currentRev + 1;
            const keepApproved = ['APPROVED', 'PARTIAL_OPEN'].includes(
              sheet.workflowState ?? '',
            );

            const filter = {
              studentId: item.studentId,
              courseId: petition.courseId,
              academicYear: petition.academicYear,
              semester: petition.semester,
              examType: petition.component,
              ...(currentRev === 0
                ? { rev: { $in: [0, null] } }
                : { rev: currentRev }),
            };

            const setPayload: Record<string, unknown> = {
              studentId: item.studentId,
              studentCode: item.studentCode,
              courseId: course._id,
              courseCode: course.code,
              courseName: course.name,
              courseNameAr: course.nameAr,
              courseNameEn: course.nameEn || course.name,
              examType: petition.component,
              grade: numericGrade,
              maxGrade: rules.max,
              percentage,
              letterGrade: scale.letter,
              gradePoints: scale.points,
              status,
              academicYear: petition.academicYear,
              semester: petition.semester,
              updatedBy: new Types.ObjectId(user._id),
              controlManaged: true,
              cleared: false,
              isPublished: existing?.isPublished ?? false,
              ...(keepApproved ? { controlApprovedRev: newRev } : {}),
              ...(petition.component === 'coursework' && score !== null
                ? {
                    attendanceMark: item.proposedAttendanceMark,
                    quizzesMark: item.proposedQuizzesMark,
                  }
                : {}),
            };

            const unsetPayload: Record<string, unknown> = {
              ...(!keepApproved ? { controlApprovedRev: '' } : {}),
              ...(petition.component !== 'coursework' || score === null
                ? { attendanceMark: '', quizzesMark: '' }
                : {}),
            };

            const updatedGrade = await this.gradeModel
              .findOneAndUpdate(
                filter,
                {
                  $set: setPayload,
                  $inc: { rev: 1 },
                  ...(Object.keys(unsetPayload).length
                    ? { $unset: unsetPayload }
                    : {}),
                },
                {
                  upsert: !existing && currentRev === 0,
                  new: true,
                  session,
                },
              )
              .lean();

            if (!updatedGrade) {
              throw new ConflictException(
                `تعذر تحديث درجة الطالب ${item.studentCode} بسبب تعديل متزامن`,
              );
            }

            const auditReason = [
              `اعتماد التماس: ${petition.reason}`,
              item.studentReason ? `(${item.studentReason})` : null,
              decisionInput.decisionNote?.trim()
                ? `— ملاحظة الاعتماد: ${decisionInput.decisionNote.trim()}`
                : null,
            ]
              .filter(Boolean)
              .join(' ')
              .slice(0, 500);

            auditRows.push({
              sheetId: sheet._id,
              gradeId: updatedGrade._id,
              studentId: item.studentId,
              courseId: petition.courseId,
              academicYear: petition.academicYear,
              semester: petition.semester,
              component: petition.component,
              action: 'PETITION_APPROVE',
              source: 'GRID',
              actorId: new Types.ObjectId(user._id),
              oldValue: oldSnapshot,
              newValue: {
                score,
                status,
                isPublished: updatedGrade.isPublished ?? false,
                rev: newRev,
                attendanceMark:
                  petition.component === 'coursework'
                    ? (item.proposedAttendanceMark ?? null)
                    : null,
                quizzesMark:
                  petition.component === 'coursework'
                    ? (item.proposedQuizzesMark ?? null)
                    : null,
              },
              reason: auditReason,
              at: now,
            });

            approvedCount += 1;
            updatedItems.push({
              ...item,
              decision: 'APPROVED',
              decisionNote: decisionInput.decisionNote?.trim() || null,
              appliedRev: newRev,
              decidedAt: now,
            });
          } else {
            const rejectReason = [
              `رفض التماس: ${petition.reason}`,
              decisionInput.decisionNote?.trim()
                ? `— سبب الرفض: ${decisionInput.decisionNote.trim()}`
                : null,
            ]
              .filter(Boolean)
              .join(' ')
              .slice(0, 500);

            auditRows.push({
              sheetId: sheet._id,
              gradeId: existing?._id,
              studentId: item.studentId,
              courseId: petition.courseId,
              academicYear: petition.academicYear,
              semester: petition.semester,
              component: petition.component,
              action: 'PETITION_REJECT',
              source: 'GRID',
              actorId: new Types.ObjectId(user._id),
              oldValue: oldSnapshot,
              newValue: {
                score: item.proposedScore,
                status: item.proposedStatus,
                attendanceMark: item.proposedAttendanceMark ?? null,
                quizzesMark: item.proposedQuizzesMark ?? null,
              },
              reason: rejectReason,
              at: now,
            });

            rejectedCount += 1;
            updatedItems.push({
              ...item,
              decision: 'REJECTED',
              decisionNote: decisionInput.decisionNote?.trim() || null,
              appliedRev: null,
              decidedAt: now,
            });
          }
        }

        if (auditRows.length > 0) {
          await this.auditModel.insertMany(auditRows, {
            session,
            ordered: true,
          });
        }

        if (approvedCount > 0) {
          await this.sheetModel.updateOne(
            { _id: sheet._id },
            { $inc: { revision: 1 } },
            { session },
          );
          await this.schemes.freeze(
            String(petition.courseId),
            petition.academicYear,
            petition.semester,
            session,
          );
        }

        const overallStatus: ControlPetitionStatus =
          approvedCount > 0 && rejectedCount === 0
            ? 'APPROVED'
            : rejectedCount > 0 && approvedCount === 0
              ? 'REJECTED'
              : 'PARTIALLY_APPROVED';

        await this.petitionModel.updateOne(
          { _id: petition._id },
          {
            $set: {
              status: overallStatus,
              items: updatedItems,
              reviewedBy: new Types.ObjectId(user._id),
              reviewedAt: now,
              reviewNote: dto.reviewNote?.trim() || null,
              requesterSeenAt: null,
            },
          },
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    return this.getPetition(user, id);
  }

  async markSeen(user: AuthenticatedUser, id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Petition not found');
    }
    const petition = await this.petitionModel.findById(id).lean();
    if (!petition) throw new NotFoundException('Petition not found');

    if (
      user.role !== 'admin' &&
      String(petition.requestedBy) !== String(user._id)
    ) {
      throw new ForbiddenException('Only the requester may mark this as seen');
    }
    this.access.assertPermission(user, PERMISSIONS.CONTROL_ACCESS);
    await this.assertPetitionScope(user, petition);

    await this.petitionModel.updateOne(
      { _id: petition._id },
      { $set: { requesterSeenAt: new Date() } },
    );

    return this.getPetition(user, id);
  }

  private async assertPetitionScope(
    user: AuthenticatedUser,
    petition: Pick<ControlPetition, 'courseId' | 'academicYear' | 'semester'>,
  ) {
    if (this.access.getCapabilities(user).scopeAll) return;
    await this.access.assertCourseIdScope(
      user,
      String(petition.courseId),
      petition.academicYear,
      petition.semester,
    );
  }

  private serializePetition(
    doc: ControlPetition & {
      _id: Types.ObjectId;
      createdAt?: Date;
      updatedAt?: Date;
    },
    actorById: Map<
      string,
      {
        _id: Types.ObjectId;
        name: string;
        nameAr?: string;
        role?: string;
        staffType?: string;
        titlePrefix?: string;
      }
    >,
    liveByStudent?: Map<
      string,
      {
        grade?: number;
        status: string;
        rev?: number;
        cleared?: boolean;
        attendanceMark?: number;
        quizzesMark?: number;
      }
    >,
  ) {
    const requester = actorById.get(String(doc.requestedBy));
    const reviewer = doc.reviewedBy
      ? actorById.get(String(doc.reviewedBy))
      : undefined;

    const approvedItemsCount = doc.items.filter(
      (i) => i.decision === 'APPROVED',
    ).length;
    const rejectedItemsCount = doc.items.filter(
      (i) => i.decision === 'REJECTED',
    ).length;

    return {
      id: String(doc._id),
      sheetId: String(doc.sheetId),
      courseId: String(doc.courseId),
      courseCode: doc.courseCode,
      courseName: doc.courseName,
      courseNameAr: doc.courseNameAr ?? null,
      courseNameEn: doc.courseNameEn ?? null,
      courseLevel: doc.courseLevel ?? null,
      academicYear: doc.academicYear,
      semester: doc.semester,
      component: doc.component,
      status: doc.status,
      reason: doc.reason,
      requestedBy: {
        id: String(doc.requestedBy),
        name: requester?.name ?? null,
        nameAr: requester?.nameAr ?? null,
        role: requester?.role ?? null,
        staffType: requester?.staffType ?? null,
        titlePrefix: requester?.titlePrefix ?? null,
      },
      requestedAt: (
        doc.requestedAt ??
        doc.createdAt ??
        new Date()
      ).toISOString(),
      reviewedBy: doc.reviewedBy
        ? {
            id: String(doc.reviewedBy),
            name: reviewer?.name ?? null,
            nameAr: reviewer?.nameAr ?? null,
            role: reviewer?.role ?? null,
            staffType: reviewer?.staffType ?? null,
            titlePrefix: reviewer?.titlePrefix ?? null,
          }
        : null,
      reviewedAt: doc.reviewedAt ? doc.reviewedAt.toISOString() : null,
      reviewNote: doc.reviewNote ?? null,
      requesterSeenAt: doc.requesterSeenAt
        ? doc.requesterSeenAt.toISOString()
        : null,
      counts: {
        total: doc.items.length,
        approved: approvedItemsCount,
        rejected: rejectedItemsCount,
        pending: doc.items.length - approvedItemsCount - rejectedItemsCount,
      },
      items: doc.items.map((item) => {
        const live = liveByStudent?.get(String(item.studentId));
        const liveRev = live?.rev ?? 0;
        return {
          studentId: String(item.studentId),
          studentCode: item.studentCode,
          studentName: item.studentName,
          studentNameAr: item.studentNameAr ?? null,
          currentScore: item.currentScore,
          currentStatus: item.currentStatus,
          currentAttendanceMark: item.currentAttendanceMark ?? null,
          currentQuizzesMark: item.currentQuizzesMark ?? null,
          baselineRev: item.baselineRev,
          proposedScore: item.proposedScore,
          proposedStatus: item.proposedStatus,
          proposedAttendanceMark: item.proposedAttendanceMark ?? null,
          proposedQuizzesMark: item.proposedQuizzesMark ?? null,
          studentReason: item.studentReason ?? null,
          decision: item.decision,
          decisionNote: item.decisionNote ?? null,
          appliedRev: item.appliedRev ?? null,
          decidedAt: item.decidedAt ? item.decidedAt.toISOString() : null,
          hasRevConflict:
            doc.status === 'PENDING' &&
            liveByStudent !== undefined &&
            liveRev !== item.baselineRev,
        };
      }),
    };
  }
}
