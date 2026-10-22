import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsArray,
  ArrayNotEmpty,
  Matches,
  IsDateString,
  Length,
  MaxLength,
  IsMongoId,
  IsEmail,
  IsInt,
  Min,
  Max,
  IsObject,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const COMPLAINT_TYPE_VALUES = [
  'complaint',
  'technical_issue',
  'academic',
  'financial',
  'facility',
  'other',
] as const;

export type ComplaintType = (typeof COMPLAINT_TYPE_VALUES)[number];

export const COMPLAINT_DEPARTMENT_VALUES = [
  'student_affairs',
  'technical_support',
  'finance',
  'control',
  'academic_advising',
] as const;

export type ComplaintDepartment = (typeof COMPLAINT_DEPARTMENT_VALUES)[number];

export const COMPLAINT_STATUS_VALUES = [
  'open',
  'in_review',
  'in_progress',
  'resolved',
  'closed',
] as const;

export type ComplaintStatus = (typeof COMPLAINT_STATUS_VALUES)[number];

export const COMPLAINT_PRIORITY_VALUES = [
  'low',
  'medium',
  'high',
  'urgent',
] as const;

export type ComplaintPriority = (typeof COMPLAINT_PRIORITY_VALUES)[number];

export class CreateComplaintDto {
  @ApiProperty({
    example: 'technical_issue',
    enum: COMPLAINT_TYPE_VALUES,
  })
  @IsEnum(COMPLAINT_TYPE_VALUES)
  @IsNotEmpty()
  type!: ComplaintType;

  @ApiProperty({ example: 'مشكلة في تسجيل المواد' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @Length(3, 120)
  title!: string;

  @ApiProperty({
    example:
      'لا يمكنني إتمام تسجيل مادة اللغة الانجليزية تظهر رسالة خطأ بالخادم',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @Length(10, 1500)
  description!: string;

  @ApiPropertyOptional({ example: 'medium', enum: COMPLAINT_PRIORITY_VALUES })
  @IsEnum(COMPLAINT_PRIORITY_VALUES)
  @IsOptional()
  priority?: ComplaintPriority;

  @ApiPropertyOptional({
    example: 'technical_support',
    enum: COMPLAINT_DEPARTMENT_VALUES,
  })
  @IsEnum(COMPLAINT_DEPARTMENT_VALUES)
  @IsOptional()
  department?: ComplaintDepartment;

  @ApiPropertyOptional({ example: 'data:image/png;base64,...' })
  @IsString()
  @IsOptional()
  @MaxLength(2_800_000, {
    message: 'حجم الصورة المرفقة كبير جداً (الحد الأقصى 2 ميجابايت)',
  })
  screenshotUrl?: string;

  @ApiPropertyOptional({ example: 'data:image/png;base64,...' })
  @IsString()
  @IsOptional()
  @MaxLength(2_800_000, {
    message: 'حجم الصورة المرفقة كبير جداً (الحد الأقصى 2 ميجابايت)',
  })
  screenshot?: string;
}

export class PublicCreateComplaintDto extends CreateComplaintDto {
  @ApiProperty({ example: '202310' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4,12}$/)
  studentCode!: string;

  @ApiProperty({ example: 'أحمد محمد علي' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @Length(3, 120)
  requesterName!: string;

  @ApiProperty({ example: '01012345678' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?\d{10,15}$/)
  contactPhone!: string;

  @ApiProperty({ example: '30101011234567' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{14}$/)
  nationalId!: string;

  @ApiPropertyOptional({ example: 'student@gmail.com' })
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim().toLowerCase();
    return trimmed.length ? trimmed : undefined;
  })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;
}

export class ReplyComplaintDto {
  @ApiProperty({
    example: 'تم مراجعة طلبك وتفعيل التسجيل يرجى إعادة المحاولة الآن',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @Length(2, 1000)
  message!: string;
}

export class UpdateComplaintStatusDto {
  @ApiProperty({
    example: 'in_review',
    enum: COMPLAINT_STATUS_VALUES,
  })
  @IsEnum(COMPLAINT_STATUS_VALUES)
  @IsOptional()
  status?: ComplaintStatus;

  @ApiPropertyOptional({ example: 'medium', enum: COMPLAINT_PRIORITY_VALUES })
  @IsEnum(COMPLAINT_PRIORITY_VALUES)
  @IsOptional()
  priority?: ComplaintPriority;

  @ApiPropertyOptional({ example: 'الدعم الفني' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsOptional()
  @MaxLength(80)
  assignedGroup?: string;

  @ApiPropertyOptional({
    example: 'technical_support',
    enum: COMPLAINT_DEPARTMENT_VALUES,
  })
  @IsEnum(COMPLAINT_DEPARTMENT_VALUES)
  @IsOptional()
  department?: ComplaintDepartment;

  @ApiPropertyOptional({ example: '507f1f77bcf86cd799439011' })
  @IsMongoId()
  @IsOptional()
  assignedStaffId?: string;

  @ApiPropertyOptional({
    example: 'متابعة داخلية: تم تحويل البلاغ للدعم الفني',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsOptional()
  @Length(2, 1000)
  internalNote?: string;
}

export class UpdateSystemSettingsDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  complaintsSystemOpen!: boolean;

  @ApiPropertyOptional({ example: ['20231002', '20231005'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  blacklistedStudentCodes?: string[];

  @ApiPropertyOptional({ example: '2026-07-07T09:00:00.000Z' })
  @IsDateString()
  @IsOptional()
  complaintOpenAt?: string;

  @ApiPropertyOptional({ example: '2026-07-14T17:00:00.000Z' })
  @IsDateString()
  @IsOptional()
  complaintCloseAt?: string;

  @ApiPropertyOptional({
    example: 3,
    description: 'Daily complaint limit per student in rolling 24 hours',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  complaintDailyLimit?: number;

  @ApiPropertyOptional({
    description:
      'Map of department to designated staff member { [deptKey]: { staffId, staffName } }',
  })
  @IsOptional()
  @IsObject()
  departmentStaffAssignments?: Record<
    string,
    { staffId: string; staffName: string }
  >;
}

export class QueryComplaintDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: COMPLAINT_STATUS_VALUES })
  @IsOptional()
  @IsEnum(COMPLAINT_STATUS_VALUES)
  status?: ComplaintStatus;

  @ApiPropertyOptional({ enum: COMPLAINT_TYPE_VALUES })
  @IsOptional()
  @IsEnum(COMPLAINT_TYPE_VALUES)
  type?: ComplaintType;

  @ApiPropertyOptional({ enum: COMPLAINT_PRIORITY_VALUES })
  @IsOptional()
  @IsEnum(COMPLAINT_PRIORITY_VALUES)
  priority?: ComplaintPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedGroup?: string;

  @ApiPropertyOptional({ enum: COMPLAINT_DEPARTMENT_VALUES })
  @IsOptional()
  @IsEnum(COMPLAINT_DEPARTMENT_VALUES)
  department?: ComplaintDepartment;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedStaffId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  limit?: number;
}

export class BulkDeleteComplaintsDto {
  @ApiProperty({ example: ['660...'], type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids!: string[];
}

export class PublicQueryComplaintDto {
  @ApiProperty({ example: '261354' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'كود الطالب مطلوب / Student code is required' })
  @Matches(/^\d{4,12}$/, { message: 'صيغة كود الطالب غير صحيحة' })
  studentCode!: string;

  @ApiProperty({ example: '29100000000000' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'الرقم القومي مطلوب / National ID is required' })
  @Matches(/^\d{14}$/, {
    message: 'الرقم القومي يجب أن يتكون من 14 رقماً',
  })
  nationalId!: string;

  @ApiPropertyOptional({ example: 'TKT-20261022-1234' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsOptional()
  ticketNumber?: string;
}

export class PublicReplyComplaintDto {
  @ApiProperty({ example: 'TKT-20261022-1234' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'رقم التذكرة مطلوب' })
  ticketNumber!: string;

  @ApiProperty({ example: '261354' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'كود الطالب مطلوب' })
  studentCode!: string;

  @ApiPropertyOptional({ example: '29100000000000' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsOptional()
  nationalId?: string;

  @ApiProperty({ example: 'أرجو التكرم بالرد ومتابعة المشكلة' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'نص الرد مطلوب' })
  @Length(2, 500, {
    message: 'الرد يجب أن يكون بين حرفين و 500 حرف كحد أقصى',
  })
  message!: string;
}
