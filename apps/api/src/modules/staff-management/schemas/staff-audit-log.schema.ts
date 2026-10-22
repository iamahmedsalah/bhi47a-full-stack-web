import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type StaffAuditLogDocument = HydratedDocument<StaffAuditLog>;

export const STAFF_AUDIT_ACTIONS = [
  'created',
  'profile_updated',
  'permissions_updated',
  'password_reset',
  'deactivated',
  'activated',
  'deleted',
] as const;

export type StaffAuditAction = (typeof STAFF_AUDIT_ACTIONS)[number];

@Schema({ collection: 'staff_audit_logs', timestamps: true })
export class StaffAuditLog {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  actorId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  targetStaffId!: Types.ObjectId;

  @Prop({ type: String, enum: STAFF_AUDIT_ACTIONS, required: true })
  action!: StaffAuditAction;

  @Prop({ type: MongooseSchema.Types.Mixed })
  changes?: Record<string, unknown>;

  @Prop({ trim: true, maxlength: 500 })
  reason?: string;
}

export const StaffAuditLogSchema = SchemaFactory.createForClass(StaffAuditLog);
StaffAuditLogSchema.index({ targetStaffId: 1, createdAt: -1 });
StaffAuditLogSchema.index({ actorId: 1, createdAt: -1 });
