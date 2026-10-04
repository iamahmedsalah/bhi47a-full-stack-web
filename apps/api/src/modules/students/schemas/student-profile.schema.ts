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
  fullNameAr?: string;

  @Prop()
  fullNameEn?: string;

  @Prop()
  nationalIdMasked?: string;

  @Prop({ select: false })
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
StudentProfileSchema.index({ studentCode: 1 }, { unique: true });

// Compound ESR Indexes (Equality -> Sort -> Range)
StudentProfileSchema.index({ level: 1, enrollmentStatus: 1, createdAt: -1 });
StudentProfileSchema.index({ enrollmentStatus: 1, createdAt: -1 });
StudentProfileSchema.index({ createdAt: -1 });
StudentProfileSchema.index({ department: 1, level: 1, createdAt: -1 });
StudentProfileSchema.index({ level: 1, studentCode: 1 });

// Weighted Text Search Index
StudentProfileSchema.index(
  {
    fullName: 'text',
    fullNameAr: 'text',
    fullNameEn: 'text',
    studentCode: 'text',
  },
  {
    weights: { studentCode: 10, fullNameAr: 5, fullName: 3, fullNameEn: 2 },
    name: 'StudentTextSearchIndex',
  },
);
