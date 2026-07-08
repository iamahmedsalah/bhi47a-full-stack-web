import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SystemSettingsDocument = SystemSettings & Document;

@Schema({
  collection: 'system_settings',
  timestamps: true,
})
export class SystemSettings {
  @Prop({ required: true, default: true })
  complaintsSystemOpen!: boolean;

  @Prop({ type: [String], default: [] })
  blacklistedStudentCodes!: string[];

  @Prop()
  complaintOpenAt?: Date;

  @Prop()
  complaintCloseAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;
}

export const SystemSettingsSchema =
  SchemaFactory.createForClass(SystemSettings);
