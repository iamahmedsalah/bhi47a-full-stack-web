import {
  Controller,
  Post,
  Get,
  Patch,
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
    this.authService.setCookieToken(res, result.token);
    return { user: result.user };
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
    this.authService.setCookieToken(res, result.token);
    return { user: result.user };
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user' })
  async getMe(@CurrentUser('_id') userId: string) {
    return this.authService.getMe(userId);
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
    this.authService.setCookieToken(res, result.token);
    return { message: result.message };
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

  @Patch('theme')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update current user theme preference' })
  async updateTheme(
    @CurrentUser('_id') userId: string,
    @Body() dto: UpdateThemeDto,
  ) {
    return this.authService.updateTheme(userId, dto.theme);
  }
}
