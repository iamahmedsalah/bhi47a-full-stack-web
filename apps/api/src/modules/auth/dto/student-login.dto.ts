import { IsNotEmpty, IsString, Matches, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class StudentLoginDto {
  @ApiProperty({ example: '20231001', description: 'Student code' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4,12}$/, { message: 'كود الطالب يجب أن يكون من 4 إلى 12 رقم' })
  studentCode!: string;

  @ApiProperty({
    example: '12345678901234',
    description: 'National ID or password',
  })
  @IsString()
  @IsNotEmpty()
  @Length(6, 100, { message: 'كلمة المرور يجب أن تكون بين 6 و 100 حرف' })
  password!: string;
}
