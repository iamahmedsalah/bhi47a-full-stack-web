import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-request';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import {
  CreateGpaRegistrationRuleDto,
  QueryAdvisingRequestDto,
  QueryRegistrationDto,
  ReviewAdvisingRequestDto,
  SubmitRegistrationDto,
  UpdateGpaRegistrationRuleDto,
  UpsertStudentAcademicProfileDto,
} from './dto/registration.dto';
import { RegistrationsService } from './registrations.service';

@ApiTags('Course Registration')
@Controller()
export class RegistrationsController {
  constructor(private readonly registrationsService: RegistrationsService) {}

  @Get('registration/eligibility')
  @Roles('student')
  @ApiOperation({ summary: 'Student registration eligibility and GPA rule' })
  getEligibility(@CurrentUser() user: AuthenticatedUser) {
    return this.registrationsService.getEligibility(user._id);
  }

  @Get('registration/available-courses')
  @Roles('student')
  @ApiOperation({ summary: 'Courses available for direct registration' })
  getAvailableCourses(@CurrentUser() user: AuthenticatedUser) {
    return this.registrationsService.getAvailableCourses(user._id);
  }

  @Post('registration/submit')
  @Roles('student')
  @ApiOperation({ summary: 'Submit direct course registration' })
  submitDirectRegistration(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitRegistrationDto,
  ) {
    return this.registrationsService.submitDirectRegistration(user._id, dto);
  }

  @Get('registration/advising-status')
  @Roles('student')
  @ApiOperation({
    summary: 'Current student advising request and advisor plan',
  })
  getAdvisingStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.registrationsService.getMyAdvisingStatus(user._id);
  }

  @Get('registration/latest')
  @Roles('student')
  @ApiOperation({ summary: 'Latest student registration' })
  getLatestRegistration(@CurrentUser() user: AuthenticatedUser) {
    return this.registrationsService.getLatestStudentRegistration(user._id);
  }

  @Get('registrations/:id/print')
  @Roles('student', 'staff', 'admin')
  @ApiOperation({ summary: 'Printable registration form data' })
  getPrintableForm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.registrationsService.getPrintableForm(id, user._id, user.role);
  }

  @Get('staff/advising-requests')
  @Roles('staff')
  @ApiOperation({ summary: 'Assigned academic advising requests' })
  listAssignedRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryAdvisingRequestDto,
  ) {
    return this.registrationsService.listAssignedAdvisingRequests(
      user._id,
      query,
    );
  }

  @Patch('staff/advising-requests/:id/review')
  @Roles('staff', 'admin')
  @ApiOperation({
    summary: 'Review, edit, approve, or reject advising request',
  })
  reviewRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: ReviewAdvisingRequestDto,
  ) {
    return this.registrationsService.reviewAdvisingRequest(
      id,
      user._id,
      user.role,
      dto,
    );
  }

  @Get('admin/academic-profiles')
  @Roles('admin', 'staff')
  @ApiOperation({ summary: 'List student academic profiles' })
  listAcademicProfiles() {
    return this.registrationsService.listAcademicProfiles();
  }

  @Post('admin/academic-profiles')
  @Roles('admin', 'staff')
  @ApiOperation({ summary: 'Create or update student academic profile' })
  upsertAcademicProfile(@Body() dto: UpsertStudentAcademicProfileDto) {
    return this.registrationsService.upsertAcademicProfile(dto);
  }

  @Get('admin/gpa-rules')
  @Roles('admin')
  @ApiOperation({ summary: 'List GPA registration rules' })
  listGpaRules() {
    return this.registrationsService.listGpaRules();
  }

  @Post('admin/gpa-rules')
  @Roles('admin')
  @ApiOperation({ summary: 'Create GPA registration rule' })
  createGpaRule(@Body() dto: CreateGpaRegistrationRuleDto) {
    return this.registrationsService.createGpaRule(dto);
  }

  @Patch('admin/gpa-rules/:id')
  @Roles('admin')
  @ApiOperation({ summary: 'Update GPA registration rule' })
  updateGpaRule(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateGpaRegistrationRuleDto,
  ) {
    return this.registrationsService.updateGpaRule(id, dto);
  }

  @Delete('admin/gpa-rules/:id')
  @Roles('admin')
  @ApiOperation({ summary: 'Delete GPA registration rule' })
  deleteGpaRule(@Param('id', ParseObjectIdPipe) id: string) {
    return this.registrationsService.deleteGpaRule(id);
  }

  @Get('admin/advising-requests')
  @Roles('admin')
  @ApiOperation({ summary: 'List all academic advising requests' })
  listAllRequests(@Query() query: QueryAdvisingRequestDto) {
    return this.registrationsService.listAllAdvisingRequests(query);
  }

  @Get('admin/registrations')
  @Roles('admin', 'staff')
  @ApiOperation({ summary: 'List course registrations' })
  listRegistrations(@Query() query: QueryRegistrationDto) {
    return this.registrationsService.listRegistrations(query);
  }
}
