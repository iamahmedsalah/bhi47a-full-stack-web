import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const supplied = (_: unknown, value: unknown) => value !== undefined;

class PeriodFieldsDto {
  @ValidateIf(supplied)
  @Transform(trim)
  @IsString()
  @Length(2, 160)
  name?: string;

  @ValidateIf((_, value: unknown) => value !== undefined && value !== '')
  @Transform(trim)
  @IsString()
  @Length(2, 160)
  nameAr?: string;

  @ValidateIf(supplied)
  @IsDateString({ strict: true })
  @MaxLength(40)
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/i)
  opensAt?: string;

  @ValidateIf(supplied)
  @IsDateString({ strict: true })
  @MaxLength(40)
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/i)
  closesAt?: string;

  @ValidateIf(supplied)
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.isEnabled)
  @IsBoolean()
  isEnabled?: boolean;
}

export class CreateAdmissionPeriodDto extends PeriodFieldsDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9_-]{2,63}$/)
  code!: string;

  @IsString()
  @Matches(/^\d{4}-\d{4}$/)
  academicYear!: string;
}

export class UpdateAdmissionPeriodDto extends PeriodFieldsDto {
  @IsInt()
  @Min(0)
  revision!: number;
}

export class QueryAdmissionPeriodDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ValidateIf(supplied)
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;
}
