import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsBoolean,
  IsArray,
  ArrayNotEmpty,
  ArrayMaxSize,
  ArrayUnique,
  IsIn,
  ValidateBy,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  ANALYTICS_LOCALES,
  type AnalyticsLocale,
  ANALYTICS_REPORT_SHEETS,
  type AnalyticsReportSheet,
  CURRICULUM_DEPARTMENTS,
  normalizeDepartment,
  isAdmissionAcademicYear,
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

export class AnalyticsExportQueryDto extends AnalyticsQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateBy({
    name: 'isAcademicYear',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'string' && isAdmissionAcademicYear(value),
    },
  })
  declare academicYear?: string;

  @ApiPropertyOptional({
    description:
      'Comma-separated worksheet identifiers. Omit for the complete workbook.',
    enum: ANALYTICS_REPORT_SHEETS,
    isArray: true,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.split(',').map((sheet) => sheet.trim())
      : value,
  )
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(ANALYTICS_REPORT_SHEETS.length)
  @ArrayUnique()
  @IsIn(ANALYTICS_REPORT_SHEETS, { each: true })
  sheets?: AnalyticsReportSheet[];

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const code = value.trim().toUpperCase();
    return (
      normalizeDepartment(code) ??
      (code === 'GEN' ? 'GENERAL' : code === 'ACC' ? 'ACCOUNTING' : value)
    );
  })
  @IsIn(CURRICULUM_DEPARTMENTS)
  declare department?: string;

  @IsOptional()
  @IsIn(['1', '2', '3', '4'])
  declare level?: string;
}
