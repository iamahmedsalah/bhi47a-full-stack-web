import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Course, CourseDocument } from '../../courses/schemas/course.schema';
import { Grade, GradeDocument } from '../../grades/schemas/grade.schema';
import { GradesService } from '../../grades/grades.service';
import type { Importer, ImportResult } from '../importer.interface';
import { normalizeStudentSemester } from '../upload-utils';

@Injectable()
export class GradeImporter implements Importer {
  readonly type = 'grades';

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Course.name) private readonly courseModel: Model<CourseDocument>,
    @InjectModel(Grade.name) private readonly gradeModel: Model<GradeDocument>,
    private readonly gradesService: GradesService,
  ) {}

  validate(rows: Record<string, unknown>[]) {
    const errors: string[] = [];
    const validRows: { row: Record<string, unknown>; rowNum: number }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      if (
        !row.studentCode ||
        !row.courseCode ||
        !row.examType ||
        !row.academicYear ||
        !row.semester ||
        row.grade === undefined ||
        row.maxGrade === undefined
      ) {
        errors.push(
          `السطر ${rowNum}: بيانات الدرجات ناقصة (كود الطالب، كود المادة، نوع الامتحان، الدرجة)`,
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

    const gradeOps: Parameters<typeof this.gradeModel.bulkWrite>[0] = [];

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

      const gradeData = {
        studentId: student._id,
        studentCode,
        courseId: course._id,
        courseName: course.name,
        courseCode: course.code,
        examType: row.examType,
        grade: row.grade,
        maxGrade: row.maxGrade,
        status: (row.status as string) || 'present',
        academicYear: String(row.academicYear).trim(),
        semester: normalizeStudentSemester(row.semester),
        isPublished: true,
      };

      gradeOps.push({
        updateOne: {
          filter: {
            studentCode,
            courseCode: course.code,
            examType: row.examType as string,
          },
          update: { $set: gradeData },
          upsert: true,
        },
      });

      successCount++;
    }

    if (gradeOps.length > 0) {
      await this.gradeModel.bulkWrite(gradeOps, { ordered: false });
      await this.gradesService.syncPublishedAcademicProgress(
        students.map((student) => student._id),
      );
    }

    return { successCount, errors };
  }
}
