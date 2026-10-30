import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { STAFF_TYPE_VALUES, type StaffType } from '@student-portal/shared';

export class UpdateStaffDto {
  @ApiPropertyOptional({ enum: STAFF_TYPE_VALUES, example: 'doctor' })
  @IsOptional()
  @IsIn(STAFF_TYPE_VALUES)
  staffType?: StaffType;
  @ApiPropertyOptional({ example: 'Ahmed Hassan' })
  @IsOptional()
  @IsString()
  @Length(2, 160)
  name?: string;

  @ApiPropertyOptional({ example: 'أحمد حسن' })
  @IsOptional()
  @IsString()
  @Length(2, 160)
  nameAr?: string;

  @ApiPropertyOptional({ example: 'staff@institute.edu' })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

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
}
