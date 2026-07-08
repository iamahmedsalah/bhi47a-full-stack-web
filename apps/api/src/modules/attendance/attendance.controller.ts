import { Controller, Get, Patch, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { UpdateAttendanceDto } from './dto/attendance.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';

@ApiTags('Attendance')
@Controller()
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get('students/me/attendance')
  @Roles('student')
  @ApiOperation({ summary: 'Get current student attendance rates' })
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
