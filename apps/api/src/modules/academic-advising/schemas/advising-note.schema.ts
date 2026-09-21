import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  NOTE_VISIBILITIES,
  type AdvisingNoteVisibility,
} from '../constants/advising.constants';
export type AdvisingNoteDocument = HydratedDocument<AdvisingNote>;
@Schema({ collection: 'advising_notes', timestamps: true })
export class AdvisingNote {
  @Prop({ type: Types.ObjectId, ref: 'AdvisingCase', required: true })
  advisingCaseId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  authorId!: Types.ObjectId;
  @Prop({ type: String, enum: NOTE_VISIBILITIES, required: true })
  visibility!: AdvisingNoteVisibility;
  @Prop({ required: true, trim: true, maxlength: 4000 }) content!: string;
  @Prop({ type: Types.ObjectId, ref: 'Course' })
  relatedCourseId?: Types.ObjectId;
  @Prop({ maxlength: 100 }) relatedNodeId?: string;
}
export const AdvisingNoteSchema = SchemaFactory.createForClass(AdvisingNote);
AdvisingNoteSchema.index({ advisingCaseId: 1, createdAt: -1 });
