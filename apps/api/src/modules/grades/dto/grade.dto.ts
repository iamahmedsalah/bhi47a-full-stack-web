import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  Min,
  Max,
  IsInt,
  IsObject,
  IsIn,
  IsDateString,
  ArrayMaxSize,
  ValidateNested,
  MaxLength,
  ValidateIf,
  ArrayUnique,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  EXAM_TYPE_VALUES,
  CONTROL_RESULT_EXAM_TYPES,
  STUDENT_RESULT_EXAM_TYPES,
  GRADE_STATUS_VALUES,
  type ExamType,
  type GradeStatus,
  SEMESTER_VALUES,
  type Semester,
} from '@student-portal/shared';

export class ResetControlCourseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  courseCode!: string;

  @Matches(/^\d{4}-\d{4}$/)
  academicYear!: string;

  @IsEnum(SEMESTER_VALUES)
  semester!: Semester;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  confirmation!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class SaveGradeDto {
  @ApiProperty({ example: '20231001' })
  @IsString()
  @IsNotEmpty()
  studentCode!: string;

  @ApiProperty({ example: 'CS101' })
  @IsString()
  @IsNotEmpty()
  courseCode!: string;

  @ApiProperty({ example: 'midterm', enum: EXAM_TYPE_VALUES })
  @IsEnum(EXAM_TYPE_VALUES)
  @IsNotEmpty()
  examType!: ExamType;

  @ApiProperty({ example: 17 })
  @IsNumber()
  @Min(0)
  grade!: number;

  @ApiProperty({ example: 20 })
  @IsNumber()
  @Min(1)
  maxGrade!: number;

  @ApiProperty({ example: 'present', enum: GRADE_STATUS_VALUES })
  @IsEnum(GRADE_STATUS_VALUES)
  @IsOptional()
  status?: GradeStatus;

  @ApiProperty({ example: '2024-2025' })
  @IsString()
  @IsNotEmpty()
  academicYear!: string;

  @ApiProperty({ example: 'first', enum: SEMESTER_VALUES })
  @IsEnum(SEMESTER_VALUES)
  @IsNotEmpty()
  semester!: Semester;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class QueryGradeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  studentCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  courseCode?: string;

  @ApiPropertyOptional({ enum: EXAM_TYPE_VALUES })
  @IsOptional()
  @IsEnum(EXAM_TYPE_VALUES)
  examType?: ExamType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    enum: ['studentCode', 'courseCode', 'grade', 'createdAt'],
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  limit?: number;
}

export class PublishGradesDto {
  @IsOptional()
  @IsObject()
  releaseDigests?: Record<string, string>;
  @ApiPropertyOptional({
    example: '2026-2027',
    description: 'Omit to affect all academic years',
  })
  @IsOptional()
  @IsString()
  academicYear?: string;

  @ApiPropertyOptional({
    example: 'first',
    enum: SEMESTER_VALUES,
    description: 'Omit to affect every semester',
  })
  @IsOptional()
  @IsEnum(SEMESTER_VALUES)
  semester?: Semester;

  @ApiPropertyOptional({
    example: 'midterm',
    enum: CONTROL_RESULT_EXAM_TYPES,
    description: 'Omit to affect coursework, midterm and final results',
  })
  @IsOptional()
  @IsIn(CONTROL_RESULT_EXAM_TYPES)
  examType?: ExamType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  courseCode?: string;

  @ApiPropertyOptional({
    example: '1',
    description:
      'Target student academic level (1, 2, 3, 4) - omit for all levels',
  })
  @IsOptional()
  @IsString()
  level?: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  isPublished!: boolean;
}

export class HistoricalPublicationScopeDto {
  @Matches(/^\d{4}-\d{4}$/)
  academicYear!: string;

  @IsIn(['first', 'second', 'summer'])
  semester!: 'first' | 'second' | 'summer';

  @IsIn(['1', '2', '3', '4'])
  level!: string;
}

export class PublishHistoricalGradesDto extends HistoricalPublicationScopeDto {
  @Matches(/^[a-f0-9]{64}$/)
  digest!: string;
}

export class ControlResultPolicyDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  passPercentage!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  finalMinimumPercentage!: number;

  @IsIn(['latest', 'best'])
  retake!: 'latest' | 'best';

  @IsInt()
  @Min(0)
  version!: number;
}

export class GradeVisibilityRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  courseCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  studentCode?: string;

  @IsOptional()
  @IsIn(STUDENT_RESULT_EXAM_TYPES)
  examType?: ExamType;

  @IsBoolean()
  isVisible!: boolean;
}

export class UpdateGradesSettingsDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['student', 'course'])
  gradesLevelBasis?: 'student' | 'course';
  @ApiPropertyOptional({ example: true })
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  gradesSystemOpen?: boolean;

  @ApiPropertyOptional({ example: '2026-10-15T08:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  gradesOpenAt?: string | null;

  @ApiPropertyOptional({ example: '2026-10-30T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  gradesCloseAt?: string | null;

  @ApiPropertyOptional({ example: ['1', '2', '3', '4'] })
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsIn(['1', '2', '3', '4'], { each: true })
  gradesPublishedLevels?: string[];

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(2)
  @ArrayUnique()
  @IsIn(STUDENT_RESULT_EXAM_TYPES, { each: true })
  gradesPublishedExamTypes?: ExamType[];

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => GradeVisibilityRuleDto)
  gradesVisibilityRules?: GradeVisibilityRuleDto[];
}

export class RecalculateAcademicProgressDto {
  @ApiPropertyOptional({
    example: '260001',
    description: 'Omit to recalculate every student with published grades',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  studentCode?: string;

  @ApiPropertyOptional({
    description:
      'When true, returns the progression simulation preview without updating records',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @ApiPropertyOptional({
    description:
      'Maximum allowed carried failed courses to advance to next level (default: 2)',
    default: 2,
  })
  @IsOptional()
  @IsNumber()
  maxAllowedCarriedCourses?: number;
}

export class AuditAcademicWarningsDto {
  @ApiPropertyOptional({
    description:
      'When true, only returns audit calculation without persisting changes',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class UpdateGradeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  studentCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  courseCode?: string;

  @ApiPropertyOptional({ enum: EXAM_TYPE_VALUES })
  @IsOptional()
  @IsEnum(EXAM_TYPE_VALUES)
  examType?: ExamType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  grade?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxGrade?: number;

  @ApiPropertyOptional({ enum: GRADE_STATUS_VALUES })
  @IsOptional()
  @IsEnum(GRADE_STATUS_VALUES)
  status?: GradeStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  academicYear?: string;

  @ApiPropertyOptional({ enum: SEMESTER_VALUES })
  @IsOptional()
  @IsEnum(SEMESTER_VALUES)
  semester?: Semester;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
