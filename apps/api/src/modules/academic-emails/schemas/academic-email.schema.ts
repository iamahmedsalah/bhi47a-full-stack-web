import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AcademicEmailDocument = AcademicEmail & Document;

@Schema({
  collection: 'academic_emails',
  timestamps: true,
})
export class AcademicEmail {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  studentId!: Types.ObjectId;

  @Prop({ required: true, unique: true })
  studentCode!: string;

  @Prop({ required: true })
  studentName!: string;

  @Prop({ required: true, unique: true })
  academicEmail!: string;

  @Prop({ type: String, required: true, enum: ['active', 'inactive'], default: 'active' })
  status!: 'active' | 'inactive';

  @Prop({ type: Types.ObjectId, ref: 'User' })
  lastUpdatedBy?: Types.ObjectId;
}

export const AcademicEmailSchema = SchemaFactory.createForClass(AcademicEmail);

AcademicEmailSchema.index({ studentId: 1 }, { unique: true });
AcademicEmailSchema.index({ status: 1 });
AcademicEmailSchema.index({ studentName: 'text' });
