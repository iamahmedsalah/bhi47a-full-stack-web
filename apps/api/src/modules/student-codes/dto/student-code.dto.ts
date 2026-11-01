import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsIn,
  IsInt,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { STUDENT_CODE_STATUSES } from '@student-portal/shared';

class CodeYearDto {
  @IsString() @Matches(/^\d{4}-\d{4}$/) academicYear!: string;
  @IsString() @Matches(/^\d{2}$/) yearPrefix!: string;
}
export class CorrectCodeMappingsDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) fingerprint!: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(10, 1000)
  reason!: string;
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.confirmed)
  @Equals(true)
  confirmed!: true;
}
export class CodeHistoryQueryDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
export class CodeAuditQueryDto extends CodeHistoryQueryDto {
  @IsString() @Matches(/^\d{4}-\d{4}$/) academicYear!: string;
  @IsString() @Matches(/^\d{2}$/) yearPrefix!: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsIn([...STUDENT_CODE_STATUSES, 'MISSING'])
  status?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Matches(/^\d{0,6}$/)
  search?: string;
}
export class InitializeCodeYearDto extends CodeYearDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) fingerprint!: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(10, 1000)
  reason!: string;
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.confirmed)
  @Equals(true)
  confirmed!: true;
}
export class RecoverStudentCodeDto extends InitializeCodeYearDto {
  @Transform(
    ({ obj }: { obj: Record<string, unknown> }) => obj.neverAssignedConfirmed,
  )
  @Equals(true)
  neverAssignedConfirmed!: true;
}
