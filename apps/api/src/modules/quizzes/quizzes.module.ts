import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Quiz, QuizSchema } from './schemas/quiz.schema';
import {
  QuizSubmission,
  QuizSubmissionSchema,
} from './schemas/quiz-submission.schema';
import { QuizAttempt, QuizAttemptSchema } from './schemas/quiz-attempt.schema';
import { Course, CourseSchema } from '../courses/schemas/course.schema';
import {
  CourseRegistration,
  CourseRegistrationSchema,
} from '../registrations/schemas/course-registration.schema';
import {
  StudentProfile,
  StudentProfileSchema,
} from '../students/schemas/student-profile.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { QuizzesController } from './quizzes.controller';
import { QuizzesService } from './quizzes.service';
import { QuizQuestionExcelService } from './services/quiz-question-excel.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Quiz.name, schema: QuizSchema },
      { name: QuizSubmission.name, schema: QuizSubmissionSchema },
      { name: QuizAttempt.name, schema: QuizAttemptSchema },
      { name: Course.name, schema: CourseSchema },
      { name: CourseRegistration.name, schema: CourseRegistrationSchema },
      { name: StudentProfile.name, schema: StudentProfileSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [QuizzesController],
  providers: [QuizzesService, QuizQuestionExcelService],
  exports: [QuizzesService, QuizQuestionExcelService],
})
export class QuizzesModule {}
