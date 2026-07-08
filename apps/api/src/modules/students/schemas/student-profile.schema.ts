import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  ENROLLMENT_STATUS_VALUES,
  type EnrollmentStatus,
} from '@student-portal/shared';

export type StudentProfileDocument = StudentProfile & Document;

@Schema({
  collection: 'student_profiles',
  timestamps: true,
})
export class StudentProfile {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, unique: true })
  studentCode!: string;

  @Prop({ required: true })
  fullName!: string;

  @Prop()
  nationalIdMasked?: string;

  @Prop()
  nationalId?: string;

  @Prop()
  academicEmail?: string;

  @Prop()
  department?: string;

  @Prop({ required: true })
  level!: string;

  @Prop()
  group?: string;

  @Prop()
  section?: string;

  @Prop({ required: true })
  academicYear!: string;

  @Prop({ required: true })
  semester!: string;

  @Prop({
    type: String,
    enum: ENROLLMENT_STATUS_VALUES,
    default: 'active',
  })
  enrollmentStatus!: EnrollmentStatus;

  @Prop()
  seatNumber?: string;

  @Prop()
  examRoom?: string;

  @Prop()
  examFloor?: string;

  @Prop()
  examBuilding?: string;
}

export const StudentProfileSchema =
  SchemaFactory.createForClass(StudentProfile);

// Indexes
StudentProfileSchema.index({ userId: 1 }, { unique: true });
StudentProfileSchema.index({ fullName: 'text' });
StudentProfileSchema.index({ level: 1 });
StudentProfileSchema.index({ enrollmentStatus: 1 });
