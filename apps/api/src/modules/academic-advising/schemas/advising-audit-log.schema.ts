import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
export type AdvisingAuditLogDocument = HydratedDocument<AdvisingAuditLog>;
@Schema({
  collection: 'advising_audit_logs',
  timestamps: { createdAt: true, updatedAt: false },
})
export class AdvisingAuditLog {
  @Prop({ type: Types.ObjectId, ref: 'AdvisingCase', required: true })
  advisingCaseId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  actorId!: Types.ObjectId;
  @Prop({ required: true }) action!: string;
  @Prop({ required: true }) entityType!: string;
  @Prop({ required: true }) entityId!: string;
  @Prop({ type: Object }) previousValue?: Record<string, unknown>;
  @Prop({ type: Object }) newValue?: Record<string, unknown>;
  @Prop({ type: Object }) metadata?: Record<string, unknown>;
}
export const AdvisingAuditLogSchema =
  SchemaFactory.createForClass(AdvisingAuditLog);
AdvisingAuditLogSchema.index({ advisingCaseId: 1, createdAt: -1 });
