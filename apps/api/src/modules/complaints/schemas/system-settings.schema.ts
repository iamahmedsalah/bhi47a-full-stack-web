import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  EXAM_TYPE_VALUES,
  type ExamType,
  type GradeVisibilityRule,
} from '@student-portal/shared';

export type SystemSettingsDocument = SystemSettings & Document;

@Schema({
  collection: 'system_settings',
  timestamps: true,
})
export class SystemSettings {
  // Populated by Mongoose timestamps, used to refresh an already-open results page.
  updatedAt?: Date;
  @Prop({ required: true, default: true })
  complaintsSystemOpen!: boolean;

  @Prop({ type: [String], default: [] })
  blacklistedStudentCodes!: string[];

  @Prop()
  complaintOpenAt?: Date;

  @Prop()
  complaintCloseAt?: Date;

  @Prop({ type: Number, default: 3 })
  complaintDailyLimit?: number;

  @Prop({
    type: Object,
    default: {},
  })
  departmentStaffAssignments?: Record<
    string,
    { staffId: string; staffName: string }
  >;

  @Prop({ default: true })
  gradesSystemOpen?: boolean;

  @Prop()
  gradesOpenAt?: Date;

  @Prop()
  gradesCloseAt?: Date;

  @Prop({ type: [String], default: ['1', '2', '3', '4'] })
  gradesPublishedLevels?: string[];

  @Prop({ type: String, enum: ['student', 'course'], default: 'course' })
  gradesLevelBasis?: 'student' | 'course';

  @Prop({ type: [String], default: [...EXAM_TYPE_VALUES] })
  gradesPublishedExamTypes?: ExamType[];

  @Prop({
    type: [
      {
        courseCode: String,
        studentCode: String,
        examType: String,
        isVisible: Boolean,
        _id: false,
      },
    ],
    default: [],
  })
  gradesVisibilityRules?: GradeVisibilityRule[];

  @Prop({ default: true })
  registrationVisible?: boolean;

  @Prop({ default: true })
  syllabiVisible?: boolean;

  @Prop({ default: false })
  studentLoginMaintenance?: boolean;

  @Prop({ type: Date, default: null })
  studentLoginMaintenanceEta?: Date | null;

  @Prop({ type: String, trim: true, maxlength: 400, default: null })
  studentLoginMaintenanceMessage?: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;
}

export const SystemSettingsSchema =
  SchemaFactory.createForClass(SystemSettings);
