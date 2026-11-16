import { ControlAttemptsService } from './services/control-attempts.service';
import {
  ControlImport,
  ControlImportSchema,
} from './schemas/control-import.schema';
import { ControlWorkbookService } from './services/control-workbook.service';
import { ControlReportsService } from './services/control-reports.service';
import {
  StudentProfile,
  StudentProfileSchema,
} from '../students/schemas/student-profile.schema';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Course, CourseSchema } from '../courses/schemas/course.schema';
import { Grade, GradeSchema } from '../grades/schemas/grade.schema';
import { GradesModule } from '../grades/grades.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  CourseRegistration,
  CourseRegistrationSchema,
} from '../registrations/schemas/course-registration.schema';
import {
  CourseStaffAssignment,
  CourseStaffAssignmentSchema,
} from '../attendance/schemas/course-staff-assignment.schema';
import { ControlController } from './control.controller';
import {
  ControlSheet,
  ControlSheetSchema,
} from './schemas/control-sheet.schema';
import {
  GradeAuditLog,
  GradeAuditLogSchema,
} from './schemas/grade-audit-log.schema';
import {
  GradingScheme,
  GradingSchemeSchema,
} from './schemas/grading-scheme.schema';
import { ControlAccessService } from './services/control-access.service';
import { ControlGradesService } from './services/control-grades.service';
import { ControlSheetsService } from './services/control-sheets.service';
import { GradingSchemeService } from './services/grading-scheme.service';

@Module({
  imports: [
    GradesModule,
    MongooseModule.forFeature([
      { name: StudentProfile.name, schema: StudentProfileSchema },
      { name: ControlImport.name, schema: ControlImportSchema },
      { name: ControlSheet.name, schema: ControlSheetSchema },
      { name: GradingScheme.name, schema: GradingSchemeSchema },
      { name: GradeAuditLog.name, schema: GradeAuditLogSchema },
      { name: Grade.name, schema: GradeSchema },
      { name: Course.name, schema: CourseSchema },
      { name: User.name, schema: UserSchema },
      { name: CourseRegistration.name, schema: CourseRegistrationSchema },
      {
        name: CourseStaffAssignment.name,
        schema: CourseStaffAssignmentSchema,
      },
    ]),
  ],
  controllers: [ControlController],
  providers: [
    ControlAttemptsService,
    ControlReportsService,
    ControlWorkbookService,
    ControlAccessService,
    ControlSheetsService,
    ControlGradesService,
    GradingSchemeService,
  ],
  exports: [ControlGradesService],
})
export class ControlModule {}
