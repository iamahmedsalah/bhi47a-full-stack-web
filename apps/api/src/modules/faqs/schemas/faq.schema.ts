import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FaqDocument = Faq & Document;

@Schema({
  collection: 'faqs',
  timestamps: true,
})
export class Faq {
  @Prop({ required: true })
  question!: string;

  @Prop({ required: true })
  answer!: string;

  @Prop({ type: [String], default: [] })
  topics!: string[];

  @Prop({ type: [String], default: [] })
  keywords!: string[];

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ default: 0 })
  sortOrder!: number;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;
}

export const FaqSchema = SchemaFactory.createForClass(Faq);

FaqSchema.index({ question: 'text', answer: 'text', keywords: 'text' });
FaqSchema.index({ topics: 1 });
FaqSchema.index({ isActive: 1 });
FaqSchema.index({ sortOrder: 1 });
