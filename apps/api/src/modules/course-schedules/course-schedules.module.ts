import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CourseSchedule,
  CourseScheduleSchema,
} from './schemas/course-schedule.schema';
import { Course, CourseSchema } from '../courses/schemas/course.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { CourseSchedulesService } from './course-schedules.service';
import { CourseSchedulesController } from './course-schedules.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CourseSchedule.name, schema: CourseScheduleSchema },
      { name: Course.name, schema: CourseSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [CourseSchedulesController],
  providers: [CourseSchedulesService],
  exports: [CourseSchedulesService],
})
export class CourseSchedulesModule {}
