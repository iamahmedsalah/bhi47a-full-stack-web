import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  CONTROL_COMPONENT_KEYS,
  CONTROL_WORKFLOW_STATES,
  type ControlWorkflowState,
  SEMESTER_VALUES,
  type ControlComponentKey,
  type Semester,
} from '@student-portal/shared';

export type ControlSheetDocument = ControlSheet & Document;

/**
 * One sheet = one course + term + component. It only carries sheet-level state
 * (lock). The marks themselves live in the existing `grades` collection.
 */
@Schema({ collection: 'control_sheets', timestamps: true })
export class ControlSheet {
  @Prop({ required: true, trim: true })
  academicYear!: string;

  @Prop({ type: String, required: true, enum: SEMESTER_VALUES })
  semester!: Semester;

  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  courseId!: Types.ObjectId;

  @Prop({ required: true, uppercase: true, trim: true })
  courseCode!: string;

  @Prop({ type: String, trim: true, lowercase: true })
  slug?: string;

  @Prop({ type: String, required: true, enum: CONTROL_COMPONENT_KEYS })
  component!: ControlComponentKey;

  @Prop({ type: String, enum: CONTROL_WORKFLOW_STATES, default: 'DRAFT' })
  workflowState!: ControlWorkflowState;

  @Prop({ type: Number, default: 0 })
  revision!: number;

  @Prop({ type: Object })
  submission?: {
    digest: string;
    schemeVersion: number;
    revision: number;
    submittedBy: string;
    submittedAt: Date;
  };

  @Prop({ type: Types.ObjectId, ref: 'User' })
  approvedBy?: Types.ObjectId;

  @Prop({ type: Object })
  reviewSubmission?: {
    digest: string;
    schemeVersion: number;
    revision: number;
    submittedBy: string;
    submittedAt: Date;
  };

  @Prop({ type: Date })
  approvedAt?: Date;

  @Prop({ type: String, maxlength: 500 })
  reviewReason?: string;

  /** Missing exam marks deferred because of a financial hold at review time. */
  @Prop({ type: [String], default: [] })
  tuitionDeferredStudentIds!: string[];

  /** Explicitly confirmed unentered marks; never interpreted as zero. */
  @Prop({ type: [String], default: [] })
  unenteredStudentIds!: string[];

  @Prop({ type: Object })
  grace?: {
    operationId: string;
    amount: number;
    actorId: string;
    appliedAt: Date;
    changed: number;
    capped: number;
  };

  @Prop({ default: false })
  locked!: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  lockedBy?: Types.ObjectId;

  @Prop({ type: Date })
  lockedAt?: Date;

  @Prop({ type: String, maxlength: 500 })
  lockReason?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}

export const ControlSheetSchema = SchemaFactory.createForClass(ControlSheet);

ControlSheetSchema.index(
  { academicYear: 1, semester: 1, courseId: 1, component: 1 },
  { unique: true },
);
ControlSheetSchema.index({ courseId: 1, academicYear: 1, semester: 1 });
ControlSheetSchema.index({ slug: 1 }, { sparse: true });

export function buildControlSheetSlug(sheet: {
  courseCode: string;
  component: string;
  academicYear: string;
  semester: string;
}): string {
  const code = String(sheet.courseCode || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const comp = String(sheet.component || '')
    .trim()
    .toLowerCase();
  const year = String(sheet.academicYear || '')
    .trim()
    .replace(/[/\\]/g, '-');
  const sem = String(sheet.semester || '')
    .trim()
    .toLowerCase();
  return `${code}-${comp}-${year}-${sem}`;
}

export function parseControlSheetSlug(slug: string): {
  courseCode: string;
  component: ControlComponentKey;
  academicYear: string;
  semester: Semester;
} | null {
  const match =
    /^([a-z0-9-]+)-(coursework|midterm|final)-(\d{4}-\d{4})-(first|second|summer)$/i.exec(
      slug.trim(),
    );
  if (!match) return null;
  return {
    courseCode: match[1].toUpperCase(),
    component: match[2].toLowerCase() as ControlComponentKey,
    academicYear: match[3],
    semester: match[4].toLowerCase() as Semester,
  };
}
