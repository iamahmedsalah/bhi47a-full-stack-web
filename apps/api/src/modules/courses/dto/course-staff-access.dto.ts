import {
  ArrayUnique,
  IsArray,
  IsISO8601,
  IsMongoId,
  IsOptional,
  ValidateIf,
} from 'class-validator';

export interface CourseStaffAccessResponse {
  members: {
    _id: string;
    name: string;
    nameAr?: string;
    staffType?: string;
    titlePrefix?: string;
    canSupervise: boolean;
    isAutoAuthorizedDoctor?: boolean;
  }[];
  supervisorId: string | null;
  canEditSupervisor?: boolean;
  gradeEntryStaffIds: string[];
  revision: string | null;
}

export class UpdateCourseStaffAccessDto {
  @IsOptional()
  @ValidateIf((_dto, value: unknown) => value !== null && value !== undefined)
  @IsMongoId()
  supervisorId?: string | null;

  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  gradeEntryStaffIds!: string[];

  @ValidateIf((_dto, value: unknown) => value !== null)
  @IsISO8601({ strict: true })
  revision!: string | null;
}
