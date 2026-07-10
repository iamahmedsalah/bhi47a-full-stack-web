import { IsNotEmpty, IsString, Matches, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
  @Length(6, 100, { message: 'كلمة المرور يجب أن تكون بين 6 و 100 حرف' })
  password!: string;
}
