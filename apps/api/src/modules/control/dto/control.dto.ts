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
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
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
  GRADE_STATUS_VALUES,
  SEMESTER_VALUES,
  type ControlComponentKey,
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
  @ApiProperty({ description: 'Required; recorded in the audit log.' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
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
