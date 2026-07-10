import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { SEMESTER_VALUES, type Semester } from '@student-portal/shared';

export type AttendanceDocument = Attendance & Document;

@Schema({
  collection: 'attendance',
  timestamps: true,
})
export class Attendance {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  studentId!: Types.ObjectId;

  @Prop({ required: true })
  studentCode!: string;

  @Prop({ required: true })
  academicYear!: string;

  @Prop({ type: String, required: true, enum: SEMESTER_VALUES })
  semester!: Semester;

  @Prop({ required: true, default: 0 })
  totalLectures!: number;

  @Prop({ required: true, default: 0 })
  attendedLectures!: number;

  @Prop({ required: true, default: 0 })
  absenceLectures!: number;

  @Prop({ required: true, default: 0 })
  attendancePercentage!: number;

  @Prop({ default: true })
  isPublished!: boolean;
}

export const AttendanceSchema = SchemaFactory.createForClass(Attendance);

// Indexes
AttendanceSchema.index(
  { studentCode: 1, academicYear: 1, semester: 1 },
  { unique: true },
);
AttendanceSchema.index({ studentId: 1 });
AttendanceSchema.index({ isPublished: 1 });
