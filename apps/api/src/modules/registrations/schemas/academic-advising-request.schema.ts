import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AdvisingReason = 'low_gpa' | 'probation' | 'failed_courses';
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
    enum: ['low_gpa', 'probation', 'failed_courses'],
  })
  reason!: AdvisingReason;

  @Prop({ type: [String], default: [] })
  autoSuggestedCourses!: string[];

  @Prop({ type: [String], default: [] })
  staffApprovedCourses!: string[];

  @Prop()
  staffNotes?: string;

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
