import {
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
export class EnrollmentSearchDto {
  @IsString() @MinLength(2) @MaxLength(100) search!: string;
}
export class StudentEnrollmentTermDto {
  @IsString() @Matches(/^\d{4}-\d{4}$/) academicYear!: string;
  @IsIn(['first', 'second', 'summer']) semester!: 'first' | 'second' | 'summer';
}
export class StudentEnrollmentCourseQueryDto extends StudentEnrollmentTermDto {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
}
export class StudentEnrollmentMutationDto extends StudentEnrollmentTermDto {
  @IsMongoId() courseId!: string;
  @IsString() @Matches(/^[a-f0-9]{64}$/) expectedVersion!: string;
}
