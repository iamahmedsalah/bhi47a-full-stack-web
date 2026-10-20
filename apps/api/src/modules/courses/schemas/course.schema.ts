import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  COURSE_LEVEL_VALUES,
  SEMESTER_VALUES,
  type CourseLevel,
  type Semester,
} from '@student-portal/shared';

export type CourseDocument = Course & Document;

export type CourseCurriculumDepartment = 'GENERAL' | 'BIS' | 'ACCOUNTING';

export interface CourseCurriculum {
  department: CourseCurriculumDepartment;
  academicLevel: CourseLevel;
  semester: Semester;
  type: Course['type'];
}

@Schema({
  collection: 'courses',
  timestamps: true,
})
export class Course {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  nameAr!: string;

  @Prop({ required: true })
  nameEn!: string;

  @Prop({ required: true, unique: true })
  code!: string;

  @Prop({ type: String, required: true, enum: COURSE_LEVEL_VALUES })
  level!: CourseLevel;

  @Prop({ type: String, required: true, enum: COURSE_LEVEL_VALUES })
  academicLevel!: CourseLevel;

  @Prop({ type: String, required: true, enum: SEMESTER_VALUES })
  semester!: Semester;

  @Prop({
    type: [
      {
        department: {
          type: String,
          required: true,
          enum: ['GENERAL', 'BIS', 'ACCOUNTING'],
        },
        academicLevel: {
          type: String,
          required: true,
          enum: COURSE_LEVEL_VALUES,
        },
        semester: { type: String, required: true, enum: SEMESTER_VALUES },
        type: { type: String, required: true },
      },
    ],
    default: undefined,
  })
  curricula?: CourseCurriculum[];

  @Prop({ trim: true, maxlength: 2000 })
  description?: string;

  @Prop()
  department?: string;

  @Prop({ min: 0 })
  creditHours?: number;

  @Prop({ type: Number, min: 1, max: 8 })
  recommendedSemester?: number;

  @Prop({ type: [String], default: [] })
  prerequisites!: string[];

  @Prop({ type: [String], default: [] })
  coRequisites!: string[];

  @Prop({ type: [String], default: [] })
  equivalentCourses!: string[];

  @Prop({ type: [String], enum: SEMESTER_VALUES, default: [] })
  offeredTerms!: Semester[];

  @Prop({
    required: true,
    enum: [
      'required',
      'elective',
      'university_req',
      'institute_req',
      'specialization_req',
    ],
    default: 'required',
  })
  type!:
    | 'required'
    | 'elective'
    | 'university_req'
    | 'institute_req'
    | 'specialization_req';

  @Prop({ type: Number, min: 0, max: 4 })
  minimumGpa?: number;

  @Prop({ type: Number, default: 0, min: 0 })
  registrationPriority!: number;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ trim: true })
  syllabusPdfUrl?: string;

  @Prop({ trim: true })
  syllabusPdfName?: string;

  @Prop({ select: false })
  syllabusPdfData?: string;

  @Prop({ type: Date })
  syllabusUpdatedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  doctorId?: Types.ObjectId;

  @Prop({ trim: true })
  doctorName?: string;

  @Prop({ trim: true })
  doctorNameAr?: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  teachingAssistantIds!: Types.ObjectId[];

  @Prop({
    type: [
      {
        _id: { type: Types.ObjectId, ref: 'User' },
        name: { type: String, trim: true },
        nameAr: { type: String, trim: true },
      },
    ],
    default: [],
  })
  teachingAssistants!: Array<{
    _id: Types.ObjectId;
    name: string;
    nameAr?: string;
  }>;

  @Prop({ trim: true })
  coverImageUrl?: string;
}

export const CourseSchema = SchemaFactory.createForClass(Course);

// Indexes
CourseSchema.index({
  name: 'text',
  nameAr: 'text',
  nameEn: 'text',
  code: 'text',
});
CourseSchema.index({ level: 1 });
CourseSchema.index({ academicLevel: 1, semester: 1 });
CourseSchema.index({ level: 1, code: 1 });
CourseSchema.index({ level: 1, semester: 1, code: 1 });
CourseSchema.index({ isActive: 1, code: 1 });
CourseSchema.index({ code: 1, isActive: 1 });
CourseSchema.index({ isActive: 1, level: 1 });
CourseSchema.index({ isActive: 1, level: 1, code: 1 });
CourseSchema.index({ doctorId: 1 });
CourseSchema.index({ teachingAssistantIds: 1 });
