import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  StudentProfile,
  StudentProfileSchema,
} from './schemas/student-profile.schema';
import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';
import { UsersModule } from '../users/users.module';
import { EmailsModule } from '../emails/emails.module';
import {
  CourseRegistration,
  CourseRegistrationSchema,
} from '../registrations/schemas/course-registration.schema';
import {
  RegistrationTerm,
  RegistrationTermSchema,
} from '../registrations/schemas/registration-term.schema';
import {
  AdvisingCase,
  AdvisingCaseSchema,
} from '../academic-advising/schemas/advising-case.schema';
import {
  AcademicEmail,
  AcademicEmailSchema,
} from '../academic-emails/schemas/academic-email.schema';

import {
  StudentAcademicProfile,
  StudentAcademicProfileSchema,
} from '../registrations/schemas/student-academic-profile.schema';
import { StudentQueryService } from './services/student-query.service';
import { StudentsExportController } from './controllers/students-export.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StudentProfile.name, schema: StudentProfileSchema },
      { name: CourseRegistration.name, schema: CourseRegistrationSchema },
      { name: RegistrationTerm.name, schema: RegistrationTermSchema },
      { name: AdvisingCase.name, schema: AdvisingCaseSchema },
      { name: AcademicEmail.name, schema: AcademicEmailSchema },
      {
        name: StudentAcademicProfile.name,
        schema: StudentAcademicProfileSchema,
      },
    ]),
    UsersModule,
    EmailsModule,
  ],
  controllers: [StudentsController, StudentsExportController],
  providers: [StudentsService, StudentQueryService],
  exports: [StudentsService, StudentQueryService],
})
export class StudentsModule {}
