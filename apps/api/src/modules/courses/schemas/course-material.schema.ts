import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  COURSE_MATERIAL_TYPE_VALUES,
  type CourseMaterialType,
  type MaterialFileReference,
} from '@student-portal/shared';

export type CourseMaterialDocument = CourseMaterial & Document;

@Schema({
  collection: 'course_materials',
  timestamps: true,
})
export class CourseMaterial {
  @Prop({ type: Types.ObjectId, ref: 'Course', required: true, index: true })
  courseId!: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    enum: COURSE_MATERIAL_TYPE_VALUES,
    index: true,
  })
  type!: CourseMaterialType; // 'lecture' | 'section'

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ trim: true })
  titleAr?: string;

  @Prop({ required: true, trim: true })
  fileUrl!: string;

  @Prop({ type: Object })
  storedFile?: MaterialFileReference;

  @Prop({ required: true, trim: true })
  fileName!: string;

  @Prop({ type: Number })
  fileSize?: number;

  @Prop({ trim: true })
  mimeType?: string;

  @Prop({ type: Number, min: 1, max: 20 })
  weekNumber?: number;

  @Prop({ trim: true, maxlength: 1000 })
  description?: string;

  @Prop({ type: Boolean, default: true })
  isPublished!: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  uploadedBy!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  uploadedByName!: string;

  @Prop({
    type: String,
    required: true,
    enum: ['doctor', 'teaching_assistant', 'admin'],
  })
  uploadedByRole!: 'doctor' | 'teaching_assistant' | 'admin';
}

export const CourseMaterialSchema =
  SchemaFactory.createForClass(CourseMaterial);

CourseMaterialSchema.index({ courseId: 1, type: 1, createdAt: -1 });
CourseMaterialSchema.index({ courseId: 1, isPublished: 1, weekNumber: 1 });
