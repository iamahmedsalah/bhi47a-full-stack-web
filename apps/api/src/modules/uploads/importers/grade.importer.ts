import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { calculateGradeScale } from '@student-portal/shared';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Course, CourseDocument } from '../../courses/schemas/course.schema';
import { Grade, GradeDocument } from '../../grades/schemas/grade.schema';
import { GradesService } from '../../grades/grades.service';
import type { Importer, ImportResult } from '../importer.interface';
import { normalizeStudentSemester, parseSafeNumber } from '../upload-utils';

interface ExamEntry {
  examType: string;
  grade: number;
  maxGrade: number;
}

@Injectable()
export class GradeImporter implements Importer {
  readonly type = 'grades';

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Course.name)
    private readonly courseModel: Model<CourseDocument>,
    @InjectModel(Grade.name) private readonly gradeModel: Model<GradeDocument>,
    private readonly gradesService: GradesService,
  ) {}

  validate(rows: Record<string, unknown>[]) {
    const errors: string[] = [];
    const validRows: { row: Record<string, unknown>; rowNum: number }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      const hasStudent = Boolean(row.studentCode);
      const hasCourse = Boolean(row.courseCode);

      const hasStandardGrade = row.grade !== undefined && Boolean(row.examType);
      const hasBreakdown =
        row.midterm !== undefined ||
        row.final !== undefined ||
        row.coursework !== undefined ||
        row.practical !== undefined ||
        row.total !== undefined;

      if (!hasStudent || !hasCourse) {
        errors.push(
          `السطر ${rowNum}: بيانات الطالب أو المادة ناقصة (كود الطالب وكود المقرر إجباريان)`,
        );
        continue;
      }

      if (!hasStandardGrade && !hasBreakdown) {
        errors.push(
          `السطر ${rowNum}: لم يتم العثور على درجات صالحة (يرجى إدخال الدرجة ونوع الامتحان، أو تفصيل أعمال السنة والنهائي والمجموع)`,
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
    const currentYear = new Date().getFullYear();
    const defaultAcademicYear = `${currentYear}-${currentYear + 1}`;

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

    const gradeOps: Parameters<typeof this.gradeModel.bulkWrite>[0] = [];
    const affectedStudentIds = new Set<string>();

    for (const { row, rowNum } of validRows) {
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
        errors.push(`السطر ${rowNum}: كود المادة (${code}) غير مسجل بالمنظومة`);
        continue;
      }

      const academicYear = (
        (row.academicYear as string) || defaultAcademicYear
      ).trim();
      const semester = normalizeStudentSemester(row.semester);
      const status = (row.status as string) || 'present';

      // Build exam entries either from breakdown columns or standard row
      const entries: ExamEntry[] = [];

      if (row.midterm !== undefined) {
        entries.push({
          examType: 'midterm',
          grade: Number(row.midterm),
          maxGrade: parseSafeNumber(row.maxMidterm) ?? 20,
        });
      }
      if (row.coursework !== undefined) {
        entries.push({
          examType: 'coursework',
          grade: Number(row.coursework),
          maxGrade: parseSafeNumber(row.maxCoursework) ?? 20,
        });
      }
      if (row.practical !== undefined) {
        entries.push({
          examType: 'practical',
          grade: Number(row.practical),
          maxGrade: parseSafeNumber(row.maxPractical) ?? 10,
        });
      }
      if (row.final !== undefined) {
        entries.push({
          examType: 'final',
          grade: Number(row.final),
          maxGrade: parseSafeNumber(row.maxFinal) ?? 60,
        });
      }

      if (entries.length === 0) {
        if (row.total !== undefined) {
          entries.push({
            examType: 'final',
            grade: Number(row.total),
            maxGrade: parseSafeNumber(row.maxGrade) ?? 100,
          });
        } else if (row.grade !== undefined && row.examType) {
          entries.push({
            examType: String((row.examType as string) || '')
              .trim()
              .toLowerCase(),
            grade: Number(row.grade),
            maxGrade: parseSafeNumber(row.maxGrade) ?? 100,
          });
        }
      }

      for (const entry of entries) {
        const percentage =
          entry.maxGrade > 0
            ? Math.round((entry.grade / entry.maxGrade) * 10000) / 100
            : 0;
        const scale = calculateGradeScale(percentage, status);

        const gradeData = {
          studentId: student._id,
          studentCode,
          courseId: course._id,
          courseName: course.name,
          courseCode: course.code,
          examType: entry.examType,
          grade: entry.grade,
          maxGrade: entry.maxGrade,
          percentage,
          letterGrade: scale.letter,
          gradePoints: scale.points,
          status,
          academicYear,
          semester,
          isPublished: true,
        };

        gradeOps.push({
          updateOne: {
            filter: {
              studentCode,
              courseCode: course.code,
              examType: entry.examType,
            },
            update: { $set: gradeData },
            upsert: true,
          },
        });
      }

      affectedStudentIds.add(student._id.toString());
      successCount++;
    }

    if (gradeOps.length > 0) {
      await this.gradeModel.bulkWrite(gradeOps, { ordered: false });
      await this.gradesService.syncPublishedAcademicProgress(
        Array.from(affectedStudentIds),
      );
    }

    return { successCount, errors };
  }
}
