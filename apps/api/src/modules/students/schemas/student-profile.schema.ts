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

  @Prop({ required: true, trim: true })
  studentCode!: string;

  @Prop({ required: true, trim: true })
  fullName!: string;

  @Prop({ trim: true })
  fullNameAr?: string;

  @Prop({ trim: true })
  fullNameEn?: string;

  @Prop({ trim: true })
  nationalIdMasked?: string;

  @Prop({ select: false, trim: true })
  nationalId?: string;

  @Prop({ trim: true, lowercase: true })
  academicEmail?: string;

  @Prop({ trim: true })
  department?: string;

  @Prop({ type: Number, min: 0, default: 0 })
  academicWarnings?: number;

  @Prop({ required: true, trim: true })
  level!: string;

  @Prop({ trim: true })
  group?: string;

  @Prop({ trim: true })
  section?: string;

  @Prop({ required: true, trim: true })
  academicYear!: string;

  @Prop({ required: true, trim: true })
  semester!: string;

  @Prop({
    type: String,
    enum: ENROLLMENT_STATUS_VALUES,
    default: 'active',
  })
  enrollmentStatus!: EnrollmentStatus;

  @Prop({ trim: true })
  seatNumber?: string;

  @Prop({ trim: true })
  examRoom?: string;

  @Prop({ trim: true })
  examFloor?: string;

  @Prop({ trim: true })
  examBuilding?: string;

  @Prop({ type: Boolean, default: false })
  isBlocked!: boolean;

  @Prop({
    type: String,
    enum: ['paid', 'unpaid', 'exempt'],
    default: 'paid',
  })
  tuitionFeesStatus!: 'paid' | 'unpaid' | 'exempt';

  @Prop({ trim: true, default: 'عدم سداد المصروفات الدراسية' })
  blockReason?: string;

  @Prop()
  blockedAt?: Date;

  @Prop()
  unblockedAt?: Date;
}

export const StudentProfileSchema =
  SchemaFactory.createForClass(StudentProfile);

// Primary & Foreign Key Identity Indexes
StudentProfileSchema.index({ userId: 1 }, { unique: true, sparse: true });
StudentProfileSchema.index({ studentCode: 1 }, { unique: true });

// Compound ESR Indexes (Equality -> Sort -> Range)
StudentProfileSchema.index({ level: 1, enrollmentStatus: 1, createdAt: -1 });
StudentProfileSchema.index({ enrollmentStatus: 1, createdAt: -1 });
StudentProfileSchema.index({ createdAt: -1 });
StudentProfileSchema.index({ department: 1, level: 1, createdAt: -1 });
StudentProfileSchema.index({ enrollmentStatus: 1, level: 1 });
StudentProfileSchema.index({ enrollmentStatus: 1, department: 1, level: 1 });
StudentProfileSchema.index({ level: 1, studentCode: 1 });
StudentProfileSchema.index({ level: 1, userId: 1 });
StudentProfileSchema.index({ fullName: 1, studentCode: 1 });
StudentProfileSchema.index({ isBlocked: 1, tuitionFeesStatus: 1, level: 1 });
StudentProfileSchema.index({ isBlocked: 1, studentCode: 1 });

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
