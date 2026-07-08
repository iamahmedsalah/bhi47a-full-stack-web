import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { SendEmailDto, QueryEmailLogDto } from './dto/email.dto';
import { EmailsService } from './emails.service';
import { PERMISSIONS } from '@student-portal/shared';

@ApiTags('Emails')
@Controller()
export class EmailsController {
  constructor(private readonly emailsService: EmailsService) {}

  @Post('admin/emails')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.EMAILS_SEND)
  @ApiOperation({ summary: 'Queue an email through Resend worker' })
  async send(@Body() dto: SendEmailDto, @CurrentUser('_id') userId: string) {
    return this.emailsService.send(dto, userId);
  }

  @Get('admin/emails')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.EMAILS_READ)
  @ApiOperation({ summary: 'List email delivery logs' })
  async list(@Query() query: QueryEmailLogDto) {
    return this.emailsService.list(query);
  }
}
