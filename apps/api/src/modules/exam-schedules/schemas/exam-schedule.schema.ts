import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import {
  EXAM_TYPE_VALUES,
  type ExamType,
  SEMESTER_VALUES,
  type Semester,
} from '@student-portal/shared';

export type ExamScheduleDocument = ExamSchedule & Document;

@Schema({
  collection: 'exam_schedules',
  timestamps: true,
})
export class ExamSchedule {
  @Prop({ required: true })
  title!: string;

  @Prop({ type: String, required: true, enum: EXAM_TYPE_VALUES })
  examType!: ExamType;

  @Prop({ required: true })
  academicYear!: string;

  @Prop({ type: String, required: true, enum: SEMESTER_VALUES })
  semester!: Semester;

  @Prop({ required: true })
  fileUrl!: string; // URL to the schedule image or PDF

  @Prop({ default: true })
  isPublished!: boolean;
}

export const ExamScheduleSchema = SchemaFactory.createForClass(ExamSchedule);

ExamScheduleSchema.index({ examType: 1 });
ExamScheduleSchema.index({ isPublished: 1 });
