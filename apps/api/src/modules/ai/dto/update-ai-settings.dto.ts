import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateAiSettingsDto {
  @ApiProperty({
    description: 'Whether students may use the academic AI advisor',
    example: true,
  })
  @IsBoolean()
  studentAdvisorEnabled!: boolean;
}
