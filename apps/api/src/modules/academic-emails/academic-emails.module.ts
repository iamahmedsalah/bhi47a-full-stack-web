import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AcademicEmail,
  AcademicEmailSchema,
} from './schemas/academic-email.schema';
import { AcademicEmailsService } from './academic-emails.service';
import { AcademicEmailsController } from './academic-emails.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AcademicEmail.name, schema: AcademicEmailSchema },
    ]),
  ],
  controllers: [AcademicEmailsController],
  providers: [AcademicEmailsService],
  exports: [AcademicEmailsService],
})
export class AcademicEmailsModule {}
