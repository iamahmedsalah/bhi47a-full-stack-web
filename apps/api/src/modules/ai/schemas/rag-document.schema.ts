import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RagDocumentStatus =
  'pending' | 'processing' | 'ready' | 'failed' | 'archived';

export type RagDocumentFailureCode =
  | 'CORRUPT_PDF'
  | 'ENCRYPTED_PDF'
  | 'EMPTY_PDF'
  | 'SCANNED_PDF_NO_TEXT'
  | 'EMBEDDING_FAILED'
  | 'STORAGE_READ_FAILED';

export type RagDocumentRecord = RagDocument & Document;

@Schema({
  collection: 'rag_documents',
  timestamps: true,
})
export class RagDocument {
  @Prop({ type: Types.ObjectId, ref: 'Course', required: true, index: true })
  courseId!: Types.ObjectId;

  @Prop({ required: true, trim: true, uppercase: true, index: true })
  courseCode!: string;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ trim: true })
  titleAr?: string;

  @Prop({ trim: true })
  titleEn?: string;

  @Prop({ required: true, trim: true })
  fileName!: string;

  @Prop({ required: true, trim: true })
  storageKey!: string;

  @Prop({ required: true, trim: true, index: true })
  sha256!: string;

  @Prop({
    type: String,
    required: true,
    enum: ['pending', 'processing', 'ready', 'failed', 'archived'],
    default: 'pending',
    index: true,
  })
  status!: RagDocumentStatus;

  @Prop({
    type: String,
    enum: [
      'CORRUPT_PDF',
      'ENCRYPTED_PDF',
      'EMPTY_PDF',
      'SCANNED_PDF_NO_TEXT',
      'EMBEDDING_FAILED',
      'STORAGE_READ_FAILED',
    ],
  })
  failureCode?: RagDocumentFailureCode;

  @Prop({ default: 0, min: 0 })
  pageCount!: number;

  @Prop({ default: 0, min: 0 })
  chunkCount!: number;

  @Prop({ trim: true })
  embeddingModel?: string;

  @Prop({ min: 0 })
  embeddingDimensions?: number;

  @Prop({ default: false })
  ocrUsed!: boolean;

  @Prop({ type: Date })
  ingestedAt?: Date;
}

export const RagDocumentSchema = SchemaFactory.createForClass(RagDocument);
RagDocumentSchema.index({ courseId: 1, sha256: 1 }, { unique: true });
RagDocumentSchema.index({ courseId: 1, status: 1 });
