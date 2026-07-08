import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendEmailDto {
  @ApiProperty({ example: ['student@example.com'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsEmail({}, { each: true })
  to!: string[];

  @ApiProperty({ example: 'Important student portal update' })
  @IsString()
  @IsNotEmpty()
  subject!: string;

  @ApiPropertyOptional({ example: 'Plain text fallback body' })
  @IsString()
  @IsOptional()
  text?: string;

  @ApiPropertyOptional({ example: '<p>HTML body</p>' })
  @IsString()
  @IsOptional()
  html?: string;

  @ApiPropertyOptional({ example: 'complaint_reply' })
  @IsString()
  @IsOptional()
  event?: string;
}

export class QueryEmailLogDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ example: 'sent' })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ example: 'complaint_reply' })
  @IsString()
  @IsOptional()
  event?: string;
}
