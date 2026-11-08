import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  COURSE_MATERIAL_TYPE_VALUES,
  type CourseMaterialType,
} from '@student-portal/shared';

export class CreateCourseMaterialDto {
  @ApiProperty({
    enum: COURSE_MATERIAL_TYPE_VALUES,
    description: 'Type of material: lecture or section',
  })
  @IsEnum(COURSE_MATERIAL_TYPE_VALUES)
  type!: CourseMaterialType;

  @ApiProperty({ description: 'Title of lecture/section' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: 'Arabic title of lecture/section' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  titleAr?: string;

  @ApiPropertyOptional({ description: 'Academic week number (1-20)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  weekNumber?: number;

  @ApiPropertyOptional({ description: 'Description or summary' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class QueryCourseMaterialsDto {
  @ApiPropertyOptional({
    enum: COURSE_MATERIAL_TYPE_VALUES,
    description: 'Filter by type: lecture or section',
  })
  @IsOptional()
  @IsEnum(COURSE_MATERIAL_TYPE_VALUES)
  type?: CourseMaterialType;
}
