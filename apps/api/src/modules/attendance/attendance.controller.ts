import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Sse,
  Headers,
  Req,
  MessageEvent,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import type { Request } from 'express';
import { AttendanceService } from './attendance.service';
import {
  AttendanceSessionService,
  SessionDetailsResponse,
  AdminOverviewResponse,
} from './services/attendance-session.service';
import { AttendanceCheckInService } from './services/attendance-checkin.service';
import { AttendanceReportService } from './services/attendance-report.service';
import { AttendanceRealtimeService } from './services/attendance-realtime.service';
import { UpdateAttendanceDto } from './dto/attendance.dto';
import {
  CreateAttendanceSessionDto,
  CheckInAttendanceDto,
  ManualMarkAttendanceDto,
  ManualStudentCheckInDto,
  QueryAttendanceRecordsDto,
  CreateCourseStaffAssignmentDto,
} from './dto/attendance-session.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';

@ApiTags('Attendance')
@ApiBearerAuth()
@Controller()
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly sessionService: AttendanceSessionService,
    private readonly checkInService: AttendanceCheckInService,
    private readonly reportService: AttendanceReportService,
    private readonly realtimeService: AttendanceRealtimeService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Resolves the web app base URL for QR check-in links.
   * WEB_BASE_URL is authoritative in production. Request values are retained as
   * development fallbacks so local setups continue to work without extra config.
   */
  private resolveWebBaseUrl(req: Request): string {
    const envUrl = this.configService.get<string>('WEB_BASE_URL');
    if (envUrl?.trim()) return envUrl.trim().replace(/\/+$/, '');
    const origin = req.headers?.origin;
    if (origin) return Array.isArray(origin) ? origin[0] : origin;
    return `${req.protocol}://${req.get('host')}`;
  }

  // ==========================================
  // STAFF / ADMIN: SESSION MANAGEMENT & QR
  // ==========================================

  @Get('attendance/my-classes')
  @Roles('staff', 'admin')
  @ApiOperation({ summary: 'Get assigned courses/sections for staff member' })
  async getMyClasses(@CurrentUser() user: { _id: string; role: string }) {
    return this.sessionService.getStaffClasses(user);
  }

  @Post('attendance/sessions')
  @Roles('staff', 'admin')
  @ApiOperation({
    summary: 'Start a new class attendance session with rotating QR',
  })
  async createSession(
    @CurrentUser() user: { _id: string; name: string; role: string },
    @Body() dto: CreateAttendanceSessionDto,
    @Req() req: Request,
  ) {
    return this.sessionService.createSession(
      user,
      dto,
      this.resolveWebBaseUrl(req),
    );
  }

  @Get('attendance/sessions/:id')
  @Roles('staff', 'admin')
  @ApiOperation({ summary: 'Get session details and live statistics' })
  async getSessionDetails(
    @Param('id') id: string,
  ): Promise<SessionDetailsResponse> {
    return this.sessionService.getSessionDetails(id);
  }

  @Get('attendance/sessions/:id/qr')
  @Roles('staff', 'admin')
  @ApiOperation({ summary: 'Get current rotating QR token for active session' })
  async getCurrentQr(@Param('id') id: string, @Req() req: Request) {
    return this.sessionService.getCurrentQr(id, this.resolveWebBaseUrl(req));
  }

  @Post('attendance/sessions/:id/close')
  @Roles('staff', 'admin')
  @ApiOperation({
    summary: 'Close attendance session and block further check-ins',
  })
  async closeSession(
    @Param('id') id: string,
    @CurrentUser() user: { _id: string; role: string },
  ) {
    return this.sessionService.closeSession(id, user);
  }

  @Sse('attendance/sessions/:id/live')
  @Roles('staff', 'admin')
  @ApiOperation({
    summary: 'Server-Sent Events (SSE) live stream for attendees',
  })
  liveSessionFeed(@Param('id') id: string): Observable<MessageEvent> {
    return this.realtimeService.getEventStream(id);
  }

  @Get('attendance/sessions/:id/records')
  @Roles('staff', 'admin')
  @ApiOperation({ summary: 'Get paginated attendee list for a session' })
  async getSessionRecords(
    @Param('id') id: string,
    @Query() query: QueryAttendanceRecordsDto,
  ) {
    return this.reportService.getSessionRecords(id, query);
  }

  @Patch('attendance/records/:id')
  @Roles('staff', 'admin')
  @ApiOperation({ summary: 'Manual status update with audit logging' })
  async manualUpdateRecord(
    @Param('id') id: string,
    @CurrentUser() user: { _id: string; name: string },
    @Body() dto: ManualMarkAttendanceDto,
  ) {
    return this.reportService.manualUpdateRecord(id, user, dto);
  }

  @Post('attendance/sessions/:id/manual-mark')
  @Roles('staff', 'admin')
  @ApiOperation({ summary: 'Manually mark a student present in a session' })
  async manualStudentCheckIn(
    @Param('id') id: string,
    @CurrentUser() user: { _id: string; name: string },
    @Body() dto: ManualStudentCheckInDto,
  ) {
    return this.reportService.manualStudentCheckIn(id, user, dto);
  }

  @Get('attendance/admin/overview')
  @Roles('admin')
  @ApiOperation({
    summary: 'Get system-wide attendance overview and recent sessions (Admin)',
  })
  async getAdminOverview(): Promise<AdminOverviewResponse> {
    return this.sessionService.getAdminOverview();
  }

  @Post('attendance/assignments')
  @Roles('admin')
  @ApiOperation({
    summary: 'Assign a Doctor or Instructor to a course (Admin)',
  })
  async assignStaffToCourse(
    @CurrentUser('_id') adminId: string,
    @Body() dto: CreateCourseStaffAssignmentDto,
  ) {
    return this.sessionService.assignStaffToCourse(adminId, dto);
  }

  @Get('attendance/reports/course/:courseCode')
  @Roles('staff', 'admin')
  @ApiOperation({
    summary: 'Get course-level attendance overview across sessions',
  })
  async getCourseReport(@Param('courseCode') courseCode: string) {
    return this.reportService.getCourseReport(courseCode);
  }

  // ==========================================
  // STUDENT: CHECK-IN & ATTENDANCE HISTORY
  // ==========================================

  @Post('attendance/check-in')
  @Roles('student')
  @ApiOperation({ summary: 'Student checks in by scanning rotating QR code' })
  async checkIn(
    @CurrentUser() user: { _id: string; name: string; studentCode?: string },
    @Body() dto: CheckInAttendanceDto,
  ) {
    return this.checkInService.checkIn(user, dto);
  }

  @Get('attendance/student/live-sessions')
  @Roles('student')
  @ApiOperation({
    summary: 'Get currently active live attendance sessions for student',
  })
  async getStudentLiveSessions(
    @CurrentUser() user: { _id: string; name: string; studentCode?: string },
  ) {
    return this.checkInService.getStudentLiveSessions(user);
  }

  @Get('students/me/attendance-history')
  @Roles('student')
  @ApiOperation({
    summary: 'Get individual attendance session records and rate',
  })
  async getMyAttendanceHistory(@CurrentUser('_id') studentId: string) {
    return this.reportService.getStudentAttendanceHistory(studentId);
  }

  // ==========================================
  // LEGACY ENDPOINTS (PRESERVED)
  // ==========================================

  @Get('students/me/attendance')
  @Roles('student')
  @ApiOperation({
    summary: 'Get current student semester aggregate attendance rates',
  })
  async getMyAttendance(@CurrentUser('_id') studentId: string) {
    return this.attendanceService.findByStudentId(studentId);
  }

  @Patch('admin/attendance/:id')
  @Roles('admin')
  @ApiOperation({ summary: 'Update student attendance record (Admin)' })
  async update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateAttendanceDto,
  ) {
    return this.attendanceService.update(id, dto);
  }
}
