import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const DAY_VALUES = [
  'saturday',
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
] as const;

const SLOT_TYPES = ['lecture', 'section', 'lab'] as const;

export class CreateCourseScheduleDto {
  @ApiProperty({ description: 'MongoDB ObjectId of the course' })
  @IsString()
  @IsNotEmpty()
  courseId!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  courseCode?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  courseName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  courseNameAr?: string;

  @ApiProperty({
    description: 'MongoDB ObjectId of the staff member (doctor/instructor)',
  })
  @IsString()
  @IsNotEmpty()
  staffId!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  staffName?: string;

  @ApiPropertyOptional({
    enum: ['doctor', 'teaching_assistant', 'assistant_lecturer'],
    default: 'doctor',
  })
  @IsEnum(['doctor', 'teaching_assistant', 'assistant_lecturer'])
  @IsOptional()
  staffType?: 'doctor' | 'teaching_assistant' | 'assistant_lecturer';

  @ApiProperty({ enum: SLOT_TYPES, default: 'lecture' })
  @IsEnum(SLOT_TYPES)
  type!: 'lecture' | 'section' | 'lab';

  @ApiProperty({ enum: DAY_VALUES })
  @IsEnum(DAY_VALUES)
  dayOfWeek!:
    'saturday' | 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday';

  @ApiProperty({ description: 'Start time e.g. 09:00 AM' })
  @IsString()
  @IsNotEmpty()
  startTime!: string;

  @ApiProperty({ description: 'End time e.g. 11:00 AM' })
  @IsString()
  @IsNotEmpty()
  endTime!: string;

  @ApiProperty({ description: 'Location / Hall / Room name (e.g. مدرج 1)' })
  @IsString()
  @IsNotEmpty()
  location!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  locationAr?: string;

  @ApiPropertyOptional({ default: '1' })
  @IsString()
  @IsOptional()
  level?: string;

  @ApiPropertyOptional({
    enum: ['first', 'second', 'summer'],
    default: 'first',
  })
  @IsString()
  @IsOptional()
  semester?: string;

  @ApiPropertyOptional({ default: 'GENERAL' })
  @IsString()
  @IsOptional()
  department?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  group?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  section?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateCourseScheduleDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  courseId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  courseCode?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  courseName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  courseNameAr?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  staffId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  staffName?: string;

  @ApiPropertyOptional({
    enum: ['doctor', 'teaching_assistant', 'assistant_lecturer'],
  })
  @IsEnum(['doctor', 'teaching_assistant', 'assistant_lecturer'])
  @IsOptional()
  staffType?: 'doctor' | 'teaching_assistant' | 'assistant_lecturer';

  @ApiPropertyOptional({ enum: SLOT_TYPES })
  @IsEnum(SLOT_TYPES)
  @IsOptional()
  type?: 'lecture' | 'section' | 'lab';

  @ApiPropertyOptional({ enum: DAY_VALUES })
  @IsEnum(DAY_VALUES)
  @IsOptional()
  dayOfWeek?:
    'saturday' | 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday';

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  startTime?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  endTime?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  locationAr?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  level?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  semester?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  department?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  group?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  section?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class QueryCourseScheduleDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  staffId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  courseId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  level?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  semester?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  department?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  dayOfWeek?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  type?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;
}
