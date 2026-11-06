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
  UpdateGradesSettingsDto,
  RecalculateAcademicProgressDto,
  AuditAcademicWarningsDto,
  UpdateGradeDto,
  ControlResultPolicyDto,
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

  @Post('admin/grades/release-preview')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.GRADES_WRITE)
  previewRelease(@Body() dto: PublishGradesDto) {
    return this.gradesService.previewControlRelease(dto);
  }

  @Get('admin/grades/control-release-history/:id')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.GRADES_READ)
  releaseHistory(@Param('id', ParseObjectIdPipe) id: string) {
    return this.gradesService.controlReleaseHistory(id);
  }

  @Post('admin/grades/control-jobs/retry')
  @Roles('admin')
  retryControlJobs() {
    return this.gradesService.processControlReleases();
  }

  @Get('admin/grades/control-policy/:id')
  @Roles('admin')
  resultPolicy(@Param('id', ParseObjectIdPipe) id: string) {
    return this.gradesService.getControlPolicy(id);
  }

  @Patch('admin/grades/control-policy/:id')
  @Roles('admin')
  updateResultPolicy(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: ControlResultPolicyDto,
    @CurrentUser('_id') actorId: string,
  ) {
    return this.gradesService.updateControlPolicy(id, dto, actorId);
  }

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

  @Get('students/me/results-window')
  @Roles('student')
  @ApiOperation({
    summary: 'Check if grades publishing window is open for current student',
  })
  async getMyResultsWindow(@CurrentUser('_id') studentId: string) {
    return this.gradesService.getStudentResultsStatus(studentId);
  }

  // ─── Admin Endpoints ─────────────────────────────────────────────

  @Get('admin/grades/settings')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.GRADES_READ)
  @ApiOperation({
    summary: 'Get current grades system publishing window and settings',
  })
  async getSettings() {
    return this.gradesService.getGradesSettings();
  }

  @Patch('admin/grades/settings')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.GRADES_WRITE)
  @ApiOperation({
    summary: 'Update grades system publishing window and settings',
  })
  async updateSettings(
    @Body() dto: UpdateGradesSettingsDto,
    @CurrentUser('_id') userId: string,
  ) {
    return this.gradesService.updateGradesSettings(dto, userId);
  }

  @Get('admin/grades')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.GRADES_READ)
  @ApiOperation({ summary: 'List and filter all grades (Admin/Staff)' })
  async findAll(@Query() query: QueryGradeDto) {
    return this.gradesService.findAll(query);
  }

  @Post('admin/grades')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.GRADES_WRITE)
  @ApiOperation({ summary: 'Add or update single grade manually (Admin)' })
  async saveGrade(@Body() dto: SaveGradeDto) {
    return this.gradesService.saveGrade(dto);
  }

  @Patch('admin/grades/:id')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.GRADES_WRITE)
  @ApiOperation({ summary: 'Edit specific grade (Admin)' })
  async update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateGradeDto,
  ) {
    return this.gradesService.update(id, dto);
  }

  @Delete('admin/grades/:id')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.GRADES_DELETE)
  @ApiOperation({ summary: 'Delete specific grade (Admin)' })
  async remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.gradesService.remove(id);
  }

  @Post('admin/grades/publish')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.GRADES_WRITE)
  @ApiOperation({
    summary: 'Publish or hide midterm/final results in bulk (Admin)',
  })
  async publishGrades(
    @Body() dto: PublishGradesDto,
    @CurrentUser('_id') actorId: string,
  ) {
    return this.gradesService.publishGrades(
      {
        ...dto,
        ...(dto.isPublished
          ? { releaseDigests: dto.releaseDigests ?? {} }
          : {}),
      },
      actorId,
    );
  }

  @Post('admin/grades/recalculate-progress')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.GRADES_WRITE)
  @ApiOperation({
    summary:
      'Recalculate GPA, completed courses, and automatic level promotion',
  })
  async recalculateAcademicProgress(
    @Body() dto: RecalculateAcademicProgressDto,
  ) {
    return this.gradesService.recalculateAcademicProgress({
      studentCode: dto.studentCode,
      dryRun: dto.dryRun,
      maxAllowedCarriedCourses: dto.maxAllowedCarriedCourses,
    });
  }

  @Post('admin/grades/audit-warnings')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.GRADES_WRITE)
  @ApiOperation({
    summary:
      'Audit student CGPA under 2.00 threshold and update academic warnings',
  })
  async auditAcademicWarnings(@Body() dto: AuditAcademicWarningsDto) {
    return this.gradesService.auditAcademicWarnings({
      dryRun: dto.dryRun,
    });
  }
}
