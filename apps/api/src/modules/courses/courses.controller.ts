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
import { CoursesService } from './courses.service';
import {
  CreateCourseDto,
  UpdateCourseDto,
  QueryCourseDto,
} from './dto/course.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import { PERMISSIONS } from '@student-portal/shared';

@ApiTags('Courses')
@Controller()
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  // ─── Student/Public Routes ────────────────────────────────────────

  @Get('courses')
  @Roles('student', 'admin', 'staff')
  @ApiOperation({ summary: 'List active courses' })
  async findActive(@Query() query: QueryCourseDto) {
    // Force isActive filter to true for regular listings if not admin/staff
    return this.coursesService.findAll({ ...query, isActive: true });
  }

  // ─── Admin/Staff Routes ───────────────────────────────────────────

  @Get('admin/courses')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.COURSES_READ)
  @ApiOperation({ summary: 'List all courses with filters (Admin/Staff)' })
  async findAll(@Query() query: QueryCourseDto) {
    return this.coursesService.findAll(query);
  }

  @Post('admin/courses')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.COURSES_WRITE)
  @ApiOperation({ summary: 'Create new course (Admin)' })
  async create(@Body() dto: CreateCourseDto) {
    return this.coursesService.create(dto);
  }

  @Patch('admin/courses/:id')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.COURSES_WRITE)
  @ApiOperation({ summary: 'Update course (Admin)' })
  async update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateCourseDto,
  ) {
    return this.coursesService.update(id, dto);
  }

  @Delete('admin/courses/:id')
  @Roles('admin')
  @ApiOperation({ summary: 'Delete course (Admin)' })
  async remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.coursesService.remove(id);
  }
}
