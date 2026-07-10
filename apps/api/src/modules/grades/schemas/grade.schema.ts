import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  EXAM_TYPE_VALUES,
  GRADE_STATUS_VALUES,
  type ExamType,
  type GradeStatus,
  SEMESTER_VALUES,
  type Semester,
} from '@student-portal/shared';

export type GradeDocument = Grade & Document;

@Schema({
  collection: 'grades',
  timestamps: true,
})
export class Grade {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  studentId!: Types.ObjectId;

  @Prop({ required: true })
  studentCode!: string;

  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  courseId!: Types.ObjectId;

  @Prop({ required: true })
  courseName!: string;

  @Prop({ required: true })
  courseCode!: string;

  @Prop({ type: String, required: true, enum: EXAM_TYPE_VALUES })
  examType!: ExamType;

  @Prop({ required: true, default: 0 })
  grade!: number;

  @Prop({ required: true, default: 100 })
  maxGrade!: number;

  @Prop({ type: String, required: true, enum: GRADE_STATUS_VALUES, default: 'present' })
  status!: GradeStatus;

  @Prop({ required: true })
  academicYear!: string;

  @Prop({ type: String, required: true, enum: SEMESTER_VALUES })
  semester!: Semester;

  @Prop({ default: true })
  isPublished!: boolean;
}

export const GradeSchema = SchemaFactory.createForClass(Grade);

// Indexes for rapid lookups and filters
GradeSchema.index(
  { studentCode: 1, courseCode: 1, examType: 1 },
  { unique: true },
);
GradeSchema.index({ studentId: 1 });
GradeSchema.index({ courseId: 1 });
GradeSchema.index({ examType: 1 });
GradeSchema.index({ isPublished: 1 });
