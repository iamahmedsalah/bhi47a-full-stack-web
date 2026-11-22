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
import { RagDocument, RagDocumentSchema } from './schemas/rag-document.schema';
import { RagChunk, RagChunkSchema } from './schemas/rag-chunk.schema';
import { FaqsModule } from '../faqs/faqs.module';
import { GradesModule } from '../grades/grades.module';
import { MaterialStorageModule } from '../material-storage/material-storage.module';
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
import {
  CourseRegistration,
  CourseRegistrationSchema,
} from '../registrations/schemas/course-registration.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ChatAuditService } from './services/chat-audit.service';
import { AiSettingsService } from './services/ai-settings.service';
import { PdfTextExtractionService } from './services/pdf-text-extraction.service';
import { RagIngestionService } from './services/rag-ingestion.service';
import { RagDocumentSearchService } from './services/rag-document-search.service';

@Module({
  imports: [
    ConfigModule,
    FaqsModule,
    GradesModule,
    MaterialStorageModule,
    MongooseModule.forFeature([
      { name: ChatSession.name, schema: ChatSessionSchema },
      { name: AiUsageLog.name, schema: AiUsageLogSchema },
      { name: AiSettings.name, schema: AiSettingsSchema },
      { name: RagDocument.name, schema: RagDocumentSchema },
      { name: RagChunk.name, schema: RagChunkSchema },
      { name: Course.name, schema: CourseSchema },
      { name: Grade.name, schema: GradeSchema },
      { name: StudentProfile.name, schema: StudentProfileSchema },
      {
        name: StudentAcademicProfile.name,
        schema: StudentAcademicProfileSchema,
      },
      {
        name: CourseRegistration.name,
        schema: CourseRegistrationSchema,
      },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [StudentChatController, AdminAiController],
  providers: [
    GeminiProvider,
    PdfTextExtractionService,
    RagIngestionService,
    RagDocumentSearchService,
    RagService,
    StudentChatbotService,
    AdminAiAdvisorService,
    ChatAuditService,
    AiSettingsService,
  ],
  exports: [
    StudentChatbotService,
    AdminAiAdvisorService,
    RagService,
    RagIngestionService,
    RagDocumentSearchService,
  ],
})
export class AiModule {}
