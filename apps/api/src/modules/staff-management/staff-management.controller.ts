import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { QueryStaffDto } from './dto/query-staff.dto';
import { UpdateStaffPermissionsDto } from './dto/update-staff-permissions.dto';
import { ResetStaffPasswordDto } from './dto/reset-staff-password.dto';
import { DeactivateStaffDto } from './dto/deactivate-staff.dto';
import { StaffManagementService } from './staff-management.service';

@ApiTags('Admin Staff Management')
@Controller('admin/staff')
@Roles('admin')
export class StaffManagementController {
  constructor(private readonly staff: StaffManagementService) {}

  @Get()
  @ApiOperation({
    summary: 'List staff accounts with pagination and filtering',
  })
  list(@Query() query: QueryStaffDto) {
    return this.staff.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a staff account' })
  create(@Body() dto: CreateStaffDto, @CurrentUser('_id') actorId: string) {
    return this.staff.create(dto, actorId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one staff account' })
  get(@Param('id', ParseObjectIdPipe) id: string) {
    return this.staff.getById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a staff account profile' })
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateStaffDto,
    @CurrentUser('_id') actorId: string,
  ) {
    return this.staff.update(id, dto, actorId);
  }

  @Patch(':id/permissions')
  @ApiOperation({ summary: 'Replace a staff account permission set' })
  updatePermissions(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateStaffPermissionsDto,
    @CurrentUser('_id') actorId: string,
  ) {
    return this.staff.updatePermissions(id, dto, actorId);
  }

  @Post(':id/reset-password')
  @ApiOperation({
    summary: 'Reset password, revoke sessions, and require a password change',
  })
  resetPassword(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: ResetStaffPasswordDto,
    @CurrentUser('_id') actorId: string,
  ) {
    return this.staff.resetPassword(id, dto, actorId);
  }

  @Post(':id/deactivate')
  @ApiOperation({
    summary: 'Deactivate a staff account without deleting history',
  })
  deactivate(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: DeactivateStaffDto,
    @CurrentUser('_id') actorId: string,
  ) {
    return this.staff.deactivate(id, dto, actorId);
  }

  @Post(':id/activate')
  @ApiOperation({ summary: 'Reactivate a staff account' })
  activate(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser('_id') actorId: string,
  ) {
    return this.staff.activate(id, actorId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a staff account permanently' })
  delete(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser('_id') actorId: string,
  ) {
    return this.staff.delete(id, actorId);
  }

  @Get(':id/audit')
  @ApiOperation({
    summary: 'List recent lifecycle changes for a staff account',
  })
  audit(@Param('id', ParseObjectIdPipe) id: string) {
    return this.staff.listAudit(id);
  }
}
