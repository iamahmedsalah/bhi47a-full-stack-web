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
  IsDateString,
  Matches,
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

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lowGradeCourses?: string[];

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  academicWarnings?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isGraduatingThisYear?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  approvedICCourseCompletions?: string[];

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

  @ApiPropertyOptional({ minimum: 1, default: 10 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  minCreditHours?: number;

  @ApiPropertyOptional({ minimum: 1, default: 4 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  minCourses?: number;

  @ApiPropertyOptional({ minimum: 1, default: 6 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxCourses?: number;

  @ApiProperty()
  @IsBoolean()
  requiresAdvisor!: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  requireForFailedCourses?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  requireForAcademicWarnings?: boolean;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  academicWarningThreshold?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  requireForIncompleteCourses?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  requireForGraduationPlans?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requireForSummerRegistration?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  exemptNewStudentsFromGpaRule?: boolean;

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

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  minCreditHours?: number;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  minCourses?: number;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxCourses?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresAdvisor?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requireForFailedCourses?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requireForAcademicWarnings?: boolean;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  academicWarningThreshold?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requireForIncompleteCourses?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requireForGraduationPlans?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requireForSummerRegistration?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  exemptNewStudentsFromGpaRule?: boolean;

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

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  overridePrerequisites?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  overrideMaxCreditHours?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  approveIncompleteCompletion?: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: 3 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(3)
  summerCourseLimit?: number;

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

  @ApiPropertyOptional({
    enum: ['low_gpa', 'probation', 'failed_courses', 'summer_policy'],
  })
  @IsOptional()
  @IsIn(['low_gpa', 'probation', 'failed_courses', 'summer_policy'])
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

  @ApiPropertyOptional({ enum: ['required', 'case', 'none'] })
  @IsOptional()
  @IsIn(['required', 'case', 'none'])
  advising?: 'required' | 'case' | 'none';

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  studentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: SEMESTER_VALUES })
  @IsOptional()
  @IsEnum(SEMESTER_VALUES)
  semester?: Semester;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  academicYear?: string;

  @ApiPropertyOptional({ enum: ['student', 'advisor'] })
  @IsOptional()
  @IsIn(['student', 'advisor'])
  source?: 'student' | 'advisor';

  @ApiPropertyOptional()
  @IsOptional()
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ enum: COURSE_LEVEL_VALUES })
  @IsOptional()
  @IsEnum(COURSE_LEVEL_VALUES)
  academicLevel?: CourseLevel;
}

export class AssignAdvisorDto {
  @ApiProperty()
  @IsMongoId()
  @IsNotEmpty()
  advisorId!: string;
}

export class UpsertRegistrationTermDto {
  @ApiProperty({ example: '2026-2027' })
  @IsString()
  @IsNotEmpty()
  academicYear!: string;

  @ApiProperty({ enum: SEMESTER_VALUES })
  @IsEnum(SEMESTER_VALUES)
  semester!: Semester;

  @ApiProperty()
  @IsBoolean()
  isOpen!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  opensAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  closesAt?: string;
}

export class CreateAcademicYearDto {
  @ApiProperty({ example: '2026-2027' })
  @IsString()
  @Matches(/^\d{4}-\d{4}$/)
  academicYear!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  makeCurrent?: boolean;
}

export class AdminProxyRegistrationDto {
  @ApiProperty()
  @IsMongoId()
  @IsNotEmpty()
  studentId!: string;

  @ApiProperty({ type: [String], example: ['BIS101', 'CS101'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  courseCodes!: string[];
}
