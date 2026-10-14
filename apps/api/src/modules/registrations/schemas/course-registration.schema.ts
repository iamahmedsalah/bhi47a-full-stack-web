import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RegistrationSource = 'student' | 'advisor' | 'system';
export type RegistrationStatus = 'pending' | 'approved' | 'rejected';

export type CourseRegistrationDocument = CourseRegistration & Document;

@Schema({
  collection: 'course_registrations',
  timestamps: true,
})
export class CourseRegistration {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  studentId!: Types.ObjectId;

  @Prop({ type: [String], default: [] })
  courses!: string[];

  @Prop({ type: Types.ObjectId, ref: 'AdvisingPlan' })
  academicPlanId?: Types.ObjectId;

  @Prop({ required: true, default: '2026-2027' })
  academicYear!: string;

  @Prop({
    required: true,
    enum: ['first', 'second', 'summer'],
    default: 'first',
  })
  semester!: 'first' | 'second' | 'summer';

  @Prop({ required: true, min: 0 })
  totalCreditHours!: number;

  @Prop({
    type: String,
    required: true,
    enum: ['student', 'advisor', 'system'],
  })
  source!: RegistrationSource;

  @Prop({
    type: String,
    required: true,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  })
  status!: RegistrationStatus;

  @Prop()
  advisorNotes?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  approvedBy?: Types.ObjectId;

  @Prop()
  approvedAt?: Date;

  @Prop()
  printableFormUrl?: string;

  @Prop({ default: 0 })
  editCount!: number;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  lastEditedBy?: Types.ObjectId;

  @Prop()
  lastEditedAt?: Date;
}

export const CourseRegistrationSchema =
  SchemaFactory.createForClass(CourseRegistration);

CourseRegistrationSchema.index({ studentId: 1, createdAt: -1 });
CourseRegistrationSchema.index(
  { studentId: 1, academicYear: 1, semester: 1 },
  { unique: true },
);
CourseRegistrationSchema.index({ status: 1 });
CourseRegistrationSchema.index({ studentId: 1, status: 1, createdAt: -1 });
