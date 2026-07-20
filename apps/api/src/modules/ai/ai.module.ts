import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { GeminiProvider } from './providers/gemini.provider';
import { RagService } from './services/rag.service';
import { StudentChatbotService } from './services/student-chatbot.service';
import { AdminAiAdvisorService } from './services/admin-ai-advisor.service';
import { StudentChatController } from './controllers/student-chat.controller';
import { AdminAiController } from './controllers/admin-ai.controller';
import { ChatSession, ChatSessionSchema } from './schemas/chat-session.schema';
import { AiUsageLog, AiUsageLogSchema } from './schemas/ai-usage-log.schema';
import { AiSettings, AiSettingsSchema } from './schemas/ai-settings.schema';
import { Faq, FaqSchema } from '../faqs/schemas/faq.schema';
import { Course, CourseSchema } from '../courses/schemas/course.schema';
import { Grade, GradeSchema } from '../grades/schemas/grade.schema';
import {
  StudentProfile,
  StudentProfileSchema,
} from '../students/schemas/student-profile.schema';
import {
  StudentAcademicProfile,
  StudentAcademicProfileSchema,
} from '../registrations/schemas/student-academic-profile.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ChatAuditService } from './services/chat-audit.service';
import { AiSettingsService } from './services/ai-settings.service';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: ChatSession.name, schema: ChatSessionSchema },
      { name: AiUsageLog.name, schema: AiUsageLogSchema },
      { name: AiSettings.name, schema: AiSettingsSchema },
      { name: Faq.name, schema: FaqSchema },
      { name: Course.name, schema: CourseSchema },
      { name: Grade.name, schema: GradeSchema },
      { name: StudentProfile.name, schema: StudentProfileSchema },
      {
        name: StudentAcademicProfile.name,
        schema: StudentAcademicProfileSchema,
      },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [StudentChatController, AdminAiController],
  providers: [
    GeminiProvider,
    RagService,
    StudentChatbotService,
    AdminAiAdvisorService,
    ChatAuditService,
    AiSettingsService,
  ],
  exports: [StudentChatbotService, AdminAiAdvisorService, RagService],
})
export class AiModule {}
