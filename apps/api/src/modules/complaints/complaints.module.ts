import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Complaint, ComplaintSchema } from './schemas/complaint.schema';
import {
  SystemSettings,
  SystemSettingsSchema,
} from './schemas/system-settings.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ComplaintsService } from './complaints.service';
import { ComplaintsController } from './complaints.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailsModule } from '../emails/emails.module';
import { ComplaintReplyEmailService } from './complaint-reply-email.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Complaint.name, schema: ComplaintSchema },
      { name: SystemSettings.name, schema: SystemSettingsSchema },
      { name: User.name, schema: UserSchema },
    ]),
    NotificationsModule,
    EmailsModule,
  ],
  controllers: [ComplaintsController],
  providers: [ComplaintsService, ComplaintReplyEmailService],
  exports: [ComplaintsService],
})
export class ComplaintsModule {}
