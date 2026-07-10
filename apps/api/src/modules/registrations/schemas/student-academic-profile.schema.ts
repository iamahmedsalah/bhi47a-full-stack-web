import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  COURSE_LEVEL_VALUES,
  SEMESTER_VALUES,
  type CourseLevel,
  type Semester,
} from '@student-portal/shared';

export type StudentAcademicProfileDocument = StudentAcademicProfile & Document;

@Schema({
  collection: 'student_academic_profiles',
  timestamps: true,
})
export class StudentAcademicProfile {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  studentId!: Types.ObjectId;

  @Prop({ type: String, required: true, enum: COURSE_LEVEL_VALUES })
  academicLevel!: CourseLevel;

  @Prop({ type: String, required: true, enum: SEMESTER_VALUES })
  semester!: Semester;

  @Prop({ required: true, min: 0, max: 4 })
  gpa!: number;

  @Prop({ type: [String], default: [] })
  completedCourses!: string[];

  @Prop({ type: [String], default: [] })
  failedCourses!: string[];

  @Prop({ type: Types.ObjectId, ref: 'User' })
  advisorId?: Types.ObjectId;
}

export const StudentAcademicProfileSchema = SchemaFactory.createForClass(
  StudentAcademicProfile,
);

StudentAcademicProfileSchema.index({ advisorId: 1 });
StudentAcademicProfileSchema.index({ academicLevel: 1, semester: 1 });
