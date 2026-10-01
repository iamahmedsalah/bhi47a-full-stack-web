import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  ATTENDANCE_METHOD_VALUES,
  ATTENDANCE_RECORD_STATUS_VALUES,
  ATTENDANCE_SESSION_TYPE_VALUES,
  type AttendanceMethod,
  type AttendanceRecordStatus,
  type AttendanceSessionType,
} from '@student-portal/shared';

export type AttendanceRecordDocument = AttendanceRecord & Document;

@Schema({ _id: false })
export class AttendanceAuditEntry {
  @Prop({ required: true })
  action!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  modifiedBy!: Types.ObjectId;

  @Prop({ trim: true })
  modifiedByName?: string;

  @Prop({ type: String, enum: ATTENDANCE_RECORD_STATUS_VALUES })
  previousStatus?: AttendanceRecordStatus;

  @Prop({
    type: String,
    required: true,
    enum: ATTENDANCE_RECORD_STATUS_VALUES,
  })
  newStatus!: AttendanceRecordStatus;

  @Prop({ trim: true, maxlength: 500 })
  reason?: string;

  @Prop({ required: true, default: () => new Date() })
  timestamp!: Date;
}

export const AttendanceAuditEntrySchema =
  SchemaFactory.createForClass(AttendanceAuditEntry);

@Schema({
  collection: 'attendance_records',
  timestamps: true,
})
export class AttendanceRecord {
  @Prop({ type: Types.ObjectId, ref: 'AttendanceSession', required: true })
  sessionId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  studentId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  studentCode!: string;

  @Prop({ required: true, trim: true })
  studentName!: string;

  @Prop({ required: true, uppercase: true, trim: true })
  courseCode!: string;

  @Prop({
    type: String,
    required: true,
    enum: ATTENDANCE_SESSION_TYPE_VALUES,
    default: 'lecture',
  })
  sessionType!: AttendanceSessionType;

  @Prop({
    type: String,
    required: true,
    enum: ATTENDANCE_RECORD_STATUS_VALUES,
    default: 'present',
  })
  status!: AttendanceRecordStatus;

  @Prop({
    type: String,
    required: true,
    enum: ATTENDANCE_METHOD_VALUES,
    default: 'qr',
  })
  method!: AttendanceMethod;

  @Prop({ required: true, default: () => new Date() })
  checkedInAt!: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  markedBy?: Types.ObjectId;

  @Prop({ trim: true })
  markedByName?: string;

  @Prop({ trim: true, maxlength: 500 })
  note?: string;

  /**
   * Unique client device identifier (UUIDv4) to enforce anti-proxy check:
   * 1 physical device = 1 student per attendance session.
   */
  @Prop({ trim: true, index: true })
  deviceId?: string;

  @Prop({ type: [AttendanceAuditEntrySchema], default: [] })
  auditTrail!: AttendanceAuditEntry[];
}

export const AttendanceRecordSchema =
  SchemaFactory.createForClass(AttendanceRecord);

// CRITICAL DATABASE UNIQUE CONSTRAINT: Prevent duplicate attendance records for the same session and student
AttendanceRecordSchema.index({ sessionId: 1, studentId: 1 }, { unique: true });

// Anti-proxy device lock index: Quickly query or enforce device uniqueness per session
AttendanceRecordSchema.index({ sessionId: 1, deviceId: 1 });

// High-performance query indexes
AttendanceRecordSchema.index({ studentId: 1, courseCode: 1, createdAt: -1 });
AttendanceRecordSchema.index({ studentCode: 1, courseCode: 1 });
AttendanceRecordSchema.index({ sessionId: 1, status: 1 });
AttendanceRecordSchema.index({ courseCode: 1, createdAt: -1 });
