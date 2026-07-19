import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { Role, Semester } from '@student-portal/shared';
import { AdvisingCase } from '../schemas/advising-case.schema';
import { AdvisingPlan } from '../schemas/advising-plan.schema';
import {
  AdvisingGraph,
  type AdvisingGraphEdge,
  type AdvisingGraphNode,
} from '../schemas/advising-graph.schema';
import { Course } from '../../courses/schemas/course.schema';
import { StudentAcademicProfile } from '../../registrations/schemas/student-academic-profile.schema';
import { AdvisingAuditService } from './advising-audit.service';
import { PlanValidationService } from './plan-validation.service';
import type {
  CreatePlanDto,
  SaveGraphDto,
  UpdatePlanDto,
} from '../dto/advising.dto';

@Injectable()
export class AdvisingPlanService {
  constructor(
    @InjectModel(AdvisingCase.name) private readonly cases: Model<AdvisingCase>,
    @InjectModel(AdvisingPlan.name) private readonly plans: Model<AdvisingPlan>,
    @InjectModel(AdvisingGraph.name)
    private readonly graphs: Model<AdvisingGraph>,
    @InjectModel(Course.name) private readonly courses: Model<Course>,
    @InjectModel(StudentAcademicProfile.name)
    private readonly academicProfiles: Model<StudentAcademicProfile>,
    private readonly validation: PlanValidationService,
    private readonly audit: AdvisingAuditService,
  ) {}

  async createPlan(
    caseId: string,
    dto: CreatePlanDto,
    actorId: string,
    role: Role,
  ) {
    const caseItem = await this.cases.findById(caseId);
    if (!caseItem) throw new NotFoundException('Advising case not found');
    this.assertCaseAccess(caseItem.assignedAdvisorId?.toString(), actorId, role);

    const latest = await this.plans
      .findOne({ advisingCaseId: caseItem._id })
      .sort({ version: -1 })
      .lean();
    const version = (latest?.version ?? 0) + 1;

    const courseIds = dto.selectedCourses.map((id) => new Types.ObjectId(id));
    const selected = await this.courses
      .find({ _id: { $in: courseIds }, isActive: true })
      .lean();
    if (selected.length !== courseIds.length) {
      throw new BadRequestException('One or more selected courses are invalid');
    }
    const totalCredits = selected.reduce(
      (acc, curr) => acc + (curr.creditHours ?? 0),
      0,
    );

    const plan = await this.plans.create({
      advisingCaseId: caseItem._id,
      studentId: caseItem.studentId,
      advisorId: new Types.ObjectId(actorId),
      type: (dto.type as any) || 'ADVISOR_DRAFT',
      title: dto.title ?? `Plan v${version}`,
      academicYear: caseItem.academicYear,
      semester: caseItem.semester,
      version,
      status: 'DRAFT',
      selectedCourses: courseIds,
      totalCredits,
      advisorNotes: dto.advisorNotes,
      studentVisibleNotes: dto.studentVisibleNotes,
    });

    await this.audit.record(
      caseItem._id,
      actorId,
      'PLAN_CREATED',
      'AdvisingPlan',
      plan._id.toString(),
      { newValue: { version } },
    );
    return plan;
  }

  async listPlans(caseId: string, actorId: string, role: Role) {
    const caseItem = await this.cases.findById(caseId).lean();
    if (!caseItem) throw new NotFoundException('Advising case not found');
    this.assertCaseAccess(
      caseItem.assignedAdvisorId?.toString(),
      actorId,
      role,
    );
    return this.plans
      .find({ advisingCaseId: new Types.ObjectId(caseId) })
      .populate('selectedCourses', 'code name nameAr nameEn creditHours semester')
      .populate('advisorId', 'name email')
      .sort({ version: -1 })
      .lean();
  }

  async getPlan(id: string, actorId: string, role: Role) {
    const plan = await this.plans
      .findById(id)
      .populate('selectedCourses', 'code name nameAr nameEn creditHours semester')
      .populate('advisorId', 'name email')
      .lean();
    if (!plan) throw new NotFoundException('Advising plan not found');

    const caseItem = await this.cases.findById(plan.advisingCaseId).lean();
    if (caseItem) {
      this.assertCaseAccess(
        caseItem.assignedAdvisorId?.toString(),
        actorId,
        role,
      );
    }
    return plan;
  }

  async updatePlan(
    id: string,
    dto: UpdatePlanDto,
    actorId: string,
    role: Role,
  ) {
    const plan = await this.plans.findById(id);
    if (!plan) throw new NotFoundException('Advising plan not found');

    const caseItem = await this.cases.findById(plan.advisingCaseId);
    if (caseItem) {
      this.assertCaseAccess(
        caseItem.assignedAdvisorId?.toString(),
        actorId,
        role,
      );
    }

    if (dto.selectedCourses) {
      const courseIds = dto.selectedCourses.map((cId) => new Types.ObjectId(cId));
      const selected = await this.courses
        .find({ _id: { $in: courseIds }, isActive: true })
        .lean();
      if (selected.length !== courseIds.length) {
        throw new BadRequestException('One or more selected courses are invalid');
      }
      plan.selectedCourses = courseIds;
      plan.totalCredits = selected.reduce(
        (acc, curr) => acc + (curr.creditHours ?? 0),
        0,
      );
    }

    if (dto.title !== undefined) plan.title = dto.title;
    if (dto.advisorNotes !== undefined) plan.advisorNotes = dto.advisorNotes;
    if (dto.studentVisibleNotes !== undefined)
      plan.studentVisibleNotes = dto.studentVisibleNotes;

    await plan.save();
    await this.audit.record(
      plan.advisingCaseId,
      actorId,
      'PLAN_UPDATED',
      'AdvisingPlan',
      plan._id.toString(),
    );
    return plan;
  }

  async validatePlan(id: string, actorId: string, role: Role) {
    const plan = await this.plans.findById(id).lean();
    if (!plan) throw new NotFoundException('Advising plan not found');

    const caseItem = await this.cases.findById(plan.advisingCaseId).lean();
    if (!caseItem) throw new NotFoundException('Advising case not found');
    this.assertCaseAccess(
      caseItem.assignedAdvisorId?.toString(),
      actorId,
      role,
    );

    const studentProfile = await this.academicProfiles
      .findOne({ studentId: plan.studentId })
      .lean();

    const selectedCourseObjs = await this.courses
      .find({ _id: { $in: plan.selectedCourses } })
      .lean();

    const result = this.validation.validate({
      courses: selectedCourseObjs as Course[],
      completedCodes: studentProfile?.completedCourses ?? [],
      failedCodes: studentProfile?.failedCourses ?? [],
      maxCredits: 18,
      semester: (caseItem.semester as Semester) || 'first',
    });

    const status = result.valid ? 'VALIDATED' : 'DRAFT';
    await this.plans.updateOne(
      { _id: plan._id },
      { $set: { status, validationResult: result } },
    );

    await this.audit.record(
      caseItem._id,
      actorId,
      'PLAN_VALIDATED',
      'AdvisingPlan',
      plan._id.toString(),
      { newValue: { isValid: result.valid } },
    );
    return { plan: { ...plan, status }, validation: result };
  }

  async approvePlan(id: string, actorId: string, role: Role) {
    const plan = await this.plans.findById(id);
    if (!plan) throw new NotFoundException('Advising plan not found');

    const caseItem = await this.cases.findById(plan.advisingCaseId);
    if (!caseItem) throw new NotFoundException('Advising case not found');
    this.assertCaseAccess(
      caseItem.assignedAdvisorId?.toString(),
      actorId,
      role,
    );

    const studentProfile = await this.academicProfiles
      .findOne({ studentId: plan.studentId })
      .lean();

    const selectedCourseObjs = await this.courses
      .find({ _id: { $in: plan.selectedCourses } })
      .lean();

    const validationResult = this.validation.validate({
      courses: selectedCourseObjs as Course[],
      completedCodes: studentProfile?.completedCourses ?? [],
      failedCodes: studentProfile?.failedCourses ?? [],
      maxCredits: 18,
      semester: (caseItem.semester as Semester) || 'first',
    });

    if (!validationResult.valid) {
      throw new BadRequestException({
        message: 'Plan contains validation errors',
        errors: validationResult.errors,
      });
    }

    plan.status = 'APPROVED';
    await plan.save();

    caseItem.approvedPlanId = plan._id;
    caseItem.status = 'APPROVED';
    caseItem.approvedAt = new Date();
    caseItem.timeline.push({
      status: 'APPROVED',
      changedAt: new Date(),
      actorId: new Types.ObjectId(actorId),
    });
    await caseItem.save();

    await this.audit.record(
      caseItem._id,
      actorId,
      'PLAN_APPROVED',
      'AdvisingPlan',
      plan._id.toString(),
    );
    return { plan, case: caseItem };
  }

  async getGraph(planId: string, actorId: string, role: Role) {
    const plan = await this.plans.findById(planId).lean();
    if (!plan) throw new NotFoundException('Advising plan not found');

    const caseItem = await this.cases.findById(plan.advisingCaseId).lean();
    if (caseItem) {
      this.assertCaseAccess(
        caseItem.assignedAdvisorId?.toString(),
        actorId,
        role,
      );
    }

    let graph = await this.graphs.findOne({ planId: plan._id }).lean();
    if (!graph) {
      const initial = await this.buildInitialGraph(
        plan.selectedCourses.map((id) => id.toString()),
      );
      const created = await this.graphs.create({
        planId: plan._id,
        nodes: initial.nodes,
        edges: initial.edges,
      });
      graph = created.toObject();
    }
    return graph;
  }

  async saveGraph(
    planId: string,
    dto: SaveGraphDto,
    actorId: string,
    role: Role,
  ) {
    const plan = await this.plans.findById(planId).lean();
    if (!plan) throw new NotFoundException('Advising plan not found');

    const caseItem = await this.cases.findById(plan.advisingCaseId).lean();
    if (caseItem) {
      this.assertCaseAccess(
        caseItem.assignedAdvisorId?.toString(),
        actorId,
        role,
      );
    }

    const updated = await this.graphs.findOneAndUpdate(
      { planId: plan._id },
      {
        $set: {
          nodes: dto.nodes as any,
          edges: dto.edges as any,
          viewport: dto.viewport,
          layoutVersion: dto.layoutVersion,
        },
      },
      { new: true, upsert: true },
    );

    await this.audit.record(
      plan.advisingCaseId,
      actorId,
      'GRAPH_SAVED',
      'AdvisingGraph',
      updated._id.toString(),
    );
    return updated;
  }

  private async buildInitialGraph(selectedCourseIds: string[]) {
    const courseObjIds = selectedCourseIds.map((id) => new Types.ObjectId(id));
    const selected = await this.courses
      .find({ _id: { $in: courseObjIds } })
      .lean();

    const selectedCodes = new Set(selected.map((c) => c.code.toUpperCase()));
    const prereqCodes = new Set(
      selected.flatMap((c) => (c.prerequisites ?? []).map((p) => p.toUpperCase())),
    );

    const allCodes = Array.from(new Set([...selectedCodes, ...prereqCodes]));
    const allCourses = await this.courses
      .find({ code: { $in: allCodes } })
      .lean();

    const nodes: AdvisingGraphNode[] = allCourses.map((c, idx) => ({
      id: c._id.toString(),
      type: 'COURSE' as const,
      position: { x: (idx % 4) * 200, y: Math.floor(idx / 4) * 100 },
      courseId: c._id.toString(),
      label: `${c.code} - ${c.name}`,
      status: selectedCodes.has(c.code.toUpperCase()) ? 'planned' : 'prerequisite',
    }));

    const nodeMap = new Map(allCourses.map((c) => [c.code.toUpperCase(), c._id.toString()]));
    const edges: AdvisingGraphEdge[] = [];

    for (const c of allCourses) {
      const targetId = c._id.toString();
      for (const req of c.prerequisites ?? []) {
        const sourceId = nodeMap.get(req.toUpperCase());
        if (sourceId) {
          edges.push({
            id: `e-${sourceId}-${targetId}`,
            type: 'PREREQUISITE' as const,
            source: sourceId,
            target: targetId,
          });
        }
      }
    }

    return { nodes, edges };
  }

  private assertCaseAccess(
    advisorId: string | undefined,
    actorId: string,
    role: Role,
  ) {
    if (role === 'staff' && advisorId !== actorId) {
      throw new ForbiddenException('You do not have access to this case');
    }
  }
}
