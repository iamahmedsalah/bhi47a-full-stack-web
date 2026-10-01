import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AdvisingRulesDocument = AdvisingRules & Document;

@Schema({
  collection: 'advising_rules',
  timestamps: true,
})
export class AdvisingRules {
  @Prop({ required: true, default: 6, min: 1, max: 10 })
  maxCoursesLimit!: number;

  @Prop({ required: true, default: true })
  preventHigherLevelCourses!: boolean;

  @Prop({ required: true, default: true })
  allowLowGradeImprovementFallback!: boolean;

  @Prop({ required: true, default: true })
  enforceDepartmentLevel3And4!: boolean;

  @Prop({ required: true, default: 12, min: 3, max: 24 })
  probationMaxCredits!: number;

  @Prop({ required: true, default: 18, min: 6, max: 24 })
  regularMaxCredits!: number;

  @Prop({ required: true, default: 21, min: 6, max: 28 })
  graduatingMaxCredits!: number;

  @Prop({ required: true, default: 9, min: 3, max: 15 })
  summerMaxCredits!: number;

  @Prop({ required: true, default: 6, min: 3, max: 12 })
  summerProbationMaxCredits!: number;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;
}

export const AdvisingRulesSchema = SchemaFactory.createForClass(AdvisingRules);
