import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Res,
  Headers,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import * as express from 'express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { StudentLoginDto } from './dto/student-login.dto';
import { AdminLoginDto } from './dto/admin-login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { StartGoogleLinkDto } from './dto/google-link.dto';
import { UpdateThemeDto } from './dto/update-theme.dto';
import {
  ForgotPasswordDto,
  ResetPasswordOtpDto,
  VerifyGoogleOtpDto,
  VerifyGoogleOAuthDto,
} from './dto/forgot-password.dto';
import { Public, OptionalAuth } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { BrowserAuth } from './guards/auth-origin.guard';
import { SensitiveOperation } from './guards/recent-auth.guard';

@ApiTags('Auth')
@Controller('auth')
@BrowserAuth()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('student/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Student login with studentCode + password' })
  async studentLogin(
    @Body() dto: StudentLoginDto,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const result = await this.authService.studentLogin(dto);
    const csrfToken = await this.authService.setCookieToken(res, result.token);
    return { user: result.user, csrfToken };
  }

  @Public()
  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin/Staff login with email + password' })
  async adminLogin(
    @Body() dto: AdminLoginDto,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const result = await this.authService.adminLogin(dto);
    const csrfToken = await this.authService.setCookieToken(res, result.token);
    return { user: result.user, csrfToken };
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user' })
  async getMe(@CurrentUser('_id') userId: string) {
    return this.authService.getMe(userId);
  }

  @Get('csrf')
  @ApiOperation({ summary: 'Refresh CSRF token for unsafe requests' })
  refreshCsrf(
    @Res({ passthrough: true }) res: express.Response,
    @Req() req: express.Request,
  ) {
    const csrfToken = this.authService.refreshCsrfToken(
      res,
      req.cookies?.access_token,
    );
    return { csrfToken };
  }

  @OptionalAuth()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and clear cookie' })
  async logout(
    @CurrentUser('_id') userId: string | undefined,
    @Res({ passthrough: true }) res: express.Response,
    @Req() req: express.Request,
  ) {
    if (userId) {
      await this.authService.revokeSession(req.cookies?.access_token);
      try {
        await this.authService.recordLogout(userId);
      } catch {
        // Non-blocking: proceed with clearing cookies even if DB activity update fails
      }
    }
    this.authService.clearCookieToken(res);
    return { message: 'تم تسجيل الخروج بنجاح' }; // Logged out successfully
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change password' })
  async changePassword(
    @CurrentUser('_id') userId: string,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const result = await this.authService.changePassword(userId, dto);
    const csrfToken = await this.authService.setCookieToken(res, result.token);
    return { message: result.message, csrfToken };
  }

  @Post('google/link/start')
  @SensitiveOperation('google-link:start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Prepare current student account for Google linking',
  })
  async startGoogleLink(
    @CurrentUser('_id') userId: string,
    @Body() dto: StartGoogleLinkDto,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    return this.authService.startGoogleLink(userId, dto.email, acceptLanguage);
  }

  @Delete('google/link')
  @SensitiveOperation('google-link:remove')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove or cancel Google account linking for current student',
  })
  async unlinkGoogle(@CurrentUser('_id') userId: string) {
    return this.authService.unlinkGoogle(userId);
  }

  @Patch('theme')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update current user theme preference' })
  async updateTheme(
    @CurrentUser('_id') userId: string,
    @Body() dto: UpdateThemeDto,
  ) {
    return this.authService.updateTheme(userId, dto.theme);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send a 6-digit OTP code to student email for password recovery',
  })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    return this.authService.forgotPassword(dto, acceptLanguage);
  }

  @Public()
  @Post('reset-password-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset student password using OTP code' })
  async resetPasswordOtp(
    @Body() dto: ResetPasswordOtpDto,
    @Headers('accept-language') acceptLanguage?: string,
    @Res({ passthrough: true }) res?: express.Response,
  ) {
    const result = await this.authService.resetPasswordOtp(dto, acceptLanguage);
    const csrfToken = await this.authService.setCookieToken(res!, result.token);
    return { user: result.user, csrfToken };
  }

  @Post('google/link/verify-otp')
  @SensitiveOperation('google-link:verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify Google linking using the OTP sent to Gmail',
  })
  async verifyGoogleOtp(
    @CurrentUser('_id') userId: string,
    @Body() dto: VerifyGoogleOtpDto,
  ) {
    return this.authService.verifyGoogleOtp(userId, dto.otp);
  }

  @Post('google/link/verify-oauth')
  @SensitiveOperation('google-link:verify-oauth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify Google linking directly using Google ID Token',
  })
  async verifyGoogleOAuth(
    @CurrentUser('_id') userId: string,
    @Body() dto: VerifyGoogleOAuthDto,
    @Headers('origin') origin: string,
  ) {
    return this.authService.verifyGoogleOAuth(
      userId,
      dto.credential,
      dto.nonceFlowId && dto.nonceProof
        ? { flowId: dto.nonceFlowId, proof: dto.nonceProof, origin }
        : undefined,
    );
  }

  @Public()
  @Post('google/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Student login using Google OAuth ID Token' })
  async googleLogin(
    @Body() dto: VerifyGoogleOAuthDto,
    @Res({ passthrough: true }) res: express.Response,
    @Headers('origin') origin: string,
  ) {
    const result = await this.authService.googleLogin(
      dto.credential,
      dto.nonceFlowId && dto.nonceProof
        ? { flowId: dto.nonceFlowId, proof: dto.nonceProof, origin }
        : undefined,
    );
    const csrfToken = await this.authService.setCookieToken(res, result.token);
    return { user: result.user, csrfToken };
  }

  @Post('heartbeat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Record user activity heartbeat and current action',
  })
  async heartbeat(
    @CurrentUser('_id') userId: string,
    @Body() body: { route?: string; action?: string; actionAr?: string },
    @Headers('user-agent') userAgent?: string,
  ) {
    if (!userId) return { ok: true };
    await this.authService.recordHeartbeat(userId, body, userAgent);
    return { ok: true };
  }
}
