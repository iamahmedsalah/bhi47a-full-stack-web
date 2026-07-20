import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/types/authenticated-request';
import { StudentChatbotService } from '../services/student-chatbot.service';
import { SendStudentChatMessageDto } from '../dto/send-student-chat-message.dto';
import { ParseObjectIdPipe } from '../../../common/pipes/parse-objectid.pipe';
import { AiSettingsService } from '../services/ai-settings.service';

@ApiTags('AI - Student Chat')
@Controller('student/chat')
@Roles('student')
export class StudentChatController {
  constructor(
    private readonly chatbot: StudentChatbotService,
    private readonly settings: AiSettingsService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Get student AI advisor availability' })
  async status() {
    return this.settings.getStudentStatus();
  }

  @Post(['message', 'messages'])
  @ApiOperation({ summary: 'Send a message to the AI chatbot' })
  async sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendStudentChatMessageDto,
  ) {
    return this.chatbot.chat(user._id, dto.message, dto.sessionId, dto.locale);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List chat sessions' })
  async listSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.chatbot.listSessions(user._id);
  }

  @Get('sessions/:sessionId/messages')
  @ApiOperation({ summary: 'Get session message history' })
  async getHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId', ParseObjectIdPipe) sessionId: string,
  ) {
    return this.chatbot.getSessionHistory(user._id, sessionId);
  }

  @Post('sessions/:sessionId/end')
  @ApiOperation({ summary: 'End a chat session' })
  async endSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId', ParseObjectIdPipe) sessionId: string,
  ) {
    return this.chatbot.endSession(user._id, sessionId);
  }
}
