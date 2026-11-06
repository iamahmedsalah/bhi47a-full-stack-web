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

  @Prop({ type: Date })
  approvedAt?: Date;

  @Prop({ type: String, maxlength: 500 })
  reviewReason?: string;

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
