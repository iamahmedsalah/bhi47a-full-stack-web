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
  type StaffType,
} from '@student-portal/shared';

export class CreateStaffDto {
  @ApiPropertyOptional({ enum: ['admin', 'staff'], example: 'staff' })
  @IsOptional()
  @IsIn(['admin', 'staff'])
  role?: 'admin' | 'staff';

  @ApiPropertyOptional({ enum: STAFF_TYPE_VALUES, example: 'doctor' })
  @IsOptional()
  @IsIn(STAFF_TYPE_VALUES)
  staffType?: StaffType;
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
