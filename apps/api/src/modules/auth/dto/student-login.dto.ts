import { IsNotEmpty, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  STUDENT_LOGIN_PASSWORD_MIN_LENGTH,
  STUDENT_PASSWORD_MAX_LENGTH,
} from '@student-portal/shared';

export class StudentLoginDto {
  @ApiProperty({ example: '20231001', description: 'Student code' })
  @IsString()
  @IsNotEmpty()
  studentCode!: string;

  @ApiProperty({
    example: '12345678901234',
    description: 'National ID or password',
  })
  @IsString()
  @IsNotEmpty()
  @Length(STUDENT_LOGIN_PASSWORD_MIN_LENGTH, STUDENT_PASSWORD_MAX_LENGTH, {
    message: 'كلمة المرور يجب أن تكون بين 6 و 100 حرف',
  })
  password!: string;
}
