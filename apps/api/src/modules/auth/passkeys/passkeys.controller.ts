import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../decorators/public.decorator';
import { Roles } from '../decorators/roles.decorator';
import { BrowserAuth } from '../guards/auth-origin.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { AuthSessionService } from '../services/auth-session.service';
import { PasskeysService } from './passkeys.service';
import {
  PasskeyLoginVerifyDto,
  PasskeyNameDto,
  PasskeyReauthDto,
  PasskeyRegisterVerifyDto,
  PasskeyIdDto,
  PasskeyLoginOptionsDto,
  UpdatePasskeySettingsDto,
} from './passkeys.dto';

@Controller('auth/passkeys')
export class PasskeysController {
  constructor(
    private readonly passkeys: PasskeysService,
    private readonly sessions: AuthSessionService,
  ) {}

  @Public()
  @Get('capabilities')
  capabilities(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return this.passkeys.capabilities();
  }

  @Roles('admin')
  @Get('settings')
  settings(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return this.passkeys.getSettings();
  }

  @Roles('admin')
  @BrowserAuth()
  @Patch('settings')
  updateSettings(
    @CurrentUser('_id') userId: string,
    @Body() dto: UpdatePasskeySettingsDto,
  ) {
    return this.passkeys.updateSettings(dto.studentLoginEnabled, userId);
  }

  @Post('reauthenticate')
  @HttpCode(200)
  reauthenticate(
    @CurrentUser('_id') userId: string,
    @Req() req: Request,
    @Headers('origin') origin: string,
    @Body() dto: PasskeyReauthDto,
  ) {
    return this.passkeys.reauthenticate(
      userId,
      req.cookies?.access_token,
      dto.password,
      origin,
      dto.operation,
      dto.credentialId,
    );
  }

  @Post('register/options')
  @HttpCode(200)
  registerOptions(
    @CurrentUser('_id') userId: string,
    @Req() req: Request,
    @Headers('origin') origin: string,
  ) {
    return this.passkeys.registerOptions(
      userId,
      req.cookies?.access_token,
      origin,
    );
  }

  @Post('register/verify')
  @HttpCode(200)
  registerVerify(
    @CurrentUser('_id') userId: string,
    @Req() req: Request,
    @Headers('origin') origin: string,
    @Body() dto: PasskeyRegisterVerifyDto,
  ) {
    return this.passkeys.registerVerify(
      userId,
      req.cookies?.access_token,
      origin,
      dto,
    );
  }

  @Public()
  @Post('login/options')
  @HttpCode(200)
  loginOptions(
    @Headers('origin') origin: string,
    @Body() dto: PasskeyLoginOptionsDto,
  ) {
    return this.passkeys.loginOptions(origin, dto?.area);
  }

  @Public()
  @Post('login/verify')
  @HttpCode(200)
  async loginVerify(
    @Headers('origin') origin: string,
    @Headers('x-passkey-flow') flowToken: string | undefined,
    @Body() dto: PasskeyLoginVerifyDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ) {
    const result = await this.passkeys.loginVerify(origin, flowToken, dto);
    const csrfToken = await this.sessions.setCookieToken(
      res,
      result.token,
      req,
    );
    res.setHeader('Cache-Control', 'no-store');
    return { user: result.user, csrfToken };
  }

  @Get()
  list(@CurrentUser('_id') userId: string) {
    return this.passkeys.list(userId);
  }

  @Patch(':id')
  rename(
    @CurrentUser('_id') userId: string,
    @Req() req: Request,
    @Headers('origin') origin: string,
    @Param() params: PasskeyIdDto,
    @Body() dto: PasskeyNameDto,
  ) {
    return this.passkeys.rename(
      userId,
      req.cookies?.access_token,
      origin,
      params.id,
      dto.name,
      dto.unlockMethod,
    );
  }

  @Delete(':id')
  remove(
    @CurrentUser('_id') userId: string,
    @Req() req: Request,
    @Headers('origin') origin: string,
    @Param() params: PasskeyIdDto,
  ) {
    return this.passkeys.remove(
      userId,
      req.cookies?.access_token,
      origin,
      params.id,
    );
  }
}
