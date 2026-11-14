import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { ClientSession } from 'mongoose';
import {
  CONTROL_COMPONENT_KEYS,
  CONTROL_ENABLED_COMPONENT_KEYS,
  DEFAULT_CONTROL_COMPONENTS,
  type ControlComponentKey,
  type ControlSchemeComponent,
} from '@student-portal/shared';
import { Grade, GradeDocument } from '../../grades/schemas/grade.schema';
import {
  GradingScheme,
  GradingSchemeDocument,
} from '../schemas/grading-scheme.schema';
import {
  GradeAuditLog,
  GradeAuditLogDocument,
} from '../schemas/grade-audit-log.schema';
import type { UpdateGradingSchemeDto } from '../dto/control.dto';

export interface ResolvedGradingScheme {
  courseId: string;
  academicYear: string;
  semester: string;
  version: number;
  courseworkAttendanceMax: number;
  courseworkQuizzesMax: number;
  frozenAt: Date | null;
  components: ControlSchemeComponent[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class GradingSchemeService {
  constructor(
    @InjectModel(GradingScheme.name)
    private readonly schemeModel: Model<GradingSchemeDocument>,
    @InjectModel(Grade.name) private readonly gradeModel: Model<GradeDocument>,
    @InjectModel(GradeAuditLog.name)
    private readonly auditModel: Model<GradeAuditLogDocument>,
  ) {}

  /** Stored values layered over defaults so every component is always present. */
  async getScheme(
    courseId: string,
    academicYear: string,
    semester: string,
    session?: ClientSession,
  ): Promise<ResolvedGradingScheme> {
    const stored = await this.schemeModel
      .findOne({
        courseId: new Types.ObjectId(courseId),
        academicYear,
        semester,
      })
      .session(session ?? null)
      .lean();
    const byKey = new Map((stored?.components ?? []).map((c) => [c.key, c]));
    const components = DEFAULT_CONTROL_COMPONENTS.map((def) => {
      const saved = byKey.get(def.key);
      return {
        ...def,
        ...(saved
          ? {
              max: def.key === 'coursework' ? 20 : saved.max,
              step:
                def.key === 'coursework' && saved.step > 20
                  ? def.step
                  : saved.step,
              enabled:
                saved.enabled &&
                CONTROL_ENABLED_COMPONENT_KEYS.includes(def.key),
            }
          : {}),
      } satisfies ControlSchemeComponent;
    });
    return {
      courseId,
      academicYear,
      semester,
      version: stored?.version ?? 0,
      courseworkAttendanceMax: stored?.courseworkAttendanceMax ?? 5,
      courseworkQuizzesMax: 20 - (stored?.courseworkAttendanceMax ?? 5),
      frozenAt: stored?.frozenAt ?? null,
      components,
    };
  }

  /** Returns the component's rules or throws when it is not enabled. */
  async requireEnabledComponent(
    courseId: string,
    academicYear: string,
    semester: string,
    key: ControlComponentKey,
    session?: ClientSession,
  ): Promise<ControlSchemeComponent> {
    const scheme = await this.getScheme(
      courseId,
      academicYear,
      semester,
      session,
    );
    const component = scheme.components.find((c) => c.key === key);
    if (!component || !component.enabled) {
      throw new BadRequestException('Component is not enabled for this course');
    }
    return component;
  }

  /** Locks max/step against silent changes once the first mark exists. */
  async freeze(
    courseId: string,
    academicYear: string,
    semester: string,
    session?: ClientSession,
  ): Promise<void> {
    const filter = {
      courseId: new Types.ObjectId(courseId),
      academicYear,
      semester,
    };
    await this.schemeModel.updateOne(
      filter,
      {
        $inc: { mutationRevision: 1 },
        $setOnInsert: {
          // Persisting/freezing unchanged defaults must preserve the version
          // used by existing previews and templates. Only a rule edit bumps it.
          version: 0,
          components: DEFAULT_CONTROL_COMPONENTS.map((c) => ({ ...c })),
        },
      },
      { upsert: true, session },
    );
    await this.schemeModel.updateOne(
      { ...filter, frozenAt: null },
      { $set: { frozenAt: new Date() } },
      { session },
    );
  }

  async updateScheme(
    actorId: string,
    courseId: string,
    dto: UpdateGradingSchemeDto,
  ): Promise<ResolvedGradingScheme> {
    const session = await this.schemeModel.db.startSession();
    try {
      return await session.withTransaction(() =>
        this.updateInTransaction(actorId, courseId, dto, session),
      );
    } finally {
      await session.endSession();
    }
  }

  private async updateInTransaction(
    actorId: string,
    courseId: string,
    dto: UpdateGradingSchemeDto,
    session: ClientSession,
  ): Promise<ResolvedGradingScheme> {
    // Mark writes freeze/touch this same document. This prevents a stale
    // no-marks check from changing rules immediately after the first mark.
    await this.schemeModel.updateOne(
      {
        courseId: new Types.ObjectId(courseId),
        academicYear: dto.academicYear,
        semester: dto.semester,
      },
      {
        $inc: { mutationRevision: 1 },
        $setOnInsert: {
          version: 0,
          components: DEFAULT_CONTROL_COMPONENTS.map((c) => ({ ...c })),
        },
      },
      { upsert: true, session },
    );
    const keys = new Set<string>();
    for (const input of dto.components) {
      if (!CONTROL_COMPONENT_KEYS.includes(input.key)) {
        throw new BadRequestException(`Unknown component ${input.key}`);
      }
      if (keys.has(input.key)) {
        throw new BadRequestException(`Duplicate component ${input.key}`);
      }
      keys.add(input.key);
      if (
        input.enabled &&
        !CONTROL_ENABLED_COMPONENT_KEYS.includes(input.key)
      ) {
        throw new BadRequestException(
          `Component ${input.key} is not available yet`,
        );
      }
      if (input.key === 'coursework' && input.max !== 20)
        throw new BadRequestException('Coursework maximum must be 20');
      if (input.step > input.max) {
        throw new BadRequestException('Step cannot exceed the maximum mark');
      }
      if (
        round2(input.max) !== input.max ||
        round2(input.step) !== input.step
      ) {
        throw new BadRequestException('At most two decimals are allowed');
      }
    }

    const before = await this.getScheme(
      courseId,
      dto.academicYear,
      dto.semester,
      session,
    );
    if (
      dto.courseworkAttendanceMax !== undefined &&
      dto.courseworkAttendanceMax !== before.courseworkAttendanceMax
    ) {
      const exists = await this.gradeModel
        .exists({
          courseId: new Types.ObjectId(courseId),
          academicYear: dto.academicYear,
          semester: dto.semester,
          examType: 'coursework',
          cleared: { $ne: true },
        })
        .session(session);
      if (exists)
        throw new ConflictException({
          code: 'COURSEWORK_SPLIT_FROZEN',
          message: 'Coursework split is frozen after entry',
        });
    }
    const next = before.components.map((current) => {
      const input = dto.components.find((c) => c.key === current.key);
      return input
        ? {
            ...current,
            max: input.max,
            step: input.step,
            enabled: input.enabled,
          }
        : current;
    });

    // Changing max/step under existing marks silently changes their meaning.
    const changedRules = next.filter((n) => {
      const old = before.components.find((c) => c.key === n.key);
      return (
        old &&
        (old.max !== n.max || old.step !== n.step || old.enabled !== n.enabled)
      );
    });
    const reason = dto.reason?.trim();
    const courseObjectId = new Types.ObjectId(courseId);
    const affected: Array<{
      component: ControlSchemeComponent;
      docs: Array<
        Pick<GradeDocument, '_id' | 'grade' | 'status' | 'studentId'>
      >;
    }> = [];

    for (const component of changedRules) {
      const docs = await this.gradeModel
        .find({
          courseId: courseObjectId,
          academicYear: dto.academicYear,
          semester: dto.semester,
          examType: component.key,
          cleared: { $ne: true },
        })
        .session(session)
        .select('_id grade status studentId')
        .lean();
      if (docs.length > 0) affected.push({ component, docs });
    }

    if (affected.length > 0) {
      throw new ConflictException({
        code: 'SCHEME_FROZEN',
        message:
          'Marks exist. Create a new term scheme; in-place force changes are disabled.',
      });
    }
    const saved = await this.schemeModel.findOneAndUpdate(
      {
        courseId: courseObjectId,
        academicYear: dto.academicYear,
        semester: dto.semester,
      },
      {
        $set: {
          components: next.map((c) => ({ ...c })),
          updatedBy: new Types.ObjectId(actorId),
          courseworkAttendanceMax:
            dto.courseworkAttendanceMax ?? before.courseworkAttendanceMax,
        },
        $inc: { version: 1 },
      },
      { upsert: true, new: true, session },
    );

    if (changedRules.length > 0 || dto.courseworkAttendanceMax !== undefined) {
      await this.auditModel.create(
        [
          {
            courseId: courseObjectId,
            academicYear: dto.academicYear,
            semester: dto.semester,
            component: changedRules.map((c) => c.key).join(',') || 'coursework',
            action: 'SCHEME_CHANGE',
            source: 'GRID',
            oldValue: {
              courseworkAttendanceMax: before.courseworkAttendanceMax,
              courseworkQuizzesMax: before.courseworkQuizzesMax,
              components: before.components.map(
                ({ key, max, step, enabled }) => ({
                  key,
                  max,
                  step,
                  enabled,
                }),
              ),
            },
            newValue: {
              courseworkAttendanceMax:
                dto.courseworkAttendanceMax ?? before.courseworkAttendanceMax,
              courseworkQuizzesMax:
                20 -
                (dto.courseworkAttendanceMax ?? before.courseworkAttendanceMax),
              components: next.map(({ key, max, step, enabled }) => ({
                key,
                max,
                step,
                enabled,
              })),
              affectedMarks: affected.reduce((n, a) => n + a.docs.length, 0),
            },
            actorId: new Types.ObjectId(actorId),
            reason,
          },
        ],
        { session },
      );
    }

    return {
      courseId,
      academicYear: dto.academicYear,
      semester: dto.semester,
      version: saved?.version ?? before.version + 1,
      frozenAt: saved?.frozenAt ?? null,
      components: next,
      courseworkAttendanceMax:
        dto.courseworkAttendanceMax ?? before.courseworkAttendanceMax,
      courseworkQuizzesMax:
        20 - (dto.courseworkAttendanceMax ?? before.courseworkAttendanceMax),
    };
  }
}
