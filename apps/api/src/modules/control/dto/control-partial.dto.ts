import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsMongoId,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class PartialCandidatesQueryDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeExcused?: boolean;
}

export class OpenPartialEntryDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsMongoId({ each: true })
  studentIds!: string[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  includeExcused?: boolean;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  studentReasons?: Record<string, string>;

  @ApiProperty()
  @IsInt()
  @Min(0)
  expectedRevision!: number;
}

export class SubmitPartialEntryDto {
  @ApiProperty()
  @IsInt()
  @Min(0)
  expectedPartialRevision!: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ReturnPartialEntryDto {
  @ApiProperty()
  @IsInt()
  @Min(0)
  expectedPartialRevision!: number;

  @ApiProperty({ minLength: 3, maxLength: 500 })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class ApprovePartialEntryDto {
  @ApiProperty()
  @IsInt()
  @Min(0)
  expectedPartialRevision!: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  attemptReviewDigest?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  keepPreviousStudentIds?: string[];
}
