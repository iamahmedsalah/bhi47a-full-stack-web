import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsNumber,
  IsBoolean,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  EXAM_TYPE_VALUES,
  GRADE_STATUS_VALUES,
  type ExamType,
  type GradeStatus,
  SEMESTER_VALUES,
  type Semester,
} from '@student-portal/shared';

export class SaveGradeDto {
  @ApiProperty({ example: '20231001' })
  @IsString()
  @IsNotEmpty()
  studentCode!: string;

  @ApiProperty({ example: 'CS101' })
  @IsString()
  @IsNotEmpty()
  courseCode!: string;

  @ApiProperty({ example: 'midterm', enum: EXAM_TYPE_VALUES })
  @IsEnum(EXAM_TYPE_VALUES)
  @IsNotEmpty()
  examType!: ExamType;

  @ApiProperty({ example: 17 })
  @IsNumber()
  @Min(0)
  grade!: number;

  @ApiProperty({ example: 20 })
  @IsNumber()
  @Min(1)
  maxGrade!: number;

  @ApiProperty({ example: 'present', enum: GRADE_STATUS_VALUES })
  @IsEnum(GRADE_STATUS_VALUES)
  @IsOptional()
  status?: GradeStatus;

  @ApiProperty({ example: '2024-2025' })
  @IsString()
  @IsNotEmpty()
  academicYear!: string;

  @ApiProperty({ example: 'first', enum: SEMESTER_VALUES })
  @IsEnum(SEMESTER_VALUES)
  @IsNotEmpty()
  semester!: Semester;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class QueryGradeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  studentCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  courseCode?: string;

  @ApiPropertyOptional({ enum: EXAM_TYPE_VALUES })
  @IsOptional()
  @IsEnum(EXAM_TYPE_VALUES)
  examType?: ExamType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  limit?: number;
}

export class PublishGradesDto {
  @ApiPropertyOptional({ example: '2026-2027', description: 'Omit to affect all academic years' })
  @IsOptional()
  @IsString()
  academicYear?: string;

  @ApiPropertyOptional({ example: 'first', enum: SEMESTER_VALUES, description: 'Omit to affect every semester' })
  @IsOptional()
  @IsEnum(SEMESTER_VALUES)
  semester?: Semester;

  @ApiPropertyOptional({ example: 'midterm', enum: EXAM_TYPE_VALUES, description: 'Omit to affect final, midterm, and quiz results' })
  @IsOptional()
  @IsEnum(EXAM_TYPE_VALUES)
  examType?: ExamType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  courseCode?: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  isPublished!: boolean;
}

export class RecalculateAcademicProgressDto {
  @ApiPropertyOptional({
    example: '260001',
    description: 'Omit to recalculate every student with published grades',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  studentCode?: string;
}

export class UpdateGradeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  studentCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  courseCode?: string;

  @ApiPropertyOptional({ enum: EXAM_TYPE_VALUES })
  @IsOptional()
  @IsEnum(EXAM_TYPE_VALUES)
  examType?: ExamType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  grade?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxGrade?: number;

  @ApiPropertyOptional({ enum: GRADE_STATUS_VALUES })
  @IsOptional()
  @IsEnum(GRADE_STATUS_VALUES)
  status?: GradeStatus;

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
  @IsBoolean()
  isPublished?: boolean;
}
