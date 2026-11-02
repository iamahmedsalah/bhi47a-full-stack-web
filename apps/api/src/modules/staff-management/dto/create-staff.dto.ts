import { ArrayMaxSize, IsMongoId } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  STAFF_ASSIGNABLE_PERMISSIONS,
  STAFF_TYPE_VALUES,
  DOCTOR_PREFIX_VALUES,
  type StaffType,
  type DoctorPrefix,
} from '@student-portal/shared';

export class CreateStaffDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsMongoId({ each: true })
  courseIds?: string[];

  @ApiPropertyOptional({ enum: ['admin', 'staff'], example: 'staff' })
  @IsOptional()
  @IsIn(['admin', 'staff'])
  role?: 'admin' | 'staff';

  @ApiPropertyOptional({ enum: STAFF_TYPE_VALUES, example: 'doctor' })
  @IsOptional()
  @IsIn(STAFF_TYPE_VALUES)
  staffType?: StaffType;

  @ApiPropertyOptional({ enum: DOCTOR_PREFIX_VALUES, example: 'dr' })
  @IsOptional()
  @IsIn(DOCTOR_PREFIX_VALUES)
  titlePrefix?: DoctorPrefix;

  @ApiProperty({ example: 'Ahmed Hassan' })
  @IsString()
  @Length(2, 160)
  name!: string;

  @ApiPropertyOptional({ example: 'أحمد حسن' })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== undefined && value !== '')
  @IsString()
  @Length(2, 160)
  nameAr?: string;

  @ApiProperty({ example: 'staff@institute.edu' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiPropertyOptional({ example: 'ahmed.hassan' })
  @IsOptional()
  @IsString()
  @Length(3, 32)
  @Matches(/^[a-zA-Z0-9._-]+$/)
  username?: string;

  @ApiPropertyOptional({ example: '+201000000000' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiProperty({ minLength: 12, maxLength: 100 })
  @IsString()
  @MinLength(12)
  @MaxLength(100)
  password!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(STAFF_ASSIGNABLE_PERMISSIONS, { each: true })
  permissions?: string[];
}
