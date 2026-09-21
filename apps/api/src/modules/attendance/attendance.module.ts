import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Attendance, AttendanceSchema } from './schemas/attendance.schema';
import {
  AttendanceSession,
  AttendanceSessionSchema,
} from './schemas/attendance-session.schema';
import {
  AttendanceRecord,
  AttendanceRecordSchema,
} from './schemas/attendance-record.schema';
import {
  CourseStaffAssignment,
  CourseStaffAssignmentSchema,
} from './schemas/course-staff-assignment.schema';
import { Course, CourseSchema } from '../courses/schemas/course.schema';
import {
  CourseRegistration,
  CourseRegistrationSchema,
} from '../registrations/schemas/course-registration.schema';
import {
  StudentProfile,
  StudentProfileSchema,
} from '../students/schemas/student-profile.schema';
import { User, UserSchema } from '../users/schemas/user.schema';

import { AttendanceService } from './attendance.service';
import { AttendanceSessionService } from './services/attendance-session.service';
import { AttendanceTokenService } from './services/attendance-token.service';
import { AttendanceCheckInService } from './services/attendance-checkin.service';
import { AttendanceReportService } from './services/attendance-report.service';
import { AttendanceRealtimeService } from './services/attendance-realtime.service';
import { AttendanceController } from './attendance.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Attendance.name, schema: AttendanceSchema },
      { name: AttendanceSession.name, schema: AttendanceSessionSchema },
      { name: AttendanceRecord.name, schema: AttendanceRecordSchema },
      {
        name: CourseStaffAssignment.name,
        schema: CourseStaffAssignmentSchema,
      },
      { name: Course.name, schema: CourseSchema },
      { name: CourseRegistration.name, schema: CourseRegistrationSchema },
      { name: StudentProfile.name, schema: StudentProfileSchema },
      { name: User.name, schema: UserSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [AttendanceController],
  providers: [
    AttendanceService,
    AttendanceSessionService,
    AttendanceTokenService,
    AttendanceCheckInService,
    AttendanceReportService,
    AttendanceRealtimeService,
  ],
  exports: [
    AttendanceService,
    AttendanceSessionService,
    AttendanceTokenService,
    AttendanceCheckInService,
    AttendanceReportService,
  ],
})
export class AttendanceModule {}
