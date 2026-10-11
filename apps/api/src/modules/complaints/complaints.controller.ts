import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ComplaintsService } from './complaints.service';
import {
  CreateComplaintDto,
  PublicCreateComplaintDto,
  ReplyComplaintDto,
  UpdateComplaintStatusDto,
  UpdateSystemSettingsDto,
  QueryComplaintDto,
  BulkDeleteComplaintsDto,
} from './dto/complaint.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import { PERMISSIONS } from '@student-portal/shared';

@ApiTags('Complaints & Tickets')
@Controller()
export class ComplaintsController {
  constructor(private readonly complaintsService: ComplaintsService) {}

  @Public()
  @Post('public/complaints')
  @ApiOperation({
    summary: 'Submit a new complaint ticket without requiring login',
  })
  async createPublic(@Body() dto: PublicCreateComplaintDto) {
    return this.complaintsService.createPublic(dto);
  }

  @Public()
  @Get('public/complaints/settings')
  @ApiOperation({
    summary: 'Get public system status and opening/closing times',
  })
  async getPublicSettings() {
    const settings = await this.complaintsService.getSettings();
    return {
      complaintsSystemOpen: settings.complaintsSystemOpen,
      complaintOpenAt: settings.complaintOpenAt,
      complaintCloseAt: settings.complaintCloseAt,
    };
  }

  // ─── Student Endpoints ───────────────────────────────────────────

  @Post('students/complaints')
  @Roles('student')
  @ApiOperation({ summary: 'Submit a new complaint ticket (Student)' })
  async create(
    @Body() dto: CreateComplaintDto,
    @CurrentUser('_id') studentId: string,
  ) {
    return this.complaintsService.create(dto, studentId);
  }

  @Get('students/complaints')
  @Roles('student')
  @ApiOperation({ summary: 'Get current student own complaint tickets list' })
  async getMyTickets(@CurrentUser('_id') studentId: string) {
    return this.complaintsService.findByStudent(studentId);
  }

  @Post('students/complaints/:id/reply')
  @Roles('student')
  @ApiOperation({
    summary: 'Add reply message on own complaint ticket (Student)',
  })
  async studentReply(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: ReplyComplaintDto,
    @CurrentUser('_id') studentId: string,
  ) {
    return this.complaintsService.addReply(id, dto, studentId, 'student');
  }

  // ─── Admin / Staff Endpoints ─────────────────────────────────────

  @Get('admin/complaints')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.COMPLAINTS_READ)
  @ApiOperation({ summary: 'List and filter all complaints (Admin/Staff)' })
  async findAll(@Query() query: QueryComplaintDto) {
    return this.complaintsService.findAll(query);
  }

  @Get('admin/complaints/assignees')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.COMPLAINTS_READ)
  @ApiOperation({ summary: 'List active staff/admin users for assignment' })
  async assignees() {
    return this.complaintsService.findAssignableStaff();
  }

  @Get('admin/complaints/settings')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.COMPLAINTS_MANAGE_SETTINGS)
  @ApiOperation({
    summary: 'Get complaints system settings and blacklist (Admin/Staff)',
  })
  async getSettings() {
    return this.complaintsService.getSettings();
  }

  @Post('admin/complaints/settings')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.COMPLAINTS_MANAGE_SETTINGS)
  @ApiOperation({
    summary: 'Update complaints portal settings and blacklist (Admin)',
  })
  async updateSettings(
    @Body() dto: UpdateSystemSettingsDto,
    @CurrentUser('_id') adminId: string,
  ) {
    return this.complaintsService.updateSettings(dto, adminId);
  }

  @Patch('admin/complaints/:id')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.COMPLAINTS_WRITE)
  @ApiOperation({
    summary: 'Update complaint status and priority (Admin/Staff)',
  })
  async updateStatus(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateComplaintStatusDto,
    @CurrentUser('_id') userId: string,
  ) {
    return this.complaintsService.updateStatus(id, dto, userId);
  }

  @Post('admin/complaints/:id/reply')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.COMPLAINTS_REPLY)
  @ApiOperation({ summary: 'Reply to complaint ticket (Admin/Staff)' })
  async adminReply(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: ReplyComplaintDto,
    @CurrentUser('_id') adminId: string,
    @CurrentUser('role') role: 'admin' | 'staff',
  ) {
    return this.complaintsService.addReply(id, dto, adminId, role);
  }

  @Delete('admin/complaints/all')
  @Roles('admin')
  @RequirePermissions(PERMISSIONS.COMPLAINTS_WRITE)
  @ApiOperation({ summary: 'Purge / Clear all complaint tickets (Admin)' })
  async clearAllComplaints(@CurrentUser('_id') adminId: string) {
    return this.complaintsService.clearAll(adminId);
  }

  @Post('admin/complaints/bulk-delete')
  @Roles('admin')
  @RequirePermissions(PERMISSIONS.COMPLAINTS_WRITE)
  @ApiOperation({ summary: 'Bulk delete selected complaint tickets (Admin)' })
  async bulkDeleteComplaints(
    @Body() dto: BulkDeleteComplaintsDto,
    @CurrentUser('_id') adminId: string,
  ) {
    return this.complaintsService.bulkDelete(dto.ids, adminId);
  }

  @Delete('admin/complaints/:id')
  @Roles('admin')
  @RequirePermissions(PERMISSIONS.COMPLAINTS_WRITE)
  @ApiOperation({ summary: 'Delete single complaint ticket (Admin)' })
  async deleteComplaint(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser('_id') adminId: string,
  ) {
    return this.complaintsService.delete(id, adminId);
  }
}
