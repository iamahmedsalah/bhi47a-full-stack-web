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
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/types/authenticated-request';
import { ParseObjectIdPipe } from '../../../common/pipes/parse-objectid.pipe';
import { AcademicAdvisingService } from '../services/academic-advising.service';
import {
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
  @Get('students') students(
    @Query() query: AdvisingStudentsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.listStudents(query, user._id, user.role);
  }
  @Get('advisors') @Roles('admin') advisors() {
    return this.service.listAdvisors();
  }
  @Post('advisors/assign-students') @Roles('admin') bulkAssignStudents(
    @Body() dto: BulkAssignAdvisorDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.bulkAssignStudents(dto, user._id);
  }
  @Post('cases') createCase(
    @Body() dto: CreateAdvisingCaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.createCase(dto, user._id);
  }
  @Get('cases') cases(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listCases(user._id, user.role);
  }
  @Get('cases/:caseId') case(
    @Param('caseId', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.getCase(id, user._id, user.role);
  }
  @Get('cases/:caseId/course-map') courseMap(
    @Param('caseId', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.getCourseMap(id, user._id, user.role);
  }
  @Patch('cases/:caseId/status') status(
    @Param('caseId', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateCaseStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updateStatus(id, dto, user._id, user.role);
  }
  @Patch('cases/:caseId/assign') @Roles('admin') assign(
    @Param('caseId', ParseObjectIdPipe) id: string,
    @Body() dto: AssignCaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.assign(id, dto, user._id);
  }
  @Post('cases/:caseId/generate-recommendations') generate(
    @Param('caseId', ParseObjectIdPipe) id: string,
    @Body() dto: GenerateRecommendationsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.generate(id, dto, user._id, user.role);
  }
  @Get('cases/:caseId/recommendations') recommendations(
    @Param('caseId', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.listRecommendations(id, user._id, user.role);
  }
  @Patch('recommendations/:id') decide(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: DecideRecommendationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.decideRecommendation(id, dto, user._id, user.role);
  }
  @Post('cases/:caseId/plans') createPlan(
    @Param('caseId', ParseObjectIdPipe) id: string,
    @Body() dto: CreatePlanDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.createPlan(id, dto, user._id, user.role);
  }
  @Get('cases/:caseId/plans') plans(
    @Param('caseId', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.listPlans(id, user._id, user.role);
  }
  @Get('plans/:planId') plan(
    @Param('planId', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.getPlan(id, user._id, user.role);
  }
  @Patch('plans/:planId') updatePlan(
    @Param('planId', ParseObjectIdPipe) id: string,
    @Body() dto: UpdatePlanDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updatePlan(id, dto, user._id, user.role);
  }
  @Post('plans/:planId/validate') validate(
    @Param('planId', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.validatePlan(id, user._id, user.role);
  }
  @Post('plans/:planId/approve') approve(
    @Param('planId', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.approvePlan(id, user._id, user.role);
  }
  @Get('plans/:planId/graph') graph(
    @Param('planId', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.getGraph(id, user._id, user.role);
  }
  @Put('plans/:planId/graph') saveGraph(
    @Param('planId', ParseObjectIdPipe) id: string,
    @Body() dto: SaveGraphDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.saveGraph(id, dto, user._id, user.role);
  }
  @Get('cases/:caseId/notes') notes(
    @Param('caseId', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.listNotes(id, user._id, user.role);
  }
  @Post('cases/:caseId/notes') createNote(
    @Param('caseId', ParseObjectIdPipe) id: string,
    @Body() dto: CreateNoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.createNote(id, dto, user._id, user.role);
  }
  @Get('cases/:caseId/audit-logs') @Roles('admin') audit(
    @Param('caseId', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.listAudit(id, user._id, user.role);
  }
}
