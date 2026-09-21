import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation';
import { QueueModule } from './core/queues/queue.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { StudentsModule } from './modules/students/students.module';
import { CoursesModule } from './modules/courses/courses.module';
import { DatabaseModule } from './database/database.module';
import { AppLoggerModule } from './core/logger/logger.module';
import { RateLimiterModule } from './common/rate-limit/rate-limit.module';
import { GradesModule } from './modules/grades/grades.module';
import { AcademicEmailsModule } from './modules/academic-emails/academic-emails.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { ExamSchedulesModule } from './modules/exam-schedules/exam-schedules.module';
import { ComplaintsModule } from './modules/complaints/complaints.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { EmailsModule } from './modules/emails/emails.module';
import { FaqsModule } from './modules/faqs/faqs.module';
import { RegistrationsModule } from './modules/registrations/registrations.module';
import { AcademicAdvisingModule } from './modules/academic-advising/academic-advising.module';
import { AiModule } from './modules/ai/ai.module';
import { StaffManagementModule } from './modules/staff-management/staff-management.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
      validate: validateEnv,
    }),
    QueueModule,
    AppLoggerModule,
    DatabaseModule,
    RateLimiterModule,
    AuthModule,
    UsersModule,
    StudentsModule,
    CoursesModule,
    GradesModule,
    AcademicEmailsModule,
    AttendanceModule,
    UploadsModule,
    ExamSchedulesModule,
    ComplaintsModule,
    NotificationsModule,
    EmailsModule,
    FaqsModule,
    RegistrationsModule,
    AcademicAdvisingModule,
    AiModule,
    StaffManagementModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
