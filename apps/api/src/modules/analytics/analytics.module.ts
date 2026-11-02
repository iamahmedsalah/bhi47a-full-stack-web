import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsQueryService } from './services/analytics-query.service';
import { AnalyticsExcelService } from './services/analytics-excel.service';
import { Quiz, QuizSchema } from '../quizzes/schemas/quiz.schema';
import {
  QuizSubmission,
  QuizSubmissionSchema,
} from '../quizzes/schemas/quiz-submission.schema';
import {
  QuizAttempt,
  QuizAttemptSchema,
} from '../quizzes/schemas/quiz-attempt.schema';
import { Course, CourseSchema } from '../courses/schemas/course.schema';
import {
  CourseRegistration,
  CourseRegistrationSchema,
} from '../registrations/schemas/course-registration.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Grade, GradeSchema } from '../grades/schemas/grade.schema';
import {
  Complaint,
  ComplaintSchema,
} from '../complaints/schemas/complaint.schema';
import {
  StudentProfile,
  StudentProfileSchema,
} from '../students/schemas/student-profile.schema';
import {
  StudentAcademicProfile,
  StudentAcademicProfileSchema,
} from '../registrations/schemas/student-academic-profile.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Quiz.name, schema: QuizSchema },
      { name: QuizSubmission.name, schema: QuizSubmissionSchema },
      { name: QuizAttempt.name, schema: QuizAttemptSchema },
      { name: Course.name, schema: CourseSchema },
      { name: CourseRegistration.name, schema: CourseRegistrationSchema },
      { name: User.name, schema: UserSchema },
      { name: Grade.name, schema: GradeSchema },
      { name: Complaint.name, schema: ComplaintSchema },
      { name: StudentProfile.name, schema: StudentProfileSchema },
      {
        name: StudentAcademicProfile.name,
        schema: StudentAcademicProfileSchema,
      },
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsQueryService, AnalyticsExcelService],
  exports: [AnalyticsQueryService, AnalyticsExcelService],
})
export class AnalyticsModule {}
