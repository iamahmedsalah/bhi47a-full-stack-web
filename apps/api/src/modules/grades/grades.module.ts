import {
  GradeAuditLog,
  GradeAuditLogSchema,
} from '../control/schemas/grade-audit-log.schema';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Grade, GradeSchema } from './schemas/grade.schema';
import { CourseQuiz, CourseQuizSchema } from './schemas/course-quiz.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Course, CourseSchema } from '../courses/schemas/course.schema';
import { GradesService } from './grades.service';
import { GradesController } from './grades.controller';
import { HistoricalPublicationController } from './historical-publication.controller';
import { HistoricalPublicationService } from './historical-publication.service';
import {
  ControlSheet,
  ControlSheetSchema,
} from '../control/schemas/control-sheet.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  StudentProfile,
  StudentProfileSchema,
} from '../students/schemas/student-profile.schema';
import {
  StudentAcademicProfile,
  StudentAcademicProfileSchema,
} from '../registrations/schemas/student-academic-profile.schema';
import {
  SystemSettings,
  SystemSettingsSchema,
} from '../complaints/schemas/system-settings.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GradeAuditLog.name, schema: GradeAuditLogSchema },
      { name: Grade.name, schema: GradeSchema },
      { name: CourseQuiz.name, schema: CourseQuizSchema },
      { name: User.name, schema: UserSchema },
      { name: Course.name, schema: CourseSchema },
      { name: StudentProfile.name, schema: StudentProfileSchema },
      {
        name: StudentAcademicProfile.name,
        schema: StudentAcademicProfileSchema,
      },
      { name: SystemSettings.name, schema: SystemSettingsSchema },
      { name: ControlSheet.name, schema: ControlSheetSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [GradesController, HistoricalPublicationController],
  providers: [GradesService, HistoricalPublicationService],
  exports: [GradesService],
})
export class GradesModule {}
