import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  ATTENDANCE_SESSION_STATUS_VALUES,
  ATTENDANCE_SESSION_TYPE_VALUES,
  STAFF_ACADEMIC_POSITION_VALUES,
  ATTENDANCE_CONFIG_DEFAULTS,
  type AttendanceSessionStatus,
  type AttendanceSessionType,
  type StaffAcademicPosition,
} from '@student-portal/shared';

export type AttendanceSessionDocument = AttendanceSession & Document;

@Schema({
  collection: 'attendance_sessions',
  timestamps: true,
})
export class AttendanceSession {
  @Prop({ required: true, uppercase: true, trim: true })
  courseCode!: string;

  @Prop({ trim: true })
  courseName?: string;

  @Prop({
    type: String,
    required: true,
    enum: ATTENDANCE_SESSION_TYPE_VALUES,
    default: 'lecture',
  })
  sessionType!: AttendanceSessionType;

  @Prop({ required: true, trim: true })
  level!: string;

  @Prop({ trim: true })
  group?: string;

  @Prop({ trim: true })
  section?: string;

  @Prop({ required: true, default: '2026-2027' })
  academicYear!: string;

  @Prop({ required: true, default: 'first' })
  semester!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  createdByName!: string;

  @Prop({
    type: String,
    required: true,
    enum: STAFF_ACADEMIC_POSITION_VALUES,
    default: 'doctor',
  })
  academicPosition!: StaffAcademicPosition;

  @Prop({
    type: String,
    required: true,
    enum: ATTENDANCE_SESSION_STATUS_VALUES,
    default: 'OPEN',
  })
  status!: AttendanceSessionStatus;

  @Prop({ required: true })
  startsAt!: Date;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop()
  closedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  closedBy?: Types.ObjectId;

  /**
   * Cryptographic secret key used to compute and verify TOTP/HMAC rotating QR tokens.
   * Marked select: false so it is never exposed in queries or JSON payloads by default.
   */
  @Prop({ required: true, select: false })
  sessionSecret!: string;

  @Prop({
    required: true,
    default: ATTENDANCE_CONFIG_DEFAULTS.LATE_AFTER_MINUTES,
    min: 1,
    max: 120,
  })
  lateThresholdMinutes!: number;

  @Prop({
    required: true,
    default: ATTENDANCE_CONFIG_DEFAULTS.SESSION_DURATION_MINUTES,
    min: 1,
    max: 240,
  })
  sessionDurationMinutes!: number;

  @Prop({
    required: true,
    default: ATTENDANCE_CONFIG_DEFAULTS.QR_ROTATION_SECONDS,
    min: 10,
    max: 120,
  })
  qrRotationSeconds!: number;

  /**
   * Optional geofencing configuration to ensure students check in within physical range of the lecture hall.
   */
  @Prop({
    type: {
      latitude: { type: Number },
      longitude: { type: Number },
      radiusMeters: { type: Number, default: 100 },
      venueName: { type: String, trim: true },
    },
    _id: false,
  })
  location?: {
    latitude: number;
    longitude: number;
    radiusMeters: number;
    venueName?: string;
  };
}

export const AttendanceSessionSchema =
  SchemaFactory.createForClass(AttendanceSession);

// Indexes
AttendanceSessionSchema.index({ courseCode: 1, status: 1 });
AttendanceSessionSchema.index({ createdBy: 1, createdAt: -1 });
AttendanceSessionSchema.index({ status: 1, expiresAt: 1 });
AttendanceSessionSchema.index({ academicYear: 1, semester: 1, level: 1 });
AttendanceSessionSchema.index({ startsAt: -1, _id: -1 });
AttendanceSessionSchema.index({ courseCode: 1, startsAt: -1 });
AttendanceSessionSchema.index({ doctorId: 1, startsAt: -1 });
