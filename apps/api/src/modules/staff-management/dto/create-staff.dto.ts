import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { STAFF_ASSIGNABLE_PERMISSIONS } from '@student-portal/shared';

export class CreateStaffDto {
  @ApiProperty({ example: 'Ahmed Hassan' })
  @IsString()
  @Length(2, 160)
  name!: string;

  @ApiProperty({ example: 'staff@institute.edu' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiPropertyOptional({ example: 'ahmed.hassan' })
  @IsOptional()
  @IsString()
  @Length(3, 32)
  @Matches(/^[a-zA-Z0-9._-]+$/)
  username?: string;

  @ApiPropertyOptional({ example: '+201000000000' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiProperty({ minLength: 12, maxLength: 100 })
  @IsString()
  @MinLength(12)
  @MaxLength(100)
  password!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(STAFF_ASSIGNABLE_PERMISSIONS, { each: true })
  permissions?: string[];
}
