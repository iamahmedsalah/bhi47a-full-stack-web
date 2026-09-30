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
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PERMISSIONS } from '@student-portal/shared';
import type { AuthenticatedUser } from '../auth/types/authenticated-request';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import {
  AdminProxyRegistrationDto,
  CreateAcademicYearDto,
  CreateGpaRegistrationRuleDto,
  QueryAdvisingRequestDto,
  QueryRegistrationDto,
  ReviewAdvisingRequestDto,
  SubmitRegistrationDto,
  UpdateGpaRegistrationRuleDto,
  UpsertStudentAcademicProfileDto,
  UpsertRegistrationTermDto,
  ToggleRegistrationTermDto,
} from './dto/registration.dto';
import { RegistrationsService } from './registrations.service';
import type { AdvisingCourseMapResponse } from './registrations.service';

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

  @Get('registration/term')
  @Roles('student', 'staff', 'admin')
  getRegistrationTerm(@CurrentUser() user: AuthenticatedUser) {
    return this.registrationsService
      .getEligibility(user._id)
      .then((eligibility) => eligibility.registrationTerm);
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

  @Post('registration/request-advising')
  @Roles('student')
  @ApiOperation({
    summary: 'Request advising instead of incomplete registration',
  })
  requestRegistrationAdvising(@CurrentUser() user: AuthenticatedUser) {
    return this.registrationsService.requestIncompleteRegistrationAdvising(
      user._id,
    );
  }

  @Post('registration/submit-approved-plan')
  @Roles('student')
  @ApiOperation({
    summary:
      'Convert the acknowledged advisor-approved plan into final registration',
  })
  submitApprovedPlan(@CurrentUser() user: AuthenticatedUser) {
    return this.registrationsService.submitApprovedAdvisingPlan(user._id);
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

  @Get('registration/history')
  @Roles('student')
  @ApiOperation({ summary: 'All saved registrations for the current student' })
  getRegistrationHistory(@CurrentUser() user: AuthenticatedUser) {
    return this.registrationsService.listStudentRegistrationHistory(user._id);
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
  @RequirePermissions(PERMISSIONS.ADVISING_READ)
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
  @RequirePermissions(PERMISSIONS.ADVISING_WRITE)
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

  @Get('staff/advising-requests/:id/course-map')
  @Roles('staff', 'admin')
  @RequirePermissions(PERMISSIONS.ADVISING_READ)
  @ApiOperation({
    summary: 'Student-specific course map with grades for advising',
  })
  getAdvisingCourseMap(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<AdvisingCourseMapResponse> {
    return this.registrationsService.getAdvisingCourseMap(
      id,
      user._id,
      user.role,
    );
  }

  @Get('admin/academic-profiles')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.ADVISING_READ)
  @ApiOperation({ summary: 'List student academic profiles' })
  listAcademicProfiles() {
    return this.registrationsService.listAcademicProfiles();
  }

  @Post('admin/academic-profiles')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.ADVISING_WRITE)
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
  @RequirePermissions(PERMISSIONS.REGISTRATION_READ)
  @ApiOperation({ summary: 'List course registrations' })
  listRegistrations(@Query() query: QueryRegistrationDto) {
    return this.registrationsService.listRegistrations(query);
  }

  @Patch('admin/registrations/:id')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.REGISTRATION_WRITE)
  @ApiOperation({ summary: 'Edit student course registration (Admin/Staff)' })
  editRegistration(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: SubmitRegistrationDto,
  ) {
    return this.registrationsService.adminEditRegistration(id, dto, user._id);
  }

  @Post('admin/registrations/proxy')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.REGISTRATION_PROXY)
  @ApiOperation({
    summary: 'Register courses on behalf of a student (Proxy Registration)',
  })
  proxyRegistration(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AdminProxyRegistrationDto,
  ) {
    return this.registrationsService.adminProxyRegistration(dto, user._id);
  }

  @Get('admin/registrations/roster')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.REGISTRATION_READ)
  @ApiOperation({
    summary:
      'Student registration roster: Registered vs Not Registered with level filter',
  })
  getRegistrationRoster(@Query() query: QueryRegistrationDto) {
    return this.registrationsService.getStudentRegistrationRoster(query);
  }

  @Get('admin/registration-terms')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.REGISTRATION_READ)
  @ApiOperation({ summary: 'List registration semester open/close settings' })
  listRegistrationTerms() {
    return this.registrationsService.listRegistrationTerms();
  }

  @Get('admin/academic-years')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.REGISTRATION_READ)
  @ApiOperation({ summary: 'List managed academic years and usage counts' })
  listAcademicYears() {
    return this.registrationsService.listAcademicYears();
  }

  @Post('admin/academic-years')
  @Roles('admin')
  @ApiOperation({ summary: 'Create an academic year with all three semesters' })
  createAcademicYear(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAcademicYearDto,
  ) {
    return this.registrationsService.createAcademicYear(dto, user._id);
  }

  @Patch('admin/academic-years/:academicYear/current')
  @Roles('admin')
  @ApiOperation({ summary: 'Make an academic year authoritative/current' })
  setCurrentAcademicYear(@Param('academicYear') academicYear: string) {
    return this.registrationsService.setCurrentAcademicYear(academicYear);
  }

  @Delete('admin/academic-years/:academicYear')
  @Roles('admin')
  @ApiOperation({ summary: 'Delete an unused, non-current academic year' })
  deleteAcademicYear(@Param('academicYear') academicYear: string) {
    return this.registrationsService.deleteAcademicYear(academicYear);
  }

  @Post('admin/registration-terms')
  @Roles('admin')
  @ApiOperation({ summary: 'Open, close, or schedule a registration semester' })
  upsertRegistrationTerm(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertRegistrationTermDto,
  ) {
    return this.registrationsService.upsertRegistrationTerm(dto, user._id);
  }

  @Patch('admin/registration-terms/:id')
  @Roles('admin')
  @ApiOperation({ summary: 'Toggle registration semester open/close' })
  toggleRegistrationTerm(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: ToggleRegistrationTermDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.registrationsService.toggleRegistrationTerm(
      id,
      dto.isOpen,
      user._id,
    );
  }
}
