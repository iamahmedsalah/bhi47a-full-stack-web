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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CourseSchedulesService } from './course-schedules.service';
import {
  CreateCourseScheduleDto,
  UpdateCourseScheduleDto,
  QueryCourseScheduleDto,
} from './dto/course-schedule.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

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

  @Get('admin/course-schedules')
  @Roles('admin', 'staff')
  @ApiOperation({
    summary: 'List all course, lecture & section schedules (Admin/Staff)',
  })
  async findAll(@Query() query: QueryCourseScheduleDto) {
    return this.schedulesService.findAll(query);
  }

  @Post('admin/course-schedules')
  @Roles('admin')
  @ApiOperation({
    summary: 'Create a course lecture or section schedule slot (Admin)',
  })
  async create(@Body() dto: CreateCourseScheduleDto) {
    return this.schedulesService.create(dto);
  }

  @Patch('admin/course-schedules/:id')
  @Roles('admin')
  @ApiOperation({
    summary: 'Update a course lecture or section schedule slot (Admin)',
  })
  async update(@Param('id') id: string, @Body() dto: UpdateCourseScheduleDto) {
    return this.schedulesService.update(id, dto);
  }

  @Delete('admin/course-schedules/:id')
  @Roles('admin')
  @ApiOperation({
    summary: 'Delete a course lecture or section schedule slot (Admin)',
  })
  async remove(@Param('id') id: string) {
    return this.schedulesService.remove(id);
  }
}
