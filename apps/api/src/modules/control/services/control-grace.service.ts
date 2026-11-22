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
import type { ApplyGraceDto, GracePreviewDto } from '../dto/control.dto';
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

  private async load(
    user: AuthenticatedUser,
    id: string,
    dto: GracePreviewDto,
    session?: ClientSession,
    retry?: ApplyGraceDto,
  ) {
    this.access.assertPermission(user, PERMISSIONS.CONTROL_GRADES_GRACE);
    const scoped = await this.sheetService.requireSheetInScope(user, id);
    const sheet = await this.sheets
      .findById(scoped.sheet._id)
      .session(session ?? null)
      .lean();
    if (!sheet || sheet.component !== 'midterm')
      throw new BadRequestException({
        code: 'GRACE_MIDTERM_ONLY',
        message: 'GRACE_MIDTERM_ONLY',
      });
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
    if (
      !rules?.enabled ||
      !Number.isFinite(dto.amount) ||
      dto.amount <= 0 ||
      validateMark(dto.amount, rules)
    )
      throw new BadRequestException({
        code: 'GRACE_INVALID_AMOUNT',
        message: 'GRACE_INVALID_AMOUNT',
      });
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
      before: number;
      after: number;
      rev: number;
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
      const after = round(Math.min(rules.max, mark.grade + dto.amount));
      if (after === mark.grade) {
        counts.atMaximum++;
        continue;
      }
      if (mark.grade + dto.amount > rules.max) counts.capped++;
      changes.push({
        id: mark._id,
        studentId: mark.studentId,
        studentCode: mark.studentCode ?? '',
        before: mark.grade,
        after,
        rev: mark.rev ?? 0,
      });
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
    for (const mark of docs) {
      const sid = String(mark.studentId);
      if (!roster.has(sid) || mark.status !== 'present') continue;
      const beforeScore = mark.grade;
      const afterScore = changeAfterByStudent.get(sid) ?? beforeScore;
      if (beforeScore > passThreshold) passedBefore += 1;
      if (afterScore > passThreshold) passedAfter += 1;
    }
    const totalRoster = roster.size;
    const passRate = {
      threshold: passThreshold,
      total: totalRoster,
      passedBefore,
      passedAfter,
      ratioBefore: totalRoster > 0 ? passedBefore / totalRoster : 0,
      ratioAfter: totalRoster > 0 ? passedAfter / totalRoster : 0,
    };

    const digest = createHash('sha256')
      .update(
        JSON.stringify({
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
          ]),
        }),
      )
      .digest('hex');
    return {
      sheet,
      rules,
      changes,
      preview: {
        digest,
        revision: sheet.revision ?? 0,
        amount: dto.amount,
        max: rules.max,
        counts,
        passRate,
        sample: changes.slice(0, 20).map((c) => ({
          studentCode: c.studentCode,
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
        const receipt = {
          operationId: dto.operationId,
          amount: dto.amount,
          actorId: user._id,
          appliedAt: new Date(),
          changed: plan.changes.length,
          capped: plan.preview.counts.capped,
        };
        const claimed = await this.sheets.updateOne(
          {
            _id: plan.sheet._id,
            revision:
              dto.expectedRevision === 0
                ? { $in: [0, null] }
                : dto.expectedRevision,
            grace: null,
          },
          { $set: { grace: receipt }, $inc: { revision: 1 } },
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
            return {
              updateOne: {
                filter: {
                  _id: c.id,
                  rev: c.rev === 0 ? { $in: [0, null] } : c.rev,
                },
                update: {
                  $set: {
                    grade: c.after,
                    percentage,
                    letterGrade: scale.letter,
                    gradePoints: scale.points,
                    updatedBy: new Types.ObjectId(user._id),
                    controlManaged: true,
                    updatedAt: receipt.appliedAt,
                  },
                  $inc: { rev: 1 },
                  $unset: { controlApprovedRev: '' },
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
          at: receipt.appliedAt,
        };
        await this.audit.insertMany(
          [
            { ...common, newValue: receipt },
            ...plan.changes.map((c) => ({
              ...common,
              gradeId: c.id,
              studentId: c.studentId,
              oldValue: { score: c.before, status: 'present', rev: c.rev },
              newValue: {
                score: c.after,
                status: 'present',
                rev: c.rev + 1,
                operationId: dto.operationId,
                added: round(c.after - c.before),
              },
            })),
          ],
          { session },
        );
        return receipt;
      });
    } finally {
      await session.endSession();
    }
  }
}
