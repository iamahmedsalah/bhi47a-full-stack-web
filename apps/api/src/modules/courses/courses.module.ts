import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Course, CourseSchema } from './schemas/course.schema';
import {
  CourseMaterial,
  CourseMaterialSchema,
} from './schemas/course-material.schema';
import { CoursesService } from './courses.service';
import { CoursesController } from './courses.controller';
import { RegistrationsModule } from '../registrations/registrations.module';
import {
  CourseRegistration,
  CourseRegistrationSchema,
} from '../registrations/schemas/course-registration.schema';
import {
  StudentProfile,
  StudentProfileSchema,
} from '../students/schemas/student-profile.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { MaterialStorageModule } from '../material-storage/material-storage.module';
import { StudentEnrollmentController } from './student-enrollment.controller';
import { StudentEnrollmentService } from './student-enrollment.service';

@Module({
  imports: [
    MaterialStorageModule,
    RegistrationsModule,
    MongooseModule.forFeature([
      { name: Course.name, schema: CourseSchema },
      { name: CourseMaterial.name, schema: CourseMaterialSchema },
      { name: CourseRegistration.name, schema: CourseRegistrationSchema },
      { name: StudentProfile.name, schema: StudentProfileSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [CoursesController, StudentEnrollmentController],
  providers: [CoursesService, StudentEnrollmentService],
  exports: [CoursesService],
})
export class CoursesModule {}
