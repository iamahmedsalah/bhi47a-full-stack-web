import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  IsInt,
  Min,
  Max,
  IsUrl,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  COURSE_MATERIAL_TYPE_VALUES,
  type CourseMaterialType,
} from '@student-portal/shared';

export class CreateCourseMaterialDto {
  @ApiPropertyOptional({
    description: 'HTTPS URL of an externally hosted recording',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @IsUrl({
    protocols: ['https'],
    require_protocol: true,
    require_valid_protocol: true,
    disallow_auth: true,
  })
  videoUrl?: string;

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

export class UpdateCourseMaterialDto extends PartialType(
  OmitType(CreateCourseMaterialDto, [
    'type',
    'videoUrl',
    'weekNumber',
  ] as const),
  { skipNullProperties: false },
) {
  @ValidateIf((_dto, value: unknown) => value !== undefined && value !== '')
  @IsUrl({
    protocols: ['https'],
    require_protocol: true,
    require_valid_protocol: true,
    disallow_auth: true,
  })
  @MaxLength(2048)
  videoUrl?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? (value === '' ? null : Number(value)) : value,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  weekNumber?: number | null;
}
