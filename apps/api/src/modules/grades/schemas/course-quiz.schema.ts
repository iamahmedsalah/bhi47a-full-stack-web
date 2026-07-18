import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  GRADE_STATUS_VALUES,
  type GradeStatus,
  SEMESTER_VALUES,
  type Semester,
} from '@student-portal/shared';

export type CourseQuizDocument = CourseQuiz & Document;

@Schema()
class QuizEntry {
  @Prop({ required: true })
  quizNumber!: number;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true, default: 0 })
  grade!: number;

  @Prop({ required: true, default: 10 })
  maxGrade!: number;

  @Prop({
    type: String,
    required: true,
    enum: GRADE_STATUS_VALUES,
    default: 'present',
  })
  status!: GradeStatus;

  @Prop()
  date?: Date;
}

const QuizEntrySchema = SchemaFactory.createForClass(QuizEntry);

@Schema({
  collection: 'course_quizzes',
  timestamps: true,
})
export class CourseQuiz {
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

  @Prop({ required: true })
  academicYear!: string;

  @Prop({ type: String, required: true, enum: SEMESTER_VALUES })
  semester!: Semester;

  @Prop({ type: [QuizEntrySchema], default: [] })
  quizzes!: QuizEntry[];

  @Prop({ required: true, default: 0 })
  totalGrade!: number;

  @Prop({ required: true, default: 0 })
  maxTotalGrade!: number;

  @Prop({ required: true, default: 0 })
  percentage!: number;

  @Prop({ default: true })
  isPublished!: boolean;
}

export const CourseQuizSchema = SchemaFactory.createForClass(CourseQuiz);

// Indexes. The compound unique term index is reconciled by GradesService
// because older installations used a two-field unique index.
CourseQuizSchema.index({ studentId: 1 });
CourseQuizSchema.index({ courseId: 1 });
CourseQuizSchema.index({ isPublished: 1 });
