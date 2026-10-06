import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class BatchUploadDto {
  @ApiProperty({
    example: 'students',
    enum: [
      'students',
      'courses',
      'grades',
      'quizzes',
      'attendance',
      'academic-emails',
    ],
  })
  @IsString()
  @IsNotEmpty()
  type!: string;

  @ApiProperty({
    description: 'Array of row objects to process in this batch',
    type: [Object],
  })
  @IsArray()
  rows!: Record<string, unknown>[];

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  batchIndex?: number;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  totalBatches?: number;

  @ApiPropertyOptional({ example: 'sess_123456789' })
  @IsOptional()
  @IsString()
  uploadSessionId?: string;
}
