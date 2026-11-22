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
import {
  CONTROL_PETITION_STATUS_VALUES,
  type ControlPetitionStatus,
} from '../schemas/control-petition.schema';

const normalizeAcademicYear = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/[/\\]/g, '-') : value;

export class CreateControlPetitionItemDto {
  @ApiProperty()
  @IsMongoId()
  studentId!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(1000)
  proposedScore?: number | null;

  @ApiPropertyOptional({ enum: GRADE_STATUS_VALUES, default: 'present' })
  @IsOptional()
  @IsEnum(GRADE_STATUS_VALUES)
  proposedStatus?: GradeStatus;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(20)
  proposedAttendanceMark?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(20)
  proposedQuizzesMark?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  studentReason?: string;
}

export class CreateControlPetitionDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  sheetId!: string;

  @ApiProperty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @ApiProperty({ type: [CreateControlPetitionItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateControlPetitionItemDto)
  items!: CreateControlPetitionItemDto[];
}

export class DecideControlPetitionItemDto {
  @ApiProperty()
  @IsMongoId()
  studentId!: string;

  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] })
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  decisionNote?: string;
}

export class DecideControlPetitionDto {
  @ApiProperty({ type: [DecideControlPetitionItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => DecideControlPetitionItemDto)
  items!: DecideControlPetitionItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewNote?: string;
}

export class ListControlPetitionsQueryDto {
  @ApiPropertyOptional({ example: '2026-2027' })
  @IsOptional()
  @Transform(normalizeAcademicYear)
  @Matches(/^\d{4}-\d{4}$/, { message: 'academicYear must be YYYY-YYYY' })
  academicYear?: string;

  @ApiPropertyOptional({ enum: SEMESTER_VALUES })
  @IsOptional()
  @IsEnum(SEMESTER_VALUES)
  semester?: Semester;

  @ApiPropertyOptional({ enum: CONTROL_COMPONENT_KEYS })
  @IsOptional()
  @IsIn(CONTROL_COMPONENT_KEYS)
  component?: ControlComponentKey;

  @ApiPropertyOptional({ enum: CONTROL_PETITION_STATUS_VALUES })
  @IsOptional()
  @IsIn(CONTROL_PETITION_STATUS_VALUES)
  status?: ControlPetitionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  courseId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  sheetId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' || value === true ? true : undefined,
  )
  @IsBoolean()
  mine?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

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
}
