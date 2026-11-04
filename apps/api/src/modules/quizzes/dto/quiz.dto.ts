import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsIn,
  Min,
  Max,
  ValidateNested,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  QUIZ_RELEASE_MODES,
  type QuizReleaseMode,
} from '@student-portal/shared';

export class QuizQuestionDto {
  @ApiProperty({ example: 'q1' })
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiProperty({ example: 'ما هو تعريف المتغير في لغات البرمجة؟' })
  @IsString()
  @IsNotEmpty()
  text!: string;

  @ApiProperty({ enum: ['mcq', 'true_false'], default: 'mcq' })
  @IsEnum(['mcq', 'true_false'])
  type!: 'mcq' | 'true_false';

  @ApiProperty({
    example: ['مساحة في الذاكرة لتخزين قيمة', 'أمر تشغيلي', 'ملف نظام'],
  })
  @IsArray()
  @IsString({ each: true })
  options!: string[];

  @ApiProperty({ example: 0, description: '0-based index of correct option' })
  @IsNumber()
  @Min(0)
  correctOptionIndex!: number;

  @ApiProperty({ example: 2, default: 1 })
  @IsNumber()
  @Min(0.5)
  points!: number;

  @ApiPropertyOptional({
    example: 'المتغير هو موقع في الذاكرة يحمل اسماً وقيمة',
  })
  @IsOptional()
  @IsString()
  explanation?: string;
}

export class CreateQuizDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  randomizeQuestions?: boolean;

  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  mcqCount?: number;

  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  trueFalseCount?: number;

  @ApiProperty({ example: 'كويز الأسبوع الرابع - البرمجة الشيئية' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  titleAr?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  @IsString()
  @IsNotEmpty()
  courseId!: string;

  @ApiPropertyOptional({ example: '2026-2027' })
  @IsOptional()
  @IsString()
  academicYear?: string;

  @ApiPropertyOptional({ example: 'first' })
  @IsOptional()
  @IsString()
  semester?: string;

  @ApiProperty({ example: 20, description: 'Duration in minutes' })
  @IsNumber()
  @Min(1)
  @Max(180)
  durationMinutes!: number;

  @ApiPropertyOptional({ example: '2026-10-15T09:00:00Z' })
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional({ example: '2026-10-15T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allowReview?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  allowResume?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  publishResults?: boolean;

  @ApiPropertyOptional({ enum: QUIZ_RELEASE_MODES, default: 'after_close' })
  @IsOptional()
  @IsIn(QUIZ_RELEASE_MODES)
  resultsReleaseMode?: QuizReleaseMode;

  @ApiPropertyOptional({ enum: QUIZ_RELEASE_MODES, default: 'manual' })
  @IsOptional()
  @IsIn(QUIZ_RELEASE_MODES)
  reviewReleaseMode?: QuizReleaseMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  open_at?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  close_at?: string;

  @ApiProperty({ type: [QuizQuestionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuizQuestionDto)
  questions!: QuizQuestionDto[];
}

export class UpdateQuizDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  randomizeQuestions?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  mcqCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  trueFalseCount?: number;

  @ApiPropertyOptional({
    description: 'Target course ID (immutable after creation)',
  })
  @IsOptional()
  @IsString()
  courseId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  titleAr?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(180)
  durationMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowReview?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  allowResume?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  publishResults?: boolean;

  @ApiPropertyOptional({ enum: QUIZ_RELEASE_MODES })
  @IsOptional()
  @IsIn(QUIZ_RELEASE_MODES)
  resultsReleaseMode?: QuizReleaseMode;

  @ApiPropertyOptional({ enum: QUIZ_RELEASE_MODES })
  @IsOptional()
  @IsIn(QUIZ_RELEASE_MODES)
  reviewReleaseMode?: QuizReleaseMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  open_at?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  close_at?: string;

  @ApiPropertyOptional({ type: [QuizQuestionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuizQuestionDto)
  questions?: QuizQuestionDto[];
}

export class SubmitQuizAnswerDto {
  @ApiProperty({ example: 'q1' })
  @IsString()
  @IsNotEmpty()
  questionId!: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  selectedOptionIndex!: number;
}

export class SaveQuizDraftDto {
  @ApiProperty({ type: [SubmitQuizAnswerDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmitQuizAnswerDto)
  answers!: SubmitQuizAnswerDto[];
}

export class ExitQuizAttemptDto {
  @ApiPropertyOptional({ type: [SubmitQuizAnswerDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmitQuizAnswerDto)
  answers?: SubmitQuizAnswerDto[];

  @ApiPropertyOptional({ example: 'visibilitychange' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class SubmitQuizDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  durationSeconds?: number;

  @ApiProperty({ type: [SubmitQuizAnswerDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmitQuizAnswerDto)
  answers!: SubmitQuizAnswerDto[];
}

export class QueryQuizDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  courseId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isPublished?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  limit?: number;
}
