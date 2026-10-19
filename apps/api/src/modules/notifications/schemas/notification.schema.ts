import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationDocument = Notification & Document;

@Schema({
  collection: 'notifications',
  timestamps: true,
})
export class Notification {
  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  body!: string;

  @Prop({
    type: String,
    required: true,
    enum: ['all', 'level', 'student'],
    default: 'all',
  })
  targetType!: 'all' | 'level' | 'student';

  @Prop()
  targetLevel?: string; // 1, 2, 3, 4

  @Prop({ type: Types.ObjectId, ref: 'User' })
  targetStudentId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  sentBy!: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['pending', 'queued', 'sent', 'failed', 'skipped'],
    default: 'pending',
  })
  deliveryStatus!: 'pending' | 'queued' | 'sent' | 'failed' | 'skipped';

  @Prop({ default: 0 })
  pushSuccessCount!: number;

  @Prop({ default: 0 })
  pushFailureCount!: number;

  @Prop()
  pushError?: string;

  @Prop()
  queuedAt?: Date;

  @Prop()
  sentAt?: Date;

  @Prop({
    type: [
      {
        userId: { type: Types.ObjectId, ref: 'User', required: true },
        readAt: { type: Date, required: true },
      },
    ],
    default: [],
  })
  readBy!: Array<{
    userId: Types.ObjectId;
    readAt: Date;
  }>;

  @Prop({ type: Object, default: {} })
  meta?: Record<string, any>;

  @Prop({
    type: [
      {
        userId: { type: Types.ObjectId, ref: 'User', required: true },
        hiddenAt: { type: Date, required: true },
      },
    ],
    default: [],
  })
  hiddenBy!: Array<{
    userId: Types.ObjectId;
    hiddenAt: Date;
  }>;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index({ targetType: 1 });
NotificationSchema.index({ targetType: 1, createdAt: -1 });
NotificationSchema.index({ targetType: 1, targetLevel: 1, createdAt: -1 });
NotificationSchema.index({ targetStudentId: 1 });
NotificationSchema.index({ targetStudentId: 1, createdAt: -1 });
NotificationSchema.index({ targetLevel: 1 });
NotificationSchema.index({ deliveryStatus: 1, createdAt: -1 });
NotificationSchema.index({ createdAt: -1 });
NotificationSchema.index({ 'readBy.userId': 1 });
NotificationSchema.index({ 'hiddenBy.userId': 1 });
