import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AiUsageLogDocument = AiUsageLog & Document;

@Schema({ timestamps: true })
export class AiUsageLog {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  model!: string;

  @Prop({ required: true })
  feature!: string;

  @Prop({ default: 0 })
  promptTokens!: number;

  @Prop({ default: 0 })
  completionTokens!: number;

  @Prop({ default: 0 })
  totalTokens!: number;

  @Prop({ default: 0 })
  latencyMs!: number;

  @Prop()
  error?: string;
}

export const AiUsageLogSchema = SchemaFactory.createForClass(AiUsageLog);
AiUsageLogSchema.index({ createdAt: -1 });
AiUsageLogSchema.index({ feature: 1, createdAt: -1 });
