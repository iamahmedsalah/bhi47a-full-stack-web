import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsBoolean,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  EXAM_TYPE_VALUES,
  type ExamType,
  SEMESTER_VALUES,
  type Semester,
} from '@student-portal/shared';

export class CreateExamScheduleDto {
  @ApiProperty({ example: 'جدول امتحانات منتصف الفصل الدراسي الأول' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ example: 'midterm', enum: EXAM_TYPE_VALUES })
  @IsEnum(EXAM_TYPE_VALUES)
  @IsNotEmpty()
  examType!: ExamType;

  @ApiProperty({ example: '2024-2025' })
  @IsString()
  @IsNotEmpty()
  academicYear!: string;

  @ApiProperty({ example: 'first', enum: SEMESTER_VALUES })
  @IsEnum(SEMESTER_VALUES)
  @IsNotEmpty()
  semester!: Semester;

  @ApiProperty({ example: 'https://cloudinary.com/example-pdf.pdf' })
  @IsString()
  @IsNotEmpty()
  fileUrl!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class UpdateExamScheduleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ enum: EXAM_TYPE_VALUES })
  @IsOptional()
  @IsEnum(EXAM_TYPE_VALUES)
  examType?: ExamType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  academicYear?: string;

  @ApiPropertyOptional({ enum: SEMESTER_VALUES })
  @IsOptional()
  @IsEnum(SEMESTER_VALUES)
  semester?: Semester;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fileUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class QueryExamScheduleDto {
  @ApiPropertyOptional({ enum: EXAM_TYPE_VALUES })
  @IsOptional()
  @IsEnum(EXAM_TYPE_VALUES)
  examType?: ExamType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
