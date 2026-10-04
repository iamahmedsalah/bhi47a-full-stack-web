import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { Role } from '@student-portal/shared';
import { AdvisingCase } from '../schemas/advising-case.schema';
import { User } from '../../users/schemas/user.schema';
import { StudentAcademicProfile } from '../../registrations/schemas/student-academic-profile.schema';
import { AdvisingAuditService } from './advising-audit.service';
import type { AdvisingStatus } from '../constants/advising.constants';
import type {
  AssignCaseDto,
  CreateAdvisingCaseDto,
  UpdateCaseStatusDto,
} from '../dto/advising.dto';

@Injectable()
export class AdvisingCaseService {
  constructor(
    @InjectModel(AdvisingCase.name) private readonly cases: Model<AdvisingCase>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(StudentAcademicProfile.name)
    private readonly academicProfiles: Model<StudentAcademicProfile>,
    private readonly audit: AdvisingAuditService,
  ) {}

  async createCase(dto: CreateAdvisingCaseDto, actorId: string) {
    const student = await this.academicProfiles
      .findOne({ studentId: new Types.ObjectId(dto.studentId) })
      .lean();
    if (!student)
      throw new NotFoundException('Student academic profile not found');

    const existing = await this.cases.findOne({
      studentId: new Types.ObjectId(dto.studentId),
      academicYear: dto.academicYear,
      semester: dto.semester,
    });
    if (existing) throw new BadRequestException('Case already exists');

    const item = await this.cases.create({
      studentId: new Types.ObjectId(dto.studentId),
      assignedAdvisorId: dto.assignedAdvisorId
        ? new Types.ObjectId(dto.assignedAdvisorId)
        : student.advisorId,
      academicYear: dto.academicYear,
      semester: dto.semester,
      status: 'NOT_STARTED',
      riskLevel: 'LOW',
      timeline: [
        {
          status: 'NOT_STARTED',
          changedAt: new Date(),
          actorId: new Types.ObjectId(actorId),
        },
      ],
    });

    await this.audit.record(
      item._id,
      actorId,
      'CASE_CREATED',
      'AdvisingCase',
      item._id.toString(),
    );
    return item;
  }

  /**
   * Enforces pagination limits on case retrieval.
   * Hard limits prevent memory exhaustion under concurrent staff access.
   */
  async listCases(
    actorId: string,
    role: Role,
    page: number = 1,
    limit: number = 50,
    status?: string,
  ) {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safePage = Math.max(page, 1);
    const skip = (safePage - 1) * safeLimit;

    const filter: Record<string, any> =
      role === 'staff'
        ? { assignedAdvisorId: new Types.ObjectId(actorId) }
        : {};

    if (status) {
      filter.status = status;
    }

    const [items, total] = await Promise.all([
      this.cases
        .find(filter)
        .read('secondaryPreferred')
        .select(
          'studentId assignedAdvisorId academicYear semester status currentDraftId approvedPlanId generatedAt reviewedAt approvedAt studentAcknowledgedAt updatedAt',
        )
        .populate('studentId', 'name studentCode avatarUrl')
        .populate('assignedAdvisorId', 'name email')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
      this.cases.countDocuments(filter),
    ]);

    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async getCase(id: string, actorId: string, role: Role) {
    const item = await this.cases
      .findById(id)
      .populate('studentId', 'name studentCode avatarUrl')
      .populate('assignedAdvisorId', 'name email')
      .lean();
    if (!item) throw new NotFoundException('Advising case not found');
    this.assertCaseAccess(
      item.assignedAdvisorId?._id?.toString() ??
        item.assignedAdvisorId?.toString(),
      actorId,
      role,
    );
    return item;
  }

  async updateStatus(
    id: string,
    dto: UpdateCaseStatusDto,
    actorId: string,
    role: Role,
  ) {
    const item = await this.cases.findById(id);
    if (!item) throw new NotFoundException('Advising case not found');
    this.assertCaseAccess(item.assignedAdvisorId?.toString(), actorId, role);

    const status = dto.status as AdvisingStatus;
    item.status = status;
    item.timeline.push({
      status,
      changedAt: new Date(),
      actorId: new Types.ObjectId(actorId),
    });
    await item.save();

    await this.audit.record(
      item._id,
      actorId,
      'STATUS_CHANGED',
      'AdvisingCase',
      item._id.toString(),
      { newValue: { status } },
    );
    return item;
  }

  async assign(id: string, dto: AssignCaseDto, actorId: string) {
    const item = await this.cases.findById(id);
    if (!item) throw new NotFoundException('Advising case not found');

    const advisor = await this.users.exists({
      _id: dto.advisorId,
      role: 'staff',
      isActive: true,
    });
    if (!advisor) throw new BadRequestException('Active advisor not found');

    item.assignedAdvisorId = new Types.ObjectId(dto.advisorId);
    item.timeline.push({
      status: item.status,
      changedAt: new Date(),
      actorId: new Types.ObjectId(actorId),
    });
    await item.save();

    await this.academicProfiles.updateOne(
      { studentId: item.studentId },
      { $set: { advisorId: item.assignedAdvisorId } },
    );

    await this.audit.record(
      item._id,
      actorId,
      'ADVISOR_ASSIGNED',
      'AdvisingCase',
      item._id.toString(),
      { newValue: { advisorId: dto.advisorId } },
    );
    return item;
  }

  async requestReview(studentId: string) {
    const sid = new Types.ObjectId(studentId);
    const item = await this.cases
      .findOne({ studentId: sid })
      .sort({ updatedAt: -1 });
    if (!item) throw new NotFoundException('Advising case not found');

    item.status = 'UNDER_REVIEW';
    item.timeline.push({
      status: 'UNDER_REVIEW',
      changedAt: new Date(),
      actorId: sid,
    });
    await item.save();

    await this.audit.record(
      item._id,
      studentId,
      'REVIEW_REQUESTED',
      'AdvisingCase',
      item._id.toString(),
    );
    return item;
  }

  async acknowledge(studentId: string) {
    const sid = new Types.ObjectId(studentId);
    const item = await this.cases
      .findOne({ studentId: sid })
      .sort({ updatedAt: -1 });
    if (!item) throw new NotFoundException('Advising case not found');

    if (item.status !== 'APPROVED') {
      throw new BadRequestException('Case is not approved yet');
    }

    item.status = 'WAITING_FOR_STUDENT';
    item.timeline.push({
      status: 'WAITING_FOR_STUDENT',
      changedAt: new Date(),
      actorId: sid,
    });
    await item.save();

    await this.audit.record(
      item._id,
      studentId,
      'PLAN_ACKNOWLEDGED',
      'AdvisingCase',
      item._id.toString(),
    );
    return item;
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
