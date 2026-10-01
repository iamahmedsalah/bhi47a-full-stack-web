import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateAdvisingRulesDto {
  @ApiPropertyOptional({ default: 6, minimum: 1, maximum: 10 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  maxCoursesLimit?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  preventHigherLevelCourses?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  allowLowGradeImprovementFallback?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enforceDepartmentLevel3And4?: boolean;

  @ApiPropertyOptional({ default: 12, minimum: 3, maximum: 24 })
  @IsOptional()
  @IsNumber()
  @Min(3)
  @Max(24)
  probationMaxCredits?: number;

  @ApiPropertyOptional({ default: 18, minimum: 6, maximum: 24 })
  @IsOptional()
  @IsNumber()
  @Min(6)
  @Max(24)
  regularMaxCredits?: number;

  @ApiPropertyOptional({ default: 21, minimum: 6, maximum: 28 })
  @IsOptional()
  @IsNumber()
  @Min(6)
  @Max(28)
  graduatingMaxCredits?: number;

  @ApiPropertyOptional({ default: 9, minimum: 3, maximum: 15 })
  @IsOptional()
  @IsNumber()
  @Min(3)
  @Max(15)
  summerMaxCredits?: number;

  @ApiPropertyOptional({ default: 6, minimum: 3, maximum: 12 })
  @IsOptional()
  @IsNumber()
  @Min(3)
  @Max(12)
  summerProbationMaxCredits?: number;
}
