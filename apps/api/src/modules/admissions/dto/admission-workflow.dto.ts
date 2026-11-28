import { IntersectionType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  ADMISSION_MOBILE,
  ADMISSION_REJECTION_REASONS,
  ADMISSION_REQUEST_STATUSES,
  ADMISSION_QUEUES,
  type AdmissionQueue,
  ADMISSION_REFERENCE_PATTERN,
  ADMISSION_TRACKING_SECRET_PATTERN,
  normalizeAdmissionReference,
  normalizeAdmissionTrackingSecret,
} from '@student-portal/shared';
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class GuardianDto {
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @Matches(ADMISSION_MOBILE) phone!: string;
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  relationship!: string;
}
export class ApplicantDto {
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(160) fullName!: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  fullNameAr?: string;
  @Transform(trim) @IsString() @MinLength(5) @MaxLength(500) address!: string;
  @Matches(ADMISSION_MOBILE) phone!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => GuardianDto)
  guardians!: GuardianDto[];
  @IsIn(['NEW', 'TRANSFER']) studentType!: 'NEW' | 'TRANSFER';
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  previousInstitution?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  previousFaculty?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  transferNotes?: string;
}
export class PublicApplicantDto extends ApplicantDto {
  @Matches(/^[23]\d{13}$/) nationalId!: string;
  @IsString() @MaxLength(2000) admissionSession!: string;
  @Matches(/^[A-Za-z0-9_-]{32,64}$/) submissionKey!: string;
  @IsString() @MaxLength(2048) captchaToken!: string;
}
export class PublicAccessDto {
  @IsOptional() @IsMongoId() accessId?: string;
  @IsOptional() @Transform(trim) @Matches(/^\d{8,12}$/) pin?: string;
  @IsOptional() @Matches(/^[A-Za-z0-9_-]{43}$/) token?: string;
}
export class PublicStatusDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeAdmissionReference(value) : value,
  )
  @Matches(ADMISSION_REFERENCE_PATTERN)
  publicReference!: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeAdmissionTrackingSecret(value) : value,
  )
  @Matches(ADMISSION_TRACKING_SECRET_PATTERN)
  secret!: string;
}
export class PublicCorrectionDto extends IntersectionType(
  ApplicantDto,
  PublicStatusDto,
) {
  @IsInt() @Min(0) revision!: number;
  @IsString() @MaxLength(2048) captchaToken!: string;
}
export class AccessCreateDto {
  @IsMongoId() admissionPeriodId!: string;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) label!: string;
  @IsIn(['PIN', 'QR', 'BOTH']) method!: 'PIN' | 'QR' | 'BOTH';
  @IsOptional() @Matches(/^\d{8,12}$/) pin?: string;
  @IsDateString() expiresAt!: string;
  @IsInt() @Min(1) @Max(100000) maxRegistrations!: number;
}
export class AdmissionListDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(160) search?: string;
  @IsOptional() @IsIn(ADMISSION_REQUEST_STATUSES) status?: string;
  @IsOptional() @IsIn(ADMISSION_QUEUES) queue?: AdmissionQueue;
  @IsOptional() @Matches(/^\d{4}-\d{4}$/) academicYear?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
export class RevisionDto {
  @IsInt() @Min(0) revision!: number;
}
export class UpdateApplicantDto extends ApplicantDto {
  @IsInt() @Min(0) revision!: number;
}
export class DecisionDto extends RevisionDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) reason?: string;
  @IsOptional() @IsIn(ADMISSION_REJECTION_REASONS) reasonCode?: string;
  @IsOptional() @IsMongoId() groupId?: string;
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.confirmed)
  @Equals(true)
  confirmed!: true;
}
export class MinistryEvidenceDto {
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(160) reference!: string;
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  decisionDate!: string;
  @IsMongoId() documentId!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) notes?: string;
}

export class LifecycleTransitionDto extends DecisionDto {
  @Matches(/^[A-Za-z0-9_-]{16,64}$/) operationId!: string;
  @IsIn([
    'APPROVE_MINISTRY',
    'REJECT_MINISTRY',
    'CONFIRM_ENROLLMENT',
    'CORRECT_MINISTRY',
  ])
  transition!:
    | 'APPROVE_MINISTRY'
    | 'REJECT_MINISTRY'
    | 'CONFIRM_ENROLLMENT'
    | 'CORRECT_MINISTRY';
  @IsOptional()
  @ValidateNested()
  @Type(() => MinistryEvidenceDto)
  ministryEvidence?: MinistryEvidenceDto;
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  enrollmentEffectiveDate?: string;
}
export class ProvisionalPolicyScopeDto {
  @Matches(/^\d{4}-\d{4}$/) academicYear!: string;
  @IsIn(['first', 'second']) semester!: string;
}

export class VerifyLegacyEnrollmentDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  studentCode!: string;
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  evidenceReference!: string;
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  enrollmentEffectiveDate!: string;
  @IsOptional() @IsIn(['COORDINATION', 'TRANSFER']) admissionType?:
    'COORDINATION' | 'TRANSFER';
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.confirmed)
  @Equals(true)
  confirmed!: true;
}

export class AdmissionFollowupCompleteDto {
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(160) reference!: string;
}

export class UpdateProvisionalPolicyDto extends ProvisionalPolicyScopeDto {
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.midterm)
  @IsBoolean()
  midterm!: boolean;
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.coursework)
  @IsBoolean()
  coursework!: boolean;
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.quiz)
  @IsBoolean()
  quiz!: boolean;
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.finalExam)
  @IsBoolean()
  finalExam!: boolean;
}

export class ApproveApplicantDto extends RevisionDto {
  @IsOptional() @IsIn(['PENDING', 'APPROVED']) ministryStatus?:
    'PENDING' | 'APPROVED';
  @IsOptional()
  @ValidateNested()
  @Type(() => MinistryEvidenceDto)
  ministryEvidence?: MinistryEvidenceDto;
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  enrollmentEffectiveDate?: string;
  @IsIn(['1', '2', '3', '4']) level!: '1' | '2' | '3' | '4';
  @IsIn(['1', '2']) semester!: '1' | '2';
  @Matches(/^[A-Z][A-Z0-9_-]{1,19}$/) department!: string;
  @IsOptional() @IsMongoId() groupId?: string;
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @Matches(/^[A-Za-z0-9_-]{1,30}$/, { each: true })
  passedCourses!: string[];
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.confirmed)
  @Equals(true)
  confirmed!: true;
}
export class CreateAdmissionGroupDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80) nameAr?: string;
  @Matches(/^\d{4}-\d{4}$/) academicYear!: string;
  @IsIn(['1', '2', '3', '4']) level!: string;
  @Matches(/^[A-Z][A-Z0-9_-]{1,19}$/) department!: string;
  @IsInt() @Min(1) @Max(10000) capacity!: number;
}
export class UpdateAdmissionGroupDto extends RevisionDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80) nameAr?: string;
  @IsInt() @Min(1) @Max(10000) capacity!: number;
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.isEnabled)
  @IsBoolean()
  isEnabled!: boolean;
}
export class ConfirmAdmissionDto {
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.confirmed)
  @Equals(true)
  confirmed!: true;
}
