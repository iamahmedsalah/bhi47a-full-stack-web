import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  IsIn,
  Min,
  Max,
  IsInt,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  COURSE_LEVEL_VALUES,
  SEMESTER_VALUES,
  type CourseLevel,
  type Semester,
} from '@student-portal/shared';
import type { CourseCurriculum } from '../schemas/course.schema';

export class CourseCurriculumDto implements CourseCurriculum {
  @IsIn(['GENERAL', 'BIS', 'ACCOUNTING'])
  department!: CourseCurriculum['department'];

  @IsEnum(COURSE_LEVEL_VALUES)
  academicLevel!: CourseLevel;

  @IsEnum(SEMESTER_VALUES)
  semester!: Semester;

  @IsIn([
    'required',
    'elective',
    'university_req',
    'institute_req',
    'specialization_req',
  ])
  type!: CourseCurriculum['type'];
}

export class CreateCourseDto {
  @ApiPropertyOptional({ type: [CourseCurriculumDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CourseCurriculumDto)
  curricula?: CourseCurriculumDto[];

  @ApiProperty({ example: 'برمجة الحاسب الآلي' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'برمجة الحاسب الآلي' })
  @IsString()
  @IsNotEmpty()
  nameAr!: string;

  @ApiProperty({ example: 'Computer Programming' })
  @IsString()
  @IsNotEmpty()
  nameEn!: string;

  @ApiProperty({ example: 'CS101' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ example: '1', enum: COURSE_LEVEL_VALUES })
  @IsEnum(COURSE_LEVEL_VALUES)
  @IsNotEmpty()
  level!: CourseLevel;

  @ApiPropertyOptional({ example: '1', enum: COURSE_LEVEL_VALUES })
  @IsOptional()
  @IsEnum(COURSE_LEVEL_VALUES)
  academicLevel?: CourseLevel;

  @ApiProperty({ example: 'first', enum: SEMESTER_VALUES })
  @IsEnum(SEMESTER_VALUES)
  @IsNotEmpty()
  semester!: Semester;

  @ApiPropertyOptional({ example: 'نظم معلومات الأعمال' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  creditHours?: number;

  @ApiPropertyOptional({ example: ['CS101'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  prerequisites?: string[];

  @ApiPropertyOptional({ example: ['CS102'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  coRequisites?: string[];

  @ApiPropertyOptional({ example: ['CS100'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  equivalentCourses?: string[];

  @ApiPropertyOptional({ enum: SEMESTER_VALUES, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(SEMESTER_VALUES, { each: true })
  offeredTerms?: Semester[];

  @ApiPropertyOptional({
    example: 'required',
    enum: [
      'required',
      'elective',
      'university_req',
      'institute_req',
      'specialization_req',
    ],
  })
  @IsOptional()
  @IsIn([
    'required',
    'elective',
    'university_req',
    'institute_req',
    'specialization_req',
  ])
  type?:
    | 'required'
    | 'elective'
    | 'university_req'
    | 'institute_req'
    | 'specialization_req';

  @ApiPropertyOptional({ minimum: 1, maximum: 8 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  recommendedSemester?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 4 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(4)
  minimumGpa?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCourseDto {
  @ApiPropertyOptional({ type: [CourseCurriculumDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CourseCurriculumDto)
  curricula?: CourseCurriculumDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nameAr?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nameEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ enum: COURSE_LEVEL_VALUES })
  @IsOptional()
  @IsEnum(COURSE_LEVEL_VALUES)
  level?: CourseLevel;

  @ApiPropertyOptional({ enum: COURSE_LEVEL_VALUES })
  @IsOptional()
  @IsEnum(COURSE_LEVEL_VALUES)
  academicLevel?: CourseLevel;

  @ApiPropertyOptional({ enum: SEMESTER_VALUES })
  @IsOptional()
  @IsEnum(SEMESTER_VALUES)
  semester?: Semester;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  creditHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  prerequisites?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  coRequisites?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  equivalentCourses?: string[];

  @ApiPropertyOptional({ enum: SEMESTER_VALUES, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(SEMESTER_VALUES, { each: true })
  offeredTerms?: Semester[];

  @ApiPropertyOptional({
    enum: [
      'required',
      'elective',
      'university_req',
      'institute_req',
      'specialization_req',
    ],
  })
  @IsOptional()
  @IsIn([
    'required',
    'elective',
    'university_req',
    'institute_req',
    'specialization_req',
  ])
  type?:
    | 'required'
    | 'elective'
    | 'university_req'
    | 'institute_req'
    | 'specialization_req';

  @ApiPropertyOptional({ minimum: 1, maximum: 8 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  recommendedSemester?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 4 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(4)
  minimumGpa?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class QueryCourseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: COURSE_LEVEL_VALUES })
  @IsOptional()
  @IsEnum(COURSE_LEVEL_VALUES)
  level?: CourseLevel;

  @ApiPropertyOptional({ enum: COURSE_LEVEL_VALUES })
  @IsOptional()
  @IsEnum(COURSE_LEVEL_VALUES)
  academicLevel?: CourseLevel;

  @ApiPropertyOptional({ enum: SEMESTER_VALUES })
  @IsOptional()
  @IsEnum(SEMESTER_VALUES)
  semester?: Semester;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  limit?: number;
}
