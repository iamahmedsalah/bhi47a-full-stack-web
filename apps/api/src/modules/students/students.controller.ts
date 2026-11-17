import { SensitiveOperation } from '../auth/guards/recent-auth.guard';
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { StudentsService } from './students.service';
import {
  CreateStudentDto,
  PasswordRequirementCodesQuery,
  UpdateStudentDto,
  SearchStudentQuery,
  ResetPasswordDto,
  UpdateMyContactDto,
  ToggleAllMustChangePasswordDto,
  TransferDepartmentDto,
  UpdatePortalSettingsDto,
  ResetAcademicRecordsDto,
} from './dto/student.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import { PERMISSIONS } from '@student-portal/shared';
import type { AuthenticatedUser } from '../auth/types/authenticated-request';

@ApiTags('Students')
@Controller()
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  // ─── Admin Routes ────────────────────────────────────────

  @Get('admin/students')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.STUDENTS_READ)
  @ApiOperation({ summary: 'List all students (admin/staff)' })
  async findAll(
    @Query() query: SearchStudentQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.studentsService.findAll(query, user);
  }

  @Get('admin/students-stats')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.STUDENTS_READ)
  @ApiOperation({ summary: 'Get student count statistics (admin/staff)' })
  async getStats() {
    return this.studentsService.getStats();
  }

  @Get('admin/students/active-sessions')
  @Roles('admin')
  @RequirePermissions(PERMISSIONS.STUDENTS_READ)
  @ApiOperation({ summary: 'Get active online student sessions (admin only)' })
  async getActiveSessions(@Query('windowMinutes') windowMinutes?: number) {
    return this.studentsService.getActiveSessions(Number(windowMinutes) || 60);
  }

  @Get('admin/students/:id')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.STUDENTS_READ)
  @ApiOperation({ summary: 'Get student full profile (admin/staff)' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.studentsService.findById(id, user);
  }

  @Post('admin/students')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.STUDENTS_WRITE)
  @ApiOperation({ summary: 'Create new student (admin)' })
  async create(
    @Body() dto: CreateStudentDto,
    @CurrentUser('_id') actorId: string,
  ) {
    return this.studentsService.create(dto, actorId);
  }

  @Patch('admin/students/:id')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.STUDENTS_WRITE)
  @ApiOperation({ summary: 'Update student (admin)' })
  async update(@Param('id') id: string, @Body() dto: UpdateStudentDto) {
    return this.studentsService.update(id, dto);
  }

  @Post('admin/students/:id/activate')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.STUDENTS_WRITE)
  @ApiOperation({ summary: 'Reactivate student account (admin/staff)' })
  async activate(@Param('id', ParseObjectIdPipe) id: string) {
    return this.studentsService.activate(id);
  }

  @Post('admin/students/:id/deactivate')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.STUDENTS_WRITE)
  @ApiOperation({ summary: 'Deactivate student account (admin/staff)' })
  async deactivatePost(@Param('id', ParseObjectIdPipe) id: string) {
    return this.studentsService.deactivate(id);
  }

  @Delete('admin/students/:id/deactivate')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.STUDENTS_WRITE)
  async deactivateAlias(@Param('id', ParseObjectIdPipe) id: string) {
    return this.studentsService.deactivate(id);
  }

  @Delete('admin/students/:id')
  @Roles('admin')
  @ApiOperation({ summary: 'Delete student permanently (admin only)' })
  async deleteStudent(
    @Param('id') id: string,
    @CurrentUser('_id') actorId: string,
  ) {
    return this.studentsService.deleteStudent(id, actorId);
  }

  @Post('admin/students/:id/reset-password')
  @SensitiveOperation('student-reset:id')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.STUDENTS_RESET_PASSWORD)
  @ApiOperation({ summary: 'Reset student password (admin)' })
  async resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    return this.studentsService.resetPassword(id, dto, user, acceptLanguage);
  }

  @Get('admin/students-must-change-password-summary')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.STUDENTS_READ)
  @ApiOperation({
    summary: 'Get summary of mustChangePassword status across all students',
  })
  async getMustChangePasswordSummary() {
    return this.studentsService.getMustChangePasswordSummary();
  }

  @Get('admin/students-must-change-password-codes')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.STUDENTS_READ)
  async getMustChangePasswordCodes(
    @Query() query: PasswordRequirementCodesQuery,
  ) {
    return this.studentsService.getMustChangePasswordCodes(
      query.page,
      query.limit,
    );
  }

  @Post('admin/students-toggle-all-must-change-password')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.STUDENTS_RESET_PASSWORD)
  @ApiOperation({
    summary: 'Toggle mustChangePassword flag for all students in bulk',
  })
  async toggleAllMustChangePassword(
    @Body() dto: ToggleAllMustChangePasswordDto,
  ) {
    return this.studentsService.toggleAllMustChangePassword(dto.enabled);
  }

  @Post('admin/students/transfer-department')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.STUDENTS_WRITE)
  @ApiOperation({
    summary:
      'Transfer students between departments (BIS ⇄ Accounting / General)',
  })
  async transferDepartment(@Body() dto: TransferDepartmentDto) {
    return this.studentsService.transferDepartment(
      dto.studentIds,
      dto.targetDepartment,
      dto.targetLevel,
    );
  }

  @Get('portal-settings')
  @Roles('student', 'staff', 'admin')
  @ApiOperation({
    summary: 'Get current student portal feature visibility flags',
  })
  async getPortalSettings() {
    return this.studentsService.getPortalSettings();
  }

  @Get('admin/portal-settings')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.STUDENTS_READ)
  @ApiOperation({
    summary: 'Get current portal feature settings (admin/staff)',
  })
  async getAdminPortalSettings() {
    return this.studentsService.getPortalSettings();
  }

  @Patch('admin/portal-settings')
  @Roles('admin')
  @ApiOperation({ summary: 'Update portal feature flags (admin only)' })
  async updatePortalSettings(
    @Body() dto: UpdatePortalSettingsDto,
    @CurrentUser('_id') adminId: string,
  ) {
    return this.studentsService.updatePortalSettings(dto, adminId);
  }

  @Post('admin/students/reset-academic-records')
  @Roles('admin')
  @ApiOperation({
    summary:
      'Bulk reset academic warnings and GPA to 0 for all students (admin only)',
  })
  async resetAcademicRecords(@Body() dto: ResetAcademicRecordsDto) {
    return this.studentsService.resetAcademicRecords(dto);
  }

  // ─── Student Routes ──────────────────────────────────────

  @Get('students/me/dashboard')
  @Roles('student')
  @ApiOperation({ summary: 'Get student dashboard' })
  async getDashboard(@CurrentUser('_id') userId: string) {
    return this.studentsService.getDashboard(userId);
  }

  @Get('students/me/profile')
  @Roles('student')
  @ApiOperation({ summary: 'Get student profile' })
  async getProfile(@CurrentUser('_id') userId: string) {
    return this.studentsService.findByUserId(userId);
  }

  @Patch('students/me/contact')
  @SensitiveOperation('profile:contact')
  @Roles('student')
  @ApiOperation({ summary: 'Update current student optional contact fields' })
  async updateMyContact(
    @CurrentUser('_id') userId: string,
    @Body() dto: UpdateMyContactDto,
  ) {
    return this.studentsService.updateMyContact(userId, dto);
  }
}
