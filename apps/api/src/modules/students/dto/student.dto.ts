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
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4,12}$/, {
    message: 'كود الطالب يجب أن يتكون من أرقام فقط بين 4 و 12 رقماً',
  })
  studentCode!: string;

  @ApiPropertyOptional({ example: 'أحمد محمد علي' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(/<[^>]*>/g, '') : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullNameAr?: string;

  @ApiPropertyOptional({ example: 'Ahmed Mohamed Ali' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(/<[^>]*>/g, '') : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullNameEn?: string;

  @ApiProperty({ example: 'أحمد محمد علي' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(/<[^>]*>/g, '') : value,
  )
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @ApiProperty({
    example: '12345678901234',
    description: 'National ID (used as initial password)',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @Matches(/^(2|3)\d{13}$|^\d{14}$/, {
    message: 'الرقم القومي يجب أن يتكون من 14 رقماً',
  })
  nationalId!: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @Matches(/^(010|011|012|015)\d{8}$|^\+?\d{10,15}$/, {
    message: 'رقم الهاتف يجب أن يكون مصرياً صالحاً أو بتنسيق دولي',
  })
  phone?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(/<[^>]*>/g, '') : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  @ApiProperty({ example: '1', enum: ['1', '2', '3', '4'] })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @IsIn(['1', '2', '3', '4'])
  level!: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  group?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  section?: string;

  @ApiProperty({ example: '2024-2025' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{4}$/, {
    message: 'العام الأكاديمي يجب أن يكون بالصيغة YYYY-YYYY',
  })
  academicYear!: string;

  @ApiProperty({ example: 'first', enum: ['first', 'second', 'summer'] })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @IsNotEmpty()
  @IsIn(['first', 'second', 'summer'])
  semester!: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  seatNumber?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsOptional()
  @IsString()
  @IsEmail()
  academicEmail?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  examRoom?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  examFloor?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  examBuilding?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  mustChangePassword?: boolean;
}

export class UpdateStudentDto {
  @ApiPropertyOptional({ example: 'أحمد محمد علي' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(/<[^>]*>/g, '') : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullNameAr?: string;

  @ApiPropertyOptional({ example: 'Ahmed Mohamed Ali' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(/<[^>]*>/g, '') : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullNameEn?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(/<[^>]*>/g, '') : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullName?: string;

  @ApiPropertyOptional({
    example: '12345678901234',
    description:
      'New national ID. Existing value is stored hashed and cannot be read back.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @Matches(/^(2|3)\d{13}$|^\d{14}$/, {
    message: 'الرقم القومي يجب أن يتكون من 14 رقماً',
  })
  nationalId?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @Matches(/^(010|011|012|015)\d{8}$|^\+?\d{10,15}$/, {
    message: 'رقم الهاتف يجب أن يكون مصرياً صالحاً أو بتنسيق دولي',
  })
  phone?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(/<[^>]*>/g, '') : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @IsIn(['1', '2', '3', '4'])
  level?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  group?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  section?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{4}$/, {
    message: 'العام الأكاديمي يجب أن يكون بالصيغة YYYY-YYYY',
  })
  academicYear?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsOptional()
  @IsString()
  @IsIn(['first', 'second', 'summer'])
  semester?: string;

  @ApiPropertyOptional({
    enum: ['active', 'inactive', 'graduated', 'suspended'],
  })
  @IsOptional()
  @IsEnum(['active', 'inactive', 'graduated', 'suspended'])
  enrollmentStatus?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  seatNumber?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsOptional()
  @IsString()
  @IsEmail()
  academicEmail?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  examRoom?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  examFloor?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
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

  @ApiPropertyOptional({
    enum: ['active', 'inactive', 'graduated', 'suspended'],
  })
  @IsOptional()
  @IsString()
  status?: string;

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

export class ToggleAllMustChangePasswordDto {
  @ApiProperty({
    example: true,
    description: 'Whether to require all students to change password on login',
  })
  @IsBoolean()
  enabled!: boolean;
}
