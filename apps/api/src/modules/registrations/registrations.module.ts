import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Course, CourseSchema } from '../courses/schemas/course.schema';
import { StudentsModule } from '../students/students.module';
import { UsersModule } from '../users/users.module';
import {
  AcademicAdvisingRequest,
  AcademicAdvisingRequestSchema,
} from './schemas/academic-advising-request.schema';
import {
  CourseRegistration,
  CourseRegistrationSchema,
} from './schemas/course-registration.schema';
import {
  GpaRegistrationRule,
  GpaRegistrationRuleSchema,
} from './schemas/gpa-registration-rule.schema';
import {
  StudentAcademicProfile,
  StudentAcademicProfileSchema,
} from './schemas/student-academic-profile.schema';
import { RegistrationsController } from './registrations.controller';
import { RegistrationsService } from './registrations.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Course.name, schema: CourseSchema },
      {
        name: StudentAcademicProfile.name,
        schema: StudentAcademicProfileSchema,
      },
      { name: GpaRegistrationRule.name, schema: GpaRegistrationRuleSchema },
      {
        name: AcademicAdvisingRequest.name,
        schema: AcademicAdvisingRequestSchema,
      },
      { name: CourseRegistration.name, schema: CourseRegistrationSchema },
    ]),
    StudentsModule,
    UsersModule,
  ],
  controllers: [RegistrationsController],
  providers: [RegistrationsService],
  exports: [RegistrationsService],
})
export class RegistrationsModule {}
