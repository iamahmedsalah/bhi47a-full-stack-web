import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RegistrationSource = 'student' | 'advisor';
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

  @Prop({ required: true, min: 0 })
  totalCreditHours!: number;

  @Prop({ required: true, enum: ['student', 'advisor'] })
  source!: RegistrationSource;

  @Prop({
    required: true,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  })
  status!: RegistrationStatus;

  @Prop()
  advisorNotes?: string;

  @Prop()
  printableFormUrl?: string;
}

export const CourseRegistrationSchema =
  SchemaFactory.createForClass(CourseRegistration);

CourseRegistrationSchema.index({ studentId: 1, createdAt: -1 });
CourseRegistrationSchema.index({ status: 1 });
