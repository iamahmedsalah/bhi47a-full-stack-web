import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsArray,
  ArrayMinSize,
  Min,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTuitionStatusDto {
  @ApiProperty({
    description: 'Whether the student is blocked from portal services',
    example: true,
  })
  @IsBoolean()
  isBlocked!: boolean;

  @ApiPropertyOptional({
    description: 'Tuition fees payment status',
    enum: ['paid', 'unpaid', 'exempt'],
    example: 'unpaid',
  })
  @IsOptional()
  @IsEnum(['paid', 'unpaid', 'exempt'], {
    message: 'حالة المصروفات يجب أن تكون: paid أو unpaid أو exempt',
  })
  tuitionFeesStatus?: 'paid' | 'unpaid' | 'exempt';

  @ApiPropertyOptional({
    description: 'Reason for blocking student account',
    example: 'عدم سداد المصروفات الدراسية',
  })
  @IsOptional()
  @IsString()
  blockReason?: string;
}

export class BulkToggleTuitionDto {
  @ApiProperty({
    description: 'List of student profile IDs or user IDs to toggle',
    example: ['65f1a2b3c4d5e6f7a8b9c0d1'],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'يجب تحديد طالب واحد على الأقل' })
  @IsString({ each: true })
  studentIds!: string[];

  @ApiProperty({
    description: 'Target block status for all selected students',
    example: true,
  })
  @IsBoolean()
  isBlocked!: boolean;

  @ApiPropertyOptional({
    description: 'Target tuition status',
    enum: ['paid', 'unpaid', 'exempt'],
  })
  @IsOptional()
  @IsEnum(['paid', 'unpaid', 'exempt'])
  tuitionFeesStatus?: 'paid' | 'unpaid' | 'exempt';

  @ApiPropertyOptional({ example: 'عدم سداد المصروفات الدراسية' })
  @IsOptional()
  @IsString()
  blockReason?: string;
}

export class QueryTuitionStatusDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Search by student code or student name',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by academic level (1, 2, 3, 4)' })
  @IsOptional()
  @IsString()
  level?: string;

  @ApiPropertyOptional({
    description: 'Filter by block status ("true" | "false" | "all")',
  })
  @IsOptional()
  @IsString()
  isBlocked?: string;

  @ApiPropertyOptional({
    description: 'Filter by tuition payment status',
    enum: ['all', 'paid', 'unpaid', 'exempt'],
  })
  @IsOptional()
  @IsString()
  tuitionFeesStatus?: string;

  @ApiPropertyOptional({
    description: 'Hours window to check for recent changes (e.g. 4, 12, 24)',
    default: 4,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  recentHours?: number = 4;

  @ApiPropertyOptional({
    description:
      'Filter only students whose status changed in the recent window ("true" | "false")',
  })
  @IsOptional()
  @IsString()
  changedInLastHours?: string;
}

export class BatchTuitionUploadDto {
  @ApiProperty({
    description: 'Batch of parsed Excel/CSV student tuition records',
    type: [Object],
  })
  @IsArray()
  rows!: Record<string, any>[];

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  batchIndex?: number;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  totalBatches?: number;
}
