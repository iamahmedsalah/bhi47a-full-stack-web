import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChatSessionDocument = ChatSession & Document;

@Schema({ timestamps: true })
export class ChatMessage {
  @Prop({ type: String, required: true, enum: ['user', 'model', 'system'] })
  role!: 'user' | 'model' | 'system';

  @Prop({ required: true })
  content!: string;

  @Prop({ default: Date.now })
  timestamp!: Date;
}

@Schema({ timestamps: true })
export class ChatSession {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    enum: ['student-faq', 'student-academic', 'admin-advising'],
  })
  sessionType!: string;

  @Prop({ type: [ChatMessage], default: [] })
  messages!: ChatMessage[];

  @Prop({ default: true })
  isActive!: boolean;

  @Prop()
  lastMessageAt?: Date;

  @Prop({ default: 0 })
  totalTokens!: number;
}

export const ChatSessionSchema = SchemaFactory.createForClass(ChatSession);
ChatSessionSchema.index({ userId: 1, sessionType: 1, isActive: 1 });
ChatSessionSchema.index({ lastMessageAt: -1 });
