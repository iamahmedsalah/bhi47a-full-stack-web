import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../../users/schemas/user.schema';
import {
  AcademicEmail,
  AcademicEmailDocument,
} from '../../academic-emails/schemas/academic-email.schema';
import type { Importer, ImportResult } from '../importer.interface';

@Injectable()
export class AcademicEmailImporter implements Importer {
  readonly type = 'academic-emails';

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(AcademicEmail.name)
    private readonly emailModel: Model<AcademicEmailDocument>,
  ) {}

  validate(rows: Record<string, unknown>[]) {
    const errors: string[] = [];
    const validRows: { row: Record<string, unknown>; rowNum: number }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      if (!row.studentCode || !row.academicEmail) {
        errors.push(
          `السطر ${rowNum}: بيانات البريد الأكاديمي ناقصة (كود الطالب، البريد الأكاديمي)`,
        );
        continue;
      }
      validRows.push({ row, rowNum });
    }

    return { validRows, errors };
  }

  async commit(
    validRows: { row: Record<string, unknown>; rowNum: number }[],
    actorId: string,
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

    const ops: Parameters<typeof this.emailModel.bulkWrite>[0] = [];
    const adminObjId =
      actorId && Types.ObjectId.isValid(actorId)
        ? new Types.ObjectId(actorId)
        : undefined;

    for (const { row, rowNum } of validRows) {
      const studentCode = String(row.studentCode).trim();
      const student = studentMap.get(studentCode);
      if (!student) {
        errors.push(
          `السطر ${rowNum}: كود الطالب (${studentCode}) غير مسجل بالمنظومة`,
        );
        continue;
      }

      const emailData: Record<string, unknown> = {
        studentId: student._id,
        studentCode,
        studentName: student.name,
        academicEmail: String(row.academicEmail).trim().toLowerCase(),
        status:
          typeof row.status === 'string' && row.status ? row.status : 'active',
        ...(adminObjId ? { lastUpdatedBy: adminObjId } : {}),
      };

      ops.push({
        updateOne: {
          filter: { studentCode },
          update: { $set: emailData },
          upsert: true,
        },
      });

      successCount++;
    }

    if (ops.length > 0) {
      try {
        await this.emailModel.bulkWrite(ops, { ordered: false });
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
              `خطأ أثناء حفظ البريد الأكاديمي: ${we.errmsg || we.message || 'تكرار البريد الأكاديمي'}`,
            );
          }
        } else {
          successCount = 0;
          const message =
            err instanceof Error
              ? err.message
              : 'خطأ أثناء حفظ البريد الأكاديمي';
          errors.push(`فشل حفظ البريد الأكاديمي: ${message}`);
        }
      }
    }

    return { successCount, errors };
  }
}
