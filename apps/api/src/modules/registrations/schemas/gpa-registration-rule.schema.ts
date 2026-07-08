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

  @Prop({ required: true, default: false })
  requiresAdvisor!: boolean;

  @Prop({ default: true })
  isActive!: boolean;
}

export const GpaRegistrationRuleSchema =
  SchemaFactory.createForClass(GpaRegistrationRule);

GpaRegistrationRuleSchema.index({ minGpa: 1, maxGpa: 1, isActive: 1 });
