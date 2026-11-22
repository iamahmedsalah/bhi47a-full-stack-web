import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsMongoId,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CONTROL_COMPONENT_KEYS,
  COURSE_LEVEL_VALUES,
  GRADE_STATUS_VALUES,
  SEMESTER_VALUES,
  type ControlComponentKey,
  type CourseLevel,
  type GradeStatus,
  type Semester,
} from '@student-portal/shared';

/** Accepts `2026/2027` and stores the canonical `2026-2027`. */
const normalizeAcademicYear = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/[/\\]/g, '-') : value;

const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/;

export class ControlTermQueryDto {
  @ApiProperty({ example: '2026-2027' })
  @Transform(normalizeAcademicYear)
  @Matches(ACADEMIC_YEAR_PATTERN, { message: 'academicYear must be YYYY-YYYY' })
  academicYear!: string;

  @ApiProperty({ enum: SEMESTER_VALUES })
  @IsEnum(SEMESTER_VALUES)
  semester!: Semester;

  @ApiPropertyOptional({ enum: COURSE_LEVEL_VALUES })
  @IsOptional()
  @IsEnum(COURSE_LEVEL_VALUES)
  level?: CourseLevel;
}

export class ControlTemplateQueryDto {
  @IsIn(CONTROL_COMPONENT_KEYS)
  component!: ControlComponentKey;

  @IsOptional()
  @IsIn(['workbook', 'missing', 'exceptions'])
  mode?: 'workbook' | 'missing' | 'exceptions';
}

export class ControlReportQueryDto extends ControlTermQueryDto {
  @IsIn(['course', 'round-table'])
  type!: 'course' | 'round-table';
}

export class OpenSheetDto extends ControlTermQueryDto {
  @ApiProperty()
  @IsMongoId()
  courseId!: string;

  @ApiProperty({ enum: CONTROL_COMPONENT_KEYS })
  @IsIn(CONTROL_COMPONENT_KEYS)
  component!: ControlComponentKey;
}

export class GradeChangeDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(20)
  attendanceMark?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(20)
  quizzesMark?: number;

  @ApiProperty()
  @IsMongoId()
  studentId!: string;

  /** `null`/absent with no status clears the cell (back to "not entered"). */
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  score?: number | null;

  @ApiPropertyOptional({ enum: GRADE_STATUS_VALUES })
  @IsOptional()
  @IsEnum(GRADE_STATUS_VALUES)
  status?: GradeStatus;

  /** Revision the client last saw; 0 for a cell with no record yet. */
  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  expectedRev!: number;

  /** Client-generated id; a repeated opId is applied only once. */
  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  opId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ApplyChangesDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedSchemeVersion?: number;

  @ApiProperty({ type: [GradeChangeDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => GradeChangeDto)
  changes!: GradeChangeDto[];

  /** Applies to every change that has no reason of its own. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class LockSheetDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class UnlockSheetDto {
  @ApiPropertyOptional({ description: 'Optional; recorded when supplied.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class UpdatePassThresholdDto {
  @ApiProperty({ example: 18 })
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(1000)
  passThreshold!: number;
}

export class SchemeComponentInputDto {
  @ApiProperty({ enum: CONTROL_COMPONENT_KEYS })
  @IsIn(CONTROL_COMPONENT_KEYS)
  key!: ControlComponentKey;

  @ApiProperty({ example: 20 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1000)
  max!: number;

  @ApiProperty({ example: 0.5 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1000)
  step!: number;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}

export class UpdateGradingSchemeDto extends ControlTermQueryDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(20)
  courseworkAttendanceMax?: number;

  @ApiProperty({ type: [SchemeComponentInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CONTROL_COMPONENT_KEYS.length)
  @ValidateNested({ each: true })
  @Type(() => SchemeComponentInputDto)
  components!: SchemeComponentInputDto[];

  /** Required to change max/step once marks exist. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ControlAuditQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  studentId?: string;
}

export class ControlEntriesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class ControlFileBatchQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(19)
  batch = 0;
}

export class AttemptPreviewQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  page = 1;
}
export class UndoCarryIcDto {
  @IsMongoId() studentId!: string;
  @Matches(/^[a-f0-9]{64}$/) fingerprint!: string;
}
export class CarryIcDto {
  @IsMongoId() sourceFinalId!: string;
  @Matches(/^[a-f0-9]{64}$/) fingerprint!: string;
}
export class ReviewSheetDto {
  @IsOptional()
  @IsBoolean()
  allowMissing?: boolean;
  @IsOptional()
  @Matches(/^[a-f0-9]{64}$/)
  attemptReviewDigest?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10000)
  @IsMongoId({ each: true })
  keepPreviousStudentIds?: string[];

  @IsIn(['SUBMIT', 'SUBMIT_APPROVAL', 'APPROVE', 'RETURN', 'REOPEN'])
  action!: 'SUBMIT' | 'SUBMIT_APPROVAL' | 'APPROVE' | 'RETURN' | 'REOPEN';

  @IsInt()
  @Min(0)
  expectedRevision!: number;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class GracePreviewDto {
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.01)
  @Max(1000)
  amount!: number;

  @IsInt()
  @Min(0)
  expectedRevision!: number;
}

export class ApplyGraceDto extends GracePreviewDto {
  @IsUUID()
  operationId!: string;

  @Matches(/^[a-f0-9]{64}$/)
  digest!: string;
}

export class ImportRowsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsObject({ each: true })
  rows!: Record<string, unknown>[];
}

export class CommitImportDto {
  @IsMongoId()
  previewId!: string;
}

export class ExportControlDto {
  @IsOptional()
  @IsIn(['workbook', 'missing', 'exceptions'])
  mode?: 'workbook' | 'missing' | 'exceptions';
}
