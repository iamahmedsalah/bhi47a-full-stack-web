import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';

export class BatchUploadDto {
  @IsOptional() @IsString() @MaxLength(200) sourceFile?: string;
  @IsOptional() @IsInt() @Min(0) rowOffset?: number;
  @ApiProperty({
    example: 'students',
    enum: [
      'students',
      'courses',
      'grades',
      'quizzes',
      'attendance',
      'academic-emails',
      'academic-warnings',
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
