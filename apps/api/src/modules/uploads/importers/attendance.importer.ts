import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../users/schemas/user.schema';
import {
  Attendance,
  AttendanceDocument,
} from '../../attendance/schemas/attendance.schema';
import type { Importer, ImportResult } from '../importer.interface';

@Injectable()
export class AttendanceImporter implements Importer {
  readonly type = 'attendance';

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Attendance.name)
    private readonly attendanceModel: Model<AttendanceDocument>,
  ) {}

  validate(rows: Record<string, unknown>[]) {
    const errors: string[] = [];
    const validRows: { row: Record<string, unknown>; rowNum: number }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      if (
        !row.studentCode ||
        row.totalLectures === undefined ||
        row.attendedLectures === undefined
      ) {
        errors.push(
          `السطر ${rowNum}: بيانات الحضور ناقصة (كود الطالب، إجمالي المحاضرات، حضور)`,
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
    const students = await this.userModel
      .find({ studentCode: { $in: studentCodes }, role: 'student' })
      .lean();
    const studentMap = new Map(students.map((s) => [s.studentCode, s]));

    const ops: Parameters<typeof this.attendanceModel.bulkWrite>[0] = [];

    for (const { row, rowNum } of validRows) {
      const studentCode = String(row.studentCode).trim();
      const student = studentMap.get(studentCode);
      if (!student) {
        errors.push(
          `السطر ${rowNum}: كود الطالب (${studentCode}) غير مسجل بالمنظومة`,
        );
        continue;
      }

      const total = row.totalLectures as number;
      const attended = row.attendedLectures as number;
      const absence =
        row.absenceLectures !== undefined
          ? (row.absenceLectures as number)
          : Math.max(0, total - attended);
      const percentage = total > 0 ? Math.round((attended / total) * 100) : 100;

      const attendanceData = {
        studentId: student._id,
        studentCode,
        academicYear: (row.academicYear as string) || '2024-2025',
        semester: (row.semester as string) || 'first',
        totalLectures: total,
        attendedLectures: attended,
        absenceLectures: absence,
        attendancePercentage: percentage,
        isPublished: true,
      };

      ops.push({
        updateOne: {
          filter: {
            studentCode,
            academicYear: attendanceData.academicYear,
            semester: attendanceData.semester,
          },
          update: { $set: attendanceData },
          upsert: true,
        },
      });

      successCount++;
    }

    if (ops.length > 0) {
      try {
        await this.attendanceModel.bulkWrite(ops, { ordered: false });
      } catch (err: unknown) {
        const bulkError = err as {
          writeErrors?: Array<{ errmsg?: string; message?: string }>;
        };
        if (bulkError?.writeErrors?.length) {
          successCount = Math.max(
            0,
            successCount - bulkError.writeErrors.length,
          );
          for (const we of bulkError.writeErrors) {
            errors.push(
              `خطأ أثناء حفظ سجل الحضور: ${we.errmsg || we.message || 'خطأ غير معروف'}`,
            );
          }
        } else {
          successCount = 0;
          const message =
            err instanceof Error ? err.message : 'خطأ أثناء حفظ الحضور';
          errors.push(`فشل حفظ الحضور: ${message}`);
        }
      }
    }

    return { successCount, errors };
  }
}
