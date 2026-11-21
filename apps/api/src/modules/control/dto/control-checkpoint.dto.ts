import {
  IsBoolean,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ControlCheckpointDto {
  @IsMongoId()
  expectedActorId!: string;

  @IsOptional()
  @IsMongoId()
  studentId?: string | null;

  @IsIn(['raw', 'attendance', 'quizzes'])
  field!: 'raw' | 'attendance' | 'quizzes';

  @IsIn(['code', 'name', 'mark'])
  sort!: 'code' | 'name' | 'mark';

  @IsBoolean()
  descending!: boolean;

  @IsIn(['all', 'absent'])
  filter!: 'all' | 'absent';

  @IsBoolean()
  onlyMissing!: boolean;

  @IsString()
  @MaxLength(100)
  search!: string;
}
