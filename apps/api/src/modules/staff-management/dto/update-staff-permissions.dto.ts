import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsIn } from 'class-validator';
import { STAFF_ASSIGNABLE_PERMISSIONS } from '@student-portal/shared';

export class UpdateStaffPermissionsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsIn(STAFF_ASSIGNABLE_PERMISSIONS, { each: true })
  permissions!: string[];
}
