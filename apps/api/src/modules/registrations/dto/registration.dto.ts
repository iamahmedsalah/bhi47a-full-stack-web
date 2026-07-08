import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  COURSE_LEVEL_VALUES,
  SEMESTER_VALUES,
  type CourseLevel,
  type Semester,
} from '@student-portal/shared';
import type {
  AdvisingReason,
  AdvisingStatus,
} from '../schemas/academic-advising-request.schema';
import type { RegistrationStatus } from '../schemas/course-registration.schema';

export class UpsertStudentAcademicProfileDto {
  @ApiProperty()
  @IsMongoId()
  studentId!: string;

  @ApiProperty({ enum: COURSE_LEVEL_VALUES })
  @IsEnum(COURSE_LEVEL_VALUES)
  academicLevel!: CourseLevel;

  @ApiProperty({ enum: SEMESTER_VALUES })
  @IsEnum(SEMESTER_VALUES)
  semester!: Semester;

  @ApiProperty({ minimum: 0, maximum: 4 })
  @IsNumber()
  @Min(0)
  @Max(4)
  gpa!: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  completedCourses?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  failedCourses?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  advisorId?: string;
}

export class CreateGpaRegistrationRuleDto {
  @ApiProperty({ minimum: 0, maximum: 4 })
  @IsNumber()
  @Min(0)
  @Max(4)
  minGpa!: number;

  @ApiProperty({ minimum: 0, maximum: 4 })
  @IsNumber()
  @Min(0)
  @Max(4)
  maxGpa!: number;

  @ApiProperty({ minimum: 1 })
  @IsNumber()
  @Min(1)
  maxCreditHours!: number;

  @ApiProperty()
  @IsBoolean()
  requiresAdvisor!: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateGpaRegistrationRuleDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 4 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(4)
  minGpa?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 4 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(4)
  maxGpa?: number;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxCreditHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresAdvisor?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SubmitRegistrationDto {
  @ApiProperty({ type: [String], example: ['BIS101', 'CS101'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  courseCodes!: string[];
}

export class ReviewAdvisingRequestDto {
  @ApiProperty({ type: [String], example: ['BIS101', 'CS101'] })
  @IsArray()
  @IsString({ each: true })
  staffApprovedCourses!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  staffNotes?: string;

  @ApiProperty({ enum: ['approved', 'rejected'] })
  @IsIn(['approved', 'rejected'])
  status!: Extract<AdvisingStatus, 'approved' | 'rejected'>;
}

export class QueryAdvisingRequestDto {
  @ApiPropertyOptional({
    enum: ['pending', 'reviewed', 'approved', 'rejected'],
  })
  @IsOptional()
  @IsIn(['pending', 'reviewed', 'approved', 'rejected'])
  status?: AdvisingStatus;

  @ApiPropertyOptional({ enum: ['low_gpa', 'probation', 'failed_courses'] })
  @IsOptional()
  @IsIn(['low_gpa', 'probation', 'failed_courses'])
  reason?: AdvisingReason;

  @ApiPropertyOptional()
  @IsOptional()
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  limit?: number;
}

export class QueryRegistrationDto {
  @ApiPropertyOptional({ enum: ['pending', 'approved', 'rejected'] })
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected'])
  status?: RegistrationStatus;

  @ApiPropertyOptional()
  @IsOptional()
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  limit?: number;
}

export class AssignAdvisorDto {
  @ApiProperty()
  @IsMongoId()
  @IsNotEmpty()
  advisorId!: string;
}
