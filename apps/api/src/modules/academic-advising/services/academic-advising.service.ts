import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { Role } from '@student-portal/shared';
import { AdvisingCaseService } from './advising-case.service';
import { AdvisingPlanService } from './advising-plan.service';
import { AdvisingRecommendationService } from './advising-recommendation.service';
import { AdvisingQueryService } from './advising-query.service';
import type { UpdateAdvisingRulesDto } from '../dto/update-advising-rules.dto';
import type {
  AdvisingStudentsQueryDto,
  AssignCaseDto,
  AutoDistributeAdvisorsDto,
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

@Injectable()
export class AcademicAdvisingService {
  constructor(
    private readonly caseService: AdvisingCaseService,
    private readonly planService: AdvisingPlanService,
    private readonly recommendationService: AdvisingRecommendationService,
    private readonly queryService: AdvisingQueryService,
  ) {}

  // ── Case Management ──────────────────────────────────────────
  createCase(dto: CreateAdvisingCaseDto, actorId: string) {
    return this.caseService.createCase(dto, actorId);
  }

  listCases(
    actorId: string,
    role: Role,
    page: number = 1,
    limit: number = 50,
    status?: string,
  ) {
    return this.caseService.listCases(actorId, role, page, limit, status);
  }

  getCase(id: string, actorId: string, role: Role) {
    return this.caseService.getCase(id, actorId, role);
  }

  updateStatus(
    id: string,
    dto: UpdateCaseStatusDto,
    actorId: string,
    role: Role,
  ) {
    return this.caseService.updateStatus(id, dto, actorId, role);
  }

  assign(id: string, dto: AssignCaseDto, actorId: string) {
    return this.caseService.assign(id, dto, actorId);
  }

  requestReview(studentId: string) {
    return this.caseService.requestReview(studentId);
  }

  acknowledge(studentId: string) {
    return this.caseService.acknowledge(studentId);
  }

  // ── Plan Management ──────────────────────────────────────────
  createPlan(caseId: string, dto: CreatePlanDto, actorId: string, role: Role) {
    return this.planService.createPlan(caseId, dto, actorId, role);
  }

  listPlans(caseId: string, actorId: string, role: Role) {
    return this.planService.listPlans(caseId, actorId, role);
  }

  getPlan(id: string, actorId: string, role: Role) {
    return this.planService.getPlan(id, actorId, role);
  }

  updatePlan(id: string, dto: UpdatePlanDto, actorId: string, role: Role) {
    return this.planService.updatePlan(id, dto, actorId, role);
  }

  validatePlan(id: string, actorId: string, role: Role) {
    return this.planService.validatePlan(id, actorId, role);
  }

  approvePlan(id: string, actorId: string, role: Role) {
    return this.planService.approvePlan(id, actorId, role);
  }

  getGraph(planId: string, actorId: string, role: Role) {
    return this.planService.getGraph(planId, actorId, role);
  }

  saveGraph(planId: string, dto: SaveGraphDto, actorId: string, role: Role) {
    return this.planService.saveGraph(planId, dto, actorId, role);
  }

  // ── Recommendation Engine ────────────────────────────────────
  generate(
    caseId: string,
    dto: GenerateRecommendationsDto,
    actorId: string,
    role: Role,
  ) {
    return this.recommendationService.generate(caseId, dto, actorId, role);
  }

  listRecommendations(caseId: string, actorId: string, role: Role) {
    return this.recommendationService.listRecommendations(
      caseId,
      actorId,
      role,
    );
  }

  decideRecommendation(
    id: string,
    dto: DecideRecommendationDto,
    actorId: string,
    role: Role,
  ) {
    return this.recommendationService.decideRecommendation(
      id,
      dto,
      actorId,
      role,
    );
  }

  getAdvisingRules() {
    return this.recommendationService.getRules();
  }

  updateAdvisingRules(dto: UpdateAdvisingRulesDto, actorId: string) {
    return this.recommendationService.updateRules(dto, actorId);
  }

  // ── Student & Advisor Queries ────────────────────────────────
  listStudents(query: AdvisingStudentsQueryDto, actorId: string, role: Role) {
    return this.queryService.listStudents(query, actorId, role);
  }

  listAdvisors() {
    return this.queryService.listAdvisors();
  }

  bulkAssignStudents(dto: BulkAssignAdvisorDto, actorId: string) {
    return this.queryService.bulkAssignStudents(dto, actorId);
  }

  autoDistributeStudents(dto: AutoDistributeAdvisorsDto, actorId: string) {
    return this.queryService.autoDistributeStudents(dto, actorId);
  }

  getCourseMap(caseId: string, actorId: string, role: Role) {
    return this.queryService.getCourseMap(caseId, actorId, role);
  }

  getStudentAdvising(studentId: string) {
    return this.queryService.getStudentAdvising(studentId);
  }

  listNotes(caseId: string, actorId: string, role: Role) {
    return this.queryService.listNotes(caseId, actorId, role);
  }

  createNote(caseId: string, dto: CreateNoteDto, actorId: string, role: Role) {
    return this.queryService.createNote(caseId, dto, actorId, role);
  }

  listAudit(caseId: string, actorId: string, role: Role) {
    return this.queryService.listAudit(caseId, actorId, role);
  }

  assistantDisabled(): never {
    throw new ServiceUnavailableException({
      code: 'FEATURE_DISABLED',
      message: 'The academic assistant is not enabled yet.',
    });
  }
}
