import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Course, CourseSchema } from './schemas/course.schema';
import { CoursesService } from './courses.service';
import { CoursesController } from './courses.controller';
import {
  CourseRegistration,
  CourseRegistrationSchema,
} from '../registrations/schemas/course-registration.schema';
import {
  StudentProfile,
  StudentProfileSchema,
} from '../students/schemas/student-profile.schema';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Course.name, schema: CourseSchema },
      { name: CourseRegistration.name, schema: CourseRegistrationSchema },
      { name: StudentProfile.name, schema: StudentProfileSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [CoursesController],
  providers: [CoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}
