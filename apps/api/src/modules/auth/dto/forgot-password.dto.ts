import {
  IsNotEmpty,
  IsString,
  Length,
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

export class ForgotPasswordDto {
  @ApiProperty({ example: '111111' })
  @IsNotEmpty()
  @IsString()
  identifier!: string;
}

export class ResetPasswordOtpDto {
  @ApiProperty({ example: '111111' })
  @IsNotEmpty()
  @IsString()
  identifier!: string;

  @ApiProperty({ example: '123456' })
  @IsNotEmpty()
  @IsString()
  @Length(6, 6)
  otp!: string;

  @ApiProperty({ example: 'NewPass123!' })
  @IsNotEmpty()
  @IsString()
  @MinLength(STUDENT_PASSWORD_MIN_LENGTH)
  @MaxLength(STUDENT_PASSWORD_MAX_LENGTH)
  @Matches(STUDENT_PASSWORD_PATTERN, {
    message:
      'Password must contain at least one Latin letter and one number, without spaces',
  })
  newPassword!: string;
}

export class VerifyGoogleOtpDto {
  @ApiProperty({ example: '123456' })
  @IsNotEmpty()
  @IsString()
  @Length(6, 6)
  otp!: string;
}

export class VerifyGoogleOAuthDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  credential!: string;
}
