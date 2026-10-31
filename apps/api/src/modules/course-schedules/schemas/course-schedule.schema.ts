import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CourseScheduleDocument = CourseSchedule & Document;

export type ScheduleSlotType = 'lecture' | 'section' | 'lab';
export type DayOfWeek =
  'saturday' | 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday';

@Schema({
  collection: 'course_schedules',
  timestamps: true,
})
export class CourseSchedule {
  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  courseId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  courseCode!: string;

  @Prop({ required: true, trim: true })
  courseName!: string;

  @Prop({ trim: true })
  courseNameAr?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  staffId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  staffName!: string;

  @Prop({ trim: true })
  staffNameAr?: string;

  @Prop({
    type: String,
    enum: ['doctor', 'teaching_assistant', 'assistant_lecturer'],
    default: 'doctor',
  })
  staffType!: 'doctor' | 'teaching_assistant' | 'assistant_lecturer';

  @Prop({
    type: String,
    enum: ['lecture', 'section', 'lab'],
    default: 'lecture',
  })
  type!: ScheduleSlotType;

  @Prop({
    type: String,
    enum: ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday'],
    required: true,
  })
  dayOfWeek!: DayOfWeek;

  @Prop({ required: true, trim: true })
  startTime!: string; // e.g. "09:00" or "09:00 AM"

  @Prop({ required: true, trim: true })
  endTime!: string; // e.g. "11:00" or "11:00 AM"

  @Prop({ required: true, trim: true })
  location!: string; // e.g. "مدرج 1" or "قاعة 204" / "Hall A"

  @Prop({ trim: true })
  locationAr?: string;

  @Prop({ type: String, default: '1' })
  level!: string; // e.g. "1", "2", "3", "4"

  @Prop({
    type: String,
    enum: ['first', 'second', 'summer'],
    default: 'first',
  })
  semester!: string;

  @Prop({ type: String, default: 'GENERAL' })
  department!: string; // 'GENERAL' | 'BIS' | 'ACCOUNTING'

  @Prop({ trim: true })
  group?: string; // e.g. "مجموعة أ" or "الفرقة الأولى"

  @Prop({ trim: true })
  section?: string; // e.g. "سكشن 1"

  @Prop({ trim: true })
  notes?: string;

  @Prop({ default: true })
  isActive!: boolean;
}

export const CourseScheduleSchema =
  SchemaFactory.createForClass(CourseSchedule);

CourseScheduleSchema.index({ staffId: 1, dayOfWeek: 1 });
CourseScheduleSchema.index({ courseId: 1 });
CourseScheduleSchema.index({ level: 1, department: 1 });
