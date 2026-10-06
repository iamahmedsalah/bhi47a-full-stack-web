import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../../users/schemas/user.schema';
import {
  StudentProfile,
  StudentProfileDocument,
} from '../../students/schemas/student-profile.schema';
import {
  StudentAcademicProfile,
  StudentAcademicProfileDocument,
} from '../../registrations/schemas/student-academic-profile.schema';
import type { Importer, ImportResult } from '../importer.interface';

@Injectable()
export class AcademicWarningImporter implements Importer {
  readonly type = 'academic-warnings';

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(StudentProfile.name)
    private readonly studentModel: Model<StudentProfileDocument>,
    @InjectModel(StudentAcademicProfile.name)
    private readonly academicProfileModel: Model<StudentAcademicProfileDocument>,
  ) {}

  validate(rows: Record<string, unknown>[]) {
    const errors: string[] = [];
    const validRows: { row: Record<string, unknown>; rowNum: number }[] = [];
    const seenCodes = new Set<string>();

    rows.forEach((row, index) => {
      const rowNum = index + 2;
      const rawCode = row.studentCode;
      const studentCode =
        typeof rawCode === 'string' || typeof rawCode === 'number'
          ? String(rawCode).trim()
          : '';
      const rawCount = row.academicWarnings ?? row.warningCount;
      const countText =
        typeof rawCount === 'string' || typeof rawCount === 'number'
          ? String(rawCount).trim()
          : '';
      const count = typeof rawCount === 'number' ? rawCount : Number(countText);

      if (!studentCode) {
        errors.push(`Row ${rowNum}: studentCode is required`);
        return;
      }
      if (seenCodes.has(studentCode)) {
        errors.push(`Row ${rowNum}: duplicate studentCode ${studentCode}`);
        return;
      }
      seenCodes.add(studentCode);
      if (!countText || !Number.isInteger(count) || count < 0) {
        errors.push(
          `Row ${rowNum}: academicWarnings must be a non-negative whole number`,
        );
        return;
      }

      row._studentCode = studentCode;
      row._academicWarnings = count;
      validRows.push({ row, rowNum });
    });

    return { validRows, errors };
  }

  async commit(
    validRows: { row: Record<string, unknown>; rowNum: number }[],
    _actorId: string,
  ): Promise<ImportResult> {
    if (!validRows.length) return { successCount: 0, errors: [] };

    const codes = validRows.map(({ row }) => row._studentCode as string);
    const users = await this.userModel
      .find({ studentCode: { $in: codes }, role: 'student' })
      .select('_id studentCode')
      .lean();
    const userByCode = new Map(users.map((user) => [user.studentCode, user]));
    const profiles = await this.studentModel
      .find({ userId: { $in: users.map((user) => user._id) } })
      .select('userId studentCode')
      .lean();
    const profileIds = new Set(
      profiles.map((profile) => profile.userId.toString()),
    );
    const errors: string[] = [];
    const profileOps: Parameters<typeof this.studentModel.bulkWrite>[0] = [];
    const academicOps: Parameters<
      typeof this.academicProfileModel.bulkWrite
    >[0] = [];

    for (const { row, rowNum } of validRows) {
      const studentCode = row._studentCode as string;
      const user = userByCode.get(studentCode);
      if (!user) {
        errors.push(
          `Row ${rowNum}: no existing student account found for ${studentCode}`,
        );
        continue;
      }
      const userId = new Types.ObjectId(user._id);
      if (!profileIds.has(userId.toString())) {
        errors.push(
          `Row ${rowNum}: no student profile found for ${studentCode}`,
        );
        continue;
      }

      const academicWarnings = row._academicWarnings as number;
      profileOps.push({
        updateOne: {
          filter: { userId },
          update: { $set: { academicWarnings } },
          upsert: false,
        },
      });
      academicOps.push({
        updateOne: {
          filter: { studentId: userId },
          update: { $set: { academicWarnings } },
          upsert: false,
        },
      });
    }

    let successCount = 0;
    if (profileOps.length) {
      const result = await this.studentModel.bulkWrite(profileOps, {
        ordered: false,
      });
      successCount = result.matchedCount;
      if (academicOps.length) {
        await this.academicProfileModel.bulkWrite(academicOps, {
          ordered: false,
        });
      }
    }

    return { successCount, errors };
  }
}
