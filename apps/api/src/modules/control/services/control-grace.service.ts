import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { ClientSession } from 'mongoose';
import { createHash } from 'node:crypto';
import {
  PERMISSIONS,
  calculateGradeScale,
  validateMark,
} from '@student-portal/shared';
import { Grade, GradeDocument } from '../../grades/schemas/grade.schema';
import {
  StudentProfile,
  StudentProfileDocument,
} from '../../students/schemas/student-profile.schema';
import {
  ControlSheet,
  ControlSheetDocument,
  defaultPassThresholdForComponent,
} from '../schemas/control-sheet.schema';
import {
  GradeAuditLog,
  GradeAuditLogDocument,
} from '../schemas/grade-audit-log.schema';
import { ControlAccessService } from './control-access.service';
import { ControlSheetsService } from './control-sheets.service';
import { GradingSchemeService } from './grading-scheme.service';
import type {
  ApplyGraceDto,
  ControlGraceMode,
  GracePreviewDto,
} from '../dto/control.dto';
import type { AuthenticatedUser } from '../../auth/types/authenticated-request';

const conflict = (code: string) =>
  new ConflictException({ code, message: code });
const round = (value: number) => Math.round(value * 100) / 100;

@Injectable()
export class ControlGraceService {
  constructor(
    @InjectModel(ControlSheet.name)
    private readonly sheets: Model<ControlSheetDocument>,
    @InjectModel(Grade.name) private readonly grades: Model<GradeDocument>,
    @InjectModel(StudentProfile.name)
    private readonly profiles: Model<StudentProfileDocument>,
    @InjectModel(GradeAuditLog.name)
    private readonly audit: Model<GradeAuditLogDocument>,
    private readonly access: ControlAccessService,
    private readonly sheetService: ControlSheetsService,
    private readonly schemes: GradingSchemeService,
  ) {}

  async getStatus(user: AuthenticatedUser, id: string) {
    this.access.assertPermission(user, PERMISSIONS.CONTROL_GRADES_GRACE);
    const scoped = await this.sheetService.requireSheetInScope(user, id);
    const sheet = await this.sheets.findById(scoped.sheet._id).lean();
    if (!sheet || sheet.component !== 'midterm') {
      throw new BadRequestException({
        code: 'GRACE_MIDTERM_ONLY',
        message: 'GRACE_MIDTERM_ONLY',
      });
    }

    const scheme = await this.schemes.getScheme(
      String(sheet.courseId),
      sheet.academicYear,
      sheet.semester,
    );
    const rules = scheme.components.find((c) => c.key === 'midterm');
    const roster = await this.sheetService.getRosterStudentIds(
      scoped.course.code,
      sheet.academicYear,
      sheet.semester,
    );
    const docs = await this.grades
      .find({
        courseId: sheet.courseId,
        academicYear: sheet.academicYear,
        semester: sheet.semester,
        examType: 'midterm',
        cleared: { $ne: true },
      })
      .select('studentId grade status rev isPublished carriedFrom grace')
      .lean();
    const profiles = await this.profiles
      .find({
        userId: { $in: [...roster].map((value) => new Types.ObjectId(value)) },
        isBlocked: true,
      })
      .select('userId')
      .lean();
    const held = new Set(profiles.map((profile) => String(profile.userId)));

    let gracedCount = 0;
    let eligibleNewCount = 0;
    let manuallyModifiedCount = 0;

    for (const mark of docs) {
      const sid = String(mark.studentId);
      if (
        !roster.has(sid) ||
        held.has(sid) ||
        mark.status !== 'present' ||
        mark.isPublished ||
        mark.carriedFrom
      ) {
        continue;
      }
      if (mark.grace) {
        gracedCount += 1;
        if ((mark.rev ?? 0) !== mark.grace.appliedRev) {
          manuallyModifiedCount += 1;
        }
      } else if (!rules || mark.grade < rules.max) {
        eligibleNewCount += 1;
      }
    }

    return {
      revision: sheet.revision ?? 0,
      locked: sheet.locked,
      workflowState: sheet.workflowState ?? 'DRAFT',
      activeGrace: sheet.grace ?? null,
      gracedCount,
      eligibleNewCount,
      manuallyModifiedCount,
      legacyGrace: Boolean(sheet.grace && gracedCount === 0),
    };
  }

  private async load(
    user: AuthenticatedUser,
    id: string,
    dto: GracePreviewDto,
    session?: ClientSession,
    retry?: ApplyGraceDto,
  ) {
    this.access.assertPermission(user, PERMISSIONS.CONTROL_GRADES_GRACE);
    const scoped = await this.sheetService.requireSheetInScope(user, id);
    await this.access.assertCourseGradeWrite(user, scoped.sheet.courseId);
    const sheet = await this.sheets
      .findById(scoped.sheet._id)
      .session(session ?? null)
      .lean();
    if (!sheet || sheet.component !== 'midterm')
      throw new BadRequestException({
        code: 'GRACE_MIDTERM_ONLY',
        message: 'GRACE_MIDTERM_ONLY',
      });

    const mode: ControlGraceMode = dto.mode ?? 'initial';
    const includeNewStudents = dto.includeNewStudents !== false;

    if (mode === 'initial') {
      if (sheet.grace) {
        if (
          retry &&
          sheet.grace.operationId === retry.operationId &&
          sheet.grace.amount === retry.amount &&
          sheet.grace.actorId === user._id
        )
          return { receipt: sheet.grace } as const;
        throw conflict('GRACE_ALREADY_APPLIED');
      }
    } else {
      if (!sheet.grace) throw conflict('GRACE_NOT_APPLIED');
      if (
        retry &&
        mode !== 'reset' &&
        sheet.grace.operationId === retry.operationId &&
        (mode === 'new_only' || sheet.grace.amount === retry.amount) &&
        sheet.grace.actorId === user._id
      ) {
        return { receipt: sheet.grace } as const;
      }
    }

    if (
      sheet.locked ||
      !['DRAFT', 'RETURNED', 'IN_REVIEW'].includes(
        sheet.workflowState ?? 'DRAFT',
      )
    )
      throw conflict('SHEET_LOCKED');
    if ((sheet.revision ?? 0) !== dto.expectedRevision)
      throw conflict('GRACE_PREVIEW_STALE');

    const scheme = await this.schemes.getScheme(
      String(sheet.courseId),
      sheet.academicYear,
      sheet.semester,
      session,
    );
    const rules = scheme.components.find((c) => c.key === 'midterm')!;
    if (!rules?.enabled) {
      throw new BadRequestException({
        code: 'GRACE_INVALID_AMOUNT',
        message: 'GRACE_INVALID_AMOUNT',
      });
    }

    if (mode === 'reset') {
      if (!Number.isFinite(dto.amount) || dto.amount !== 0) {
        throw new BadRequestException({
          code: 'GRACE_INVALID_AMOUNT',
          message: 'GRACE_INVALID_AMOUNT',
        });
      }
    } else if (
      !Number.isFinite(dto.amount) ||
      dto.amount <= 0 ||
      validateMark(dto.amount, rules)
    ) {
      throw new BadRequestException({
        code: 'GRACE_INVALID_AMOUNT',
        message: 'GRACE_INVALID_AMOUNT',
      });
    }

    const roster = await this.sheetService.getRosterStudentIds(
      scoped.course.code,
      sheet.academicYear,
      sheet.semester,
      undefined,
      session,
    );
    const docs = await this.grades
      .find({
        courseId: sheet.courseId,
        academicYear: sheet.academicYear,
        semester: sheet.semester,
        examType: 'midterm',
        cleared: { $ne: true },
      })
      .session(session ?? null)
      .sort({ studentId: 1 })
      .limit(10001)
      .lean();
    if (docs.length > 10000) throw conflict('ROSTER_LIMIT_EXCEEDED');
    const profiles = await this.profiles
      .find({
        userId: { $in: [...roster].map((value) => new Types.ObjectId(value)) },
        isBlocked: true,
      })
      .session(session ?? null)
      .select('userId')
      .lean();
    const held = new Set(profiles.map((profile) => String(profile.userId)));

    const seen = new Set<string>();
    const changes: Array<{
      id: Types.ObjectId;
      studentId: Types.ObjectId;
      studentCode: string;
      originalGrade: number;
      before: number;
      after: number;
      rev: number;
      appliedAmount: number;
      clearGrace: boolean;
    }> = [];
    const counts = {
      registered: roster.size,
      changed: 0,
      capped: 0,
      atMaximum: 0,
      absentOrBanned: 0,
      held: 0,
      unentered: 0,
      other: 0,
    };
    const modeStats = {
      alreadyGraced: 0,
      manuallyModified: 0,
      excludedNew: 0,
      totalGracedAfter: 0,
    };

    let hasAnyGracedRecord = false;
    for (const mark of docs) {
      const sid = String(mark.studentId);
      if (roster.has(sid) && mark.grace) {
        hasAnyGracedRecord = true;
        break;
      }
    }
    if ((mode === 'adjust' || mode === 'reset') && !hasAnyGracedRecord) {
      throw conflict('GRACE_LEGACY_LOCKED');
    }

    for (const mark of docs) {
      const studentId = String(mark.studentId);
      if (!roster.has(studentId)) continue;
      if (seen.has(studentId)) throw conflict('GRACE_INVALID_MARKS');
      seen.add(studentId);
      if (['absent', 'banned'].includes(mark.status)) {
        counts.absentOrBanned++;
        continue;
      }
      if (held.has(studentId)) {
        counts.held++;
        continue;
      }
      if (mark.status !== 'present' || mark.isPublished || mark.carriedFrom) {
        counts.other++;
        continue;
      }
      if (mark.maxGrade !== rules.max || validateMark(mark.grade, rules))
        throw conflict('GRACE_INVALID_MARKS');

      if (mode === 'initial') {
        const after = round(Math.min(rules.max, mark.grade + dto.amount));
        if (after === mark.grade) {
          counts.atMaximum++;
          continue;
        }
        if (mark.grade + dto.amount > rules.max) counts.capped++;
        modeStats.totalGracedAfter++;
        changes.push({
          id: mark._id,
          studentId: mark.studentId,
          studentCode: mark.studentCode ?? '',
          originalGrade: mark.grade,
          before: mark.grade,
          after,
          rev: mark.rev ?? 0,
          appliedAmount: dto.amount,
          clearGrace: false,
        });
      } else if (mode === 'new_only') {
        if (mark.grace) {
          modeStats.alreadyGraced++;
          modeStats.totalGracedAfter++;
          continue;
        }
        const after = round(Math.min(rules.max, mark.grade + dto.amount));
        if (after === mark.grade) {
          counts.atMaximum++;
          continue;
        }
        if (mark.grade + dto.amount > rules.max) counts.capped++;
        modeStats.totalGracedAfter++;
        changes.push({
          id: mark._id,
          studentId: mark.studentId,
          studentCode: mark.studentCode ?? '',
          originalGrade: mark.grade,
          before: mark.grade,
          after,
          rev: mark.rev ?? 0,
          appliedAmount: dto.amount,
          clearGrace: false,
        });
      } else if (mode === 'adjust') {
        if (mark.grace) {
          modeStats.totalGracedAfter++;
          if ((mark.rev ?? 0) !== mark.grace.appliedRev) {
            modeStats.manuallyModified++;
            continue;
          }
          const original = mark.grace.originalGrade;
          const after = round(Math.min(rules.max, original + dto.amount));
          if (after === mark.grade && mark.grace.appliedAmount === dto.amount) {
            continue;
          }
          if (original + dto.amount > rules.max) counts.capped++;
          changes.push({
            id: mark._id,
            studentId: mark.studentId,
            studentCode: mark.studentCode ?? '',
            originalGrade: original,
            before: mark.grade,
            after,
            rev: mark.rev ?? 0,
            appliedAmount: dto.amount,
            clearGrace: false,
          });
        } else {
          if (!includeNewStudents) {
            modeStats.excludedNew++;
            continue;
          }
          const after = round(Math.min(rules.max, mark.grade + dto.amount));
          if (after === mark.grade) {
            counts.atMaximum++;
            continue;
          }
          if (mark.grade + dto.amount > rules.max) counts.capped++;
          modeStats.totalGracedAfter++;
          changes.push({
            id: mark._id,
            studentId: mark.studentId,
            studentCode: mark.studentCode ?? '',
            originalGrade: mark.grade,
            before: mark.grade,
            after,
            rev: mark.rev ?? 0,
            appliedAmount: dto.amount,
            clearGrace: false,
          });
        }
      } else if (mode === 'reset') {
        if (!mark.grace) continue;
        if ((mark.rev ?? 0) !== mark.grace.appliedRev) {
          modeStats.manuallyModified++;
          continue;
        }
        const original = mark.grace.originalGrade;
        changes.push({
          id: mark._id,
          studentId: mark.studentId,
          studentCode: mark.studentCode ?? '',
          originalGrade: original,
          before: mark.grade,
          after: original,
          rev: mark.rev ?? 0,
          appliedAmount: 0,
          clearGrace: true,
        });
      }
    }
    counts.changed = changes.length;
    counts.unentered = roster.size - seen.size;

    const passThreshold =
      typeof sheet.passThreshold === 'number' &&
      Number.isFinite(sheet.passThreshold)
        ? sheet.passThreshold
        : defaultPassThresholdForComponent(sheet.component, rules.max);

    const changeAfterByStudent = new Map(
      changes.map((c) => [String(c.studentId), c.after]),
    );
    let passedBefore = 0;
    let passedAfter = 0;
    let presentCount = 0;
    let bannedCount = 0;
    let absentCount = 0;
    for (const mark of docs) {
      const sid = String(mark.studentId);
      if (!roster.has(sid)) continue;
      if (mark.status === 'present') {
        presentCount += 1;
        const beforeScore = mark.grade;
        const afterScore = changeAfterByStudent.get(sid) ?? beforeScore;
        if (typeof beforeScore === 'number' && beforeScore > passThreshold) {
          passedBefore += 1;
        }
        if (typeof afterScore === 'number' && afterScore > passThreshold) {
          passedAfter += 1;
        }
      } else if (mark.status === 'banned') {
        bannedCount += 1;
      } else if (mark.status === 'absent') {
        absentCount += 1;
      }
    }
    const eligibleTotal = presentCount + bannedCount;
    const passRate = {
      threshold: passThreshold,
      total: eligibleTotal,
      presentCount,
      bannedCount,
      absentCount,
      rosterTotal: roster.size,
      passedBefore,
      passedAfter,
      ratioBefore: eligibleTotal > 0 ? passedBefore / eligibleTotal : 0,
      ratioAfter: eligibleTotal > 0 ? passedAfter / eligibleTotal : 0,
    };

    const digest = createHash('sha256')
      .update(
        JSON.stringify({
          mode,
          includeNewStudents,
          amount: dto.amount,
          revision: sheet.revision ?? 0,
          scheme,
          roster: [...roster].sort(),
          held: [...held].sort(),
          marks: docs.map((m) => [
            String(m._id),
            String(m.studentId),
            m.grade,
            m.maxGrade,
            m.status,
            m.rev,
            m.isPublished,
            m.carriedFrom,
            m.grace?.originalGrade ?? null,
            m.grace?.appliedAmount ?? null,
            m.grace?.appliedRev ?? null,
          ]),
        }),
      )
      .digest('hex');

    return {
      mode,
      sheet,
      rules,
      changes,
      modeStats,
      preview: {
        mode,
        digest,
        revision: sheet.revision ?? 0,
        amount: dto.amount,
        max: rules.max,
        counts,
        modeStats,
        passRate,
        sample: changes.slice(0, 20).map((c) => ({
          studentCode: c.studentCode,
          originalGrade: c.originalGrade,
          before: c.before,
          added: round(c.after - c.before),
          after: c.after,
        })),
      },
    } as const;
  }

  async preview(user: AuthenticatedUser, id: string, dto: GracePreviewDto) {
    const plan = await this.load(user, id, dto);
    if ('receipt' in plan) throw conflict('GRACE_ALREADY_APPLIED');
    return plan.preview;
  }

  async apply(user: AuthenticatedUser, id: string, dto: ApplyGraceDto) {
    const session = await this.sheets.db.startSession();
    try {
      return await session.withTransaction(async () => {
        const plan = await this.load(user, id, dto, session, dto);
        if ('receipt' in plan) return plan.receipt;
        if (plan.preview.digest !== dto.digest)
          throw conflict('GRACE_PREVIEW_STALE');
        if (!plan.changes.length) throw conflict('GRACE_NO_CHANGES');

        const now = new Date();
        const isReset = plan.mode === 'reset';
        const effectiveSheetAmount =
          plan.mode === 'new_only'
            ? (plan.sheet.grace?.amount ?? dto.amount)
            : dto.amount;

        const receipt = {
          operationId: dto.operationId,
          amount: effectiveSheetAmount,
          actorId: user._id,
          appliedAt: plan.sheet.grace?.appliedAt ?? now,
          changed: plan.changes.length,
          capped: plan.preview.counts.capped,
          totalGraced: plan.modeStats.totalGracedAfter,
          updatedAt: now,
        };

        const claimed = await this.sheets.updateOne(
          {
            _id: plan.sheet._id,
            revision:
              dto.expectedRevision === 0
                ? { $in: [0, null] }
                : dto.expectedRevision,
            grace: plan.mode === 'initial' ? null : { $ne: null },
          },
          {
            $set: { grace: isReset ? null : receipt },
            $inc: { revision: 1 },
          },
          { session },
        );
        if (claimed.matchedCount !== 1) throw conflict('GRACE_PREVIEW_STALE');
        await this.schemes.freeze(
          String(plan.sheet.courseId),
          plan.sheet.academicYear,
          plan.sheet.semester,
          session,
        );
        const result = await this.grades.bulkWrite(
          plan.changes.map((c) => {
            const percentage = round((c.after / plan.rules.max) * 100);
            const scale = calculateGradeScale(percentage);
            const nextRev = c.rev + 1;
            const setFields: Record<string, unknown> = {
              grade: c.after,
              percentage,
              letterGrade: scale.letter,
              gradePoints: scale.points,
              updatedBy: new Types.ObjectId(user._id),
              controlManaged: true,
              updatedAt: now,
            };
            const unsetFields: Record<string, unknown> = {
              controlApprovedRev: '',
            };
            if (c.clearGrace) {
              unsetFields.grace = '';
            } else {
              setFields.grace = {
                originalGrade: c.originalGrade,
                appliedAmount: c.appliedAmount,
                actualAdded: round(c.after - c.originalGrade),
                appliedRev: nextRev,
                operationId: dto.operationId,
                appliedAt: now,
              };
            }
            return {
              updateOne: {
                filter: {
                  _id: c.id,
                  rev: c.rev === 0 ? { $in: [0, null] } : c.rev,
                },
                update: {
                  $set: setFields,
                  $inc: { rev: 1 },
                  $unset: unsetFields,
                },
              },
            };
          }),
          { session },
        );
        if (result.matchedCount !== plan.changes.length)
          throw conflict('GRACE_PREVIEW_STALE');

        const common = {
          sheetId: plan.sheet._id,
          courseId: plan.sheet.courseId,
          academicYear: plan.sheet.academicYear,
          semester: plan.sheet.semester,
          component: 'midterm',
          action: 'GRACE',
          source: 'SYSTEM',
          actorId: new Types.ObjectId(user._id),
          at: now,
        };
        await this.audit.insertMany(
          [
            {
              ...common,
              newValue: {
                ...(isReset ? { reset: true, amount: 0 } : receipt),
                mode: plan.mode,
              },
            },
            ...plan.changes.map((c) => ({
              ...common,
              gradeId: c.id,
              studentId: c.studentId,
              oldValue: {
                score: c.before,
                status: 'present',
                rev: c.rev,
                originalGrade: c.originalGrade,
              },
              newValue: {
                score: c.after,
                status: 'present',
                rev: c.rev + 1,
                operationId: dto.operationId,
                added: round(c.after - c.before),
                originalGrade: c.originalGrade,
                mode: plan.mode,
              },
            })),
          ],
          { session },
        );
        return isReset ? { ...receipt, reset: true } : receipt;
      });
    } finally {
      await session.endSession();
    }
  }
}
