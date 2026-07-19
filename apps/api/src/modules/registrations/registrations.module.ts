import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Course, CourseSchema } from '../courses/schemas/course.schema';
import { Grade, GradeSchema } from '../grades/schemas/grade.schema';
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
import {
  RegistrationTerm,
  RegistrationTermSchema,
} from './schemas/registration-term.schema';
import {
  AdvisingPlan,
  AdvisingPlanSchema,
} from '../academic-advising/schemas/advising-plan.schema';
import {
  AdvisingCase,
  AdvisingCaseSchema,
} from '../academic-advising/schemas/advising-case.schema';
import { GpaRuleService } from './services/gpa-rule.service';
import { AcademicProfileService } from './services/academic-profile.service';
import { RegistrationTermService } from './services/registration-term.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Course.name, schema: CourseSchema },
      { name: Grade.name, schema: GradeSchema },
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
      { name: AdvisingPlan.name, schema: AdvisingPlanSchema },
      { name: AdvisingCase.name, schema: AdvisingCaseSchema },
      { name: RegistrationTerm.name, schema: RegistrationTermSchema },
    ]),
    StudentsModule,
    UsersModule,
  ],
  controllers: [RegistrationsController],
  providers: [
    RegistrationsService,
    GpaRuleService,
    AcademicProfileService,
    RegistrationTermService,
  ],
  exports: [
    RegistrationsService,
    GpaRuleService,
    AcademicProfileService,
    RegistrationTermService,
  ],
})
export class RegistrationsModule {}
