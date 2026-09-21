import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  STUDENT_PASSWORD_MAX_LENGTH,
  STUDENT_PASSWORD_MIN_LENGTH,
  STUDENT_PASSWORD_PATTERN,
} from '@student-portal/shared';

export class ChangePasswordDto {
  @ApiProperty({ description: 'Current password' })
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @ApiProperty({
    description:
      'New password (8-100 characters, with at least one Latin letter and one number, and no spaces)',
  })
  @IsString()
  @MinLength(STUDENT_PASSWORD_MIN_LENGTH)
  @MaxLength(STUDENT_PASSWORD_MAX_LENGTH)
  @Matches(STUDENT_PASSWORD_PATTERN, {
    message:
      'Password must contain at least one Latin letter and one number, without spaces',
  })
  @IsNotEmpty()
  newPassword!: string;
}
