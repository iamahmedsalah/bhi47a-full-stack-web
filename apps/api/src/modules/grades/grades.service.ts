import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Grade, GradeDocument } from './schemas/grade.schema';
import { CourseQuiz, CourseQuizDocument } from './schemas/course-quiz.schema';
import {
  SaveGradeDto,
  QueryGradeDto,
  PublishGradesDto,
  UpdateGradesSettingsDto,
} from './dto/grade.dto';
import {
  buildPaginationOptions,
  createPaginatedResult,
} from '../../common/utils/pagination.util';
import { User, UserDocument } from '../users/schemas/user.schema';
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
import { calculateGradeScale, type CourseLevel } from '@student-portal/shared';
import { coursesForDepartment } from '../courses/utils/course-curriculum.util';

import { shouldRunStartupTasks } from '../../common/utils/runtime.util';

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
    private notificationsService: NotificationsService,
  ) {}

  async onModuleInit() {
    if (!shouldRunStartupTasks()) {
      return;
    }

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

  async syncPublishedAcademicProgress(
    studentIds: Array<string | Types.ObjectId>,
    options?: {
      dryRun?: boolean;
      maxAllowedCarriedCourses?: number;
    },
  ) {
    const uniqueIds = [
      ...new Set(studentIds.map((id) => id.toString()).filter(Boolean)),
    ];
    if (uniqueIds.length === 0) return [];

    const courses = await this.courseModel.find({ isActive: true }).lean();
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
        .find({ studentId: { $in: objectIds }, isPublished: true })
        .lean(),
      this.userModel
        .find({ _id: { $in: objectIds } })
        .select('name studentCode')
        .lean(),
    ]);

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

      const progress = mergeAcademicCourseProgress({
        completedCourses: academic?.completedCourses,
        failedCourses: academic?.failedCourses,
        lowGradeCourses: academic?.lowGradeCourses,
        grades,
        courseCredits,
      });
      const currentLevel = (academic?.academicLevel ??
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

      const promotedLevel = evaluation.promotedLevel;
      const wasPromoted = evaluation.willPromote;

      const currentRequirements = curriculumCourses.filter(
        (course) =>
          (course.academicLevel ?? course.level) === currentLevel &&
          (course.semester === 'first' || course.semester === 'second') &&
          course.type !== 'elective',
      );

      const isDryRun = Boolean(options?.dryRun);

      if (!isDryRun) {
        const finalGpa = progress.calculatedGpa ?? academic?.gpa;
        let warningCount: number | undefined;
        if (typeof finalGpa === 'number' && finalGpa > 0) {
          if (finalGpa < 2.0) {
            warningCount = Math.max(
              1,
              (academic?.academicWarnings ??
                studentProfile?.academicWarnings ??
                0) + 1,
            );
          } else {
            warningCount = 0;
          }
        }

        if (academic) {
          academic.completedCourses = progress.completedCourses;
          academic.failedCourses = progress.failedCourses;
          academic.lowGradeCourses = progress.lowGradeCourses;
          if (progress.calculatedGpa !== null)
            academic.gpa = progress.calculatedGpa;
          academic.academicLevel = promotedLevel;
          if (wasPromoted) academic.semester = 'first';
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

      const completedCredits = progress.courseResults
        .filter((r) => r.passed)
        .reduce((acc, curr) => acc + curr.creditHours, 0);

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

    const filter = {
      studentCode: dto.studentCode,
      courseCode: dto.courseCode.toUpperCase(),
      examType: dto.examType,
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
      isPublished: dto.isPublished !== undefined ? dto.isPublished : true,
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
    const filter: any = {};

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

    const [items, total] = await Promise.all([
      this.gradeModel
        .find(filter)
        .sort({ createdAt: -1 })
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
    const deleted = await this.gradeModel.findByIdAndDelete(id);
    if (!deleted) {
      throw new NotFoundException('الدرجة غير موجودة');
    }
    return { message: 'تم حذف الدرجة بنجاح' }; // Grade deleted successfully
  }

  async publishGrades(dto: PublishGradesDto): Promise<{ count: number }> {
    const filter: any = {};
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

    const quizFilter: any = {};
    if (dto.academicYear) quizFilter.academicYear = dto.academicYear;
    if (dto.semester) quizFilter.semester = dto.semester;
    if (dto.courseCode) quizFilter.courseCode = dto.courseCode.toUpperCase();
    if (dto.level) {
      const studentsInLevel = await this.studentProfileModel
        .find({ level: dto.level })
        .select('userId')
        .lean();
      quizFilter.studentId = { $in: studentsInLevel.map((p) => p.userId) };
    }

    const includeGrades = !dto.examType || dto.examType !== 'quiz';
    const includeQuizzes = !dto.examType || dto.examType === 'quiz';
    const affectedGrades = includeGrades
      ? await this.gradeModel.find(filter).select('studentId').lean()
      : [];
    const [result, quizResult] = await Promise.all([
      includeGrades
        ? this.gradeModel.updateMany(filter, {
            $set: { isPublished: dto.isPublished },
          })
        : Promise.resolve({ modifiedCount: 0 }),
      includeQuizzes
        ? this.courseQuizModel.updateMany(quizFilter, {
            $set: { isPublished: dto.isPublished },
          })
        : Promise.resolve({ modifiedCount: 0 }),
    ]);

    if (affectedGrades.length > 0) {
      await this.syncPublishedAcademicProgress(
        affectedGrades.map((grade) => grade.studentId),
      );
    }

    if (dto.isPublished && result.modifiedCount > 0) {
      // Find all matching grades to obtain target students
      const gradesToPublish = await this.gradeModel
        .find(filter)
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

    return { count: result.modifiedCount + quizResult.modifiedCount };
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
      gradesOpenAt: settings.gradesOpenAt?.toISOString(),
      gradesCloseAt: settings.gradesCloseAt?.toISOString(),
      gradesPublishedLevels: settings.gradesPublishedLevels ?? [
        '1',
        '2',
        '3',
        '4',
      ],
    };
  }

  async updateGradesSettings(dto: UpdateGradesSettingsDto, userId?: string) {
    let settings = await this.systemSettingsModel.findOne();
    if (!settings) {
      settings = new this.systemSettingsModel();
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
    isOpen: boolean;
    reason?: 'system_closed' | 'not_started' | 'ended' | 'level_not_published';
    openAt?: string;
    closeAt?: string;
    studentLevel: string;
    isLevelPublished: boolean;
  }> {
    const settings = await this.getGradesSettings();
    const profile = await this.studentProfileModel
      .findOne({ userId: new Types.ObjectId(studentId) })
      .select('level')
      .lean();
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
        studentLevel,
        isLevelPublished,
      };
    }

    if (settings.gradesCloseAt && now > new Date(settings.gradesCloseAt)) {
      return {
        isOpen: false,
        reason: 'ended',
        openAt: settings.gradesOpenAt,
        closeAt: settings.gradesCloseAt,
        studentLevel,
        isLevelPublished,
      };
    }

    if (!isLevelPublished) {
      return {
        isOpen: false,
        reason: 'level_not_published',
        openAt: settings.gradesOpenAt,
        closeAt: settings.gradesCloseAt,
        studentLevel,
        isLevelPublished,
      };
    }

    return {
      isOpen: true,
      openAt: settings.gradesOpenAt,
      closeAt: settings.gradesCloseAt,
      studentLevel,
      isLevelPublished: true,
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

    // Self-heal academic profiles created before automatic progression was
    // introduced. New grade saves/publish operations already trigger this.
    await this.syncPublishedAcademicProgress([studentId]);
    const grades = await this.gradeModel
      .find({
        studentId: new Types.ObjectId(studentId),
        isPublished: true,
      })
      .sort({ courseCode: 1, examType: 1 })
      .lean();
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
    return grades.map((grade) => ({
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
    return this.courseQuizModel
      .find({
        studentId: new Types.ObjectId(studentId),
        isPublished: true,
      })
      .sort({ courseCode: 1 })
      .lean();
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
