import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  TUITION_AUDIT_ACTION_TYPE_VALUES,
  type TuitionAuditActionType,
} from '@student-portal/shared';

export type TuitionAuditLogDocument = TuitionAuditLog & Document;

@Schema({
  collection: 'tuition_audit_logs',
  timestamps: true,
})
export class TuitionAuditLog {
  @Prop({
    type: Types.ObjectId,
    ref: 'StudentProfile',
    required: true,
    index: true,
  })
  studentProfileId!: Types.ObjectId;

  @Prop({ required: true, index: true, trim: true })
  studentCode!: string;

  @Prop({ required: true, trim: true })
  studentName!: string;

  @Prop({ required: true, trim: true })
  level!: string;

  @Prop({ default: 'GENERAL', trim: true })
  department!: string;

  @Prop({ required: true, trim: true })
  previousTuitionStatus!: string;

  @Prop({ required: true, trim: true })
  newTuitionStatus!: string;

  @Prop({ required: true, type: Boolean })
  previousBlockStatus!: boolean;

  @Prop({ required: true, type: Boolean })
  newBlockStatus!: boolean;

  @Prop({ trim: true })
  blockReason?: string;

  @Prop({
    type: String,
    required: true,
    enum: TUITION_AUDIT_ACTION_TYPE_VALUES,
    default: 'manual_single',
  })
  actionType!: TuitionAuditActionType;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  performedBy!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  performedByName!: string;

  @Prop({ required: true, trim: true })
  performedByRole!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const TuitionAuditLogSchema =
  SchemaFactory.createForClass(TuitionAuditLog);

TuitionAuditLogSchema.index({ createdAt: -1, studentCode: 1 });
TuitionAuditLogSchema.index({ studentProfileId: 1, createdAt: -1 });
TuitionAuditLogSchema.index({ performedBy: 1, createdAt: -1 });
