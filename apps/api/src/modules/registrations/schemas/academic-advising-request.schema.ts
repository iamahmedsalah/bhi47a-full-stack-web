import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AdvisingReason =
  'low_gpa' | 'probation' | 'failed_courses' | 'summer_policy';
export type AdvisingStatus = 'pending' | 'reviewed' | 'approved' | 'rejected';

export type AcademicAdvisingRequestDocument = AcademicAdvisingRequest &
  Document;

@Schema({
  collection: 'academic_advising_requests',
  timestamps: true,
})
export class AcademicAdvisingRequest {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  studentId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  assignedStaffId?: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    enum: ['low_gpa', 'probation', 'failed_courses', 'summer_policy'],
  })
  reason!: AdvisingReason;

  @Prop({ type: [String], default: [] })
  autoSuggestedCourses!: string[];

  @Prop({ type: [String], default: [] })
  staffApprovedCourses!: string[];

  @Prop()
  staffNotes?: string;

  @Prop({ default: false })
  overridePrerequisites!: boolean;

  @Prop({ default: false })
  overrideMaxCreditHours!: boolean;

  @Prop({ default: false })
  approveIncompleteCompletion!: boolean;

  @Prop({ type: Number, min: 1, max: 3 })
  summerCourseLimit?: number;

  @Prop({ type: [String], default: [] })
  policyWarnings!: string[];

  @Prop({ type: Types.ObjectId, ref: 'User' })
  reviewedBy?: Types.ObjectId;

  @Prop()
  reviewedAt?: Date;

  @Prop({
    type: String,
    required: true,
    enum: ['pending', 'reviewed', 'approved', 'rejected'],
    default: 'pending',
  })
  status!: AdvisingStatus;
}

export const AcademicAdvisingRequestSchema = SchemaFactory.createForClass(
  AcademicAdvisingRequest,
);

AcademicAdvisingRequestSchema.index({ studentId: 1, status: 1 });
AcademicAdvisingRequestSchema.index({ assignedStaffId: 1, status: 1 });
