import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/types/authenticated-request';
import { ParseObjectIdPipe } from '../../../common/pipes/parse-objectid.pipe';
import { AcademicAdvisingService } from '../services/academic-advising.service';
import { PERMISSIONS } from '@student-portal/shared';
import type { UpdateAdvisingRulesDto } from '../dto/update-advising-rules.dto';
import {
  AdvisingCasesQueryDto,
  AdvisingStudentsQueryDto,
  AssignCaseDto,
  BulkAssignAdvisorDto,
  CreateAdvisingCaseDto,
  CreateNoteDto,
  CreatePlanDto,
  DecideRecommendationDto,
  GenerateRecommendationsDto,
  SaveGraphDto,
  UpdateCaseStatusDto,
  UpdatePlanDto,
} from '../dto/advising.dto';

@ApiTags('Academic Advising - Admin')
@Controller('admin/advising')
@Roles('admin', 'staff')
export class AdminAdvisingController {
  constructor(private readonly service: AcademicAdvisingService) {}

  @Get('students')
  @RequirePermissions(PERMISSIONS.ADVISING_READ)
  students(
    @Query() query: AdvisingStudentsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.listStudents(query, user._id, user.role);
  }

  @Get('advisors')
  @Roles('admin')
  @RequirePermissions(PERMISSIONS.ADVISING_READ)
  advisors() {
    return this.service.listAdvisors();
  }

  @Post('advisors/assign-students')
  @Roles('admin')
  @RequirePermissions(PERMISSIONS.ADVISING_WRITE)
  bulkAssignStudents(
    @Body() dto: BulkAssignAdvisorDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.bulkAssignStudents(dto, user._id);
  }

  @Post('cases')
  @RequirePermissions(PERMISSIONS.ADVISING_WRITE)
  createCase(
    @Body() dto: CreateAdvisingCaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.createCase(dto, user._id);
  }

  @Get('cases')
  @RequirePermissions(PERMISSIONS.ADVISING_READ)
  cases(
    @Query() query: AdvisingCasesQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.listCases(
      user._id,
      user.role,
      query.page,
      query.limit,
      query.status,
    );
  }

  @Get('cases/:caseId')
  @RequirePermissions(PERMISSIONS.ADVISING_READ)
  case(
    @Param('caseId', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.getCase(id, user._id, user.role);
  }

  @Get('cases/:caseId/course-map')
  @RequirePermissions(PERMISSIONS.ADVISING_READ)
  courseMap(
    @Param('caseId', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.getCourseMap(id, user._id, user.role);
  }

  @Patch('cases/:caseId/status')
  @RequirePermissions(PERMISSIONS.ADVISING_WRITE)
  status(
    @Param('caseId', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateCaseStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updateStatus(id, dto, user._id, user.role);
  }

  @Patch('cases/:caseId/assign')
  @Roles('admin')
  @RequirePermissions(PERMISSIONS.ADVISING_WRITE)
  assign(
    @Param('caseId', ParseObjectIdPipe) id: string,
    @Body() dto: AssignCaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.assign(id, dto, user._id);
  }

  @Post('cases/:caseId/generate-recommendations')
  @RequirePermissions(PERMISSIONS.ADVISING_WRITE)
  generate(
    @Param('caseId', ParseObjectIdPipe) id: string,
    @Body() dto: GenerateRecommendationsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.generate(id, dto, user._id, user.role);
  }

  @Get('cases/:caseId/recommendations')
  @RequirePermissions(PERMISSIONS.ADVISING_READ)
  recommendations(
    @Param('caseId', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.listRecommendations(id, user._id, user.role);
  }

  @Patch('recommendations/:id')
  @RequirePermissions(PERMISSIONS.ADVISING_WRITE)
  decide(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: DecideRecommendationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.decideRecommendation(id, dto, user._id, user.role);
  }

  @Post('cases/:caseId/plans')
  @RequirePermissions(PERMISSIONS.ADVISING_WRITE)
  createPlan(
    @Param('caseId', ParseObjectIdPipe) id: string,
    @Body() dto: CreatePlanDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.createPlan(id, dto, user._id, user.role);
  }

  @Get('cases/:caseId/plans')
  @RequirePermissions(PERMISSIONS.ADVISING_READ)
  plans(
    @Param('caseId', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.listPlans(id, user._id, user.role);
  }

  @Get('plans/:planId')
  @RequirePermissions(PERMISSIONS.ADVISING_READ)
  plan(
    @Param('planId', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.getPlan(id, user._id, user.role);
  }

  @Patch('plans/:planId')
  @RequirePermissions(PERMISSIONS.ADVISING_WRITE)
  updatePlan(
    @Param('planId', ParseObjectIdPipe) id: string,
    @Body() dto: UpdatePlanDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updatePlan(id, dto, user._id, user.role);
  }

  @Post('plans/:planId/validate')
  @RequirePermissions(PERMISSIONS.ADVISING_WRITE)
  validate(
    @Param('planId', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.validatePlan(id, user._id, user.role);
  }

  @Post('plans/:planId/approve')
  @RequirePermissions(PERMISSIONS.ADVISING_WRITE)
  approve(
    @Param('planId', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.approvePlan(id, user._id, user.role);
  }

  @Get('plans/:planId/graph')
  @RequirePermissions(PERMISSIONS.ADVISING_READ)
  graph(
    @Param('planId', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.getGraph(id, user._id, user.role);
  }

  @Put('plans/:planId/graph')
  @RequirePermissions(PERMISSIONS.ADVISING_WRITE)
  saveGraph(
    @Param('planId', ParseObjectIdPipe) id: string,
    @Body() dto: SaveGraphDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.saveGraph(id, dto, user._id, user.role);
  }

  @Get('cases/:caseId/notes')
  @RequirePermissions(PERMISSIONS.ADVISING_READ)
  notes(
    @Param('caseId', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.listNotes(id, user._id, user.role);
  }

  @Post('cases/:caseId/notes')
  @RequirePermissions(PERMISSIONS.ADVISING_WRITE)
  createNote(
    @Param('caseId', ParseObjectIdPipe) id: string,
    @Body() dto: CreateNoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.createNote(id, dto, user._id, user.role);
  }

  @Get('cases/:caseId/audit-logs')
  @Roles('admin')
  @RequirePermissions(PERMISSIONS.ADVISING_READ)
  audit(
    @Param('caseId', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.listAudit(id, user._id, user.role);
  }

  @Get('rules')
  @RequirePermissions(PERMISSIONS.ADVISING_READ)
  getRules() {
    return this.service.getAdvisingRules();
  }

  @Patch('rules')
  @Roles('admin')
  @RequirePermissions(PERMISSIONS.ADVISING_WRITE)
  updateRules(
    @Body() dto: UpdateAdvisingRulesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updateAdvisingRules(dto, user._id);
  }
}
