import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  PLAN_STATUSES,
  PLAN_TYPES,
  type AdvisingPlanStatus,
  type AdvisingPlanType,
} from '../constants/advising.constants';
export interface PlanValidationSnapshot {
  valid: boolean;
  errors: Array<{
    code: string;
    message: string;
    severity: string;
    courseIds: string[];
  }>;
  warnings: Array<{
    code: string;
    message: string;
    severity: string;
    courseIds: string[];
  }>;
  requiredOverrides: string[];
  totalCredits: number;
  validatedAt: Date;
}
export type AdvisingPlanDocument = HydratedDocument<AdvisingPlan>;
@Schema({
  collection: 'advising_plans',
  timestamps: true,
  optimisticConcurrency: true,
})
export class AdvisingPlan {
  @Prop({ type: Types.ObjectId, ref: 'AdvisingCase', required: true })
  advisingCaseId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  studentId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User' }) advisorId?: Types.ObjectId;
  @Prop({ type: String, enum: PLAN_TYPES, required: true })
  type!: AdvisingPlanType;
  @Prop({ required: true, min: 1, default: 1 }) version!: number;
  @Prop({ required: true, trim: true, maxlength: 160 }) title!: string;
  @Prop({ required: true }) academicYear!: string;
  @Prop({ required: true }) semester!: string;
  @Prop({ type: [Types.ObjectId], ref: 'Course', default: [] })
  selectedCourses!: Types.ObjectId[];
  @Prop({ min: 0, default: 0 }) totalCredits!: number;
  @Prop({ type: Object }) validationResult?: PlanValidationSnapshot;
  @Prop({ trim: true, maxlength: 4000 }) advisorNotes?: string;
  @Prop({ trim: true, maxlength: 4000 }) studentVisibleNotes?: string;
  @Prop({ type: [String], default: [] }) overrideReasons!: string[];
  @Prop({ type: String, enum: PLAN_STATUSES, default: 'DRAFT' })
  status!: AdvisingPlanStatus;
  @Prop() studentAcknowledgedAt?: Date;
  @Prop() submittedAt?: Date;
  @Prop() registeredAt?: Date;
}
export const AdvisingPlanSchema = SchemaFactory.createForClass(AdvisingPlan);
AdvisingPlanSchema.index({ advisingCaseId: 1, type: 1, version: -1 });
AdvisingPlanSchema.index({ studentId: 1, status: 1 });
