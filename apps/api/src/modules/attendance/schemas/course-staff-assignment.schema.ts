import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  STAFF_ACADEMIC_POSITION_VALUES,
  type StaffAcademicPosition,
} from '@student-portal/shared';

export type CourseStaffAssignmentDocument = CourseStaffAssignment & Document;

@Schema({
  collection: 'course_staff_assignments',
  timestamps: true,
})
export class CourseStaffAssignment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  staffId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  staffName!: string;

  @Prop({ trim: true })
  staffUserCode?: string;

  @Prop({ required: true, uppercase: true, trim: true })
  courseCode!: string;

  @Prop({ required: true, trim: true })
  courseName!: string;

  @Prop({
    type: String,
    required: true,
    enum: STAFF_ACADEMIC_POSITION_VALUES,
    default: 'doctor',
  })
  academicPosition!: StaffAcademicPosition;

  @Prop({ required: true, default: '2026-2027' })
  academicYear!: string;

  @Prop({ required: true, default: 'first' })
  semester!: string;

  @Prop({ type: [String], default: [] })
  groups!: string[];

  @Prop({ type: [String], default: [] })
  sections!: string[];

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  assignedBy?: Types.ObjectId;
}

export const CourseStaffAssignmentSchema = SchemaFactory.createForClass(
  CourseStaffAssignment,
);

// Compound Unique Constraint: One assignment per staff, course, academic role, year, and semester
CourseStaffAssignmentSchema.index(
  {
    staffId: 1,
    courseCode: 1,
    academicPosition: 1,
    academicYear: 1,
    semester: 1,
  },
  { unique: true },
);

// Lookup indexes
CourseStaffAssignmentSchema.index({ staffId: 1, isActive: 1 });
CourseStaffAssignmentSchema.index({
  courseCode: 1,
  academicYear: 1,
  semester: 1,
});
