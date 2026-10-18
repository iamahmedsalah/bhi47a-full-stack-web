import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { CourseSchedulesService } from './course-schedules.service';
import {
  CreateCourseScheduleDto,
  UpdateCourseScheduleDto,
  QueryCourseScheduleDto,
} from './dto/course-schedule.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PERMISSIONS } from '@student-portal/shared';

@ApiTags('Course & Section Schedules')
@ApiBearerAuth()
@Controller()
export class CourseSchedulesController {
  constructor(private readonly schedulesService: CourseSchedulesService) {}

  @Get(['staff/me/schedule', 'course-schedules/staff/me'])
  @Roles('admin', 'staff')
  @ApiOperation({
    summary:
      'Get assigned lecture & section schedule for current doctor/staff member',
  })
  async getMySchedule(@CurrentUser('_id') staffUserId: string) {
    return this.schedulesService.findByStaff(staffUserId);
  }

  @Get('admin/course-schedules/template')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.COURSE_SCHEDULES_READ)
  @ApiOperation({
    summary:
      'Download standard Excel or CSV template for bulk lecture & section schedules',
  })
  async downloadScheduleTemplate(
    @Query('format') format: 'xlsx' | 'csv' = 'xlsx',
    @Res() res: Response,
  ) {
    const selectedFormat = format === 'csv' ? 'csv' : 'xlsx';
    const result = await this.schedulesService.generateTemplate(selectedFormat);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
    );
    res.send(result.buffer);
  }

  @Post('admin/course-schedules/upload-excel')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.COURSE_SCHEDULES_WRITE)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Bulk import lecture, section and lab schedules from Excel (.xlsx) or CSV',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  async uploadExcel(
    @UploadedFile() file?: { buffer: Buffer; originalname: string },
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('يرجى تحديد ملف Excel أو CSV لرفعه');
    }
    return this.schedulesService.importFromExcel(
      file.buffer,
      file.originalname,
    );
  }

  @Get('admin/course-schedules')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.COURSE_SCHEDULES_READ)
  @ApiOperation({
    summary: 'List all course, lecture & section schedules (Admin/Staff)',
  })
  async findAll(@Query() query: QueryCourseScheduleDto) {
    return this.schedulesService.findAll(query);
  }

  @Post('admin/course-schedules')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.COURSE_SCHEDULES_WRITE)
  @ApiOperation({
    summary: 'Create a course lecture or section schedule slot (Admin/Staff)',
  })
  async create(@Body() dto: CreateCourseScheduleDto) {
    return this.schedulesService.create(dto);
  }

  @Patch('admin/course-schedules/:id')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.COURSE_SCHEDULES_WRITE)
  @ApiOperation({
    summary: 'Update a course lecture or section schedule slot (Admin/Staff)',
  })
  async update(@Param('id') id: string, @Body() dto: UpdateCourseScheduleDto) {
    return this.schedulesService.update(id, dto);
  }

  @Delete('admin/course-schedules/:id')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.COURSE_SCHEDULES_WRITE)
  @ApiOperation({
    summary: 'Delete a course lecture or section schedule slot (Admin/Staff)',
  })
  async remove(@Param('id') id: string) {
    return this.schedulesService.remove(id);
  }
}
