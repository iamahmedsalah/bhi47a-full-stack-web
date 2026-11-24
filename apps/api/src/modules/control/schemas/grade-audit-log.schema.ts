import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type GradeAuditLogDocument = GradeAuditLog & Document;

export const GRADE_AUDIT_ACTIONS = [
  'CREATE',
  'UPDATE',
  'CLEAR',
  'LOCK',
  'UNLOCK',
  'SCHEME_CHANGE',
  'SUBMIT',
  'SUBMIT_APPROVAL',
  'APPROVE',
  'RETURN',
  'REOPEN',
  'PUBLISH',
  'HIDE',
  'GRACE',
  'PETITION_APPROVE',
  'PETITION_REJECT',
  'PARTIAL_OPEN',
  'PARTIAL_SUBMIT',
  'PARTIAL_RETURN',
  'PARTIAL_APPROVE',
  'PARTIAL_CLOSE',
] as const;
export type GradeAuditAction = (typeof GRADE_AUDIT_ACTIONS)[number];

export const GRADE_AUDIT_SOURCES = ['GRID', 'XLSX', 'SYSTEM'] as const;
export type GradeAuditSource = (typeof GRADE_AUDIT_SOURCES)[number];

export interface GradeAuditSnapshot {
  attendanceMark?: number | null;
  quizzesMark?: number | null;
  score: number | null;
  status: string | null;
  isPublished?: boolean | null;
  rev?: number | null;
}

/**
 * Append-only: the application only ever inserts and reads these rows, it never
 * updates or deletes them.
 */
@Schema({ collection: 'grade_audit_logs', timestamps: false })
export class GradeAuditLog {
  @Prop({ type: Types.ObjectId, ref: 'ControlSheet' })
  sheetId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Grade' })
  gradeId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  studentId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  courseId!: Types.ObjectId;

  @Prop({ required: true })
  academicYear!: string;

  @Prop({ required: true })
  semester!: string;

  @Prop({ required: true })
  component!: string;

  @Prop({ type: String, required: true, enum: GRADE_AUDIT_ACTIONS })
  action!: GradeAuditAction;

  @Prop({ type: String, required: true, enum: GRADE_AUDIT_SOURCES })
  source!: GradeAuditSource;

  @Prop({ type: Object })
  oldValue?: GradeAuditSnapshot | Record<string, unknown> | null;

  @Prop({ type: Object })
  newValue?: GradeAuditSnapshot | Record<string, unknown> | null;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  actorId!: Types.ObjectId;

  @Prop({ type: String, maxlength: 500 })
  reason?: string;

  @Prop({ type: String })
  payloadHash?: string;

  /** Client-generated id that makes a retried edit idempotent. */
  @Prop({ type: String })
  opId?: string;

  @Prop({ type: Date, required: true, default: () => new Date() })
  at!: Date;
}

export const GradeAuditLogSchema = SchemaFactory.createForClass(GradeAuditLog);

GradeAuditLogSchema.index({ sheetId: 1, at: -1 });
GradeAuditLogSchema.index({ courseId: 1, studentId: 1, at: -1 });
GradeAuditLogSchema.index({ opId: 1 }, { unique: true, sparse: true });
