import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
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

  @Post('stream')
  @ApiOperation({
    summary: 'Stream a message response from the AI chatbot via SSE',
  })
  async streamMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendStudentChatMessageDto,
    @Res() res: Response,
  ) {
    const stream = this.chatbot.chatStream(
      user._id,
      dto.message,
      dto.sessionId,
      dto.locale,
    );

    // Pull the first event ("meta") before committing 200 SSE headers so rate-limit (429) or disabled (503) exceptions return proper HTTP status codes
    const first = await stream.next();

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const writeSse = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    if (!first.done && first.value) {
      writeSse(first.value.event, first.value.data);
    }

    for await (const item of stream) {
      writeSse(item.event, item.data);
    }

    res.end();
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
