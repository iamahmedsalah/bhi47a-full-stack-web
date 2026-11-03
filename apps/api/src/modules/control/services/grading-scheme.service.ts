import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CONTROL_COMPONENT_KEYS,
  CONTROL_ENABLED_COMPONENT_KEYS,
  DEFAULT_CONTROL_COMPONENTS,
  calculateGradeScale,
  validateMark,
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
  ): Promise<ResolvedGradingScheme> {
    const stored = await this.schemeModel
      .findOne({
        courseId: new Types.ObjectId(courseId),
        academicYear,
        semester,
      })
      .lean();
    const byKey = new Map((stored?.components ?? []).map((c) => [c.key, c]));
    const components = DEFAULT_CONTROL_COMPONENTS.map((def) => {
      const saved = byKey.get(def.key);
      return {
        ...def,
        ...(saved
          ? {
              max: saved.max,
              step: saved.step,
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
  ): Promise<ControlSchemeComponent> {
    const scheme = await this.getScheme(courseId, academicYear, semester);
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
  ): Promise<void> {
    const filter = {
      courseId: new Types.ObjectId(courseId),
      academicYear,
      semester,
    };
    await this.schemeModel.updateOne(
      filter,
      {
        $setOnInsert: {
          version: 1,
          components: DEFAULT_CONTROL_COMPONENTS.map((c) => ({ ...c })),
        },
      },
      { upsert: true },
    );
    await this.schemeModel.updateOne(
      { ...filter, frozenAt: null },
      { $set: { frozenAt: new Date() } },
    );
  }

  async updateScheme(
    actorId: string,
    courseId: string,
    dto: UpdateGradingSchemeDto,
  ): Promise<ResolvedGradingScheme> {
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
    );
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
      return old && (old.max !== n.max || old.step !== n.step);
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
        })
        .select('_id grade status studentId')
        .lean();
      if (docs.length > 0) affected.push({ component, docs });
    }

    if (affected.length > 0) {
      if (!dto.force || !reason || reason.length < 3) {
        throw new ConflictException({
          code: 'SCHEME_FROZEN',
          message:
            'Marks already exist for this component. Changing the maximum or step requires force=true and a reason.',
          affected: affected.map((a) => ({
            key: a.component.key,
            marks: a.docs.length,
          })),
        });
      }
      for (const { component, docs } of affected) {
        const conflicts = docs.filter(
          (d) =>
            (d.status === 'present' || d.status === 'withheld') &&
            validateMark(d.grade, component) !== null,
        );
        if (conflicts.length > 0) {
          throw new ConflictException({
            code: 'SCHEME_CONFLICT',
            message: `${conflicts.length} existing mark(s) would become invalid under the new maximum/step`,
            key: component.key,
            count: conflicts.length,
          });
        }
      }
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
        },
        $inc: { version: 1 },
      },
      { upsert: true, new: true },
    );

    for (const { component, docs } of affected) {
      await this.gradeModel.bulkWrite(
        docs.map((d) => {
          const percentage =
            component.max > 0 ? round2((d.grade / component.max) * 100) : 0;
          const scale = calculateGradeScale(percentage, d.status);
          return {
            updateOne: {
              filter: { _id: d._id },
              update: {
                $set: {
                  maxGrade: component.max,
                  percentage,
                  letterGrade: scale.letter,
                  gradePoints: scale.points,
                },
                $inc: { rev: 1 },
              },
            },
          };
        }),
        { ordered: false },
      );
    }

    if (changedRules.length > 0) {
      await this.auditModel.create({
        courseId: courseObjectId,
        academicYear: dto.academicYear,
        semester: dto.semester,
        component: changedRules.map((c) => c.key).join(','),
        action: 'SCHEME_CHANGE',
        source: 'GRID',
        oldValue: {
          components: before.components.map(({ key, max, step, enabled }) => ({
            key,
            max,
            step,
            enabled,
          })),
        },
        newValue: {
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
      });
    }

    return {
      courseId,
      academicYear: dto.academicYear,
      semester: dto.semester,
      version: saved?.version ?? before.version + 1,
      frozenAt: saved?.frozenAt ?? null,
      components: next,
    };
  }
}
