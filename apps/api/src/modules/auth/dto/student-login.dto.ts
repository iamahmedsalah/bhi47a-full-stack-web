import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  STUDENT_LOGIN_PASSWORD_MIN_LENGTH,
  STUDENT_PASSWORD_MAX_LENGTH,
} from '@student-portal/shared';

export class StudentLoginDto {
  @ApiProperty({ example: '20231001', description: 'Student code' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4,12}$/, {
    message: 'كود الطالب يجب أن يتكون من أرقام فقط بين 4 و 12 رقماً',
  })
  studentCode!: string;

  @ApiProperty({
    example: '12345678901234',
    description: 'National ID or password',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @Length(STUDENT_LOGIN_PASSWORD_MIN_LENGTH, STUDENT_PASSWORD_MAX_LENGTH, {
    message: 'كلمة المرور يجب أن تكون بين 6 و 100 حرف',
  })
  password!: string;
}
