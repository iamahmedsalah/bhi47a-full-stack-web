import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Grade, GradeDocument } from './schemas/grade.schema';
import { CourseQuiz, CourseQuizDocument } from './schemas/course-quiz.schema';
import { SaveGradeDto, QueryGradeDto, PublishGradesDto } from './dto/grade.dto';
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
import { mergeAcademicCourseProgress } from '../registrations/utils/academic-course-progress.util';
import { calculatePromotedAcademicLevel } from './utils/academic-level-progression.util';
import type { CourseLevel } from '@student-portal/shared';

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
    private notificationsService: NotificationsService,
  ) {}

  async onModuleInit() {
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

  async syncPublishedAcademicProgress(studentIds: Array<string | Types.ObjectId>) {
    const uniqueIds = [
      ...new Set(studentIds.map((id) => id.toString()).filter(Boolean)),
    ];
    if (uniqueIds.length === 0) return [];

    const courses = await this.courseModel.find({ isActive: true }).lean();
    const courseCredits = Object.fromEntries(
      courses.map((course) => [course.code.toUpperCase(), course.creditHours ?? 1]),
    );

    const results = await Promise.all(
      uniqueIds.map(async (studentId) => {
        const objectId = new Types.ObjectId(studentId);
        const [academic, studentProfile, grades] = await Promise.all([
          this.studentAcademicProfileModel.findOne({ studentId: objectId }),
          this.studentProfileModel.findOne({ userId: objectId }),
          this.gradeModel.find({ studentId: objectId, isPublished: true }).lean(),
        ]);
        if (!academic && !studentProfile) return null;

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
        const promotedLevel = calculatePromotedAcademicLevel({
          currentLevel,
          courses,
          finalizedCourses,
        });
        const wasPromoted = Number(promotedLevel) > Number(currentLevel);
        const currentRequirements = courses.filter(
          (course) =>
            (course.academicLevel ?? course.level) === currentLevel &&
            (course.semester === 'first' || course.semester === 'second') &&
            course.type !== 'elective',
        );
        const finalized = new Set(finalizedCourses);
        const missingCourseCodes = currentRequirements
          .filter((course) => !finalized.has(course.code.toUpperCase()))
          .map((course) => course.code)
          .sort();
        const requiredCodes = new Set(
          currentRequirements.map((course) => course.code.toUpperCase()),
        );
        const carriedFailedCourseCodes = progress.failedCourses.filter((code) =>
          requiredCodes.has(code),
        );

        if (academic) {
          academic.completedCourses = progress.completedCourses;
          academic.failedCourses = progress.failedCourses;
          academic.lowGradeCourses = progress.lowGradeCourses;
          if (progress.calculatedGpa !== null) academic.gpa = progress.calculatedGpa;
          academic.academicLevel = promotedLevel;
          if (wasPromoted) academic.semester = 'first';
          await academic.save();
        }
        if (
          studentProfile &&
          (studentProfile.level !== promotedLevel ||
            (wasPromoted && studentProfile.semester !== 'first'))
        ) {
          studentProfile.level = promotedLevel;
          if (wasPromoted) studentProfile.semester = 'first';
          await studentProfile.save();
        }

        return {
          studentCode: studentProfile?.studentCode ?? null,
          previousLevel: currentLevel,
          academicLevel: promotedLevel,
          promoted: wasPromoted,
          missingCourseCodes,
          carriedFailedCourseCodes,
          hasFirstSemesterCurriculum: currentRequirements.some(
            (course) => course.semester === 'first',
          ),
          hasSecondSemesterCurriculum: currentRequirements.some(
            (course) => course.semester === 'second',
          ),
        };
      }),
    );
    return results.filter((result) => result !== null);
  }

  async recalculateAcademicProgress(studentCode?: string) {
    let studentIds: Types.ObjectId[] = [];
    if (studentCode) {
      const student = await this.userModel
        .findOne({ studentCode: studentCode.trim(), role: 'student' })
        .select('_id')
        .lean();
      if (!student) throw new NotFoundException('Student not found');
      studentIds = [student._id];
    } else {
      studentIds = (await this.gradeModel.distinct('studentId', {
        isPublished: true,
      })) as Types.ObjectId[];
    }

    const students = await this.syncPublishedAcademicProgress(studentIds);
    return {
      processed: students.length,
      promoted: students.filter((student) => student.promoted).length,
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

    const updateData = {
      studentId: student._id,
      courseId: course._id,
      courseName: course.name,
      courseCode: course.code,
      grade: dto.grade,
      maxGrade: dto.maxGrade,
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
              : dto.examType;
        await this.notificationsService.sendNotification(
          {
            targetType: 'student',
            targetStudentCode: student.studentCode,
            title: 'إعلان الدرجات | Grades Published',
            body: `تم نشر نتيجة مادة ${course.name} (${examTypeLabel})`,
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

    // Map items to include student name directly for convenience
    const formattedItems = items.map((item: any) => ({
      ...item,
      studentName: item.studentId?.name || '—',
    }));

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
    const updated = await this.gradeModel.findByIdAndUpdate(
      id,
      { $set: updateData },
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

    const quizFilter: any = {};
    if (dto.academicYear) quizFilter.academicYear = dto.academicYear;
    if (dto.semester) quizFilter.semester = dto.semester;
    if (dto.courseCode) quizFilter.courseCode = dto.courseCode.toUpperCase();

    const includeGrades = !dto.examType || dto.examType !== 'quiz';
    const includeQuizzes = !dto.examType || dto.examType === 'quiz';
    const affectedGrades = includeGrades
      ? await this.gradeModel.find(filter).select('studentId').lean()
      : [];
    const [result, quizResult] = await Promise.all([
      includeGrades
        ? this.gradeModel.updateMany(filter, { $set: { isPublished: dto.isPublished } })
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
          const courseName = course?.name || grade.courseCode;
          const examTypeLabel =
            dto.examType === 'midterm'
              ? 'منتصف الفصل'
              : dto.examType === 'final'
                ? 'نهائي'
                : dto.examType;
          await this.notificationsService.sendNotification(
            {
              targetType: 'student',
              targetStudentCode: grade.studentCode,
              title: 'إعلان الدرجات | Grades Published',
              body: `تم نشر نتيجة مادة ${courseName} (${examTypeLabel})`,
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

  // ─── Student Self Services ───────────────────────────────────────

  async findStudentResults(
    studentId: string,
  ): Promise<
    Array<
      Grade & {
        creditHours: number;
        academicLevel: CourseLevel;
        courseNameAr?: string;
        courseNameEn?: string;
      }
    >
  > {
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
    })) as Array<
      Grade & {
        creditHours: number;
        academicLevel: CourseLevel;
        courseNameAr?: string;
        courseNameEn?: string;
      }
    >;
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
}
