import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ExamSchedule,
  ExamScheduleSchema,
} from './schemas/exam-schedule.schema';
import {
  StudentProfile,
  StudentProfileSchema,
} from '../students/schemas/student-profile.schema';
import { ExamSchedulesService } from './exam-schedules.service';
import { ExamSchedulesController } from './exam-schedules.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ExamSchedule.name, schema: ExamScheduleSchema },
      { name: StudentProfile.name, schema: StudentProfileSchema },
    ]),
  ],
  controllers: [ExamSchedulesController],
  providers: [ExamSchedulesService],
  exports: [ExamSchedulesService],
})
export class ExamSchedulesModule {}
