import { ArrayUnique, IsArray, IsOptional } from 'class-validator';
import { STAFF_ASSIGNABLE_PERMISSIONS } from '@student-portal/shared';
import { ArrayMaxSize, IsMongoId } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsEmail,
  ValidateIf,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  STAFF_TYPE_VALUES,
  DOCTOR_PREFIX_VALUES,
  type StaffType,
  type DoctorPrefix,
} from '@student-portal/shared';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateStaffDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsMongoId({ each: true })
  courseIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsMongoId({ each: true })
  gradeEntryCourseIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(STAFF_ASSIGNABLE_PERMISSIONS, { each: true })
  permissions?: string[];

  @ApiPropertyOptional({ enum: STAFF_TYPE_VALUES, example: 'doctor' })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsIn(STAFF_TYPE_VALUES)
  staffType?: StaffType;

  @ApiPropertyOptional({ enum: DOCTOR_PREFIX_VALUES, example: 'dr' })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsIn(DOCTOR_PREFIX_VALUES)
  titlePrefix?: DoctorPrefix;

  @ApiPropertyOptional({ example: 'Ahmed Hassan' })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @Transform(trim)
  @IsString()
  @Length(2, 160)
  name?: string;

  @ApiPropertyOptional({ example: 'أحمد حسن' })
  @ValidateIf((_, value: unknown) => value !== undefined && value !== '')
  @Transform(trim)
  @IsString()
  @Length(2, 160)
  nameAr?: string;

  @ApiPropertyOptional({ example: 'staff@institute.edu' })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({ example: 'ahmed.hassan' })
  @ValidateIf((_, value: unknown) => value !== undefined && value !== '')
  @Transform(trim)
  @IsString()
  @Length(3, 32)
  @Matches(/^[a-zA-Z0-9._-]+$/)
  username?: string;

  @ApiPropertyOptional({ example: '+201000000000' })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  phone?: string;
}
