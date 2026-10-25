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

  @Prop({ type: Number, default: 3 })
  complaintDailyLimit?: number;

  @Prop({
    type: Object,
    default: {},
  })
  departmentStaffAssignments?: Record<
    string,
    { staffId: string; staffName: string }
  >;

  @Prop({ default: true })
  gradesSystemOpen?: boolean;

  @Prop()
  gradesOpenAt?: Date;

  @Prop()
  gradesCloseAt?: Date;

  @Prop({ type: [String], default: ['1', '2', '3', '4'] })
  gradesPublishedLevels?: string[];

  @Prop({ default: true })
  registrationVisible?: boolean;

  @Prop({ default: true })
  syllabiVisible?: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;
}

export const SystemSettingsSchema =
  SchemaFactory.createForClass(SystemSettings);
