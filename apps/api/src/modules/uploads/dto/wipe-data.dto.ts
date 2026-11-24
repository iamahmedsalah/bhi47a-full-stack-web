import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  EXAM_TYPE_VALUES,
  SEMESTER_VALUES,
  type ExamType,
  type Semester,
} from '@student-portal/shared';

export const WIPE_TARGET_VALUES = [
  'grades',
  'quizzes',
  'attendance',
  'students',
  'complaints',
  'all',
] as const;
export type WipeTarget = (typeof WIPE_TARGET_VALUES)[number];

export const GRADE_WIPE_EXAM_TYPE_VALUES = [
  ...EXAM_TYPE_VALUES,
  'total',
] as const;
export type GradeWipeExamType = ExamType | 'total';

export const WIPE_SEMESTER_VALUES = ['all', ...SEMESTER_VALUES] as const;
export type WipeSemester = 'all' | Semester;

export const GRADE_SOURCE_SCOPE_VALUES = [
  'all',
  'historical_only',
  'non_control_only',
] as const;
export type GradeSourceScope = (typeof GRADE_SOURCE_SCOPE_VALUES)[number];

export const QUIZ_WIPE_SCOPE_VALUES = [
  'attempts_and_submissions',
  'all_quizzes_and_submissions',
  'legacy_course_quizzes',
  'everything',
] as const;
export type QuizWipeScope = (typeof QUIZ_WIPE_SCOPE_VALUES)[number];

export const ATTENDANCE_WIPE_SCOPE_VALUES = [
  'qr_sessions_and_records',
  'legacy_attendance',
  'everything',
] as const;
export type AttendanceWipeScope = (typeof ATTENDANCE_WIPE_SCOPE_VALUES)[number];

export const COMPLAINT_WIPE_SCOPE_VALUES = [
  'resolved_and_closed',
  'all',
] as const;
export type ComplaintWipeScope = (typeof COMPLAINT_WIPE_SCOPE_VALUES)[number];

export class WipePreviewDto {
  @ApiProperty({ enum: WIPE_TARGET_VALUES })
  @IsIn(WIPE_TARGET_VALUES)
  target!: WipeTarget;

  @ApiPropertyOptional({
    type: [String],
    description: 'Academic years to target (e.g. ["2023-2024"]). Empty = all.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  academicYears?: string[];

  @ApiPropertyOptional({ enum: WIPE_SEMESTER_VALUES, default: 'all' })
  @IsOptional()
  @IsIn(WIPE_SEMESTER_VALUES)
  semester?: WipeSemester;

  @ApiPropertyOptional({
    enum: GRADE_WIPE_EXAM_TYPE_VALUES,
    isArray: true,
    description: 'Exam types for grades wipe. Empty/omitted = all exam types.',
  })
  @IsOptional()
  @IsArray()
  @IsIn(GRADE_WIPE_EXAM_TYPE_VALUES, { each: true })
  examTypes?: GradeWipeExamType[];

  @ApiPropertyOptional({ enum: GRADE_SOURCE_SCOPE_VALUES, default: 'all' })
  @IsOptional()
  @IsIn(GRADE_SOURCE_SCOPE_VALUES)
  sourceScope?: GradeSourceScope;

  @ApiPropertyOptional({
    default: false,
    description:
      'When false (default), grades governed by protected Control sheets (IN_REVIEW/PENDING_APPROVAL/APPROVED/locked) or approved/published control marks are protected.',
  })
  @IsOptional()
  @IsBoolean()
  includeApprovedControl?: boolean;

  @ApiPropertyOptional({
    enum: QUIZ_WIPE_SCOPE_VALUES,
    default: 'everything',
  })
  @IsOptional()
  @IsIn(QUIZ_WIPE_SCOPE_VALUES)
  quizScope?: QuizWipeScope;

  @ApiPropertyOptional({
    enum: ATTENDANCE_WIPE_SCOPE_VALUES,
    default: 'everything',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_WIPE_SCOPE_VALUES)
  attendanceScope?: AttendanceWipeScope;

  @ApiPropertyOptional({
    default: false,
    description:
      'When false (default), currently OPEN live QR attendance sessions are protected from deletion.',
  })
  @IsOptional()
  @IsBoolean()
  includeOpenAttendanceSessions?: boolean;

  @ApiPropertyOptional({
    enum: COMPLAINT_WIPE_SCOPE_VALUES,
    default: 'all',
  })
  @IsOptional()
  @IsIn(COMPLAINT_WIPE_SCOPE_VALUES)
  complaintScope?: ComplaintWipeScope;

  @ApiPropertyOptional({
    description:
      'ISO date (YYYY-MM-DD or timestamp) to delete complaints created before this date.',
  })
  @IsOptional()
  @IsDateString()
  olderThan?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Student levels to target (e.g. ["1", "2"]). Empty = all.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  levels?: string[];
}

export class WipeDataDto extends WipePreviewDto {
  @ApiPropertyOptional({
    maxLength: 500,
    description: 'Optional audit reason recorded in server logs.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
