import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  Schema as MongooseSchema,
  Types,
  type HydratedDocument,
} from 'mongoose';
import {
  STUDENT_CODE_STATUSES,
  type StudentCodeStatus,
} from '@student-portal/shared';

@Schema({ _id: false })
export class CodeAssignment {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, ref: 'User' })
  studentId!: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId })
  registrationRequestId?: Types.ObjectId;
  @Prop() assignedAt?: Date;
  @Prop({ required: true }) observedAt!: Date;
  @Prop({ enum: ['admission', 'legacy'], required: true }) source!: string;
  @Prop() releasedAt?: Date;
  @Prop() releaseReason?: string;
  @Prop({ type: MongooseSchema.Types.ObjectId }) releasedBy?: Types.ObjectId;
}
const AssignmentSchema = SchemaFactory.createForClass(CodeAssignment);

@Schema({ collection: 'student_code_registry', timestamps: true })
export class StudentCodeEntry {
  @Prop({ required: true, immutable: true }) studentCode!: string;
  @Prop({ required: true, immutable: true }) academicYear!: string;
  @Prop({ required: true, immutable: true }) yearPrefix!: string;
  @Prop({ min: 1, max: 9999, required: true, immutable: true })
  sequence!: number;
  @Prop({ type: String, enum: STUDENT_CODE_STATUSES, required: true })
  status!: StudentCodeStatus;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  currentStudentId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId })
  registrationRequestId?: Types.ObjectId;
  @Prop({ type: [AssignmentSchema], default: [] })
  assignmentHistory!: CodeAssignment[];
}
export type StudentCodeEntryDocument = HydratedDocument<StudentCodeEntry>;
export const StudentCodeEntrySchema =
  SchemaFactory.createForClass(StudentCodeEntry);
StudentCodeEntrySchema.index({ studentCode: 1 }, { unique: true });
StudentCodeEntrySchema.index(
  { academicYear: 1, sequence: 1 },
  { unique: true },
);
StudentCodeEntrySchema.index(
  { currentStudentId: 1 },
  { unique: true, partialFilterExpression: { status: 'ASSIGNED' } },
);
StudentCodeEntrySchema.index(
  { registrationRequestId: 1 },
  {
    unique: true,
    partialFilterExpression: { registrationRequestId: { $type: 'objectId' } },
  },
);
StudentCodeEntrySchema.index({ academicYear: 1, status: 1, sequence: 1 });
StudentCodeEntrySchema.index({ yearPrefix: 1, studentCode: 1 });

/** The counter and immutable year mapping share one document, used as a write fence. */
@Schema({ collection: 'student_code_years', timestamps: true })
export class StudentCodeYear {
  @Prop({ required: true, immutable: true }) academicYear!: string;
  @Prop({ required: true, immutable: true }) yearPrefix!: string;
  @Prop({ required: true, min: 1, max: 10000 }) nextSequence!: number;
  @Prop({ default: 0, min: 0 }) revision!: number;
  @Prop({ required: true, immutable: true }) initializedAt!: Date;
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    required: true,
    immutable: true,
  })
  initializedBy!: Types.ObjectId;
  @Prop({ required: true, immutable: true }) initializationReason!: string;
}
export type StudentCodeYearDocument = HydratedDocument<StudentCodeYear>;
export const StudentCodeYearSchema =
  SchemaFactory.createForClass(StudentCodeYear);
StudentCodeYearSchema.index({ academicYear: 1 }, { unique: true });
StudentCodeYearSchema.index({ yearPrefix: 1 }, { unique: true });

@Schema({ collection: 'student_code_audit_logs', timestamps: false })
export class StudentCodeAuditLog {
  @Prop({ required: true, immutable: true }) studentCode!: string;
  @Prop({ required: true, immutable: true }) academicYear!: string;
  @Prop({
    enum: [
      'INITIALIZED',
      'BACKFILLED',
      'ASSIGNED',
      'RECOVERED',
      'MARKED_REVIEW',
    ],
    required: true,
    immutable: true,
  })
  action!: string;
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    required: true,
    immutable: true,
  })
  actorId!: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, immutable: true })
  studentId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, immutable: true })
  requestId?: Types.ObjectId;
  @Prop({ immutable: true }) from?: string;
  @Prop({ required: true, immutable: true }) to!: string;
  @Prop({ required: true, immutable: true }) reason!: string;
  @Prop({ required: true, immutable: true }) at!: Date;
}
export type StudentCodeAuditLogDocument = HydratedDocument<StudentCodeAuditLog>;
export const StudentCodeAuditLogSchema =
  SchemaFactory.createForClass(StudentCodeAuditLog);
StudentCodeAuditLogSchema.index({ studentCode: 1, at: -1, _id: -1 });
StudentCodeAuditLogSchema.index({ academicYear: 1, at: -1 });
