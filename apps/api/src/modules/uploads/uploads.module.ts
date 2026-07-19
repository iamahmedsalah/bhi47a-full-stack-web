import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UploadsService } from './uploads.service';
import { UploadsController } from './uploads.controller';
import { StudentImporter } from './importers/student.importer';
import { CourseImporter } from './importers/course.importer';
import { GradeImporter } from './importers/grade.importer';
import { QuizImporter } from './importers/quiz.importer';
import { AttendanceImporter } from './importers/attendance.importer';
import { AcademicEmailImporter } from './importers/academic-email.importer';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  StudentProfile,
  StudentProfileSchema,
} from '../students/schemas/student-profile.schema';
import { Course, CourseSchema } from '../courses/schemas/course.schema';
import { Grade, GradeSchema } from '../grades/schemas/grade.schema';
import {
  CourseQuiz,
  CourseQuizSchema,
} from '../grades/schemas/course-quiz.schema';
import {
  Attendance,
  AttendanceSchema,
} from '../attendance/schemas/attendance.schema';
import {
  AcademicEmail,
  AcademicEmailSchema,
} from '../academic-emails/schemas/academic-email.schema';
import {
  StudentAcademicProfile,
  StudentAcademicProfileSchema,
} from '../registrations/schemas/student-academic-profile.schema';
import { GradesModule } from '../grades/grades.module';

@Module({
  imports: [
    GradesModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: StudentProfile.name, schema: StudentProfileSchema },
      { name: Course.name, schema: CourseSchema },
      { name: Grade.name, schema: GradeSchema },
      { name: CourseQuiz.name, schema: CourseQuizSchema },
      { name: Attendance.name, schema: AttendanceSchema },
      { name: AcademicEmail.name, schema: AcademicEmailSchema },
      {
        name: StudentAcademicProfile.name,
        schema: StudentAcademicProfileSchema,
      },
    ]),
  ],
  controllers: [UploadsController],
  providers: [
    UploadsService,
    StudentImporter,
    CourseImporter,
    GradeImporter,
    QuizImporter,
    AttendanceImporter,
    AcademicEmailImporter,
  ],
  exports: [UploadsService],
})
export class UploadsModule {}
