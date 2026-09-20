import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AcademicEmail,
  AcademicEmailSchema,
} from './schemas/academic-email.schema';
import {
  StudentProfile,
  StudentProfileSchema,
} from '../students/schemas/student-profile.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { AcademicEmailsService } from './academic-emails.service';
import { AcademicEmailsController } from './academic-emails.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AcademicEmail.name, schema: AcademicEmailSchema },
      { name: StudentProfile.name, schema: StudentProfileSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [AcademicEmailsController],
  providers: [AcademicEmailsService],
  exports: [AcademicEmailsService],
})
export class AcademicEmailsModule {}
