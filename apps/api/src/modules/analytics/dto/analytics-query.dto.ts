import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import {
  ANALYTICS_LOCALES,
  type AnalyticsLocale,
} from '@student-portal/shared';

export class AnalyticsQueryDto {
  @ApiPropertyOptional({ description: 'Academic year (e.g. 2026-2027)' })
  @IsOptional()
  @IsString()
  academicYear?: string;

  @ApiPropertyOptional({
    description: 'Semester filter',
    enum: ['first', 'second', 'summer'],
  })
  @IsOptional()
  @IsEnum(['first', 'second', 'summer'])
  semester?: 'first' | 'second' | 'summer';

  @ApiPropertyOptional({ description: 'Department code or name' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ description: 'Academic level (1, 2, 3, 4)' })
  @IsOptional()
  @IsString()
  level?: string;

  @ApiPropertyOptional({
    description: 'Report language (ar or en, default: ar)',
    enum: ['ar', 'en'],
    default: 'ar',
  })
  @IsOptional()
  @IsEnum(Object.values(ANALYTICS_LOCALES))
  locale?: AnalyticsLocale = 'ar';

  @ApiPropertyOptional({
    description:
      'Include detailed individual quiz submissions roster in export',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true || value === '1')
  @IsBoolean()
  includeSubmissions?: boolean = false;
}
