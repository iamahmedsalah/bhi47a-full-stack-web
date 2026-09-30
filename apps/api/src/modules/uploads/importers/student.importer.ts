import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../../users/schemas/user.schema';
import {
  StudentProfile,
  StudentProfileDocument,
} from '../../students/schemas/student-profile.schema';
import {
  StudentAcademicProfile,
  StudentAcademicProfileDocument,
} from '../../registrations/schemas/student-academic-profile.schema';
import {
  AcademicEmail,
  AcademicEmailDocument,
} from '../../academic-emails/schemas/academic-email.schema';
import type { Importer, ImportResult } from '../importer.interface';
import {
  normalizeStudentLevel,
  normalizeStudentSemester,
} from '../upload-utils';

interface UpdateUserOp {
  updateOne: {
    filter: { studentCode: string };
    update: {
      $set: Record<string, unknown>;
      $setOnInsert: Record<string, unknown>;
    };
    upsert: boolean;
  };
}

interface UpdateProfileOp {
  updateOne: {
    filter: { studentCode: string };
    update: {
      $set: Record<string, unknown>;
    };
    upsert: boolean;
  };
}

@Injectable()
export class StudentImporter implements Importer {
  readonly type = 'students';

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(StudentProfile.name)
    private readonly studentModel: Model<StudentProfileDocument>,
    @InjectModel(StudentAcademicProfile.name)
    private readonly academicProfileModel: Model<StudentAcademicProfileDocument>,
    @InjectModel(AcademicEmail.name)
    private readonly academicEmailModel: Model<AcademicEmailDocument>,
  ) {}

  validate(rows: Record<string, unknown>[]) {
    const errors: string[] = [];
    const validRows: { row: Record<string, unknown>; rowNum: number }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      if (!row.studentCode || !row.fullName || !row.nationalId) {
        errors.push(
          `السطر ${rowNum}: البيانات الأساسية ناقصة (كود الطالب، الاسم، الرقم القومي)`,
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
    const existingUsers = await this.userModel
      .find({ studentCode: { $in: studentCodes } })
      .lean();
    const userMap = new Map(existingUsers.map((u) => [u.studentCode, u]));

    const userOps: UpdateUserOp[] = [];
    const profileOps: UpdateProfileOp[] = [];
    const passwordHashCache = new Map<string, string>();

    for (const { row, rowNum } of validRows) {
      try {
        const studentCode = String(row.studentCode).trim();
        const nationalId = String(row.nationalId).trim();
        const existingUser = userMap.get(studentCode);

        const maskedId =
          nationalId.length === 14
            ? nationalId.substring(0, 3) + '****' + nationalId.substring(11)
            : '111****111';

        let passwordHash: string;
        if (
          existingUser &&
          existingUser.nationalId === nationalId &&
          existingUser.passwordHash
        ) {
          passwordHash = existingUser.passwordHash;
        } else if (passwordHashCache.has(nationalId)) {
          passwordHash = passwordHashCache.get(nationalId)!;
        } else {
          passwordHash = await bcrypt.hash(nationalId, 10);
          passwordHashCache.set(nationalId, passwordHash);
        }

        userOps.push({
          updateOne: {
            filter: { studentCode },
            update: {
              $set: {
                role: 'student',
                studentCode,
                name: row.fullName,
                passwordHash,
                nationalIdHash: passwordHash,
                nationalIdMasked: maskedId,
                nationalId,
                mustChangePassword: row.mustChangePassword ?? false,
                isActive: true,
              },
              $setOnInsert: { permissions: [] },
            },
            upsert: true,
          },
        });

        profileOps.push({
          updateOne: {
            filter: { studentCode },
            update: {
              $set: {
                fullName: row.fullName,
                studentCode,
                nationalIdMasked: maskedId,
                nationalId,
                level: normalizeStudentLevel(row.level),
                department: row.department,
                group: row.group,
                section: row.section,
                academicEmail: row.academicEmail,
                academicYear: row.academicYear || defaultAcademicYear,
                semester: normalizeStudentSemester(row.semester),
                seatNumber: row.seatNumber,
                examRoom: row.examRoom,
                examFloor: row.examFloor,
                examBuilding: row.examBuilding,
                enrollmentStatus: 'active',
              },
            },
            upsert: true,
          },
        });

        successCount++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'خطأ غير معروف';
        errors.push(`السطر ${rowNum}: ${message}`);
      }
    }

    if (userOps.length > 0) {
      await this.userModel.bulkWrite(userOps, { ordered: false });
    }

    if (profileOps.length > 0) {
      const updatedUsers = await this.userModel
        .find(
          { studentCode: { $in: studentCodes } },
          { _id: 1, studentCode: 1 },
        )
        .lean();
      const updatedUserMap = new Map(
        updatedUsers.map((u) => [u.studentCode, u._id]),
      );

      for (const op of profileOps) {
        const sc = op.updateOne.filter.studentCode;
        const uId = updatedUserMap.get(sc);
        if (uId) {
          op.updateOne.update.$set.userId = uId;
        }
      }

      await this.studentModel.bulkWrite(profileOps, { ordered: false });

      const academicProfileOps = profileOps.flatMap((op) => {
        const studentCode = op.updateOne.filter.studentCode;
        const studentId = updatedUserMap.get(studentCode);
        if (!studentId) return [];

        return [
          {
            updateOne: {
              filter: { studentId },
              update: {
                $set: {
                  academicLevel: op.updateOne.update.$set.level,
                  semester: op.updateOne.update.$set.semester,
                },
                $setOnInsert: {
                  gpa: 0,
                  completedCourses: [],
                  failedCourses: [],
                  lowGradeCourses: [],
                  academicWarnings: 0,
                  isGraduatingThisYear: false,
                  approvedICCourseCompletions: [],
                },
              },
              upsert: true,
            },
          },
        ];
      });

      if (academicProfileOps.length > 0) {
        await this.academicProfileModel.bulkWrite(academicProfileOps as any, {
          ordered: false,
        });
      }

      // Sync to AcademicEmail collection so all imported students appear on Academic Emails page
      const emailOps = profileOps.map((op) => {
        const studentCode = op.updateOne.filter.studentCode;
        const studentId = updatedUserMap.get(studentCode);
        const fullName =
          (op.updateOne.update.$set.fullName as string) ||
          `Student ${studentCode}`;
        const academicEmail =
          (op.updateOne.update.$set.academicEmail as string)?.trim() ||
          `${studentCode}.bhi47@bhiasc.org`;

        return {
          updateOne: {
            filter: { studentCode },
            update: {
              $set: {
                studentCode,
                studentName: fullName,
                academicEmail,
                status: 'active',
                ...(studentId ? { studentId } : {}),
              },
            },
            upsert: true,
          },
        };
      });

      if (emailOps.length > 0) {
        await this.academicEmailModel.bulkWrite(emailOps as any, {
          ordered: false,
        });
      }
    }

    return { successCount, errors };
  }
}
