import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Course, CourseSchema } from '../courses/schemas/course.schema';
import { Grade, GradeSchema } from '../grades/schemas/grade.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  StudentProfile,
  StudentProfileSchema,
} from '../students/schemas/student-profile.schema';
import {
  StudentAcademicProfile,
  StudentAcademicProfileSchema,
} from '../registrations/schemas/student-academic-profile.schema';
import {
  AdvisingCase,
  AdvisingCaseSchema,
} from './schemas/advising-case.schema';
import {
  AdvisingPlan,
  AdvisingPlanSchema,
} from './schemas/advising-plan.schema';
import {
  AdvisingGraph,
  AdvisingGraphSchema,
} from './schemas/advising-graph.schema';
import {
  CourseRecommendation,
  CourseRecommendationSchema,
} from './schemas/course-recommendation.schema';
import {
  AdvisingNote,
  AdvisingNoteSchema,
} from './schemas/advising-note.schema';
import {
  AdvisingAuditLog,
  AdvisingAuditLogSchema,
} from './schemas/advising-audit-log.schema';
import { AdminAdvisingController } from './controllers/admin-advising.controller';
import { StudentAdvisingController } from './controllers/student-advising.controller';
import { AcademicAdvisingService } from './services/academic-advising.service';
import { AdvisingCaseService } from './services/advising-case.service';
import { AdvisingPlanService } from './services/advising-plan.service';
import { AdvisingRecommendationService } from './services/advising-recommendation.service';
import { AdvisingQueryService } from './services/advising-query.service';
import { AdvisingAuditService } from './services/advising-audit.service';
import { PlanValidationService } from './services/plan-validation.service';
import {
  CourseRegistration,
  CourseRegistrationSchema,
} from '../registrations/schemas/course-registration.schema';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    AiModule,
    MongooseModule.forFeature([
      { name: Course.name, schema: CourseSchema },
      { name: Grade.name, schema: GradeSchema },
      { name: CourseRegistration.name, schema: CourseRegistrationSchema },
      { name: User.name, schema: UserSchema },
      { name: StudentProfile.name, schema: StudentProfileSchema },
      {
        name: StudentAcademicProfile.name,
        schema: StudentAcademicProfileSchema,
      },
      { name: AdvisingCase.name, schema: AdvisingCaseSchema },
      { name: AdvisingPlan.name, schema: AdvisingPlanSchema },
      { name: AdvisingGraph.name, schema: AdvisingGraphSchema },
      { name: CourseRecommendation.name, schema: CourseRecommendationSchema },
      { name: AdvisingNote.name, schema: AdvisingNoteSchema },
      { name: AdvisingAuditLog.name, schema: AdvisingAuditLogSchema },
    ]),
  ],
  controllers: [AdminAdvisingController, StudentAdvisingController],
  providers: [
    AcademicAdvisingService,
    AdvisingCaseService,
    AdvisingPlanService,
    AdvisingRecommendationService,
    AdvisingQueryService,
    AdvisingAuditService,
    PlanValidationService,
  ],
  exports: [
    AcademicAdvisingService,
    AdvisingCaseService,
    AdvisingPlanService,
    AdvisingRecommendationService,
    AdvisingQueryService,
  ],
})
export class AcademicAdvisingModule {}
