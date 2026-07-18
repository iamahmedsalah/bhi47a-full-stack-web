import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/types/authenticated-request';
import { AcademicAdvisingService } from '../services/academic-advising.service';
@ApiTags('Academic Advising - Student')
@Controller('student/advising')
@Roles('student')
export class StudentAdvisingController {
  constructor(private readonly service: AcademicAdvisingService) {}
  @Get() get(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getStudentAdvising(user._id);
  }
  @Get('recommendations') recommendations(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service
      .getStudentAdvising(user._id)
      .then((value) => value?.recommendations ?? []);
  }
  @Get('approved-plan') plan(@CurrentUser() user: AuthenticatedUser) {
    return this.service
      .getStudentAdvising(user._id)
      .then((value) => value?.approvedPlan ?? null);
  }
  @Get('registration-sheet') registrationSheet(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.getStudentAdvising(user._id).then((value) => ({
      generatedAt: new Date().toISOString(),
      case: value?.case ?? null,
      approvedPlan: value?.approvedPlan ?? null,
      notes: value?.notes ?? [],
    }));
  }
  @Post('request-review') review(@CurrentUser() user: AuthenticatedUser) {
    return this.service.requestReview(user._id);
  }
  @Post('acknowledge') acknowledge(@CurrentUser() user: AuthenticatedUser) {
    return this.service.acknowledge(user._id);
  }
  @Post('assistant/messages') assistant() {
    return this.service.assistantDisabled();
  }
}
