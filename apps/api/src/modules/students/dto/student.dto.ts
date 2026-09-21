import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsEmail,
  Matches,
  IsIn,
  IsBoolean,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  STUDENT_PASSWORD_MAX_LENGTH,
  STUDENT_PASSWORD_MIN_LENGTH,
  STUDENT_PASSWORD_PATTERN,
} from '@student-portal/shared';

export class CreateStudentDto {
  @ApiProperty({ example: '20231001' })
  @IsString()
  @IsNotEmpty()
  studentCode!: string;

  @ApiProperty({ example: 'أحمد محمد علي' })
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @ApiProperty({
    example: '12345678901234',
    description: 'National ID (used as initial password)',
  })
  @IsString()
  @IsNotEmpty()
  nationalId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  department?: string;

  @ApiProperty({ example: '1', enum: ['1', '2', '3', '4'] })
  @IsString()
  @IsNotEmpty()
  level!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  group?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  section?: string;

  @ApiProperty({ example: '2024-2025' })
  @IsString()
  @IsNotEmpty()
  academicYear!: string;

  @ApiProperty({ example: 'first', enum: ['first', 'second', 'summer'] })
  @IsString()
  @IsNotEmpty()
  semester!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  seatNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsEmail()
  academicEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  examRoom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  examFloor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  examBuilding?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  mustChangePassword?: boolean;
}

export class UpdateStudentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({
    example: '12345678901234',
    description:
      'New national ID. Existing value is stored hashed and cannot be read back.',
  })
  @IsOptional()
  @IsString()
  nationalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  level?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  group?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  section?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  academicYear?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  semester?: string;

  @ApiPropertyOptional({
    enum: ['active', 'inactive', 'graduated', 'suspended'],
  })
  @IsOptional()
  @IsEnum(['active', 'inactive', 'graduated', 'suspended'])
  enrollmentStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  seatNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsEmail()
  academicEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  examRoom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  examFloor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  examBuilding?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  mustChangePassword?: boolean;
}

export class SearchStudentQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ['1', '2', '3', '4'] })
  @IsOptional()
  @IsString()
  level?: string;

  @ApiPropertyOptional({
    enum: ['active', 'inactive', 'graduated', 'suspended'],
  })
  @IsOptional()
  @IsString()
  enrollmentStatus?: string;

  @ApiPropertyOptional({ enum: ['studentCode', 'createdAt'] })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortOrder?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  limit?: number;
}

export class ResetPasswordDto {
  @ApiPropertyOptional({
    description:
      'Custom temporary password. If omitted, the stored 14-digit National ID is used when available.',
    example: 'TempPass2026',
  })
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  })
  @IsOptional()
  @IsString()
  @MinLength(STUDENT_PASSWORD_MIN_LENGTH)
  @MaxLength(STUDENT_PASSWORD_MAX_LENGTH)
  @Matches(STUDENT_PASSWORD_PATTERN, {
    message:
      'Password must contain at least one Latin letter and one number, without spaces',
  })
  newPassword?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  mustChangePassword?: boolean;
}

export class UpdateMyContactDto {
  @ApiPropertyOptional({ example: 'student@gmail.com' })
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim().toLowerCase();
    return trimmed.length ? trimmed : undefined;
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '01012345678' })
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  })
  @IsOptional()
  @Matches(/^\+?\d{10,15}$/)
  phone?: string;

  @ApiPropertyOptional({ enum: ['light', 'dark', 'system'], example: 'system' })
  @IsOptional()
  @IsIn(['light', 'dark', 'system'])
  theme?: 'light' | 'dark' | 'system';
}
