import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PERMISSIONS } from '@student-portal/shared';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../../common/pipes/parse-objectid.pipe';
import type { AuthenticatedUser } from '../../auth/types/authenticated-request';
import { AdminAiAdvisorService } from '../services/admin-ai-advisor.service';
import { ChatAuditService } from '../services/chat-audit.service';
import { QueryChatAuditDto } from '../dto/query-chat-audit.dto';
import { UpdateAiSettingsDto } from '../dto/update-ai-settings.dto';
import { AiSettingsService } from '../services/ai-settings.service';
import { RagIngestionService } from '../services/rag-ingestion.service';

@ApiTags('AI - Admin Advisor')
@Controller('admin/ai')
@Roles('admin', 'staff')
export class AdminAiController {
  constructor(
    private readonly advisor: AdminAiAdvisorService,
    private readonly chatAudit: ChatAuditService,
    private readonly settings: AiSettingsService,
    private readonly ragIngestion: RagIngestionService,
  ) {}

  @Get('settings')
  @Roles('admin')
  @ApiOperation({ summary: 'Get AI advisor settings and total token usage' })
  async getSettings() {
    return this.settings.getAdminSettings();
  }

  @Patch('settings')
  @Roles('admin')
  @ApiOperation({ summary: 'Enable or disable the student AI advisor' })
  async updateSettings(
    @Body() dto: UpdateAiSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.settings.update(dto, user._id);
  }

  @Get('chat-sessions')
  @Roles('admin')
  @ApiOperation({ summary: 'List student AI chat sessions for auditing' })
  async listChatSessions(@Query() query: QueryChatAuditDto) {
    return this.chatAudit.list(query);
  }

  @Get('chat-sessions/:sessionId')
  @Roles('admin')
  @ApiOperation({ summary: 'View a student AI chat session for auditing' })
  async getChatSession(
    @Param('sessionId', ParseObjectIdPipe) sessionId: string,
  ) {
    return this.chatAudit.getSession(sessionId);
  }

  @Post('analyze-student/:studentId')
  @RequirePermissions(PERMISSIONS.ADVISING_READ)
  @ApiOperation({ summary: 'AI analysis of student academic performance' })
  async analyzeStudent(
    @Param('studentId', ParseObjectIdPipe) studentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.advisor.analyzeStudent(studentId, user._id);
  }

  @Post('summarize-student/:studentId')
  @RequirePermissions(PERMISSIONS.ADVISING_READ)
  @ApiOperation({ summary: 'AI-generated academic summary for advising' })
  async summarizeStudent(
    @Param('studentId', ParseObjectIdPipe) studentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.advisor.summarizeStudent(studentId, user._id);
  }

  @Get('usage-stats')
  @Roles('admin')
  @ApiOperation({ summary: 'Get AI usage statistics' })
  async usageStats(@Query('days') days?: string) {
    return this.advisor.getUsageStats(days ? parseInt(days, 10) : 30);
  }

  @Get('rag-documents')
  @Roles('admin')
  @ApiOperation({
    summary: 'Get RAG syllabus indexing status overview for all active courses',
  })
  async getRagDocumentsOverview() {
    return this.ragIngestion.getIngestionOverview();
  }

  @Post('rag-documents/reindex-all')
  @Roles('admin')
  @ApiOperation({
    summary: 'Trigger RAG indexing for all unindexed or failed course syllabi',
  })
  async reindexAllRagDocuments(@Body('forceAll') forceAll?: boolean) {
    return this.ragIngestion.reindexAllPending(Boolean(forceAll));
  }

  @Post('rag-documents/:courseId/reindex')
  @Roles('admin')
  @ApiOperation({
    summary: 'Force manual RAG re-indexing for a specific course syllabus',
  })
  async reindexCourseRagDocument(
    @Param('courseId', ParseObjectIdPipe) courseId: string,
  ) {
    return this.ragIngestion.reindexCourse(courseId, true);
  }
}
