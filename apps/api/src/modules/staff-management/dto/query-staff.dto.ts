import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { STAFF_TYPE_VALUES, type StaffType } from '@student-portal/shared';

export class QueryStaffDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: ['all', 'active', 'inactive'], default: 'all' })
  @IsOptional()
  @IsIn(['all', 'active', 'inactive'])
  status: 'all' | 'active' | 'inactive' = 'all';

  @ApiPropertyOptional({ enum: ['all', 'staff', 'admin'], default: 'all' })
  @IsOptional()
  @IsIn(['all', 'staff', 'admin'])
  role: 'all' | 'staff' | 'admin' = 'all';

  @ApiPropertyOptional({
    enum: ['all', ...STAFF_TYPE_VALUES],
    default: 'all',
  })
  @IsOptional()
  @IsIn(['all', ...STAFF_TYPE_VALUES])
  staffType: 'all' | StaffType = 'all';
}
