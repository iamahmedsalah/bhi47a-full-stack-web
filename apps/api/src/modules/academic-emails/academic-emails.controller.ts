import { Controller, Get, Patch, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AcademicEmailsService } from './academic-emails.service';
import {
  UpdateAcademicEmailDto,
  QueryAcademicEmailDto,
} from './dto/academic-email.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import { PERMISSIONS } from '@student-portal/shared';

@ApiTags('Academic Emails')
@Controller()
export class AcademicEmailsController {
  constructor(private readonly emailService: AcademicEmailsService) {}

  @Get('students/me/academic-email')
  @Roles('student')
  @ApiOperation({ summary: 'Get current student academic email details' })
  async getMyEmail(@CurrentUser('_id') studentId: string) {
    return this.emailService.findByStudentId(studentId);
  }

  @Get('admin/academic-emails')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.ACADEMIC_EMAILS_READ)
  @ApiOperation({
    summary: 'List and filter all academic emails (Admin/Staff)',
  })
  async findAll(@Query() query: QueryAcademicEmailDto) {
    return this.emailService.findAll(query);
  }

  @Patch('admin/academic-emails/:id')
  @Roles('admin')
  @ApiOperation({
    summary: 'Update or activate/deactivate academic email (Admin)',
  })
  async update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateAcademicEmailDto,
    @CurrentUser('_id') adminId: string,
  ) {
    return this.emailService.update(id, dto, adminId);
  }
}
