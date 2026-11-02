import { Course, CourseSchema } from '../courses/schemas/course.schema';
import { StaffCourseAssignmentsService } from './staff-course-assignments.service';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema';
import { StaffManagementController } from './staff-management.controller';
import { StaffManagementService } from './staff-management.service';
import {
  StaffAuditLog,
  StaffAuditLogSchema,
} from './schemas/staff-audit-log.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Course.name, schema: CourseSchema },
      { name: StaffAuditLog.name, schema: StaffAuditLogSchema },
    ]),
  ],
  controllers: [StaffManagementController],
  providers: [StaffManagementService, StaffCourseAssignmentsService],
  exports: [StaffManagementService],
})
export class StaffManagementModule {}
