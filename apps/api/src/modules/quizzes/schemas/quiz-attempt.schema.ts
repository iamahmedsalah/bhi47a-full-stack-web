import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type QuizAttemptDocument = QuizAttempt & Document;

export type QuizAttemptStatus =
  'in_progress' | 'submitted' | 'terminated_by_exit' | 'timed_out';

export class DraftAnswer {
  @Prop({ required: true })
  questionId!: string;

  @Prop({ type: Number, required: true })
  selectedOptionIndex!: number;
}

@Schema({
  collection: 'quiz_attempts',
  timestamps: true,
})
export class QuizAttempt {
  @Prop({ type: Types.ObjectId, ref: 'Quiz', required: true, index: true })
  quizId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  studentId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Course', required: true, index: true })
  courseId!: Types.ObjectId;

  @Prop({ type: Date, required: true })
  startedAt!: Date;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  @Prop({
    type: String,
    enum: ['in_progress', 'submitted', 'terminated_by_exit', 'timed_out'],
    default: 'in_progress',
    index: true,
  })
  status!: QuizAttemptStatus;

  @Prop({ type: Boolean, default: false })
  allowResume!: boolean;

  @Prop({ type: Number, default: 0 })
  exitCount!: number;

  @Prop({ type: [DraftAnswer], default: [] })
  draftAnswers!: DraftAnswer[];

  @Prop({ type: Date, default: Date.now })
  lastActiveAt!: Date;

  @Prop({ type: Date })
  submittedAt?: Date;
}

export const QuizAttemptSchema = SchemaFactory.createForClass(QuizAttempt);
QuizAttemptSchema.index({ quizId: 1, studentId: 1 }, { unique: true });
QuizAttemptSchema.index({ studentId: 1, status: 1 });
QuizAttemptSchema.index({ quizId: 1, status: 1 });
