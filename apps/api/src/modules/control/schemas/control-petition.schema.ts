import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  CONTROL_COMPONENT_KEYS,
  GRADE_STATUS_VALUES,
  SEMESTER_VALUES,
  type ControlComponentKey,
  type GradeStatus,
  type Semester,
} from '@student-portal/shared';

export const CONTROL_PETITION_STATUS_VALUES = [
  'PENDING',
  'APPROVED',
  'PARTIALLY_APPROVED',
  'REJECTED',
] as const;
export type ControlPetitionStatus =
  (typeof CONTROL_PETITION_STATUS_VALUES)[number];

export const CONTROL_PETITION_ITEM_DECISION_VALUES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
] as const;
export type ControlPetitionItemDecision =
  (typeof CONTROL_PETITION_ITEM_DECISION_VALUES)[number];

export interface ControlPetitionStudentItem {
  studentId: Types.ObjectId;
  studentCode: string;
  studentName: string;
  studentNameAr?: string | null;
  currentScore: number | null;
  currentStatus: GradeStatus | null;
  currentAttendanceMark?: number | null;
  currentQuizzesMark?: number | null;
  baselineRev: number;
  proposedScore: number | null;
  proposedStatus: GradeStatus;
  proposedAttendanceMark?: number | null;
  proposedQuizzesMark?: number | null;
  studentReason?: string | null;
  decision: ControlPetitionItemDecision;
  decisionNote?: string | null;
  appliedRev?: number | null;
  decidedAt?: Date | null;
}

export type ControlPetitionDocument = ControlPetition &
  Document & {
    createdAt: Date;
    updatedAt: Date;
  };

@Schema({ collection: 'control_petitions', timestamps: true })
export class ControlPetition {
  @Prop({ type: Types.ObjectId, ref: 'ControlSheet', required: true })
  sheetId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  courseId!: Types.ObjectId;

  @Prop({ required: true, uppercase: true, trim: true })
  courseCode!: string;

  @Prop({ required: true, trim: true })
  courseName!: string;

  @Prop({ type: String, trim: true })
  courseNameAr?: string | null;

  @Prop({ type: String, trim: true })
  courseNameEn?: string | null;

  @Prop({ type: String, trim: true })
  courseLevel?: string | null;

  @Prop({ required: true, trim: true })
  academicYear!: string;

  @Prop({ type: String, required: true, enum: SEMESTER_VALUES })
  semester!: Semester;

  @Prop({ type: String, required: true, enum: CONTROL_COMPONENT_KEYS })
  component!: ControlComponentKey;

  @Prop({
    type: String,
    required: true,
    enum: CONTROL_PETITION_STATUS_VALUES,
    default: 'PENDING',
  })
  status!: ControlPetitionStatus;

  @Prop({ required: true, trim: true, maxlength: 500 })
  reason!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  requestedBy!: Types.ObjectId;

  @Prop({ type: Date, required: true, default: () => new Date() })
  requestedAt!: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  reviewedBy?: Types.ObjectId;

  @Prop({ type: Date })
  reviewedAt?: Date;

  @Prop({ type: String, maxlength: 500 })
  reviewNote?: string | null;

  /** Null once decided until the requester opens/dismisses the outcome. */
  @Prop({ type: Date, default: null })
  requesterSeenAt?: Date | null;

  @Prop({
    type: [
      {
        studentId: { type: Types.ObjectId, ref: 'User', required: true },
        studentCode: { type: String, required: true, trim: true },
        studentName: { type: String, required: true, trim: true },
        studentNameAr: { type: String, default: null },
        currentScore: { type: Number, default: null },
        currentStatus: {
          type: String,
          enum: [...GRADE_STATUS_VALUES, null],
          default: null,
        },
        currentAttendanceMark: { type: Number, default: null },
        currentQuizzesMark: { type: Number, default: null },
        baselineRev: { type: Number, required: true, default: 0 },
        proposedScore: { type: Number, default: null },
        proposedStatus: {
          type: String,
          required: true,
          enum: GRADE_STATUS_VALUES,
          default: 'present',
        },
        proposedAttendanceMark: { type: Number, default: null },
        proposedQuizzesMark: { type: Number, default: null },
        studentReason: { type: String, maxlength: 500, default: null },
        decision: {
          type: String,
          required: true,
          enum: CONTROL_PETITION_ITEM_DECISION_VALUES,
          default: 'PENDING',
        },
        decisionNote: { type: String, maxlength: 500, default: null },
        appliedRev: { type: Number, default: null },
        decidedAt: { type: Date, default: null },
      },
    ],
    default: [],
  })
  items!: ControlPetitionStudentItem[];
}

export const ControlPetitionSchema =
  SchemaFactory.createForClass(ControlPetition);

ControlPetitionSchema.index({ status: 1, createdAt: -1 });
ControlPetitionSchema.index({ sheetId: 1, createdAt: -1 });
ControlPetitionSchema.index({
  requestedBy: 1,
  status: 1,
  requesterSeenAt: 1,
  createdAt: -1,
});
ControlPetitionSchema.index({
  academicYear: 1,
  semester: 1,
  status: 1,
  createdAt: -1,
});
