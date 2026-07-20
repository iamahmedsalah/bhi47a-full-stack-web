import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AiSettingsDocument = HydratedDocument<AiSettings>;

@Schema({ timestamps: true, collection: 'ai_settings' })
export class AiSettings {
  @Prop({ required: true, unique: true, default: 'default' })
  key!: string;

  @Prop({ default: true })
  studentAdvisorEnabled!: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;
}

export const AiSettingsSchema = SchemaFactory.createForClass(AiSettings);
