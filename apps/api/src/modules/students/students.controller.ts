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
import { StudentsService } from './students.service';
import {
  CreateStudentDto,
  UpdateStudentDto,
  SearchStudentQuery,
  ResetPasswordDto,
  UpdateMyContactDto,
} from './dto/student.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import { PERMISSIONS } from '@student-portal/shared';

@ApiTags('Students')
@Controller()
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  // ─── Admin Routes ────────────────────────────────────────

  @Get('admin/students')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.STUDENTS_READ)
  @ApiOperation({ summary: 'List all students (admin/staff)' })
  async findAll(@Query() query: SearchStudentQuery) {
    return this.studentsService.findAll(query);
  }

  @Get('admin/students/:id')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.STUDENTS_READ)
  @ApiOperation({ summary: 'Get student full profile (admin/staff)' })
  async findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.studentsService.findById(id);
  }

  @Post('admin/students')
  @Roles('admin')
  @ApiOperation({ summary: 'Create new student (admin)' })
  async create(@Body() dto: CreateStudentDto) {
    return this.studentsService.create(dto);
  }

  @Patch('admin/students/:id')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.STUDENTS_WRITE)
  @ApiOperation({ summary: 'Update student (admin)' })
  async update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateStudentDto,
  ) {
    return this.studentsService.update(id, dto);
  }

  @Post('admin/students/:id/activate')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.STUDENTS_WRITE)
  @ApiOperation({ summary: 'Reactivate student account (admin/staff)' })
  async activate(@Param('id', ParseObjectIdPipe) id: string) {
    return this.studentsService.activate(id);
  }

  @Delete('admin/students/:id')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.STUDENTS_WRITE)
  @ApiOperation({ summary: 'Deactivate student (admin)' })
  async deactivate(@Param('id', ParseObjectIdPipe) id: string) {
    return this.studentsService.deactivate(id);
  }

  @Post('admin/students/:id/reset-password')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.STUDENTS_RESET_PASSWORD)
  @ApiOperation({ summary: 'Reset student password (admin)' })
  async resetPassword(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.studentsService.resetPassword(id, dto);
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
  @Roles('student')
  @ApiOperation({ summary: 'Update current student optional contact fields' })
  async updateMyContact(
    @CurrentUser('_id') userId: string,
    @Body() dto: UpdateMyContactDto,
  ) {
    return this.studentsService.updateMyContact(userId, dto);
  }
}
