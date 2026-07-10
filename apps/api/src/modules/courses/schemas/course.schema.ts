import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import {
  COURSE_LEVEL_VALUES,
  SEMESTER_VALUES,
  type CourseLevel,
  type Semester,
} from '@student-portal/shared';

export type CourseDocument = Course & Document;

@Schema({
  collection: 'courses',
  timestamps: true,
})
export class Course {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, unique: true })
  code!: string;

  @Prop({ type: String, required: true, enum: COURSE_LEVEL_VALUES })
  level!: CourseLevel;

  @Prop({ type: String, required: true, enum: COURSE_LEVEL_VALUES })
  academicLevel!: CourseLevel;

  @Prop({ type: String, required: true, enum: SEMESTER_VALUES })
  semester!: Semester;

  @Prop()
  department?: string;

  @Prop()
  creditHours?: number;

  @Prop({ type: [String], default: [] })
  prerequisites!: string[];

  @Prop({ required: true, enum: ['required', 'elective'], default: 'required' })
  type!: 'required' | 'elective';

  @Prop({ default: true })
  isActive!: boolean;
}

export const CourseSchema = SchemaFactory.createForClass(Course);

// Indexes
CourseSchema.index({ name: 'text' });
CourseSchema.index({ level: 1 });
CourseSchema.index({ academicLevel: 1, semester: 1 });
CourseSchema.index({ isActive: 1 });
