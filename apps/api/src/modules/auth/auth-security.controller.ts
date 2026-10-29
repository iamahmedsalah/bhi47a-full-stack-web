import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { IsString, Length } from 'class-validator';
import { RecentAuthService } from './services/recent-auth.service';
import { AuthSessionService } from './services/auth-session.service';
import { UsersService } from '../users/users.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { BrowserAuth } from './guards/auth-origin.guard';
import { SensitiveOperation } from './guards/recent-auth.guard';

export class ReauthenticateDto {
  @IsString() @Length(1, 256) password!: string;
  @IsString() @Length(1, 100) operation!: string;
}

@BrowserAuth()
@Controller('auth')
export class AuthSecurityController {
  constructor(
    private readonly recent: RecentAuthService,
    private readonly sessions: AuthSessionService,
    private readonly users: UsersService,
  ) {}

  @Public()
  @Post('google/nonce')
  @HttpCode(200)
  nonce(
    @Headers('origin') origin: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    return this.recent.googleNonce(origin);
  }

  @Post('reauthenticate')
  @HttpCode(200)
  reauthenticate(
    @CurrentUser('_id') userId: string,
    @Req() req: Request,
    @Body() dto: ReauthenticateDto,
  ) {
    return this.recent.reauthenticate(
      userId,
      req.cookies?.access_token,
      dto.password,
      dto.operation,
    );
  }

  @Get('sessions')
  sessionsList(@CurrentUser('_id') userId: string, @Req() req: Request) {
    return this.sessions.listSessions(userId, req.cookies?.access_token, req);
  }

  @Delete('sessions/:id')
  @SensitiveOperation('sessions:id')
  revoke(@CurrentUser('_id') userId: string, @Param('id') id: string) {
    return this.sessions.revokeOwnedSession(userId, id);
  }

  @Post('logout-all')
  @SensitiveOperation('sessions:all')
  @HttpCode(200)
  async logoutAll(
    @CurrentUser('_id') userId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.users.revokeAllSessions(userId);
    this.sessions.clearCookieToken(res);
    return { ok: true };
  }
}
