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
import { PERMISSIONS } from '@student-portal/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequireAnyPermissions } from '../auth/decorators/permissions.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { QueryStaffDto } from './dto/query-staff.dto';
import { QueryStaffCoursesDto } from './dto/query-staff-courses.dto';
import { UpdateStaffPermissionsDto } from './dto/update-staff-permissions.dto';
import { ResetStaffPasswordDto } from './dto/reset-staff-password.dto';
import { DeactivateStaffDto } from './dto/deactivate-staff.dto';
import { StaffManagementService } from './staff-management.service';
import { SensitiveOperation } from '../auth/guards/recent-auth.guard';

@ApiTags('Admin Staff Management')
@Controller('admin/staff')
@Roles('admin', 'staff')
export class StaffManagementController {
  constructor(private readonly staff: StaffManagementService) {}

  @Get()
  @RequireAnyPermissions(
    PERMISSIONS.STAFF_READ,
    PERMISSIONS.STAFF_CREATE_ACADEMIC,
  )
  @ApiOperation({
    summary: 'List staff accounts with pagination and filtering',
  })
  list(@Query() query: QueryStaffDto, @CurrentUser('role') actorRole: string) {
    return this.staff.list(query, actorRole);
  }

  @Post()
  @RequireAnyPermissions(PERMISSIONS.STAFF_CREATE_ACADEMIC)
  @ApiOperation({ summary: 'Create a staff account' })
  create(
    @Body() dto: CreateStaffDto,
    @CurrentUser('_id') actorId: string,
    @CurrentUser('role') actorRole: string,
  ) {
    return this.staff.create(dto, actorId, actorRole);
  }

  @Get('course-choices')
  @RequireAnyPermissions(PERMISSIONS.STAFF_CREATE_ACADEMIC)
  @ApiOperation({ summary: 'List course choices for staff assignment forms' })
  courseChoices(@Query() query: QueryStaffCoursesDto) {
    return this.staff.listFormCourses(query);
  }

  @Get(':id/courses')
  @RequireAnyPermissions(PERMISSIONS.STAFF_CREATE_ACADEMIC)
  @ApiOperation({ summary: 'List assigned courses for a staff edit form' })
  assignedCourses(
    @Param('id', ParseObjectIdPipe) id: string,
    @Query() query: QueryStaffCoursesDto,
  ) {
    return this.staff.listFormCourses(query, id);
  }

  @Get(':id/grade-entry-courses')
  @RequireAnyPermissions(
    PERMISSIONS.STAFF_READ,
    PERMISSIONS.STAFF_CREATE_ACADEMIC,
  )
  @ApiOperation({
    summary:
      'List course IDs authorized for Control grade entry for a staff member',
  })
  gradeEntryCourses(@Param('id', ParseObjectIdPipe) id: string) {
    return this.staff.listGradeEntryCourseIds(id);
  }

  @Get(':id')
  @RequireAnyPermissions(
    PERMISSIONS.STAFF_READ,
    PERMISSIONS.STAFF_CREATE_ACADEMIC,
  )
  @ApiOperation({ summary: 'Get one staff account' })
  get(@Param('id', ParseObjectIdPipe) id: string) {
    return this.staff.getById(id);
  }

  @Patch(':id')
  @RequireAnyPermissions(PERMISSIONS.STAFF_CREATE_ACADEMIC)
  @ApiOperation({ summary: 'Update a staff account profile' })
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateStaffDto,
    @CurrentUser('_id') actorId: string,
    @CurrentUser('role') actorRole: string,
  ) {
    return this.staff.update(id, dto, actorId, actorRole);
  }

  @Patch(':id/permissions')
  @SensitiveOperation('staff-permissions:id')
  @Roles('admin')
  @ApiOperation({ summary: 'Replace a staff account permission set' })
  updatePermissions(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateStaffPermissionsDto,
    @CurrentUser('_id') actorId: string,
    @CurrentUser('role') actorRole: string,
  ) {
    return this.staff.updatePermissions(id, dto, actorId, actorRole);
  }

  @Post(':id/reset-password')
  @SensitiveOperation('staff-reset:id')
  @RequireAnyPermissions(PERMISSIONS.STAFF_CREATE_ACADEMIC)
  @ApiOperation({
    summary: 'Reset password, revoke sessions, and require a password change',
  })
  resetPassword(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: ResetStaffPasswordDto,
    @CurrentUser('_id') actorId: string,
    @CurrentUser('role') actorRole: string,
  ) {
    return this.staff.resetPassword(id, dto, actorId, actorRole);
  }

  @Post(':id/deactivate')
  @RequireAnyPermissions(PERMISSIONS.STAFF_CREATE_ACADEMIC)
  @ApiOperation({
    summary: 'Deactivate a staff account without deleting history',
  })
  deactivate(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: DeactivateStaffDto,
    @CurrentUser('_id') actorId: string,
    @CurrentUser('role') actorRole: string,
  ) {
    return this.staff.deactivate(id, dto, actorId, actorRole);
  }

  @Post(':id/activate')
  @RequireAnyPermissions(PERMISSIONS.STAFF_CREATE_ACADEMIC)
  @ApiOperation({ summary: 'Reactivate a staff account' })
  activate(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser('_id') actorId: string,
    @CurrentUser('role') actorRole: string,
  ) {
    return this.staff.activate(id, actorId, actorRole);
  }

  @Delete(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Delete a staff account permanently' })
  delete(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser('_id') actorId: string,
    @CurrentUser('role') actorRole: string,
  ) {
    return this.staff.delete(id, actorId, actorRole);
  }

  @Get(':id/audit')
  @Roles('admin')
  @ApiOperation({
    summary: 'List recent lifecycle changes for a staff account',
  })
  audit(@Param('id', ParseObjectIdPipe) id: string) {
    return this.staff.listAudit(id);
  }
}
