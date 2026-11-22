import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RagChunkDocument = RagChunk & Document;

@Schema({
  collection: 'rag_chunks',
  timestamps: true,
})
export class RagChunk {
  @Prop({
    type: Types.ObjectId,
    ref: 'RagDocument',
    required: true,
    index: true,
  })
  documentId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Course', required: true, index: true })
  courseId!: Types.ObjectId;

  @Prop({ required: true, trim: true, uppercase: true, index: true })
  courseCode!: string;

  @Prop({ required: true, trim: true, index: true })
  sha256!: string;

  @Prop({ required: true, min: 1 })
  pageNumber!: number;

  @Prop({ required: true, min: 0 })
  chunkIndex!: number;

  @Prop({ required: true })
  text!: string;

  @Prop({ required: true })
  normalizedText!: string;

  @Prop({ type: [String], default: [], index: true })
  terms!: string[];

  @Prop({ default: 0, min: 0 })
  tokenEstimate!: number;

  @Prop({ type: [Number], default: [] })
  embedding!: number[];

  @Prop({ required: true, trim: true })
  embeddingModel!: string;

  @Prop({ required: true, min: 1 })
  embeddingDimensions!: number;

  @Prop({ default: false, index: true })
  isActive!: boolean;
}

export const RagChunkSchema = SchemaFactory.createForClass(RagChunk);
RagChunkSchema.index({ courseId: 1, sha256: 1, isActive: 1 });
RagChunkSchema.index({ documentId: 1, chunkIndex: 1 }, { unique: true });
