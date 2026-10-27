import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { defaultPasswordHasher } from '../../../security/password-hasher';
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
  CourseRegistration,
  CourseRegistrationDocument,
} from '../../registrations/schemas/course-registration.schema';
import { Course, CourseDocument } from '../../courses/schemas/course.schema';
import {
  AcademicEmail,
  AcademicEmailDocument,
} from '../../academic-emails/schemas/academic-email.schema';
import type { Importer, ImportResult } from '../importer.interface';
import {
  normalizeStudentLevel,
  normalizeStudentSemester,
} from '../upload-utils';

export function explicitPasswordReset(value: unknown) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

interface UpdateUserOp {
  updateOne: {
    filter: Record<string, unknown>;
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
    @InjectModel(Course.name)
    private readonly courseModel: Model<CourseDocument>,
    @InjectModel(CourseRegistration.name)
    private readonly registrationModel: Model<CourseRegistrationDocument>,
  ) {}

  validate(rows: Record<string, unknown>[]) {
    const errors: string[] = [];
    const validRows: { row: Record<string, unknown>; rowNum: number }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      const hasName = Boolean(row.fullName || row.fullNameAr || row.fullNameEn);
      if (!row.studentCode || !hasName || !row.nationalId) {
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
      .select('+passwordHash +nationalIdHash +nationalId')
      .lean();
    const userMap = new Map(existingUsers.map((u) => [u.studentCode, u]));

    const userOps: UpdateUserOp[] = [];
    const profileOps: UpdateProfileOp[] = [];

    for (const { row, rowNum } of validRows) {
      try {
        const studentCode = String(row.studentCode).trim();
        const nationalId = String(row.nationalId).trim();
        const existingUser = userMap.get(studentCode);
        const isForcedReset = explicitPasswordReset(row.mustChangePassword);
        if (existingUser && existingUser.role !== 'student')
          throw new Error('Student code belongs to a different account role');

        const resolvedName =
          (row.fullName as string)?.trim() ||
          (row.fullNameAr as string)?.trim() ||
          (row.fullNameEn as string)?.trim() ||
          'Student';
        const fullNameAr =
          (row.fullNameAr as string)?.trim() ||
          (/[\u0600-\u06FF]/.test(resolvedName) ? resolvedName : undefined);
        const fullNameEn =
          (row.fullNameEn as string)?.trim() ||
          (!/[\u0600-\u06FF]/.test(resolvedName) ? resolvedName : undefined);

        const maskedId =
          nationalId.length === 14
            ? nationalId.substring(0, 3) + '****' + nationalId.substring(11)
            : '111****111';

        const passwordHash =
          !existingUser || isForcedReset
            ? await defaultPasswordHasher.hash(nationalId)
            : undefined;
        if (existingUser && isForcedReset) {
          const changed = await this.userModel.updateOne(
            { _id: existingUser._id, passwordHash: existingUser.passwordHash },
            {
              $set: {
                passwordHash,
                mustChangePassword: true,
                passwordChangedAt: new Date(),
                failedLoginAttempts: 0,
                loginAttempts: 0,
              },
              $inc: { tokenVersion: 1 },
              $unset: { lockUntil: 1, lockedUntil: 1 },
            },
          );
          if (changed.modifiedCount !== 1)
            throw new Error(
              'Account password changed during import; retry this row',
            );
        }
        const nationalIdHash =
          existingUser?.nationalId === nationalId && existingUser.nationalIdHash
            ? existingUser.nationalIdHash
            : await defaultPasswordHasher.hash(nationalId);

        const userSetFields: Record<string, unknown> = {
          role: 'student',
          studentCode,
          name: resolvedName,
          nationalIdHash,
          nationalIdMasked: maskedId,
          nationalId,
        };

        const userUpdateDoc: Record<string, unknown> = {
          $set: userSetFields,
          $setOnInsert: {
            permissions: [],
            isActive: true,
            ...(!existingUser
              ? { passwordHash, mustChangePassword: true }
              : {}),
          },
        };

        userOps.push({
          updateOne: {
            filter: { studentCode, role: 'student' },
            update: userUpdateDoc as any,
            upsert: !existingUser,
          },
        });

        const normalizedLevel = normalizeStudentLevel(row.level);
        let resolvedDept = (row.department as string)?.trim();
        if (normalizedLevel === '1' || normalizedLevel === '2') {
          resolvedDept = 'GENERAL';
        } else if (normalizedLevel === '3' || normalizedLevel === '4') {
          if (
            !resolvedDept ||
            resolvedDept === 'GENERAL' ||
            resolvedDept === 'General'
          ) {
            resolvedDept = 'BIS';
          }
        }

        profileOps.push({
          updateOne: {
            filter: { studentCode },
            update: {
              $set: {
                fullName: resolvedName,
                fullNameAr,
                fullNameEn,
                studentCode,
                nationalIdMasked: maskedId,
                nationalId,
                level: normalizedLevel,
                department: resolvedDept,
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
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'خطأ غير معروف';
        errors.push(`السطر ${rowNum}: ${message}`);
      }
    }

    if (userOps.length > 0) {
      try {
        await this.userModel.bulkWrite(userOps, { ordered: false });
      } catch (err: unknown) {
        const bulkError = err as {
          writeErrors?: Array<{ errmsg?: string; message?: string }>;
        };
        if (bulkError?.writeErrors?.length) {
          for (const we of bulkError.writeErrors) {
            errors.push(
              `خطأ أثناء إنشاء حساب المستخدم: ${we.errmsg || we.message || 'فشل التكرار'}`,
            );
          }
        } else {
          const msg =
            err instanceof Error
              ? err.message
              : 'خطأ في عملية إنشاء المستخدمين';
          errors.push(`فشل كتابة المستخدمين: ${msg}`);
        }
      }
    }

    if (profileOps.length > 0) {
      const updatedUsers = await this.userModel
        .find(
          { studentCode: { $in: studentCodes }, role: 'student' },
          { _id: 1, studentCode: 1 },
        )
        .lean();
      const updatedUserMap = new Map(
        updatedUsers.map((u) => [u.studentCode, u._id]),
      );

      // Only upsert profile if a corresponding user document exists with a valid userId.
      // This prevents orphan records and duplicate key crashes on null userId.
      const safeProfileOps: UpdateProfileOp[] = [];
      for (const op of profileOps) {
        const sc = op.updateOne.filter.studentCode;
        const uId = updatedUserMap.get(sc);
        if (uId) {
          op.updateOne.update.$set.userId = uId;
          safeProfileOps.push(op);
        } else {
          errors.push(
            `تعذر حفظ الملف الأكاديمي للطالب ${sc}: حساب المستخدم غير متوفر`,
          );
        }
      }

      if (safeProfileOps.length > 0) {
        try {
          const writeRes = await this.studentModel.bulkWrite(safeProfileOps, {
            ordered: false,
          });
          successCount =
            (writeRes.upsertedCount || 0) +
            (writeRes.modifiedCount || 0) +
            (writeRes.matchedCount || 0);
        } catch (err: unknown) {
          const bulkError = err as {
            writeErrors?: Array<{ errmsg?: string; message?: string }>;
            result?: {
              nUpserted?: number;
              nModified?: number;
              nMatched?: number;
            };
          };
          if (bulkError?.writeErrors?.length) {
            for (const we of bulkError.writeErrors) {
              errors.push(
                `خطأ في حفظ الملف الأكاديمي: ${we.errmsg || we.message || 'خطأ غير معروف'}`,
              );
            }
          }
          if (bulkError?.result) {
            successCount =
              (bulkError.result.nUpserted || 0) +
              (bulkError.result.nModified || 0) +
              (bulkError.result.nMatched || 0);
          }
        }
      }

      const academicProfileOps = safeProfileOps.flatMap((op) => {
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
        try {
          await this.academicProfileModel.bulkWrite(academicProfileOps as any, {
            ordered: false,
          });
        } catch {
          // Non-fatal secondary sync
        }
      }

      // Sync to AcademicEmail collection so all imported students appear on Academic Emails page
      const emailOps = safeProfileOps.map((op) => {
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
        try {
          await this.academicEmailModel.bulkWrite(emailOps as any, {
            ordered: false,
          });
        } catch {
          // Non-fatal secondary sync
        }
      }

      // Automated First-Year Registration for Level 1 imported students
      const firstYearOps = safeProfileOps.filter((op) => {
        const lvl = ((op.updateOne.update.$set.level as string) || '').trim();
        return (
          lvl === '1' ||
          lvl.startsWith('1') ||
          lvl.includes('أول') ||
          lvl.includes('اول') ||
          lvl.includes('first')
        );
      });

      if (firstYearOps.length > 0) {
        try {
          const l1Courses = await this.courseModel
            .find({
              isActive: { $ne: false },
              $or: [{ level: '1' }, { academicLevel: '1' }],
              type: { $ne: 'elective' },
            })
            .lean();

          if (l1Courses.length > 0) {
            const regOps = firstYearOps.flatMap((op) => {
              const sc = op.updateOne.filter.studentCode;
              const uId = updatedUserMap.get(sc);
              if (!uId) return [];

              const studentSemester = (
                (op.updateOne.update.$set.semester as string) || 'first'
              ).toLowerCase();
              const studentYear =
                (op.updateOne.update.$set.academicYear as string) ||
                defaultAcademicYear;
              const studentDept = (
                (op.updateOne.update.$set.department as string) || ''
              )
                .trim()
                .toLowerCase();

              const matchingCourses = l1Courses.filter((c) => {
                const cSem = String(c.semester || 'first').toLowerCase();
                const offered = (c.offeredTerms || []).map((t) =>
                  String(t).toLowerCase(),
                );
                const semMatch =
                  cSem === studentSemester || offered.includes(studentSemester);
                if (!semMatch) return false;

                if (c.department && c.department.trim() && studentDept) {
                  const cDept = c.department.trim().toLowerCase();
                  const isGeneral =
                    cDept === 'عام' ||
                    cDept === 'general' ||
                    cDept === 'all' ||
                    cDept === 'الكل';
                  if (
                    !isGeneral &&
                    !cDept.includes(studentDept) &&
                    !studentDept.includes(cDept)
                  ) {
                    return false;
                  }
                }
                return true;
              });

              if (matchingCourses.length === 0) return [];

              const courseCodes = matchingCourses.map((c) => c.code);
              const totalCreditHours = matchingCourses.reduce(
                (sum, c) => sum + (c.creditHours || 3),
                0,
              );

              return [
                {
                  updateOne: {
                    filter: {
                      studentId: uId,
                      academicYear: studentYear,
                      semester: studentSemester,
                    },
                    update: {
                      $set: {
                        courses: courseCodes,
                        totalCreditHours,
                        source: 'system',
                        status: 'approved',
                        approvedAt: new Date(),
                        advisorNotes:
                          'تسجيل تلقائي لطلاب الفرقة الأولى (Automated First-Year Registration)',
                      },
                      $setOnInsert: {
                        editCount: 0,
                      },
                    },
                    upsert: true,
                  },
                },
              ];
            });

            if (regOps.length > 0) {
              await this.registrationModel.bulkWrite(regOps as any, {
                ordered: false,
              });
            }
          }
        } catch {
          // Non-fatal secondary sync
        }
      }
    }

    return { successCount, errors };
  }
}
