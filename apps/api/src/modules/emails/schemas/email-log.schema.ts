import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EmailLogDocument = EmailLog & Document;

@Schema({
  collection: 'email_logs',
  timestamps: true,
})
export class EmailLog {
  @Prop({ type: [String], required: true })
  to!: string[];

  @Prop({ required: true })
  subject!: string;

  @Prop()
  text?: string;

  @Prop()
  html?: string;

  @Prop({ required: true, default: 'manual' })
  event!: string;

  @Prop({
    type: String,
    enum: ['pending', 'queued', 'sent', 'failed', 'skipped'],
    default: 'pending',
  })
  status!: 'pending' | 'queued' | 'sent' | 'failed' | 'skipped';

  @Prop()
  providerId?: string;

  @Prop()
  error?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  requestedBy?: Types.ObjectId;

  @Prop()
  queuedAt?: Date;

  @Prop()
  sentAt?: Date;
}

export const EmailLogSchema = SchemaFactory.createForClass(EmailLog);

EmailLogSchema.index({ event: 1 });
EmailLogSchema.index({ status: 1 });
EmailLogSchema.index({ createdAt: -1 });
