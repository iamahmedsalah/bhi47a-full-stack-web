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
    const adminObjId = new Types.ObjectId(actorId);

    for (const { row, rowNum } of validRows) {
      const studentCode = String(row.studentCode).trim();
      const student = studentMap.get(studentCode);
      if (!student) {
        errors.push(
          `السطر ${rowNum}: كود الطالب (${studentCode}) غير مسجل بالمنظومة`,
        );
        continue;
      }

      const emailData = {
        studentId: student._id,
        studentCode,
        studentName: student.name,
        academicEmail: row.academicEmail as string,
        status: (row.status as string) || 'active',
        lastUpdatedBy: adminObjId,
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
      await this.emailModel.bulkWrite(ops, { ordered: false });
    }

    return { successCount, errors };
  }
}
