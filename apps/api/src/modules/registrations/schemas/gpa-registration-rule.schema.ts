import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type GpaRegistrationRuleDocument = GpaRegistrationRule & Document;

@Schema({
  collection: 'gpa_registration_rules',
  timestamps: true,
})
export class GpaRegistrationRule {
  @Prop({ required: true, min: 0, max: 4 })
  minGpa!: number;

  @Prop({ required: true, min: 0, max: 4 })
  maxGpa!: number;

  @Prop({ required: true, min: 1 })
  maxCreditHours!: number;

  @Prop({ required: true, min: 1, default: 10 })
  minCreditHours!: number;

  @Prop({ required: true, min: 1, default: 4 })
  minCourses!: number;

  @Prop({ required: true, min: 1, default: 6 })
  maxCourses!: number;

  @Prop({ required: true, default: false })
  requiresAdvisor!: boolean;

  @Prop({ default: true })
  requireForFailedCourses!: boolean;

  @Prop({ default: true })
  requireForAcademicWarnings!: boolean;

  @Prop({ min: 1, default: 1 })
  academicWarningThreshold!: number;

  @Prop({ default: true })
  requireForIncompleteCourses!: boolean;

  @Prop({ default: true })
  requireForGraduationPlans!: boolean;

  @Prop({ default: false })
  requireForSummerRegistration!: boolean;

  @Prop({ default: true })
  exemptNewStudentsFromGpaRule!: boolean;

  @Prop({ default: true })
  isActive!: boolean;
}

export const GpaRegistrationRuleSchema =
  SchemaFactory.createForClass(GpaRegistrationRule);

GpaRegistrationRuleSchema.index({ minGpa: 1, maxGpa: 1, isActive: 1 });
