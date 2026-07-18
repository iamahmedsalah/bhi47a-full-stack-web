import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Res,
  HttpCode,
  HttpStatus,
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
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('auth')
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
    const csrfToken = this.authService.setCookieToken(res, result.token);
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
    const csrfToken = this.authService.setCookieToken(res, result.token);
    return { user: result.user, csrfToken };
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user' })
  async getMe(@CurrentUser('_id') userId: string) {
    return this.authService.getMe(userId);
  }

  @Get('csrf')
  @ApiOperation({ summary: 'Refresh CSRF token for unsafe requests' })
  refreshCsrf(@Res({ passthrough: true }) res: express.Response) {
    const csrfToken = this.authService.refreshCsrfToken(res);
    return { csrfToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and clear cookie' })
  logout(@Res({ passthrough: true }) res: express.Response) {
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
    const csrfToken = this.authService.setCookieToken(res, result.token);
    return { message: result.message, csrfToken };
  }

  @Post('google/link/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Prepare current student account for Google linking',
  })
  async startGoogleLink(
    @CurrentUser('_id') userId: string,
    @Body() dto: StartGoogleLinkDto,
  ) {
    return this.authService.startGoogleLink(userId, dto.email);
  }

  @Delete('google/link')
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
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset student password using OTP code' })
  async resetPasswordOtp(
    @Body() dto: ResetPasswordOtpDto,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const result = await this.authService.resetPasswordOtp(dto);
    const csrfToken = this.authService.setCookieToken(res, result.token);
    return { user: result.user, csrfToken };
  }

  @Post('google/link/verify-otp')
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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify Google linking directly using Google ID Token',
  })
  async verifyGoogleOAuth(
    @CurrentUser('_id') userId: string,
    @Body() dto: VerifyGoogleOAuthDto,
  ) {
    return this.authService.verifyGoogleOAuth(userId, dto.credential);
  }

  @Public()
  @Post('google/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Student login using Google OAuth ID Token' })
  async googleLogin(
    @Body() dto: VerifyGoogleOAuthDto,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const result = await this.authService.googleLogin(dto.credential);
    const csrfToken = this.authService.setCookieToken(res, result.token);
    return { user: result.user, csrfToken };
  }
}
