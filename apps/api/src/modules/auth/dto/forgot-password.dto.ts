import { IsNotEmpty, IsString, Length, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
  @MinLength(8)
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
