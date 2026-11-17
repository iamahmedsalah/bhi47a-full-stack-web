import { ControlReleaseStore } from './control-release.store';
import { randomUUID } from 'node:crypto';
import type { ResultPolicy } from '../control/utils/official-result.util';
import { ConflictException, BadRequestException } from '@nestjs/common';
import {
  GradeAuditLog,
  type GradeAuditLogDocument,
} from '../control/schemas/grade-audit-log.schema';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Grade, GradeDocument } from './schemas/grade.schema';
import {
  ControlSheet,
  ControlSheetDocument,
} from '../control/schemas/control-sheet.schema';
import { CourseQuiz, CourseQuizDocument } from './schemas/course-quiz.schema';
import {
  SaveGradeDto,
  QueryGradeDto,
  PublishGradesDto,
  UpdateGradesSettingsDto,
  ResetControlCourseDto,
} from './dto/grade.dto';
import {
  buildPaginationOptions,
  createPaginatedResult,
} from '../../common/utils/pagination.util';
import { User, UserDocument } from '../users/schemas/user.schema';
import type { AuthenticatedUser } from '../auth/types/authenticated-request';
import { Course, CourseDocument } from '../courses/schemas/course.schema';
import { NotificationsService } from '../notifications/notifications.service';
import {
  StudentProfile,
  StudentProfileDocument,
} from '../students/schemas/student-profile.schema';
import {
  StudentAcademicProfile,
  StudentAcademicProfileDocument,
} from '../registrations/schemas/student-academic-profile.schema';
import {
  SystemSettings,
  SystemSettingsDocument,
} from '../complaints/schemas/system-settings.schema';
import { mergeAcademicCourseProgress } from '../registrations/utils/academic-course-progress.util';
import { evaluateAcademicProgression } from './utils/academic-level-progression.util';
import {
  calculateGradeScale,
  type CourseLevel,
  CONTROL_RESULT_EXAM_TYPES,
  STUDENT_RESULT_EXAM_TYPES,
  isReleasedGradeVisible,
} from '@student-portal/shared';
import { coursesForDepartment } from '../courses/utils/course-curriculum.util';

import {
  shouldRunStartupTasks,
  shouldRunQueueWorkers,
} from '../../common/utils/runtime.util';

@Injectable()
export class GradesService implements OnModuleInit {
  constructor(
    @InjectModel(Grade.name) private gradeModel: Model<GradeDocument>,
    @InjectModel(CourseQuiz.name)
    private courseQuizModel: Model<CourseQuizDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Course.name) private courseModel: Model<CourseDocument>,
    @InjectModel(StudentProfile.name)
    private studentProfileModel: Model<StudentProfileDocument>,
    @InjectModel(StudentAcademicProfile.name)
    private studentAcademicProfileModel: Model<StudentAcademicProfileDocument>,
    @InjectModel(SystemSettings.name)
    private systemSettingsModel: Model<SystemSettingsDocument>,
    @InjectModel(ControlSheet.name)
    private controlSheetModel: Model<ControlSheetDocument>,
    private notificationsService: NotificationsService,
    @InjectModel(GradeAuditLog.name)
    private readonly controlAudit: Model<GradeAuditLogDocument>,
  ) {}

  private releaseTimer?: ReturnType<typeof setInterval>;
  private processingReleases = false;
  private releaseWakeup?: ReturnType<typeof setImmediate>;
  scheduleControlReleases() {
    if (!this.releaseWakeup) {
      this.releaseWakeup = setImmediate(() => {
        this.releaseWakeup = undefined;
        void this.processControlReleases().catch(() =>
          console.warn(
            'Control reconciliation pending; durable retry retained',
          ),
        );
      });
    }
    return { scheduled: true };
  }
  get controlReleases() {
    return new ControlReleaseStore(this.gradeModel.db);
  }

  async processControlReleases() {
    if (this.processingReleases) return;
    this.processingReleases = true;
    const leases = this.gradeModel.db.collection(
      'control_reconciliation_leases',
    );
    const leaseId = new Types.ObjectId('0000000000000000000000c1');
    const token = randomUUID();
    let acquired = false;
    try {
      try {
        await leases.findOneAndUpdate(
          {
            _id: leaseId,
            $or: [
              { expiresAt: { $lt: new Date() } },
              { expiresAt: { $exists: false } },
            ],
          },
          { $set: { token, expiresAt: new Date(Date.now() + 600000) } },
          { upsert: true, returnDocument: 'after' },
        );
        acquired = true;
      } catch (error) {
        if ((error as { code?: number }).code === 11000) return;
        throw error;
      }
      const jobs = await this.gradeModel.db
        .collection('control_release_outbox')
        .find({ delivered: { $ne: true } })
        .sort({ createdAt: 1 })
        .limit(25)
        .toArray();
      const students = [...new Set(jobs.map((j) => String(j.studentId)))];
      const finalStudents = await this.gradeModel.db
        .collection('control_academic_baselines')
        .find({ _id: { $in: students.map((id) => new Types.ObjectId(id)) } })
        .toArray();
      if (finalStudents.length)
        await this.syncPublishedAcademicProgress(
          finalStudents.map((b) => String(b._id)),
        );
      await this.controlReleases.flushOutbox(jobs.map((j) => j._id));
    } finally {
      if (acquired) await leases.deleteOne({ _id: leaseId, token });
      this.processingReleases = false;
    }
  }
  onModuleDestroy() {
    if (this.releaseTimer) clearInterval(this.releaseTimer);
    if (this.releaseWakeup) clearImmediate(this.releaseWakeup);
  }

  async onModuleInit() {
    if (process.env.NODE_ENV !== 'test' && shouldRunQueueWorkers()) {
      this.releaseTimer = setInterval(() => {
        void this.processControlReleases().catch(() =>
          console.warn('Control release reconciliation pending; will retry'),
        );
      }, 10000);
      this.releaseTimer.unref();
    }
    if (!shouldRunStartupTasks()) {
      return;
    }

    await this.dropLegacyGradeUniqueIndex();

    // Earlier versions allowed only one quiz record per student/course, which
    // caused a later semester to overwrite or conflict with the previous one.
    // Replace only that known legacy index and preserve every other DB index.
    try {
      await this.courseQuizModel.init();
      const indexes = await this.courseQuizModel.collection.indexes();
      const legacyIndex = indexes.find(
        (index) =>
          index.unique === true &&
          Object.keys(index.key).length === 2 &&
          index.key.studentCode === 1 &&
          index.key.courseCode === 1,
      );
      if (legacyIndex?.name) {
        await this.courseQuizModel.collection.dropIndex(legacyIndex.name);
      }
      const refreshedIndexes = legacyIndex
        ? await this.courseQuizModel.collection.indexes()
        : indexes;
      const termIndexExists = refreshedIndexes.some(
        (index) =>
          index.unique === true &&
          Object.keys(index.key).length === 4 &&
          index.key.studentCode === 1 &&
          index.key.courseCode === 1 &&
          index.key.academicYear === 1 &&
          index.key.semester === 1,
      );
      if (!termIndexExists) {
        await this.courseQuizModel.collection.createIndex(
          { studentCode: 1, courseCode: 1, academicYear: 1, semester: 1 },
          { unique: true },
        );
      }
    } catch (error: any) {
      // A new database may not have the collection yet; Mongoose will create
      // the schema index when the first record is stored.
      if (error?.codeName !== 'NamespaceNotFound') throw error;
    }
  }

  /**
   * The original unique index `{ studentCode, courseCode, examType }` had no
   * term, so a retaken course collided with its earlier attempt. The term-aware
   * unique index declared on the schema replaces it; only that exact legacy
   * index is dropped and every other index is preserved.
   */
  private async dropLegacyGradeUniqueIndex() {
    try {
      await this.gradeModel.init();
      const indexes = await this.gradeModel.collection.indexes();
      const legacy = indexes.find(
        (index) =>
          index.unique === true &&
          Object.keys(index.key).length === 3 &&
          index.key.studentCode === 1 &&
          index.key.courseCode === 1 &&
          index.key.examType === 1,
      );
      if (legacy?.name) {
        await this.gradeModel.collection.dropIndex(legacy.name);
      }
    } catch (error: any) {
      if (error?.codeName !== 'NamespaceNotFound') {
        console.error('Failed to drop legacy grades unique index:', error);
      }
    }
  }

  /**
   * Rejects writes to a component whose Use the Control workbook to edit marks for this sheet. Used by every
   * non-grid write path (manual form, Excel import) so a lock holds everywhere.
   */
  async hasControlSheet(
    courseId: Types.ObjectId,
    academicYear: string,
    semester: string,
  ): Promise<boolean> {
    return Boolean(
      await this.controlSheetModel.exists({ courseId, academicYear, semester }),
    );
  }

  async assertSheetEditable(
    courseId: string | Types.ObjectId,
    academicYear: string,
    semester: string,
    examType: string,
  ): Promise<void> {
    if (['midterm', 'coursework', 'final', 'total'].includes(examType))
      throw new ConflictException({
        code: 'CONTROL_WORKBOOK_REQUIRED',
        message:
          'Enter coursework, midterm and final marks through Control for validation, review and audit.',
      });
    const locked = await this.controlSheetModel
      .exists({
        courseId: new Types.ObjectId(courseId.toString()),
        academicYear,
        semester,
        component: examType,
      })
      .lean();
    if (locked) {
      throw new ConflictException({
        code: 'CONTROL_WORKBOOK_REQUIRED',
        message:
          'Use the Control workbook to edit this sheet; review and audit are required.',
      });
    }
  }

  async syncPublishedAcademicProgress(
    studentIds: Array<string | Types.ObjectId>,
    options?: {
      dryRun?: boolean;
      maxAllowedCarriedCourses?: number;
      promoteLevels?: boolean;
    },
  ) {
    const uniqueIds = [
      ...new Set(studentIds.map((id) => id.toString()).filter(Boolean)),
    ];
    if (uniqueIds.length === 0) return [];

    const courses = await this.courseModel
      .find({ isActive: { $ne: false } })
      .lean();
    const courseCredits = Object.fromEntries(
      courses.map((course) => [
        course.code.toUpperCase(),
        course.creditHours ?? 1,
      ]),
    );

    const objectIds = uniqueIds.map((id) => new Types.ObjectId(id));
    const [allAcademics, allProfiles, allGrades, allUsers] = await Promise.all([
      this.studentAcademicProfileModel.find({ studentId: { $in: objectIds } }),
      this.studentProfileModel.find({ userId: { $in: objectIds } }),
      this.gradeModel
        .find({
          studentId: { $in: objectIds },
          isPublished: true,
          status: { $ne: 'withheld' },
          controlManaged: { $ne: true },
          $or: [
            { controlManaged: { $ne: true } },
            {
              $expr: { $eq: ['$controlApprovedRev', { $ifNull: ['$rev', 0] }] },
            },
          ],
        })
        .lean(),
      this.userModel
        .find({ _id: { $in: objectIds } })
        .select('name studentCode')
        .lean(),
    ]);

    const baselines = await this.gradeModel.db
      .collection('control_academic_baselines')
      .find({ _id: { $in: objectIds } })
      .toArray();
    const baselineById = new Map(baselines.map((b) => [String(b._id), b]));
    for (const studentId of objectIds) {
      const released = await this.controlReleases.studentMarks(studentId);
      for (const mark of released)
        if (mark.examType === 'final' && mark.officialResult?.official) {
          allGrades.push({
            ...mark,
            examType: 'final',
            grade: mark.officialResult.total!,
            maxGrade: mark.officialResult.totalMax,
            officialResult: mark.officialResult,
            retakePolicy: (
              await this.controlReleases.policy({
                courseId: mark.courseId,
                academicYear: mark.academicYear,
                semester: mark.semester,
              })
            ).rules.retake,
          } as unknown as (typeof allGrades)[number]);
        }
    }

    const academicMap = new Map(
      allAcademics.map((a) => [a.studentId.toString(), a]),
    );
    const profileMap = new Map(
      allProfiles.map((p) => [p.userId.toString(), p]),
    );
    const userMap = new Map(allUsers.map((u) => [u._id.toString(), u]));

    const gradesByStudent = new Map<string, typeof allGrades>();
    for (const g of allGrades) {
      const sId = g.studentId.toString();
      const list = gradesByStudent.get(sId) || [];
      list.push(g);
      gradesByStudent.set(sId, list);
    }

    const docsToSave: Array<{ save: () => Promise<unknown> }> = [];

    const results = uniqueIds.map((studentId) => {
      const academic = academicMap.get(studentId);
      const studentProfile = profileMap.get(studentId);
      const grades = gradesByStudent.get(studentId) || [];
      const user = userMap.get(studentId);

      if (!academic && !studentProfile) return null;
      const curriculumCourses = coursesForDepartment(
        courses as unknown as CourseDocument[],
        studentProfile?.department,
      );

      const baseline = baselineById.get(studentId);
      const progress = mergeAcademicCourseProgress({
        completedCourses:
          baseline?.completedCourses ?? academic?.completedCourses,
        failedCourses: baseline?.failedCourses ?? academic?.failedCourses,
        lowGradeCourses: baseline?.lowGradeCourses ?? academic?.lowGradeCourses,
        grades,
        courseCredits,
      });
      const currentLevel = (baseline?.academicLevel ??
        academic?.academicLevel ??
        studentProfile?.level ??
        '1') as CourseLevel;
      const finalizedCourses = progress.courseResults.map(
        (result) => result.courseCode,
      );

      const evaluation = evaluateAcademicProgression({
        currentLevel,
        courses: curriculumCourses,
        finalizedCourses,
        failedCourses: progress.failedCourses,
        maxAllowedCarriedCourses: options?.maxAllowedCarriedCourses ?? 2,
      });

      const promotedLevel =
        options?.promoteLevels === false
          ? currentLevel
          : evaluation.promotedLevel;
      const wasPromoted =
        options?.promoteLevels !== false && evaluation.willPromote;

      const currentRequirements = curriculumCourses.filter(
        (course) =>
          (course.academicLevel ?? course.level) === currentLevel &&
          (course.semester === 'first' || course.semester === 'second') &&
          course.type !== 'elective',
      );

      const previousCredits =
        baseline?.completedCreditHours ?? academic?.completedCreditHours ?? 0;
      const completedCreditsFromGrades = progress.courseResults
        .filter((r) => r.passed)
        .reduce((acc, curr) => acc + curr.creditHours, 0);
      const completedCreditsFromList = progress.completedCourses.reduce(
        (acc, code) => acc + (courseCredits[code.toUpperCase()] ?? 3),
        0,
      );
      const completedCredits = Math.max(
        previousCredits,
        completedCreditsFromGrades,
        completedCreditsFromList,
      );

      const isDryRun = Boolean(options?.dryRun);

      if (!isDryRun) {
        const hasFullHistoricalGrades =
          completedCreditsFromGrades >= completedCredits &&
          completedCreditsFromGrades > 0;
        const finalGpa = hasFullHistoricalGrades
          ? (progress.calculatedGpa ?? academic?.gpa)
          : (baseline?.gpa ?? academic?.gpa ?? progress.calculatedGpa);
        let warningCount: number | undefined = baseline?.academicWarnings;
        if (
          typeof finalGpa === 'number' &&
          (progress.gradedCredits > 0 || finalGpa > 0)
        ) {
          if (finalGpa < 2.0) {
            warningCount = Math.max(
              1,
              baseline
                ? 1
                : (academic?.academicWarnings ??
                    studentProfile?.academicWarnings ??
                    0),
            );
          } else {
            warningCount = 0;
          }
        }

        if (academic) {
          academic.completedCourses = progress.completedCourses;
          academic.failedCourses = progress.failedCourses;
          academic.lowGradeCourses = progress.lowGradeCourses;
          academic.completedCreditHours = completedCredits;
          if (finalGpa !== undefined && finalGpa !== null) {
            academic.gpa = finalGpa;
          }
          academic.academicLevel = promotedLevel;
          if (wasPromoted) academic.semester = 'first';
          else if (options?.promoteLevels !== false && baseline?.semester)
            academic.semester = baseline.semester;
          if (warningCount !== undefined) {
            academic.academicWarnings = warningCount;
          }
          docsToSave.push(academic);
        }
        if (studentProfile) {
          let shouldSaveProfile = false;
          if (
            studentProfile.level !== promotedLevel ||
            (wasPromoted && studentProfile.semester !== 'first')
          ) {
            studentProfile.level = promotedLevel;
            if (wasPromoted) studentProfile.semester = 'first';
            else if (options?.promoteLevels !== false && baseline?.semester)
              studentProfile.semester = baseline.semester;
            shouldSaveProfile = true;
          }
          if (
            warningCount !== undefined &&
            studentProfile.academicWarnings !== warningCount
          ) {
            studentProfile.academicWarnings = warningCount;
            shouldSaveProfile = true;
          }
          if (shouldSaveProfile) {
            docsToSave.push(studentProfile);
          }
        }
      }

      return {
        studentId: studentId.toString(),
        studentCode: studentProfile?.studentCode ?? user?.studentCode ?? null,
        studentName: user?.name ?? studentProfile?.studentCode ?? '—',
        previousLevel: currentLevel,
        currentLevel,
        targetLevel: promotedLevel,
        academicLevel: promotedLevel,
        promoted: wasPromoted,
        willPromote: wasPromoted,
        gpa: progress.calculatedGpa ?? academic?.gpa ?? 0,
        completedCredits,
        totalFailedCount: progress.failedCourses.length,
        carriedFailedCourseCodes: evaluation.carriedFailedCourses,
        carriedFailedCourses: evaluation.carriedFailedCourses,
        missingCourseCodes: evaluation.missingMandatoryCourses,
        missingMandatoryCourses: evaluation.missingMandatoryCourses,
        reasonCode: evaluation.reasonCode,
        reasonAr: evaluation.reasonAr,
        reasonEn: evaluation.reasonEn,
        hasFirstSemesterCurriculum: currentRequirements.some(
          (course) => course.semester === 'first',
        ),
        hasSecondSemesterCurriculum: currentRequirements.some(
          (course) => course.semester === 'second',
        ),
      };
    });

    if (docsToSave.length > 0) {
      await Promise.all(docsToSave.map((d) => d.save()));
    }

    return results.filter((result) => result !== null);
  }

  async recalculateAcademicProgress(options?: {
    studentCode?: string;
    dryRun?: boolean;
    maxAllowedCarriedCourses?: number;
  }) {
    let studentIds: Types.ObjectId[] = [];
    if (options?.studentCode) {
      const student = await this.userModel
        .findOne({ studentCode: options.studentCode.trim(), role: 'student' })
        .select('_id')
        .lean();
      if (!student) throw new NotFoundException('Student not found');
      studentIds = [student._id];
    } else {
      studentIds = await this.gradeModel.distinct('studentId', {
        isPublished: true,
      });
    }

    const students = await this.syncPublishedAcademicProgress(studentIds, {
      dryRun: options?.dryRun ?? false,
      maxAllowedCarriedCourses: options?.maxAllowedCarriedCourses ?? 2,
    });

    const promoted = students.filter((student) => student.promoted).length;
    const retained = students.length - promoted;

    return {
      dryRun: options?.dryRun ?? false,
      maxAllowedCarriedCourses: options?.maxAllowedCarriedCourses ?? 2,
      processed: students.length,
      promotedCount: promoted,
      promoted,
      retainedCount: retained,
      students,
    };
  }

  async saveGrade(dto: SaveGradeDto): Promise<GradeDocument> {
    // 1. Resolve student (user)
    const student = await this.userModel.findOne({
      studentCode: dto.studentCode,
      role: 'student',
    });
    if (!student) {
      throw new NotFoundException('الطالب غير موجود'); // Student not found
    }

    // 2. Resolve course
    const course = await this.courseModel.findOne({
      code: dto.courseCode.toUpperCase(),
    });
    if (!course) {
      throw new NotFoundException('المادة غير موجودة'); // Course not found
    }

    await this.assertSheetEditable(
      course._id,
      dto.academicYear,
      dto.semester,
      dto.examType,
    );

    const filter = {
      studentCode: dto.studentCode,
      courseCode: dto.courseCode.toUpperCase(),
      examType: dto.examType,
      academicYear: dto.academicYear,
      semester: dto.semester,
    };

    const percentage =
      dto.maxGrade > 0
        ? Math.round((dto.grade / dto.maxGrade) * 10000) / 100
        : 0;
    const scale = calculateGradeScale(percentage, dto.status || 'present');

    const updateData = {
      studentId: student._id,
      courseId: course._id,
      courseName: course.name,
      courseCode: course.code,
      grade: dto.grade,
      maxGrade: dto.maxGrade,
      percentage,
      letterGrade: scale.letter,
      gradePoints: scale.points,
      status: dto.status || 'present',
      academicYear: dto.academicYear,
      semester: dto.semester,
      isPublished: dto.isPublished !== undefined ? dto.isPublished : false,
    };

    // Upsert (insert or update)
    const gradeDoc = await this.gradeModel.findOneAndUpdate(
      filter,
      { $set: updateData },
      { new: true, upsert: true },
    );

    if (gradeDoc && gradeDoc.isPublished) {
      await this.syncPublishedAcademicProgress([gradeDoc.studentId]);
      try {
        const examTypeLabel =
          dto.examType === 'midterm'
            ? 'منتصف الفصل'
            : dto.examType === 'final'
              ? 'نهائي'
              : dto.examType || '';
        const examSuffix = examTypeLabel ? ` (${examTypeLabel})` : '';
        const courseTitle = course?.nameAr || course?.name || 'المقرر';
        await this.notificationsService.sendNotification(
          {
            targetType: 'student',
            targetStudentCode: student.studentCode,
            title: 'إعلان الدرجات | Grades Published',
            body: `تم نشر نتيجة مادة ${courseTitle}${examSuffix}`,
          },
          'system',
        );
      } catch (err) {
        console.error('Failed to send grade publication notification:', err);
      }
    }

    return gradeDoc as any;
  }

  async findAll(query: QueryGradeDto) {
    const { page, limit, skip } = buildPaginationOptions(query);
    const filter: any = { cleared: { $ne: true } };

    if (query.studentCode) {
      filter.studentCode = query.studentCode;
    }

    if (query.courseCode) {
      filter.courseCode = query.courseCode.toUpperCase();
    }

    if (query.examType) {
      filter.examType = query.examType;
    }

    if (query.isPublished !== undefined) {
      filter.isPublished = query.isPublished;
    }

    if (query.status) {
      filter.status = query.status;
    }

    let sortField = 'createdAt';
    if (query.sortBy === 'studentCode' || query.sortBy === 'studentName')
      sortField = 'studentCode';
    else if (query.sortBy === 'courseCode' || query.sortBy === 'course')
      sortField = 'courseCode';
    else if (query.sortBy === 'grade') sortField = 'grade';
    else if (query.sortBy === 'createdAt') sortField = 'createdAt';

    const sortDir: 1 | -1 =
      query.sortOrder === 'asc'
        ? 1
        : query.sortOrder === 'desc'
          ? -1
          : sortField === 'studentCode' || sortField === 'courseCode'
            ? 1
            : -1;

    const [items, total] = await Promise.all([
      this.gradeModel
        .find(filter)
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(limit)
        .populate('studentId', 'name')
        .lean(),
      this.gradeModel.countDocuments(filter),
    ]);

    const courseCodes = [
      ...new Set(items.map((item: any) => item.courseCode).filter(Boolean)),
    ];
    const matchedCourses = courseCodes.length
      ? await this.courseModel
          .find({ code: { $in: courseCodes } })
          .select('code name nameAr nameEn creditHours academicLevel level')
          .lean()
      : [];
    const coursesByCode = new Map(
      matchedCourses.map((course) => [course.code.toUpperCase(), course]),
    );

    // Map items to include student name and localized course names directly for convenience
    const formattedItems = items.map((item: any) => {
      const course = coursesByCode.get(item.courseCode?.toUpperCase());
      return {
        ...item,
        studentName: item.studentId?.name || '—',
        courseNameAr: course?.nameAr || item.courseNameAr,
        courseNameEn: course?.nameEn || item.courseNameEn || item.courseName,
      };
    });

    return createPaginatedResult(formattedItems, total, page, limit);
  }

  async findOne(id: string): Promise<GradeDocument> {
    const grade = await this.gradeModel.findById(id);
    if (!grade) {
      throw new NotFoundException('الدرجة غير موجودة'); // Grade not found
    }
    return grade;
  }

  async update(id: string, updateData: Partial<Grade>): Promise<GradeDocument> {
    const existing = await this.gradeModel.findById(id);
    if (!existing) {
      throw new NotFoundException('الدرجة غير موجودة');
    }
    await this.assertSheetEditable(
      existing.courseId,
      existing.academicYear,
      existing.semester,
      existing.examType,
    );
    const finalGrade =
      updateData.grade !== undefined ? updateData.grade : existing.grade;
    const finalMax =
      updateData.maxGrade !== undefined
        ? updateData.maxGrade
        : existing.maxGrade;
    const finalStatus =
      updateData.status !== undefined ? updateData.status : existing.status;
    const percentage =
      finalMax > 0 ? Math.round((finalGrade / finalMax) * 10000) / 100 : 0;
    const scale = calculateGradeScale(percentage, finalStatus);

    const mergedData = {
      ...updateData,
      percentage,
      letterGrade: scale.letter,
      gradePoints: scale.points,
    };

    const updated = await this.gradeModel.findByIdAndUpdate(
      id,
      { $set: mergedData },
      { new: true },
    );
    if (!updated) {
      throw new NotFoundException('الدرجة غير موجودة');
    }
    await this.syncPublishedAcademicProgress([updated.studentId]);
    return updated;
  }

  async remove(id: string): Promise<{ message: string }> {
    const target = await this.gradeModel.findById(id).lean();
    if (target) {
      await this.assertSheetEditable(
        target.courseId,
        target.academicYear,
        target.semester,
        target.examType,
      );
    }
    const deleted = await this.gradeModel.findByIdAndDelete(id);
    if (!deleted) {
      throw new NotFoundException('الدرجة غير موجودة');
    }
    return { message: 'تم حذف الدرجة بنجاح' }; // Grade deleted successfully
  }

  async getControlPolicy(id: string) {
    const sheet = await this.controlSheetModel.findById(id).lean();
    if (!sheet) throw new NotFoundException('Control sheet not found');
    return this.controlReleases.policy(sheet);
  }

  async updateControlPolicy(
    id: string,
    dto: ResultPolicy & { version: number },
    actorId: string,
  ) {
    const sheet = await this.controlSheetModel.findById(id).lean();
    if (!sheet) throw new NotFoundException('Control sheet not found');
    const { version, ...rules } = dto;
    return this.controlReleases.updatePolicy(sheet, rules, version, actorId);
  }

  async previewControlRelease(dto: PublishGradesDto) {
    if (dto.examType && !CONTROL_RESULT_EXAM_TYPES.includes(dto.examType)) {
      throw new BadRequestException(
        'Only coursework, midterm and final results are managed here',
      );
    }
    if (dto.level)
      throw new ConflictException(
        'Use the level visibility settings for access. Release Control results by course and term.',
      );
    const filter: Record<string, unknown> = {};
    if (dto.academicYear) filter.academicYear = dto.academicYear;
    if (dto.semester) filter.semester = dto.semester;
    if (dto.courseCode) filter.courseCode = dto.courseCode.toUpperCase();
    filter.component = dto.examType ?? { $in: CONTROL_RESULT_EXAM_TYPES };
    const sheets = await this.controlSheetModel.find(filter).limit(501).lean();
    if (sheets.length > 500)
      throw new ConflictException('Choose a narrower publication scope');
    const items: Array<{
      sheetId: string;
      courseCode: string;
      component: string;
      students: number;
      activeReleaseId: string | null;
      digest: string;
    }> = [];
    // Preview only: bounded parallel reads, never concurrent operations in a
    // MongoDB transaction. Activation still validates every returned digest.
    if (dto.isPublished) {
      for (let offset = 0; offset < sheets.length; offset += 4) {
        const batch = await Promise.all(
          sheets.slice(offset, offset + 4).map(async (sheet) => {
            const preview = await this.controlReleases.preview(sheet);
            return {
              sheetId: String(sheet._id),
              courseCode: sheet.courseCode,
              component: sheet.component,
              students: preview.count,
              activeReleaseId: preview.activeReleaseId,
              digest: preview.digest,
            };
          }),
        );
        items.push(...batch);
      }
    }

    return {
      sheets: items,
      releaseDigests: Object.fromEntries(
        items.map((i) => [i.sheetId, i.digest]),
      ),
    };
  }

  async resetControlCourse(
    dto: ResetControlCourseDto,
    user: AuthenticatedUser,
  ) {
    if (user.role !== 'admin')
      throw new ForbiddenException('Administrator required');
    const code = dto.courseCode.trim().toUpperCase();
    if (dto.confirmation.trim().toUpperCase() !== code || !dto.reason.trim())
      throw new BadRequestException({
        code: 'CONTROL_RESET_CONFIRMATION_REQUIRED',
        message: 'Confirm the course code and supply a reset reason',
      });
    const course = await this.courseModel
      .findOne({ code })
      .select('_id')
      .lean();
    if (!course) throw new NotFoundException('Course not found');
    const scope = {
      courseId: course._id,
      academicYear: dto.academicYear,
      semester: dto.semester,
    };
    const db = this.gradeModel.db;
    const resetId = new Types.ObjectId();
    const session = await db.startSession();
    let cleared = 0;
    try {
      await session.withTransaction(async () => {
        // Serialize with academic reconciliation, as reset reverses published effects.
        const leases = db.collection('control_reconciliation_leases');
        const leaseId = new Types.ObjectId('0000000000000000000000c1');
        try {
          await leases.findOneAndUpdate(
            {
              _id: leaseId,
              $or: [
                { expiresAt: { $lt: new Date() } },
                { expiresAt: { $exists: false } },
              ],
            },
            {
              $set: {
                token: String(resetId),
                expiresAt: new Date(Date.now() + 600000),
              },
            },
            { upsert: true, session },
          );
        } catch (error) {
          if ((error as { code?: number }).code === 11000)
            throw new ConflictException({
              code: 'CONTROL_RESET_BUSY',
              message: 'Reconciliation is running; retry the reset shortly',
            });
          throw error;
        }
        const marks = await this.gradeModel
          .find({ ...scope, examType: { $in: CONTROL_RESULT_EXAM_TYPES } })
          .session(session)
          .lean();
        const sheets = await this.controlSheetModel
          .find(scope)
          .session(session)
          .lean();
        const pointers = await db
          .collection('control_release_pointers')
          .find(
            {
              'scope.courseId': course._id,
              'scope.academicYear': dto.academicYear,
              'scope.semester': dto.semester,
            },
            { session },
          )
          .toArray();
        await db
          .collection('control_release_pointers')
          .updateMany(
            { _id: { $in: pointers.map((entry) => entry._id) } },
            { $set: { active: false } },
            { session },
          );
        const releases = await db
          .collection('control_releases')
          .find(
            {
              'scope.courseId': course._id,
              'scope.academicYear': dto.academicYear,
              'scope.semester': dto.semester,
            },
            { session, projection: { _id: 1 } },
          )
          .toArray();
        await db.collection('control_release_outbox').updateMany(
          {
            releaseId: { $in: releases.map((entry) => entry._id) },
            delivered: { $ne: true },
          },
          { $set: { delivered: true, cancelledByReset: resetId } },
          { session },
        );
        const now = new Date();
        if (marks.length)
          await this.controlAudit.insertMany(
            marks.map((mark) => ({
              gradeId: mark._id,
              sheetId: sheets.find((sheet) => sheet.component === mark.examType)
                ?._id,
              ...scope,
              component: mark.examType,
              studentId: mark.studentId,
              action: 'CLEAR',
              source: 'SYSTEM',
              actorId: new Types.ObjectId(user._id),
              reason: dto.reason.trim(),
              at: now,
              oldValue: {
                score: mark.grade,
                attendanceMark: mark.attendanceMark,
                quizzesMark: mark.quizzesMark,
                status: mark.status,
                rev: mark.rev,
                isPublished: mark.isPublished,
              },
              newValue: { resetId: String(resetId), cleared: true },
            })),
            { session },
          );
        const result = await this.gradeModel.updateMany(
          { ...scope, examType: { $in: CONTROL_RESULT_EXAM_TYPES } },
          {
            $set: {
              cleared: true,
              isPublished: false,
              grade: 0,
              percentage: 0,
              gradePoints: 0,
              letterGrade: '',
              status: 'present',
              attendanceMark: null,
              quizzesMark: null,
              updatedAt: now,
              controlManaged: true,
            },
            $unset: { controlApprovedRev: '' },
            $inc: { rev: 1 },
          },
          { session },
        );
        cleared = result.modifiedCount;
        await this.controlSheetModel.updateMany(
          scope,
          {
            $set: {
              workflowState: 'DRAFT',
              locked: false,
              reviewReason: dto.reason.trim(),
            },
            $unset: {
              submission: '',
              approvedBy: '',
              approvedAt: '',
              lockedBy: '',
              lockedAt: '',
              lockReason: '',
            },
            $inc: { revision: 1 },
          },
          { session },
        );
        await db
          .collection(
            db.models.GradingScheme?.collection.name ??
              'control_grading_schemes',
          )
          .deleteMany(scope, { session });
        await db
          .collection<{ _id: string }>('control_result_policies')
          .deleteOne(
            {
              _id: `${String(course._id)}|${dto.academicYear}|${dto.semester}`,
            },
            { session },
          );
        await db
          .collection(
            db.models.ControlImport?.collection.name ??
              'control_import_batches',
          )
          .deleteMany(
            { sheetId: { $in: sheets.map((sheet) => sheet._id) } },
            { session },
          );
        const students = [
          ...new Map(
            marks.map((mark) => [String(mark.studentId), mark.studentId]),
          ).values(),
        ];
        if (students.length)
          await db.collection('control_release_outbox').insertMany(
            students.map((studentId) => ({
              _id: new Types.ObjectId(),
              studentId,
              actorId: new Types.ObjectId(user._id),
              releaseId: resetId,
              attempts: 0,
              createdAt: now,
            })),
            { session },
          );
        await leases.deleteOne(
          { _id: leaseId, token: String(resetId) },
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
    this.scheduleControlReleases();
    return {
      cleared,
      courseCode: code,
      academicYear: dto.academicYear,
      semester: dto.semester,
    };
  }

  async controlReleaseHistory(id: string) {
    const sheet = await this.controlSheetModel.findById(id).lean();
    if (!sheet) throw new NotFoundException('Control sheet not found');
    const db = this.gradeModel.db;
    const releases = await db
      .collection('control_releases')
      .find({ sheetId: sheet._id }, { projection: { marks: 0, results: 0 } })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    const pointer = await db
      .collection('control_release_pointers')
      .findOne({ _id: sheet._id });
    const pendingCounts = await db
      .collection('control_release_outbox')
      .aggregate<{ _id: Types.ObjectId; count: number }>([
        {
          $match: {
            releaseId: { $in: releases.map((r) => r._id) },
            delivered: { $ne: true },
          },
        },
        { $group: { _id: '$releaseId', count: { $sum: 1 } } },
      ])
      .toArray();
    const pendingByRelease = new Map(
      pendingCounts.map((entry) => [String(entry._id), entry.count]),
    );
    const pendingJobs = pendingCounts.reduce(
      (total, entry) => total + entry.count,
      0,
    );
    return {
      releases: releases.map((r) => ({
        _id: String(r._id),
        createdAt: new Date(r.createdAt).toISOString(),
        digest: String(r.digest),
        pendingJobs: pendingByRelease.get(String(r._id)) ?? 0,
      })),
      activeReleaseId: pointer?.active ? String(pointer.releaseId) : null,
      pendingJobs,
    };
  }

  async publishGrades(
    dto: PublishGradesDto,
    actorId?: string,
  ): Promise<{ count: number }> {
    if (dto.examType && !CONTROL_RESULT_EXAM_TYPES.includes(dto.examType)) {
      throw new BadRequestException(
        'Only coursework, midterm and final results are managed here',
      );
    }
    const filter: any = {
      cleared: { $ne: true },
      examType: { $in: CONTROL_RESULT_EXAM_TYPES },
    };
    if (dto.academicYear) filter.academicYear = dto.academicYear;
    if (dto.semester) filter.semester = dto.semester;
    if (dto.examType) filter.examType = dto.examType;

    if (dto.courseCode) {
      filter.courseCode = dto.courseCode.toUpperCase();
    }

    if (dto.level) {
      const studentsInLevel = await this.studentProfileModel
        .find({ level: dto.level })
        .select('userId')
        .lean();
      const userIds = studentsInLevel.map((p) => p.userId);
      filter.studentId = { $in: userIds };
    }

    const affectedGrades = await this.gradeModel
      .find(filter)
      .select('studentId controlManaged historicalImport')
      .lean();
    if (affectedGrades.some((g) => g.historicalImport && !g.controlManaged)) {
      throw new ConflictException(
        'Use historical publication by level / استخدم نشر الدرجات التاريخية حسب المستوى',
      );
    }
    if (dto.level && affectedGrades.some((g) => g.controlManaged))
      throw new ConflictException(
        'Control releases require an entire course/term; use level settings to control student access',
      );
    await this.controlReleases.prepare();
    const session = await this.gradeModel.db.startSession();
    let result = { modifiedCount: 0 };
    const snapshotGradeIds = new Set<string>();
    try {
      await session.withTransaction(async () => {
        snapshotGradeIds.clear();
        const selected = await this.gradeModel
          .find(filter)
          .session(session)
          .lean();
        const scopeKey = (g: {
          courseId: { toString(): string };
          academicYear: string;
          semester: string;
          examType?: string;
          component?: string;
        }) =>
          `${g.courseId.toString()}|${g.academicYear}|${g.semester}|${g.examType ?? g.component}`;
        const scopes = new Map(
          selected.map((g) => [
            scopeKey(g),
            {
              courseId: g.courseId,
              academicYear: g.academicYear,
              semester: g.semester,
              component: g.examType,
            },
          ]),
        );
        if (scopes.size > 500)
          throw new ConflictException(
            'Choose a narrower course/term scope for publication',
          );
        const controlSheets = scopes.size
          ? await this.controlSheetModel
              .find({ $or: [...scopes.values()] })
              .session(session)
              .lean()
          : [];
        const sheetByScope = new Map(
          controlSheets.map((s) => [scopeKey(s), s]),
        );
        const sheetIds = new Set<string>();
        for (const grade of selected) {
          const sheet = sheetByScope.get(scopeKey(grade));
          if (
            dto.isPublished &&
            (grade.controlManaged || sheet) &&
            (!sheet ||
              sheet.workflowState !== 'APPROVED' ||
              grade.controlApprovedRev !== (grade.rev ?? 0))
          ) {
            throw new ConflictException(
              'Approve the selected marks on the Control page before publishing',
            );
          }
          if (sheet) {
            sheetIds.add(String(sheet._id));
            snapshotGradeIds.add(String(grade._id));
          }
        }
        // Cleared draft rows must not prevent withdrawal of an older snapshot.
        if (!dto.isPublished && !dto.level) {
          const sheetFilter: Record<string, unknown> = {};
          if (dto.academicYear) sheetFilter.academicYear = dto.academicYear;
          if (dto.semester) sheetFilter.semester = dto.semester;
          if (dto.courseCode)
            sheetFilter.courseCode = dto.courseCode.toUpperCase();
          if (dto.examType) sheetFilter.component = dto.examType;
          const matching = await this.controlSheetModel
            .find(sheetFilter)
            .session(session)
            .limit(501)
            .lean();
          if (matching.length > 500)
            throw new ConflictException('Choose a narrower withdrawal scope');
          matching.forEach((s) => sheetIds.add(String(s._id)));
        }
        result = await this.gradeModel.updateMany(
          filter,
          { $set: { isPublished: dto.isPublished } },
          { session },
        );
        if (sheetIds.size && !actorId)
          throw new ForbiddenException('Publication actor required');
        for (const id of sheetIds) {
          const sheet = await this.controlSheetModel
            .findById(id)
            .session(session)
            .lean();
          if (!sheet) continue;
          if (dto.isPublished && dto.releaseDigests && !dto.releaseDigests[id])
            throw new ConflictException(
              'Preview every selected Control sheet before activation',
            );
          const releaseEvidence = dto.isPublished
            ? await this.controlReleases.activate(
                sheet,
                actorId!,
                session,
                dto.releaseDigests?.[id],
              )
            : null;
          if (!dto.isPublished)
            await this.controlReleases.withdraw(sheet, session);
          await this.controlSheetModel.updateOne(
            { _id: sheet._id },
            { $inc: { revision: 1 } },
            { session },
          );
          await this.controlAudit.create(
            [
              {
                sheetId: sheet._id,
                courseId: sheet.courseId,
                academicYear: sheet.academicYear,
                semester: sheet.semester,
                component: sheet.component,
                action: dto.isPublished ? 'PUBLISH' : 'HIDE',
                source: 'SYSTEM',
                actorId: new Types.ObjectId(actorId),
                newValue: {
                  isPublished: dto.isPublished,
                  ...(releaseEvidence
                    ? {
                        releaseId: String(releaseEvidence._id),
                        digest: releaseEvidence.digest,
                      }
                    : {}),
                },
              },
            ],
            { session },
          );
        }
      });
    } finally {
      await session.endSession();
    }
    const legacyAffected = affectedGrades.filter(
      (grade) =>
        !grade.controlManaged && !snapshotGradeIds.has(String(grade._id)),
    );
    if (legacyAffected.length > 0) {
      await this.syncPublishedAcademicProgress(
        legacyAffected.map((grade) => grade.studentId),
      );
    }

    if (
      dto.isPublished &&
      result.modifiedCount > 0 &&
      legacyAffected.length > 0
    ) {
      // Find all matching grades to obtain target students
      const gradesToPublish = await this.gradeModel
        .find({
          ...filter,
          _id: { $in: legacyAffected.map((grade) => grade._id) },
        })
        .select('studentCode courseCode')
        .lean();

      const course = dto.courseCode
        ? await this.courseModel.findOne({ code: dto.courseCode.toUpperCase() })
        : null;

      for (const grade of gradesToPublish) {
        try {
          const courseName = course?.nameAr || course?.name || grade.courseCode;
          const examTypeLabel =
            dto.examType === 'midterm'
              ? 'منتصف الفصل'
              : dto.examType === 'final'
                ? 'نهائي'
                : dto.examType || '';
          const examSuffix = examTypeLabel ? ` (${examTypeLabel})` : '';
          await this.notificationsService.sendNotification(
            {
              targetType: 'student',
              targetStudentCode: grade.studentCode,
              title: 'إعلان الدرجات | Grades Published',
              body: `تم نشر نتيجة مادة ${courseName}${examSuffix}`,
            },
            'system',
          );
        } catch (err) {
          console.error(
            `Failed to send grade publication notification to student ${grade.studentCode}:`,
            err,
          );
        }
      }
    }

    // The committed release is already readable. GPA reconciliation and in-app
    // notification delivery use the durable outbox and must not hold HTTP open.
    this.scheduleControlReleases();
    return { count: result.modifiedCount };
  }

  async getGradesSettings() {
    let settings = await this.systemSettingsModel.findOne();
    if (!settings) {
      settings = await this.systemSettingsModel.create({
        complaintsSystemOpen: true,
        gradesSystemOpen: true,
        gradesPublishedLevels: ['1', '2', '3', '4'],
      });
    }
    return {
      gradesSystemOpen: settings.gradesSystemOpen ?? true,
      gradesLevelBasis: settings.gradesLevelBasis ?? 'course',
      visibilityVersion: settings.updatedAt?.toISOString(),
      gradesOpenAt: settings.gradesOpenAt?.toISOString(),
      gradesCloseAt: settings.gradesCloseAt?.toISOString(),
      gradesPublishedLevels: settings.gradesPublishedLevels ?? [
        '1',
        '2',
        '3',
        '4',
      ],
      gradesPublishedExamTypes: (
        settings.gradesPublishedExamTypes ?? STUDENT_RESULT_EXAM_TYPES
      ).filter((type) => STUDENT_RESULT_EXAM_TYPES.includes(type)),
      gradesVisibilityRules: (settings.gradesVisibilityRules ?? []).filter(
        (rule) =>
          !rule.examType || STUDENT_RESULT_EXAM_TYPES.includes(rule.examType),
      ),
    };
  }

  async updateGradesSettings(dto: UpdateGradesSettingsDto, userId?: string) {
    let settings = await this.systemSettingsModel.findOne();
    if (!settings) {
      settings = new this.systemSettingsModel();
    }
    if (dto.gradesLevelBasis !== undefined)
      settings.gradesLevelBasis = dto.gradesLevelBasis;

    const openAt =
      dto.gradesOpenAt !== undefined
        ? dto.gradesOpenAt
        : settings.gradesOpenAt?.toISOString();
    const closeAt =
      dto.gradesCloseAt !== undefined
        ? dto.gradesCloseAt
        : settings.gradesCloseAt?.toISOString();
    if (openAt && closeAt && Date.parse(closeAt) <= Date.parse(openAt)) {
      throw new BadRequestException('Closing time must be after opening time');
    }
    if (dto.gradesPublishedExamTypes !== undefined)
      settings.gradesPublishedExamTypes = dto.gradesPublishedExamTypes;
    if (dto.gradesVisibilityRules !== undefined) {
      if (
        dto.gradesVisibilityRules.some(
          (rule) => !rule.courseCode?.trim() && !rule.studentCode?.trim(),
        )
      ) {
        throw new BadRequestException(
          'A visibility rule requires a course or student code',
        );
      }
      settings.gradesVisibilityRules = dto.gradesVisibilityRules.map(
        (rule) => ({
          ...rule,
          courseCode: rule.courseCode?.trim().toUpperCase() || undefined,
          studentCode: rule.studentCode?.trim() || undefined,
        }),
      );
    }

    if (dto.gradesSystemOpen !== undefined) {
      settings.gradesSystemOpen = dto.gradesSystemOpen;
    }
    if (dto.gradesOpenAt !== undefined) {
      settings.gradesOpenAt = dto.gradesOpenAt
        ? new Date(dto.gradesOpenAt)
        : undefined;
    }
    if (dto.gradesCloseAt !== undefined) {
      settings.gradesCloseAt = dto.gradesCloseAt
        ? new Date(dto.gradesCloseAt)
        : undefined;
    }
    if (dto.gradesPublishedLevels !== undefined) {
      settings.gradesPublishedLevels = dto.gradesPublishedLevels;
    }
    if (userId && Types.ObjectId.isValid(userId)) {
      settings.updatedBy = new Types.ObjectId(userId);
    }

    await settings.save();
    return this.getGradesSettings();
  }

  async getStudentResultsStatus(studentId: string): Promise<{
    visibleExamTypes?: Array<'midterm' | 'final'>;
    isOpen: boolean;
    reason?:
      | 'system_closed'
      | 'not_started'
      | 'ended'
      | 'level_not_published'
      | 'tuition_blocked'
      | 'student_blocked';
    openAt?: string;
    closeAt?: string;
    studentLevel: string;
    isLevelPublished: boolean;
    visibilityVersion?: string;
  }> {
    const settings = await this.getGradesSettings();
    const profile = await this.studentProfileModel
      .findOne({ userId: new Types.ObjectId(studentId) })
      .select('level isBlocked tuitionFeesStatus')
      .lean();
    const visibilityVersion = `${settings.visibilityVersion ?? ''}:${profile?.isBlocked === true ? 'blocked' : 'clear'}`;
    const studentLevel = profile?.level || '1';
    const publishedLevels = settings.gradesPublishedLevels ?? [
      '1',
      '2',
      '3',
      '4',
    ];
    const isLevelPublished = publishedLevels.includes(studentLevel);

    if (settings.gradesSystemOpen === false) {
      return {
        isOpen: false,
        reason: 'system_closed',
        openAt: settings.gradesOpenAt,
        closeAt: settings.gradesCloseAt,
        visibilityVersion,
        studentLevel,
        isLevelPublished,
      };
    }

    const now = new Date();
    if (settings.gradesOpenAt && now < new Date(settings.gradesOpenAt)) {
      return {
        isOpen: false,
        reason: 'not_started',
        openAt: settings.gradesOpenAt,
        closeAt: settings.gradesCloseAt,
        visibilityVersion,
        studentLevel,
        isLevelPublished,
      };
    }

    if (settings.gradesCloseAt && now >= new Date(settings.gradesCloseAt)) {
      return {
        isOpen: false,
        reason: 'ended',
        openAt: settings.gradesOpenAt,
        closeAt: settings.gradesCloseAt,
        visibilityVersion,
        studentLevel,
        isLevelPublished,
      };
    }

    if (!isLevelPublished && settings.gradesLevelBasis === 'student') {
      return {
        isOpen: false,
        reason: 'level_not_published',
        openAt: settings.gradesOpenAt,
        closeAt: settings.gradesCloseAt,
        visibilityVersion,
        studentLevel,
        isLevelPublished,
      };
    }

    if (profile?.isBlocked) {
      return {
        isOpen: false,
        reason:
          profile.tuitionFeesStatus === 'unpaid'
            ? 'tuition_blocked'
            : 'student_blocked',
        openAt: settings.gradesOpenAt,
        closeAt: settings.gradesCloseAt,
        visibilityVersion,
        studentLevel,
        isLevelPublished,
      };
    }

    return {
      isOpen: true,
      visibleExamTypes: (['midterm', 'final'] as const).filter((type) =>
        (
          settings.gradesPublishedExamTypes ?? STUDENT_RESULT_EXAM_TYPES
        ).includes(type),
      ),
      openAt: settings.gradesOpenAt,
      closeAt: settings.gradesCloseAt,
      visibilityVersion,
      studentLevel,
      isLevelPublished,
    };
  }

  // ─── Student Self Services ───────────────────────────────────────

  async findStudentResults(studentId: string): Promise<
    Array<
      Grade & {
        creditHours: number;
        academicLevel: CourseLevel;
        courseNameAr?: string;
        courseNameEn?: string;
      }
    >
  > {
    const status = await this.getStudentResultsStatus(studentId);
    if (!status.isOpen) {
      return [];
    }

    // Student reads never mutate GPA/progression. Control midterm/coursework
    // releases are components, not official full-course outcomes.
    const legacyGrades = await this.gradeModel
      .find({
        cleared: { $ne: true },
        examType: { $in: CONTROL_RESULT_EXAM_TYPES },
        studentId: new Types.ObjectId(studentId),
        isPublished: true,
        status: { $ne: 'withheld' },
        $or: [
          { controlManaged: { $ne: true } },
          { $expr: { $eq: ['$controlApprovedRev', { $ifNull: ['$rev', 0] }] } },
        ],
      })
      .sort({ courseCode: 1, examType: 1 })
      .lean();
    const released = await this.controlReleases.studentMarks(
      new Types.ObjectId(studentId),
    );
    const controlledScopes =
      await this.controlReleases.managedScopes(legacyGrades);
    const grades = [
      ...legacyGrades.filter(
        (g) =>
          !controlledScopes.has(
            `${String(g.courseId)}|${g.academicYear}|${g.semester}|${g.examType}`,
          ) &&
          !controlledScopes.has(
            `${String(g.courseId)}|${g.academicYear}|${g.semester}|final`,
          ),
      ),
      ...released,
    ];
    const courseCodes = [...new Set(grades.map((grade) => grade.courseCode))];
    const matchedCourses = courseCodes.length
      ? await this.courseModel
          .find({ code: { $in: courseCodes } })
          .select('code creditHours academicLevel level nameAr nameEn')
          .lean()
      : [];
    const coursesByCode = new Map(
      matchedCourses.map((course) => [course.code.toUpperCase(), course]),
    );
    const enriched = grades.map((grade) => ({
      ...grade,
      academicLevel:
        coursesByCode.get(grade.courseCode.toUpperCase())?.academicLevel ??
        coursesByCode.get(grade.courseCode.toUpperCase())?.level ??
        '1',
    }));
    const visible = await this.visibleStudentRows(studentId, enriched);
    return visible.map((grade) => ({
      ...grade,
      creditHours:
        coursesByCode.get(grade.courseCode.toUpperCase())?.creditHours ?? 1,
      academicLevel:
        coursesByCode.get(grade.courseCode.toUpperCase())?.academicLevel ??
        coursesByCode.get(grade.courseCode.toUpperCase())?.level ??
        '1',
      courseNameAr: coursesByCode.get(grade.courseCode.toUpperCase())?.nameAr,
      courseNameEn: coursesByCode.get(grade.courseCode.toUpperCase())?.nameEn,
    }));
  }

  async findStudentQuizzes(studentId: string): Promise<CourseQuiz[]> {
    const quizzes = await this.courseQuizModel
      .find({
        studentId: new Types.ObjectId(studentId),
        isPublished: true,
      })
      .sort({ courseCode: 1 })
      .lean();
    const profile = await this.studentProfileModel
      .findOne({ userId: new Types.ObjectId(studentId) })
      .select('isBlocked')
      .lean();
    // Instructor publication is independent of official result visibility.
    // Financial/administrative holds still protect all student grade reads.
    return profile?.isBlocked ? [] : quizzes;
  }

  private async visibleStudentRows<
    T extends {
      courseCode: string;
      examType?: string;
      academicLevel?: string;
      status?: string;
      grade?: number;
    },
  >(studentId: string, rows: T[], examType?: string): Promise<T[]> {
    const [settings, profile] = await Promise.all([
      this.getGradesSettings(),
      this.studentProfileModel
        .findOne({ userId: new Types.ObjectId(studentId) })
        .select('level studentCode isBlocked')
        .lean(),
    ]);
    // Match the existing tuition administration block, including manual holds.
    // Visibility overrides and approved releases cannot bypass this gate.
    if (profile?.isBlocked) return [];
    const student = {
      level: profile?.level ?? '1',
      studentCode: profile?.studentCode,
    };
    const now = Date.now();
    const visible = (
      courseCode: string,
      component: string,
      academicLevel?: string,
    ) =>
      isReleasedGradeVisible(
        settings,
        student,
        { courseCode, examType: component, academicLevel },
        now,
      );
    return rows
      .filter(
        (row) =>
          STUDENT_RESULT_EXAM_TYPES.includes(
            (examType ??
              row.examType ??
              '') as import('@student-portal/shared').ExamType,
          ) &&
          visible(
            row.courseCode,
            examType ?? row.examType ?? '',
            row.academicLevel,
          ),
      )
      .map((row) => {
        const publicRow = {
          ...row,
          attendanceMark: undefined,
          quizzesMark: undefined,
          ...(row.examType === 'midterm'
            ? { letterGrade: undefined, gradePoints: undefined }
            : row.status === 'incomplete'
              ? { letterGrade: 'IC', gradePoints: undefined }
              : {}),
        };
        const normalized =
          row.status === 'absent' || row.status === 'banned'
            ? {
                ...publicRow,
                grade: 0,
                percentage: 0,
                gradePoints: 0,
                letterGrade:
                  row.examType === 'midterm'
                    ? undefined
                    : calculateGradeScale(0, row.status).letter,
              }
            : publicRow;
        if (
          'officialResult' in row &&
          row.officialResult &&
          typeof row.officialResult === 'object'
        ) {
          const outcome = row.officialResult as Record<string, unknown>;
          // A published final authorizes the official aggregate, not raw coursework.
          // Never return the release's component array to student clients.
          if (row.examType !== 'final')
            return { ...normalized, officialResult: undefined };
          return {
            ...normalized,
            officialResult: {
              official: outcome.official,
              complete: outcome.complete,
              total: outcome.total,
              totalMax: outcome.totalMax,
              percentage: outcome.percentage,
              passed: outcome.passed,
              gradePoints: outcome.gradePoints,
              letterGrade:
                row.status === 'banned'
                  ? 'FX'
                  : row.status === 'incomplete'
                    ? 'IC'
                    : outcome.letterGrade,
            },
          };
        }
        return normalized;
      });
  }

  async auditAcademicWarnings(options?: { dryRun?: boolean }) {
    // High-performance filter: only fetch academic profiles that have recorded grades,
    // warnings, or completed/failed courses (skipping fresh or empty profiles that have no history)
    const academicProfiles = await this.studentAcademicProfileModel
      .find({
        $or: [
          { gpa: { $gt: 0 } },
          { academicWarnings: { $gt: 0 } },
          { 'completedCourses.0': { $exists: true } },
          { 'failedCourses.0': { $exists: true } },
        ],
      })
      .select('studentId gpa academicWarnings completedCourses failedCourses')
      .lean();

    const studentIds = academicProfiles
      .map((p) => p.studentId)
      .filter((id): id is Types.ObjectId => Boolean(id));

    const [studentProfiles, users] =
      studentIds.length > 0
        ? await Promise.all([
            this.studentProfileModel
              .find({ userId: { $in: studentIds } })
              .select('userId studentCode fullName fullNameAr academicWarnings')
              .lean(),
            this.userModel
              .find({ _id: { $in: studentIds } })
              .select('name studentCode')
              .lean(),
          ])
        : [[], []];

    const studentMap = new Map(
      studentProfiles.map((sp) => [sp.userId.toString(), sp]),
    );
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    const details: Array<{
      studentId: string;
      studentCode: string;
      studentName: string;
      gpa: number;
      previousWarnings: number;
      newWarnings: number;
      status: 'WARNED' | 'CLEARED' | 'GOOD_STANDING';
      isActionRequired: boolean;
    }> = [];

    const academicBulkOps: Parameters<
      typeof this.studentAcademicProfileModel.bulkWrite
    >[0] = [];
    const profileBulkOps: Parameters<
      typeof this.studentProfileModel.bulkWrite
    >[0] = [];

    let warnedCount = 0;
    let clearedCount = 0;
    let goodStandingCount = 0;

    for (const ap of academicProfiles) {
      if (!ap.studentId) continue;
      const sId = ap.studentId.toString();
      const sp = studentMap.get(sId);
      const user = userMap.get(sId);
      const gpa = ap.gpa ?? 0;
      const prevWarnings = ap.academicWarnings ?? sp?.academicWarnings ?? 0;

      const hasHistory =
        gpa > 0 ||
        (ap.completedCourses && ap.completedCourses.length > 0) ||
        (ap.failedCourses && ap.failedCourses.length > 0);

      if (!hasHistory) {
        continue;
      }

      let newWarnings = prevWarnings;
      let status: 'WARNED' | 'CLEARED' | 'GOOD_STANDING' = 'GOOD_STANDING';

      if (gpa > 0 && gpa < 2.0) {
        newWarnings = Math.max(1, prevWarnings + 1);
        status = 'WARNED';
        warnedCount++;
      } else if (gpa >= 2.0) {
        if (prevWarnings > 0) {
          newWarnings = 0;
          status = 'CLEARED';
          clearedCount++;
        } else {
          newWarnings = 0;
          status = 'GOOD_STANDING';
          goodStandingCount++;
        }
      }

      details.push({
        studentId: sId,
        studentCode: sp?.studentCode ?? user?.studentCode ?? '',
        studentName: user?.name ?? sp?.fullName ?? '',
        gpa,
        previousWarnings: prevWarnings,
        newWarnings,
        status,
        isActionRequired: status === 'WARNED',
      });

      if (!options?.dryRun && newWarnings !== prevWarnings) {
        academicBulkOps.push({
          updateOne: {
            filter: { _id: ap._id },
            update: { $set: { academicWarnings: newWarnings } },
          },
        });
        if (sp) {
          profileBulkOps.push({
            updateOne: {
              filter: { _id: sp._id },
              update: { $set: { academicWarnings: newWarnings } },
            },
          });
        }
      }
    }

    if (!options?.dryRun) {
      if (academicBulkOps.length > 0) {
        await this.studentAcademicProfileModel.bulkWrite(academicBulkOps, {
          ordered: false,
        });
      }
      if (profileBulkOps.length > 0) {
        await this.studentProfileModel.bulkWrite(profileBulkOps, {
          ordered: false,
        });
      }
    }

    return {
      totalAudited: details.length,
      warnedCount,
      clearedCount,
      goodStandingCount,
      dryRun: Boolean(options?.dryRun),
      details,
    };
  }
}
