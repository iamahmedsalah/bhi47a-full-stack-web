import {
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../../common/pipes/parse-objectid.pipe';
import type { AuthenticatedUser } from '../../auth/types/authenticated-request';
import { AdminAiAdvisorService } from '../services/admin-ai-advisor.service';

@ApiTags('AI - Admin Advisor')
@Controller('admin/ai')
@Roles('admin', 'staff')
export class AdminAiController {
  constructor(private readonly advisor: AdminAiAdvisorService) {}

  @Post('analyze-student/:studentId')
  @ApiOperation({ summary: 'AI analysis of student academic performance' })
  async analyzeStudent(
    @Param('studentId', ParseObjectIdPipe) studentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.advisor.analyzeStudent(studentId, user._id);
  }

  @Post('summarize-student/:studentId')
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
}
