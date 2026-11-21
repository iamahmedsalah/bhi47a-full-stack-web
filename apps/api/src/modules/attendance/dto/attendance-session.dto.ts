import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ArrayUnique,
  IsMongoId,
  ValidateNested,
  IsBoolean,
  IsInt,
  IsIn,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ATTENDANCE_SESSION_TYPES,
  ATTENDANCE_RECORD_STATUSES,
  ATTENDANCE_RECORD_DELETE_LIMIT,
  STAFF_ACADEMIC_POSITIONS,
  type AttendanceSessionType,
  type AttendanceRecordStatus,
  type StaffAcademicPosition,
} from '@student-portal/shared';

export class DeleteAttendanceRecordsDto {
  @ApiProperty({ type: [String], maxItems: ATTENDANCE_RECORD_DELETE_LIMIT })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(ATTENDANCE_RECORD_DELETE_LIMIT)
  @ArrayUnique()
  @IsMongoId({ each: true })
  recordIds!: string[];
}

export class SessionLocationDto {
  @ApiPropertyOptional({
    example: 'مدرج 315',
    description: 'Name of the hall or lecture room',
  })
  @IsOptional()
  @IsString()
  venueName?: string;

  @ApiProperty({ example: 30.0444, description: 'Hall latitude' })
  @Type(() => Number)
  @IsNumber()
  latitude!: number;

  @ApiProperty({ example: 31.2357, description: 'Hall longitude' })
  @Type(() => Number)
  @IsNumber()
  longitude!: number;

  @ApiPropertyOptional({
    example: 100,
    default: 100,
    description: 'Allowed radius in meters',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(10)
  @Max(5000)
  radiusMeters?: number = 100;
}

export class UpdateSessionLocationDto {
  @ApiPropertyOptional({
    default: true,
    description: 'Enable or disable geofencing for this session',
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ example: 'مدرج 315' })
  @IsOptional()
  @IsString()
  venueName?: string;

  @ApiPropertyOptional({ example: 30.0444 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: 31.2357 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(10)
  @Max(5000)
  radiusMeters?: number;
}

export class CreateAttendanceSessionDto {
  @ApiProperty({ example: 'CS101', description: 'Course Code' })
  @IsString()
  @IsNotEmpty()
  courseCode!: string;

  @ApiProperty({
    enum: ATTENDANCE_SESSION_TYPES,
    default: 'lecture',
    description: 'Type of class session',
  })
  @IsEnum(ATTENDANCE_SESSION_TYPES)
  sessionType!: AttendanceSessionType;

  @ApiProperty({ example: '1', description: 'Academic level (1, 2, 3, 4)' })
  @IsString()
  @IsNotEmpty()
  level!: string;

  @ApiPropertyOptional({ example: 'A', description: 'Group identifier' })
  @IsOptional()
  @IsString()
  group?: string;

  @ApiPropertyOptional({ example: '1', description: 'Section identifier' })
  @IsOptional()
  @IsString()
  section?: string;

  @ApiPropertyOptional({ example: '2026-2027' })
  @IsOptional()
  @IsString()
  academicYear?: string;

  @ApiPropertyOptional({ example: 'first' })
  @IsOptional()
  @IsString()
  semester?: string;

  @ApiPropertyOptional({
    example: 10,
    description: 'Minutes after start when a check-in is considered LATE',
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(120)
  lateThresholdMinutes?: number;

  @ApiPropertyOptional({
    example: 15,
    description: 'Duration of the attendance window in minutes',
    default: 15,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(3)
  @Max(240)
  sessionDurationMinutes?: number;

  @ApiPropertyOptional({
    example: 60,
    description: 'QR rotation frequency in seconds',
    default: 60,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(10)
  @Max(120)
  qrRotationSeconds?: number;

  @ApiPropertyOptional({
    type: SessionLocationDto,
    description: 'Optional geofencing location for the lecture hall',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SessionLocationDto)
  location?: SessionLocationDto;
}

export class CheckInAttendanceDto {
  @ApiProperty({
    description:
      'Opaque cryptographically signed QR token or rotating short fallback code',
  })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiPropertyOptional({
    description:
      'Unique client device identifier (UUIDv4) to enforce 1 device per student per session',
  })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({
    description:
      'Hardware-based cross-browser fingerprint to enforce 1 physical device even across browsers',
  })
  @IsOptional()
  @IsString()
  deviceFingerprint?: string;

  @ApiPropertyOptional({
    description:
      'Human-readable device model and browser (e.g. Windows PC • Chrome)',
  })
  @IsOptional()
  @IsString()
  deviceInfo?: string;

  @ApiPropertyOptional({
    description: 'Client GPS latitude coordinate for geofence validation',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({
    description: 'Client GPS longitude coordinate for geofence validation',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({
    description: 'GPS accuracy radius in meters reported by device',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  accuracy?: number;
}

export class ManualMarkAttendanceDto {
  @ApiProperty({
    enum: ATTENDANCE_RECORD_STATUSES,
    example: 'present',
    description: 'Target attendance status',
  })
  @IsEnum(ATTENDANCE_RECORD_STATUSES)
  status!: AttendanceRecordStatus;

  @ApiPropertyOptional({
    example: 'Student attended but could not scan phone camera',
    description: 'Auditable reason for the manual change',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: 'Optional instructor note' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class ManualStudentCheckInDto {
  @ApiProperty({
    example: '2026001',
    description: 'Student code to manually mark',
  })
  @IsString()
  @IsNotEmpty()
  studentCode!: string;

  @ApiProperty({
    enum: ATTENDANCE_RECORD_STATUSES,
    default: 'present',
  })
  @IsEnum(ATTENDANCE_RECORD_STATUSES)
  status!: AttendanceRecordStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class QueryAttendanceSessionsDto {
  @IsOptional()
  @IsIn(['all', 'OPEN', 'CLOSED', 'EXPIRED', 'ENDED'])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  level?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  courseCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @IsIn(['ar', 'en'])
  lang?: 'ar' | 'en';
}

export class QueryAttendanceRecordsDto {
  @ApiPropertyOptional({ enum: ATTENDANCE_RECORD_STATUSES })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Search student name or code' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(200)
  limit: number = 50;
}

export class CreateCourseStaffAssignmentDto {
  @ApiProperty({ description: 'User ID of the staff member' })
  @IsString()
  @IsNotEmpty()
  staffId!: string;

  @ApiProperty({ example: 'CS101', description: 'Course Code' })
  @IsString()
  @IsNotEmpty()
  courseCode!: string;

  @ApiProperty({
    enum: STAFF_ACADEMIC_POSITIONS,
    default: 'doctor',
    description: 'Academic role for this assignment (doctor or instructor)',
  })
  @IsEnum(STAFF_ACADEMIC_POSITIONS)
  academicPosition!: StaffAcademicPosition;

  @ApiPropertyOptional({ example: '2026-2027' })
  @IsOptional()
  @IsString()
  academicYear?: string;

  @ApiPropertyOptional({ example: 'first' })
  @IsOptional()
  @IsString()
  semester?: string;

  @ApiPropertyOptional({ type: [String], example: ['1', '2'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  groups?: string[];

  @ApiPropertyOptional({ type: [String], example: ['A', 'B'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sections?: string[];
}
