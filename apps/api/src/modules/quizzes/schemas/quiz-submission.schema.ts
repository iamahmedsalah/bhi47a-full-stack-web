import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type QuizSubmissionDocument = QuizSubmission & Document;

export class SubmittedAnswer {
  @Prop({ required: true })
  questionId!: string;

  @Prop({ type: Number, required: true })
  selectedOptionIndex!: number;

  @Prop({ type: Boolean, required: true })
  isCorrect!: boolean;

  @Prop({ type: Number, required: true })
  pointsAwarded!: number;
}

@Schema({
  collection: 'quiz_submissions',
  timestamps: true,
})
export class QuizSubmission {
  @Prop({ type: Types.ObjectId, ref: 'Quiz', required: true, index: true })
  quizId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Course', required: true, index: true })
  courseId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  studentId!: Types.ObjectId;

  @Prop({ required: true, trim: true, index: true })
  studentCode!: string;

  @Prop({ required: true, trim: true })
  studentName!: string;

  @Prop({ type: [SubmittedAnswer], default: [] })
  answers!: SubmittedAnswer[];

  @Prop({ type: Number, required: true })
  score!: number;

  @Prop({ type: Number, required: true })
  totalMarks!: number;

  @Prop({ type: Number, required: true })
  percentage!: number;

  @Prop({ type: Boolean, required: true })
  isPassed!: boolean;

  @Prop({ type: Date, required: true })
  startedAt!: Date;

  @Prop({ type: Date, required: true })
  submittedAt!: Date;

  @Prop({ type: Number, default: 0 })
  durationSeconds!: number;
}

export const QuizSubmissionSchema =
  SchemaFactory.createForClass(QuizSubmission);
QuizSubmissionSchema.index({ quizId: 1, studentId: 1 }, { unique: true });
QuizSubmissionSchema.index({ courseId: 1 });
QuizSubmissionSchema.index({ studentId: 1, createdAt: -1 });
