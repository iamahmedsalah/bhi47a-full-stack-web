import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty } from 'class-validator';

export class UpdateThemeDto {
  @ApiProperty({ enum: ['light', 'dark', 'system'], example: 'system' })
  @IsNotEmpty()
  @IsIn(['light', 'dark', 'system'])
  theme!: 'light' | 'dark' | 'system';
}
