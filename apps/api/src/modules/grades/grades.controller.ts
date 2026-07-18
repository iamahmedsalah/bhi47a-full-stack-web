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
import { GradesService } from './grades.service';
import {
  SaveGradeDto,
  QueryGradeDto,
  PublishGradesDto,
  RecalculateAcademicProgressDto,
  UpdateGradeDto,
} from './dto/grade.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import { PERMISSIONS } from '@student-portal/shared';

@ApiTags('Grades')
@Controller()
export class GradesController {
  constructor(private readonly gradesService: GradesService) {}

  // ─── Student Self Endpoints ──────────────────────────────────────

  @Get('students/me/results')
  @Roles('student')
  @ApiOperation({
    summary: 'Get current student midterm and final exam results',
  })
  async getMyResults(@CurrentUser('_id') studentId: string) {
    return this.gradesService.findStudentResults(studentId);
  }

  @Get('students/me/course-quizzes')
  @Roles('student')
  @ApiOperation({
    summary: 'Get current student quiz grades grouped by course',
  })
  async getMyQuizzes(@CurrentUser('_id') studentId: string) {
    return this.gradesService.findStudentQuizzes(studentId);
  }

  // ─── Admin Endpoints ─────────────────────────────────────────────

  @Get('admin/grades')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.GRADES_READ)
  @ApiOperation({ summary: 'List and filter all grades (Admin/Staff)' })
  async findAll(@Query() query: QueryGradeDto) {
    return this.gradesService.findAll(query);
  }

  @Post('admin/grades')
  @Roles('admin')
  @ApiOperation({ summary: 'Add or update single grade manually (Admin)' })
  async saveGrade(@Body() dto: SaveGradeDto) {
    return this.gradesService.saveGrade(dto);
  }

  @Patch('admin/grades/:id')
  @Roles('admin')
  @ApiOperation({ summary: 'Edit specific grade (Admin)' })
  async update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateGradeDto,
  ) {
    return this.gradesService.update(id, dto);
  }

  @Delete('admin/grades/:id')
  @Roles('admin')
  @ApiOperation({ summary: 'Delete specific grade (Admin)' })
  async remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.gradesService.remove(id);
  }

  @Post('admin/grades/publish')
  @Roles('admin')
  @ApiOperation({
    summary: 'Publish or hide midterm/final results in bulk (Admin)',
  })
  async publishGrades(@Body() dto: PublishGradesDto) {
    return this.gradesService.publishGrades(dto);
  }

  @Post('admin/grades/recalculate-progress')
  @Roles('admin')
  @ApiOperation({
    summary: 'Recalculate GPA, completed courses, and automatic level promotion',
  })
  async recalculateAcademicProgress(
    @Body() dto: RecalculateAcademicProgressDto,
  ) {
    return this.gradesService.recalculateAcademicProgress(dto.studentCode);
  }
}
