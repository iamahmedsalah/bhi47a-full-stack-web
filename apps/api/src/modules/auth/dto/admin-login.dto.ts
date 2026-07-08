import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AdminLoginDto {
  @ApiProperty({
    example: 'admin@institute.edu',
    description: 'Admin/Staff email',
  })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({
    example: 'Use-a-strong-admin-password',
    description: 'Password',
  })
  @IsString()
  @IsNotEmpty()
  @Length(6, 100, { message: 'كلمة المرور يجب أن تكون بين 6 و 100 حرف' })
  password!: string;
}
