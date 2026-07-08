import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import { UsersService } from './users.service';

@ApiTags('Admin Staff Management')
@Controller('admin/staff')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'List all staff users' })
  listStaff() {
    return this.usersService.listStaff();
  }

  @Patch(':id/permissions')
  @Roles('admin')
  @ApiOperation({ summary: 'Update a staff member permissions list' })
  updatePermissions(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body('permissions') permissions: string[],
  ) {
    return this.usersService.updateStaffPermissions(id, permissions);
  }
}
