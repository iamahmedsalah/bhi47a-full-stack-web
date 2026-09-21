import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ATTENDANCE_SESSION_TYPES,
  ATTENDANCE_RECORD_STATUSES,
  STAFF_ACADEMIC_POSITIONS,
  type AttendanceSessionType,
  type AttendanceRecordStatus,
  type StaffAcademicPosition,
} from '@student-portal/shared';

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
    example: 25,
    description: 'QR rotation frequency in seconds',
    default: 25,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(10)
  @Max(120)
  qrRotationSeconds?: number;
}

export class CheckInAttendanceDto {
  @ApiProperty({
    description:
      'Opaque cryptographically signed QR token or rotating short fallback code',
  })
  @IsString()
  @IsNotEmpty()
  token!: string;
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
