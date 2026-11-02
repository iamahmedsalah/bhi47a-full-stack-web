import { Controller, Get, Query, Res, Header } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiProduces } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PERMISSIONS } from '@student-portal/shared';
import type { AuthenticatedUser } from '../auth/types/authenticated-request';
import {
  AnalyticsQueryDto,
  AnalyticsExportQueryDto,
} from './dto/analytics-query.dto';
import { AnalyticsQueryService } from './services/analytics-query.service';
import { AnalyticsExcelService } from './services/analytics-excel.service';

@ApiTags('Academic Analytics')
@Controller('admin/analytics')
export class AnalyticsController {
  constructor(
    private readonly queryService: AnalyticsQueryService,
    private readonly excelService: AnalyticsExcelService,
  ) {}

  @Get('overview')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  @ApiOperation({
    summary: 'Get comprehensive academic analytics overview and KPIs',
  })
  async getOverview(
    @Query() query: AnalyticsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.queryService.getOverview(query, user);
  }

  @Get('quizzes')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  @ApiOperation({
    summary:
      'Get detailed quizzes analytics with eligible students and pass rates',
  })
  async getQuizzesAnalytics(
    @Query() query: AnalyticsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.queryService.getQuizzesAnalytics(query, user);
  }

  @Get('staff-quizzes')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  @ApiOperation({
    summary:
      'Get staff quiz performance (Doctors, Assistant Lecturers, Teaching Assistants)',
  })
  async getStaffQuizPerformance(
    @Query() query: AnalyticsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.queryService.getStaffQuizPerformance(query, user);
  }

  @Get('courses')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  @ApiOperation({
    summary:
      'Get courses analytics with enrolled counts, quizzes, and midterm/final pass rates',
  })
  async getCoursesAnalytics(
    @Query() query: AnalyticsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.queryService.getCoursesAnalytics(query, user);
  }

  @Get('report/export')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.ANALYTICS_EXPORT)
  @ApiOperation({
    summary: 'Export selected analyses or the complete Excel workbook (.xlsx)',
  })
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  async exportComprehensiveReport(
    @Query() query: AnalyticsExportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const workbook = await this.excelService.generateComprehensiveWorkbook(
      query,
      user,
    );

    const nowStr = new Date().toISOString().slice(0, 10);
    const scope =
      query.sheets?.length === 1
        ? query.sheets[0]
        : query.sheets
          ? 'selected'
          : 'report';
    const filenameAscii = `academic-analytics-${scope}-${nowStr}.xlsx`;
    const filenameUtf8 = encodeURIComponent(
      query.locale === 'en'
        ? filenameAscii
        : `تقرير-التحليلات-الأكاديمية-${query.sheets ? 'مختار' : 'الشامل'}-${nowStr}.xlsx`,
    );

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filenameAscii}"; filename*=UTF-8''${filenameUtf8}`,
    );

    const buffer = await workbook.xlsx.writeBuffer();
    res.end(buffer);
  }
}
