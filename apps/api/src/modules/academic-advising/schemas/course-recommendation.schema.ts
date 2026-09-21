import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
export type CourseRecommendationDocument =
  HydratedDocument<CourseRecommendation>;
@Schema({ collection: 'course_recommendations', timestamps: true })
export class CourseRecommendation {
  @Prop({ type: Types.ObjectId, ref: 'AdvisingCase', required: true })
  advisingCaseId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  studentId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  courseId!: Types.ObjectId;
  @Prop({ min: 0, max: 100, required: true }) score!: number;
  @Prop({
    type: String,
    enum: ['HIGH', 'MEDIUM', 'LOW', 'BLOCKED'],
    required: true,
  })
  priority!: string;
  @Prop({ required: true }) eligible!: boolean;
  @Prop({ default: false, index: true }) isRecommendedForSemester!: boolean;
  @Prop({ type: [String], default: [] }) reasonCodes!: string[];
  @Prop({ required: true }) explanation!: string;
  @Prop({ type: [String], default: [] }) warnings!: string[];
  @Prop({ type: [String], default: [] }) blockedReasons!: string[];
  @Prop({ default: false }) accepted!: boolean;
  @Prop({ default: false }) rejected!: boolean;
  @Prop({ maxlength: 1000 }) rejectionReason?: string;
  @Prop({ required: true }) generationKey!: string;
}
export const CourseRecommendationSchema =
  SchemaFactory.createForClass(CourseRecommendation);
CourseRecommendationSchema.index(
  { advisingCaseId: 1, courseId: 1 },
  { unique: true },
);
CourseRecommendationSchema.index({ studentId: 1, priority: 1 });
