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

  @Prop({
    type: String,
    required: true,
    enum: GRADE_STATUS_VALUES,
    default: 'present',
  })
  status!: GradeStatus;

  @Prop({ required: true })
  academicYear!: string;

  @Prop({ type: String, required: true, enum: SEMESTER_VALUES })
  semester!: Semester;

  @Prop({ default: false })
  isPublished!: boolean;

  @Prop({ type: Number })
  percentage?: number;

  @Prop({ type: String })
  letterGrade?: string;

  @Prop({ type: Number })
  gradePoints?: number;

  @Prop({ type: String })
  courseNameAr?: string;

  @Prop({ type: String })
  courseNameEn?: string;

  @Prop({ type: Number, min: 0, max: 20 })
  attendanceMark?: number;

  @Prop({ type: Number, min: 0, max: 20 })
  quizzesMark?: number;

  @Prop({ type: Boolean, default: false })
  cleared?: boolean;

  @Prop({ type: Boolean, default: false })
  controlManaged?: boolean;

  @Prop({ type: Number })
  controlApprovedRev?: number;

  /** Optimistic-concurrency revision, incremented by the Control module. */
  @Prop({ type: Number, default: 0, min: 0 })
  rev?: number;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;
}

export const GradeSchema = SchemaFactory.createForClass(Grade);

// A student has at most one record per course, term and exam type. The legacy
// `{ studentCode, courseCode, examType }` unique index had no term, which made a
// retaken course collide with its earlier attempt; it is dropped on startup by
// `GradesService.onModuleInit`.
GradeSchema.index(
  { studentId: 1, courseId: 1, academicYear: 1, semester: 1, examType: 1 },
  { unique: true },
);
GradeSchema.index({
  studentCode: 1,
  courseCode: 1,
  examType: 1,
  academicYear: 1,
  semester: 1,
});
GradeSchema.index({ studentId: 1 });
GradeSchema.index({ studentId: 1, isPublished: 1 });
GradeSchema.index({ courseId: 1 });
GradeSchema.index({ examType: 1 });
GradeSchema.index({ isPublished: 1 });
