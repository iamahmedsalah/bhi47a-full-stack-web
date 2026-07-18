import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  ADVISING_STATUSES,
  GRAPH_EDGE_TYPES,
  GRAPH_NODE_TYPES,
  NOTE_VISIBILITIES,
  PLAN_TYPES,
} from '../constants/advising.constants';

export class AdvisingStudentsQueryDto {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsString() level?: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{4}$/) academicYear?: string;
  @IsOptional() @IsIn(['first', 'second', 'summer']) semester?: string;
  @IsOptional() @IsEnum(ADVISING_STATUSES) status?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(4) minGpa?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(4) maxGpa?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
export class CreateAdvisingCaseDto {
  @IsMongoId() studentId!: string;
  @IsString() @Matches(/^\d{4}-\d{4}$/) academicYear!: string;
  @IsString() @MinLength(1) @MaxLength(30) semester!: string;
  @IsOptional() @IsMongoId() assignedAdvisorId?: string;
}
export class UpdateCaseStatusDto {
  @IsEnum(ADVISING_STATUSES) status!: string;
}
export class AssignCaseDto {
  @IsMongoId() advisorId!: string;
}
export class BulkAssignAdvisorDto {
  @IsMongoId() advisorId!: string;
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(200)
  @IsMongoId({ each: true })
  studentIds!: string[];
  @IsString() @MinLength(4) @MaxLength(20) academicYear!: string;
  @IsIn(['first', 'second', 'summer']) semester!: string;
}
export class GenerateRecommendationsDto {
  @IsOptional() @IsInt() @Min(1) @Max(30) maxCredits = 18;
}
export class DecideRecommendationDto {
  @IsOptional() @IsBoolean() accepted?: boolean;
  @IsOptional()
  @IsEnum(['ACCEPTED', 'REJECTED', 'PENDING'])
  decision?: 'ACCEPTED' | 'REJECTED' | 'PENDING';
  @IsOptional() @IsString() @MaxLength(1000) rejectionReason?: string;
}
export class CreatePlanDto {
  @IsEnum(PLAN_TYPES) type!: string;
  @IsString() @MinLength(2) @MaxLength(160) title!: string;
  @IsArray()
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsMongoId({ each: true })
  selectedCourses!: string[];
  @IsOptional() @IsString() @MaxLength(4000) advisorNotes?: string;
  @IsOptional() @IsString() @MaxLength(4000) studentVisibleNotes?: string;
}
export class UpdatePlanDto {
  @IsInt() @Min(1) version!: number;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) title?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsMongoId({ each: true })
  selectedCourses?: string[];
  @IsOptional() @IsString() @MaxLength(4000) advisorNotes?: string;
  @IsOptional() @IsString() @MaxLength(4000) studentVisibleNotes?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  overrideReasons?: string[];
}
class PositionDto {
  @IsNumber() x!: number;
  @IsNumber() y!: number;
}
class GraphNodeDto {
  @IsString() @MaxLength(100) id!: string;
  @IsEnum(GRAPH_NODE_TYPES) type!: string;
  @ValidateNested() @Type(() => PositionDto) position!: PositionDto;
  @IsOptional() @IsMongoId() courseId?: string;
  @IsString() @MaxLength(200) label!: string;
  @IsOptional() @IsString() @MaxLength(40) status?: string;
  @IsOptional() @IsBoolean() locked?: boolean;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
class GraphEdgeDto {
  @IsString() @MaxLength(100) id!: string;
  @IsEnum(GRAPH_EDGE_TYPES) type!: string;
  @IsString() @MaxLength(100) source!: string;
  @IsString() @MaxLength(100) target!: string;
}
class ViewportDto {
  @IsNumber() x!: number;
  @IsNumber() y!: number;
  @IsNumber() @Min(0.1) @Max(4) zoom!: number;
}
export class SaveGraphDto {
  @IsArray()
  @ArrayMaxSize(250)
  @ValidateNested({ each: true })
  @Type(() => GraphNodeDto)
  nodes!: GraphNodeDto[];
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => GraphEdgeDto)
  edges!: GraphEdgeDto[];
  @ValidateNested() @Type(() => ViewportDto) viewport!: ViewportDto;
  @IsInt() @Min(1) layoutVersion!: number;
}
export class CreateNoteDto {
  @IsEnum(NOTE_VISIBILITIES) visibility!: string;
  @IsString() @MinLength(1) @MaxLength(4000) content!: string;
  @IsOptional() @IsMongoId() relatedCourseId?: string;
  @IsOptional() @IsString() @MaxLength(100) relatedNodeId?: string;
}
