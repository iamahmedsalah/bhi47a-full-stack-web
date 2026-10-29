import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Course, CourseDocument } from '../../courses/schemas/course.schema';
import {
  CourseQuiz,
  CourseQuizDocument,
} from '../../grades/schemas/course-quiz.schema';
import type { Importer, ImportResult } from '../importer.interface';
import { normalizeStudentSemester } from '../upload-utils';
import type { GradeStatus } from '@student-portal/shared';

function normalizeGradeStatus(status?: string): GradeStatus {
  const clean = String(status ?? '')
    .trim()
    .toLowerCase();
  if (clean === 'absent' || clean === 'غائب' || clean === 'غياب')
    return 'absent';
  if (clean === 'banned' || clean === 'محروم' || clean === 'حرمان')
    return 'banned';
  return 'present';
}

@Injectable()
export class QuizImporter implements Importer {
  readonly type = 'quizzes';

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Course.name)
    private readonly courseModel: Model<CourseDocument>,
    @InjectModel(CourseQuiz.name)
    private readonly courseQuizModel: Model<CourseQuizDocument>,
  ) {}

  validate(rows: Record<string, unknown>[]) {
    const errors: string[] = [];
    const validRows: { row: Record<string, unknown>; rowNum: number }[] = [];
    const currentYear = new Date().getFullYear();
    const defaultAcademicYear = `${currentYear}-${currentYear + 1}`;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      if (!row.academicYear) {
        row.academicYear = defaultAcademicYear;
      }
      if (!row.semester) {
        row.semester = 'first';
      }
      if (row.maxGrade === undefined && row.grade !== undefined) {
        row.maxGrade = 10;
      }
      if (
        !row.studentCode ||
        !row.courseCode ||
        row.quizNumber === undefined ||
        row.grade === undefined ||
        row.maxGrade === undefined
      ) {
        errors.push(
          `السطر ${rowNum}: بيانات الكويز ناقصة (كود الطالب، كود المادة، رقم الكويز، الدرجة)`,
        );
        continue;
      }
      validRows.push({ row, rowNum });
    }

    return { validRows, errors };
  }

  async commit(
    validRows: { row: Record<string, unknown>; rowNum: number }[],
  ): Promise<ImportResult> {
    const errors: string[] = [];
    let successCount = 0;

    if (validRows.length === 0) return { successCount: 0, errors };

    const studentCodes = Array.from(
      new Set(validRows.map((v) => String(v.row.studentCode).trim())),
    );
    const courseCodes = Array.from(
      new Set(
        validRows.map((v) => String(v.row.courseCode).trim().toUpperCase()),
      ),
    );

    const [students, courses] = await Promise.all([
      this.userModel
        .find({ studentCode: { $in: studentCodes }, role: 'student' })
        .lean(),
      this.courseModel.find({ code: { $in: courseCodes } }).lean(),
    ]);

    const studentMap = new Map(students.map((s) => [s.studentCode, s]));
    const courseMap = new Map(courses.map((c) => [c.code, c]));

    // 1. Pre-fetch existing course quiz documents in bulk
    const queryConditions = validRows
      .map(({ row }) => {
        const studentCode = String(row.studentCode).trim();
        const courseCode = String(row.courseCode).trim().toUpperCase();
        const academicYear = String(row.academicYear).trim();
        const semester = normalizeStudentSemester(row.semester);
        return { studentCode, courseCode, academicYear, semester };
      })
      .filter((cond) => cond.studentCode && cond.courseCode);

    const existingQuizzes =
      queryConditions.length > 0
        ? await this.courseQuizModel.find({ $or: queryConditions })
        : [];

    const quizMap = new Map<string, CourseQuizDocument>();
    for (const q of existingQuizzes) {
      const key = `${q.studentCode}:${q.courseCode}:${q.academicYear}:${q.semester}`;
      quizMap.set(key, q);
    }

    const modifiedDocs = new Set<CourseQuizDocument>();

    for (const { row, rowNum } of validRows) {
      try {
        const studentCode = String(row.studentCode).trim();
        const code = String(row.courseCode).trim().toUpperCase();

        const student = studentMap.get(studentCode);
        if (!student) {
          errors.push(
            `السطر ${rowNum}: كود الطالب (${studentCode}) غير مسجل بالمنظومة`,
          );
          continue;
        }

        const course = courseMap.get(code);
        if (!course) {
          errors.push(
            `السطر ${rowNum}: كود المادة (${code}) غير مسجل بالمنظومة`,
          );
          continue;
        }

        const academicYear = String(row.academicYear).trim();
        const semester = normalizeStudentSemester(row.semester);
        const key = `${studentCode}:${course.code}:${academicYear}:${semester}`;
        let quizRecord = quizMap.get(key);

        const quizEntry = {
          quizNumber: row.quizNumber as number,
          title: (row.title as string) || `Quiz ${String(row.quizNumber)}`,
          grade: row.grade as number,
          maxGrade: row.maxGrade as number,
          status: normalizeGradeStatus(row.status as string),
          date: new Date(),
        };

        if (!quizRecord) {
          quizRecord = new this.courseQuizModel({
            studentId: student._id,
            studentCode,
            courseId: course._id,
            courseName: course.name,
            courseCode: course.code,
            academicYear,
            semester,
            quizzes: [quizEntry],
            totalGrade: quizEntry.grade,
            maxTotalGrade: quizEntry.maxGrade,
            percentage: Math.round(
              (quizEntry.grade / quizEntry.maxGrade) * 100,
            ),
            isPublished: true,
          });
          quizMap.set(key, quizRecord);
        } else {
          const existingIdx = quizRecord.quizzes.findIndex(
            (q) => q.quizNumber === row.quizNumber,
          );
          if (existingIdx !== -1) {
            quizRecord.quizzes[existingIdx] = quizEntry;
          } else {
            quizRecord.quizzes.push(quizEntry);
          }

          let totalG = 0;
          let maxTotalG = 0;
          for (const q of quizRecord.quizzes) {
            if (q.status === 'present') totalG += q.grade;
            maxTotalG += q.maxGrade;
          }

          quizRecord.totalGrade = totalG;
          quizRecord.maxTotalGrade = maxTotalG;
          quizRecord.percentage =
            maxTotalG > 0 ? Math.round((totalG / maxTotalG) * 100) : 0;
        }

        modifiedDocs.add(quizRecord);
        successCount++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'خطأ غير معروف';
        errors.push(`السطر ${rowNum}: ${message}`);
      }
    }

    if (modifiedDocs.size > 0) {
      const docs = Array.from(modifiedDocs);
      const saveResults = await Promise.allSettled(
        docs.map((doc) => doc.save()),
      );
      for (const res of saveResults) {
        if (res.status === 'rejected') {
          successCount = Math.max(0, successCount - 1);
          const msg =
            res.reason instanceof Error
              ? res.reason.message
              : 'تعذر حفظ سجل الكويز';
          errors.push(`خطأ أثناء حفظ الكويز: ${msg}`);
        }
      }
    }

    return { successCount, errors };
  }
}
