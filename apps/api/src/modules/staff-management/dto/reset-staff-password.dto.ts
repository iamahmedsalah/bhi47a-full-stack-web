import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetStaffPasswordDto {
  @ApiProperty({ minLength: 12, maxLength: 100 })
  @IsString()
  @MinLength(12)
  @MaxLength(100)
  newPassword!: string;
}
