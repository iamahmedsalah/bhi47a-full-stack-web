import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendNotificationDto {
  @ApiProperty({ example: 'تنبيه هام للفرقة الرابعة' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({
    example:
      'يرجى العلم بأنه تم نقل لجنة امتحان مادة إدارة الأعمال إلى المبنى الرئيسي مدرج أ',
  })
  @IsString()
  @IsNotEmpty()
  body!: string;

  @ApiProperty({ example: 'level', enum: ['all', 'level', 'student'] })
  @IsEnum(['all', 'level', 'student'])
  @IsNotEmpty()
  targetType!: 'all' | 'level' | 'student';

  @ApiPropertyOptional({ example: '4' })
  @IsString()
  @IsOptional()
  targetLevel?: string;

  @ApiPropertyOptional({ example: '20231001' })
  @IsString()
  @IsOptional()
  targetStudentCode?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Forward notification to students via WhatsApp automation',
  })
  @IsBoolean()
  @IsOptional()
  sendWhatsApp?: boolean;
}

export class RegisterFcmTokenDto {
  @ApiProperty({ example: 'fcm-device-registration-token-string' })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ example: 'web', enum: ['web', 'android', 'ios'] })
  @IsEnum(['web', 'android', 'ios'])
  @IsNotEmpty()
  platform!: 'web' | 'android' | 'ios';
}
export class QueryNotificationDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  unreadOnly?: boolean;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  _t?: string;
}
