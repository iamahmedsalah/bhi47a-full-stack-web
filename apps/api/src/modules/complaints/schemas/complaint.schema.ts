import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ComplaintDocument = Complaint & Document;

@Schema()
class ReplyEntry {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  senderId!: Types.ObjectId;

  @Prop({ required: true })
  senderName!: string;

  @Prop({ type: String, required: true, enum: ['admin', 'staff', 'student'] })
  senderRole!: 'admin' | 'staff' | 'student';

  @Prop({ required: true })
  message!: string;

  @Prop({ default: Date.now })
  createdAt!: Date;
}

const ReplyEntrySchema = SchemaFactory.createForClass(ReplyEntry);

// Persisted with the reply so delivery can recover after a process restart.
@Schema()
export class ReplyEmailEvent {
  @Prop({ required: true })
  eventKey!: string;
  @Prop({ required: true })
  to!: string;
  @Prop({ type: String, enum: ['ar', 'en'], required: true })
  lang!: 'ar' | 'en';
  @Prop({
    type: String,
    enum: ['pending', 'processing', 'sent', 'failed'],
    default: 'pending',
  })
  status!: 'pending' | 'processing' | 'sent' | 'failed';
  @Prop({ default: 0 })
  attempts!: number;
  @Prop({ default: Date.now })
  createdAt!: Date;
  @Prop({ default: Date.now })
  nextAttemptAt!: Date;
  @Prop()
  leaseId?: string;
  @Prop()
  leaseUntil?: Date;
}
const ReplyEmailEventSchema = SchemaFactory.createForClass(ReplyEmailEvent);

@Schema()
class InternalNoteEntry {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  authorId!: Types.ObjectId;

  @Prop({ required: true })
  authorName!: string;

  @Prop({ required: true })
  message!: string;

  @Prop({ default: Date.now })
  createdAt!: Date;
}

const InternalNoteEntrySchema = SchemaFactory.createForClass(InternalNoteEntry);

@Schema()
class StatusHistoryEntry {
  @Prop({ required: true })
  fromStatus!: string;

  @Prop({ required: true })
  toStatus!: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  changedBy?: Types.ObjectId;

  @Prop()
  changedByName?: string;

  @Prop({ default: Date.now })
  changedAt!: Date;
}

const StatusHistoryEntrySchema =
  SchemaFactory.createForClass(StatusHistoryEntry);

@Schema({
  collection: 'complaints',
  timestamps: true,
})
export class Complaint {
  @Prop({ required: true, unique: true })
  ticketNumber!: string; // e.g. TKT-YYYYMMDD-XXXX

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  studentId!: Types.ObjectId;

  @Prop({ required: true })
  studentCode!: string;

  @Prop({ required: true })
  studentName!: string;

  @Prop()
  requesterName?: string;

  @Prop()
  contactPhone?: string;

  @Prop()
  contactEmail?: string;

  @Prop({ type: String, enum: ['ar', 'en'] })
  notificationLocale?: 'ar' | 'en';

  @Prop({ type: [ReplyEmailEventSchema], default: [], select: false })
  replyEmailEvents!: ReplyEmailEvent[];

  @Prop()
  nationalId?: string;

  @Prop()
  nationalIdMasked?: string;

  @Prop()
  screenshotUrl?: string;

  @Prop({
    type: String,
    required: true,
    enum: [
      'complaint',
      'technical_issue',
      'academic',
      'financial',
      'facility',
      'other',
    ],
    default: 'other',
  })
  type!:
    | 'complaint'
    | 'technical_issue'
    | 'academic'
    | 'financial'
    | 'facility'
    | 'other';

  @Prop({
    type: String,
    enum: [
      'student_affairs',
      'technical_support',
      'finance',
      'control',
      'academic_advising',
    ],
  })
  department?:
    | 'student_affairs'
    | 'technical_support'
    | 'finance'
    | 'control'
    | 'academic_advising';

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  description!: string;

  @Prop({
    type: String,
    required: true,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
  })
  priority!: 'low' | 'medium' | 'high' | 'urgent';

  @Prop({
    type: String,
    required: true,
    enum: ['open', 'in_review', 'in_progress', 'resolved', 'closed'],
    default: 'open',
  })
  status!: 'open' | 'in_review' | 'in_progress' | 'resolved' | 'closed';

  @Prop()
  assignedGroup?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  assignedStaffId?: Types.ObjectId;

  @Prop()
  assignedStaffName?: string;

  @Prop({ type: [ReplyEntrySchema], default: [] })
  replies!: ReplyEntry[];

  @Prop({ type: [InternalNoteEntrySchema], default: [] })
  internalNotes!: InternalNoteEntry[];

  @Prop({ type: [StatusHistoryEntrySchema], default: [] })
  statusHistory!: StatusHistoryEntry[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const ComplaintSchema = SchemaFactory.createForClass(Complaint);

// Internal delivery state must not be included in complaint API responses.
for (const output of ['toJSON', 'toObject'] as const) {
  ComplaintSchema.set(output, {
    transform: (_document, value) => {
      Reflect.deleteProperty(value, 'replyEmailEvents');
      return value;
    },
  });
}

// Supports the default paginated admin list without a blocking in-memory sort.
ComplaintSchema.index({ createdAt: -1, _id: -1 });
ComplaintSchema.index({ status: 1 });
ComplaintSchema.index({ status: 1, createdAt: -1 });
ComplaintSchema.index({ priority: 1 });
ComplaintSchema.index({ type: 1 });
ComplaintSchema.index({ department: 1 });
ComplaintSchema.index({ studentCode: 1 });
ComplaintSchema.index({ studentId: 1, createdAt: -1 });
ComplaintSchema.index({ assignedGroup: 1 });
ComplaintSchema.index({ assignedStaffId: 1 });
ComplaintSchema.index({ assignedStaffId: 1, status: 1 });
ComplaintSchema.index({
  'replyEmailEvents.status': 1,
  'replyEmailEvents.nextAttemptAt': 1,
});
