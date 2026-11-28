import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongoSchema, Types } from 'mongoose';
import {
  ADMISSION_REQUEST_STATUSES,
  MINISTRY_STATUSES,
  OFFICIAL_ENROLLMENT_STATUSES,
  type MinistryStatus,
  type OfficialEnrollmentStatus,
  type AdmissionRequestStatus,
  type AdmissionGuardian,
  type AdmissionImportRow,
} from '@student-portal/shared';

@Schema({ _id: false })
export class AdmissionEvent {
  @Prop({ type: MongoSchema.Types.ObjectId }) actorId?: Types.ObjectId;
  @Prop({ required: true }) action!: string;
  @Prop({ required: true }) at!: Date;
  @Prop() reason?: string;
  @Prop({ required: true }) revision!: number;
  @Prop() operationId?: string;
  @Prop({ type: MongoSchema.Types.Mixed }) details?: Record<string, unknown>;
}
const EventSchema = SchemaFactory.createForClass(AdmissionEvent);
@Schema({ _id: false })
class Guardian {
  @Prop({ required: true }) name!: string;
  @Prop({ required: true }) phone!: string;
  @Prop({ required: true }) relationship!: string;
}
const GuardianSchema = SchemaFactory.createForClass(Guardian);

@Schema({ collection: 'admission_requests', timestamps: true })
export class AdmissionRequest {
  @Prop({ required: true, immutable: true }) publicReference!: string;
  @Prop({ required: true, select: false, immutable: true })
  statusSecretHash!: string;
  @Prop({ required: true, select: false }) nationalIdEncrypted!: string;
  @Prop({ required: true, select: false }) nationalIdLookup!: string;
  @Prop({ required: true }) nationalIdMasked!: string;
  @Prop({ required: true }) fullName!: string;
  @Prop() fullNameAr?: string;
  @Prop({ required: true }) address!: string;
  @Prop({ required: true }) phone!: string;
  @Prop({ type: [GuardianSchema], required: true })
  guardians!: AdmissionGuardian[];
  @Prop({ type: String, enum: ['NEW', 'TRANSFER'], required: true })
  studentType!: 'NEW' | 'TRANSFER';
  @Prop() previousInstitution?: string;
  @Prop() previousFaculty?: string;
  @Prop() transferNotes?: string;
  @Prop({ type: MongoSchema.Types.ObjectId, required: true, immutable: true })
  admissionPeriodId!: Types.ObjectId;
  @Prop({ type: MongoSchema.Types.ObjectId, required: true, immutable: true })
  admissionAccessId!: Types.ObjectId;
  @Prop({ required: true, immutable: true }) academicYear!: string;
  @Prop({ type: String, enum: ADMISSION_REQUEST_STATUSES, default: 'PENDING' })
  status!: AdmissionRequestStatus;
  @Prop({ type: String, enum: MINISTRY_STATUSES })
  ministryStatus?: MinistryStatus;
  @Prop({ type: String, enum: OFFICIAL_ENROLLMENT_STATUSES })
  officialEnrollmentStatus?: OfficialEnrollmentStatus;
  @Prop() enrollmentEffectiveDate?: string;
  @Prop() correctionInstructions?: string;
  @Prop({ default: 0 }) revision!: number;
  @Prop({ required: true, immutable: true }) submittedAt!: Date;
  @Prop() waitlistedAt?: Date;
  @Prop({ type: MongoSchema.Types.ObjectId }) studentId?: Types.ObjectId;
  @Prop() studentCode?: string;
  @Prop() formerStudentCode?: string;
  @Prop() level?: string;
  @Prop() department?: string;
  @Prop() semester?: string;
  @Prop({ type: MongoSchema.Types.ObjectId }) groupId?: Types.ObjectId;
  @Prop({ type: [String], default: [] }) passedCourses!: string[];
  @Prop({ type: MongoSchema.Types.Mixed }) rejection?: {
    reasonCode: string;
    explanation?: string;
  };
  @Prop() notes?: string;
  @Prop() deletedAt?: Date;
  @Prop({ type: MongoSchema.Types.ObjectId }) deletedBy?: Types.ObjectId;
  @Prop({ default: false }) duplicateReviewRequired!: boolean;
  @Prop({ type: [EventSchema], default: [] }) history!: AdmissionEvent[];
}
export const AdmissionRequestSchema =
  SchemaFactory.createForClass(AdmissionRequest);
AdmissionRequestSchema.index({ publicReference: 1 }, { unique: true });
AdmissionRequestSchema.index(
  { nationalIdLookup: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ['PENDING', 'WAITLISTED', 'APPROVED'] },
    },
  },
);
AdmissionRequestSchema.index(
  { studentId: 1 },
  {
    unique: true,
    partialFilterExpression: { studentId: { $type: 'objectId' } },
  },
);
AdmissionRequestSchema.index({ academicYear: 1, status: 1, submittedAt: -1 });
AdmissionRequestSchema.index({
  ministryStatus: 1,
  officialEnrollmentStatus: 1,
  academicYear: 1,
  submittedAt: -1,
});
AdmissionRequestSchema.index({
  groupId: 1,
  status: 1,
  waitlistedAt: 1,
  _id: 1,
});

@Schema({ collection: 'admission_access', timestamps: true })
export class AdmissionAccess {
  @Prop() deletedAt?: Date;
  @Prop({ required: true }) label!: string;
  @Prop({ type: MongoSchema.Types.ObjectId, required: true, immutable: true })
  admissionPeriodId!: Types.ObjectId;
  @Prop({ required: true, immutable: true }) academicYear!: string;
  @Prop({ type: String, enum: ['PIN', 'QR', 'BOTH'], required: true }) method!:
    'PIN' | 'QR' | 'BOTH';
  @Prop({ select: false }) pinHash?: string;
  @Prop({ select: false }) tokenHash?: string;
  @Prop({ select: false }) pinCipher?: string;
  @Prop({ select: false }) tokenCipher?: string;
  @Prop({ required: true }) expiresAt!: Date;
  @Prop({ required: true }) maxRegistrations!: number;
  @Prop({ default: 0 }) usedCount!: number;
  @Prop({ enum: ['ACTIVE', 'REVOKED'], default: 'ACTIVE' }) status!:
    'ACTIVE' | 'REVOKED';
  @Prop({ default: 0 }) failedAttempts!: number;
  @Prop() lockedUntil?: Date;
  @Prop({ type: MongoSchema.Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;
  @Prop({ type: [EventSchema], default: [] }) history!: AdmissionEvent[];
  createdAt!: Date;
}
export const AdmissionAccessSchema =
  SchemaFactory.createForClass(AdmissionAccess);
AdmissionAccessSchema.index({ tokenHash: 1 }, { unique: true, sparse: true });
AdmissionAccessSchema.index(
  { pinHash: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'ACTIVE', pinHash: { $type: 'string' } },
  },
);
AdmissionAccessSchema.index({ admissionPeriodId: 1, createdAt: -1 });

@Schema({ collection: 'admission_groups', timestamps: true })
export class AdmissionGroup {
  @Prop() deletedAt?: Date;
  @Prop({ required: true }) name!: string;
  @Prop() nameAr?: string;
  @Prop({ required: true, immutable: true }) academicYear!: string;
  @Prop({ required: true, immutable: true }) level!: string;
  @Prop({ required: true, immutable: true }) department!: string;
  @Prop({ required: true }) capacity!: number;
  @Prop({ default: 0 }) enrolled!: number;
  @Prop({ default: true }) isEnabled!: boolean;
  @Prop({ default: 0 }) revision!: number;
  @Prop({ type: [EventSchema], default: [] }) history!: AdmissionEvent[];
}
export const AdmissionGroupSchema =
  SchemaFactory.createForClass(AdmissionGroup);
AdmissionGroupSchema.index(
  { academicYear: 1, level: 1, department: 1, name: 1 },
  { unique: true },
);

@Schema({ collection: 'admission_import_batches', timestamps: true })
export class AdmissionImportBatch {
  @Prop({ type: MongoSchema.Types.ObjectId, required: true })
  uploadedBy!: Types.ObjectId;
  @Prop({ required: true }) fileHash!: string;
  @Prop({ required: true }) expiresAt!: Date;
  @Prop({ enum: ['PREVIEWED', 'APPLYING', 'APPLIED'], default: 'PREVIEWED' })
  status!: 'PREVIEWED' | 'APPLYING' | 'APPLIED';
  @Prop({ type: [MongoSchema.Types.Mixed], required: true })
  rows!: AdmissionImportRow[];
  @Prop() lease?: string;
  @Prop() leaseUntil?: Date;
}
export const AdmissionImportBatchSchema =
  SchemaFactory.createForClass(AdmissionImportBatch);
AdmissionImportBatchSchema.index({ uploadedBy: 1, createdAt: -1 });
AdmissionImportBatchSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 604800 },
);
