import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PERMISSIONS } from '@student-portal/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-request';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import { StudentEnrollmentService } from './student-enrollment.service';
import {
  EnrollmentSearchDto,
  StudentEnrollmentCourseQueryDto,
  StudentEnrollmentMutationDto,
  StudentEnrollmentTermDto,
} from './dto/student-enrollment.dto';
@Controller('admin/course-student-enrollments')
@Roles('admin', 'staff')
@RequirePermissions(PERMISSIONS.COURSES_STUDENT_ENROLLMENT_MANAGE)
export class StudentEnrollmentController {
  constructor(private readonly service: StudentEnrollmentService) {}
  @Get('students')
  search(@Query() query: EnrollmentSearchDto) {
    return this.service.searchStudents(query.search);
  }
  @Get(':studentId/courses')
  courses(
    @Param('studentId', ParseObjectIdPipe) studentId: string,
    @Query() query: StudentEnrollmentCourseQueryDto,
  ) {
    return this.service.availableCourses(studentId, query);
  }
  @Get(':studentId')
  detail(
    @Param('studentId', ParseObjectIdPipe) studentId: string,
    @Query() query: StudentEnrollmentTermDto,
  ) {
    return this.service.detail(studentId, query);
  }
  @Post(':studentId/add')
  add(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('studentId', ParseObjectIdPipe) studentId: string,
    @Body() dto: StudentEnrollmentMutationDto,
  ) {
    return this.service.add(actor, studentId, dto);
  }
  @Post(':studentId/withdraw')
  withdraw(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('studentId', ParseObjectIdPipe) studentId: string,
    @Body() dto: StudentEnrollmentMutationDto,
  ) {
    return this.service.withdraw(actor, studentId, dto);
  }
}
