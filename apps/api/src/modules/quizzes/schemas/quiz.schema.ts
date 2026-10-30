import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  QUIZ_RELEASE_MODES,
  type QuizReleaseMode,
} from '@student-portal/shared';

export type QuizDocument = Quiz & Document;

export type QuestionType = 'mcq' | 'true_false';

export class QuizQuestion {
  @Prop({ required: true })
  id!: string;

  @Prop({ required: true })
  text!: string;

  @Prop({ type: String, enum: ['mcq', 'true_false'], default: 'mcq' })
  type!: QuestionType;

  @Prop({ type: [String], default: [] })
  options!: string[];

  @Prop({ type: Number, required: true })
  correctOptionIndex!: number;

  @Prop({ type: Number, required: true, default: 1 })
  points!: number;

  @Prop({ trim: true })
  explanation?: string;
}

@Schema({
  collection: 'quizzes',
  timestamps: true,
})
export class Quiz {
  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ trim: true })
  titleAr?: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  courseId!: Types.ObjectId;

  @Prop({ trim: true, required: true })
  courseCode!: string;

  @Prop({ trim: true, required: true })
  courseName!: string;

  @Prop({ trim: true })
  courseNameAr?: string;

  @Prop({ trim: true })
  courseNameEn?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  creatorId!: Types.ObjectId;

  @Prop({ trim: true })
  creatorName?: string;

  @Prop({ trim: true })
  academicYear?: string;

  @Prop({ trim: true })
  semester?: string;

  @Prop({ type: Number, required: true, min: 1, default: 15 })
  durationMinutes!: number;

  @Prop({ type: Number, required: true, default: 10 })
  totalMarks!: number;

  @Prop({ type: Number, default: 5 })
  passingMarks!: number;

  @Prop({ type: Date })
  startsAt?: Date;

  @Prop({ type: Date })
  endsAt?: Date;

  @Prop({ default: false })
  isPublished!: boolean;

  @Prop({ default: true })
  allowReview!: boolean;

  @Prop({ default: true })
  allowResume!: boolean;

  @Prop({ default: false })
  publishResults!: boolean;

  @Prop({ type: String, enum: QUIZ_RELEASE_MODES, default: 'after_close' })
  resultsReleaseMode?: QuizReleaseMode;

  @Prop({ type: String, enum: QUIZ_RELEASE_MODES, default: 'manual' })
  reviewReleaseMode?: QuizReleaseMode;

  @Prop({ type: Array, default: [] })
  questions!: QuizQuestion[];
}

export const QuizSchema = SchemaFactory.createForClass(Quiz);
QuizSchema.index({ courseId: 1, isPublished: 1 });
QuizSchema.index({ courseId: 1, isPublished: 1, createdAt: -1 });
QuizSchema.index({ courseId: 1, isPublished: 1, startsAt: 1, endsAt: 1 });
QuizSchema.index({ creatorId: 1 });
