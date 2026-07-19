import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { Role, Semester } from '@student-portal/shared';
import { AdvisingCase } from '../schemas/advising-case.schema';
import { CourseRecommendation } from '../schemas/course-recommendation.schema';
import { Course, CourseDocument } from '../../courses/schemas/course.schema';
import { StudentAcademicProfile } from '../../registrations/schemas/student-academic-profile.schema';
import { RulesBasedRecommendationProvider } from '../../registrations/recommendations/rules-based-recommendation.provider';
import { AdvisingAuditService } from './advising-audit.service';
import type {
  DecideRecommendationDto,
  GenerateRecommendationsDto,
} from '../dto/advising.dto';

@Injectable()
export class AdvisingRecommendationService {
  private readonly provider = new RulesBasedRecommendationProvider();

  constructor(
    @InjectModel(AdvisingCase.name) private readonly cases: Model<AdvisingCase>,
    @InjectModel(CourseRecommendation.name)
    private readonly recommendations: Model<CourseRecommendation>,
    @InjectModel(Course.name) private readonly courses: Model<CourseDocument>,
    @InjectModel(StudentAcademicProfile.name)
    private readonly academicProfiles: Model<StudentAcademicProfile>,
    private readonly audit: AdvisingAuditService,
  ) {}

  async generate(
    caseId: string,
    dto: GenerateRecommendationsDto,
    actorId: string,
    role: Role,
  ) {
    const caseItem = await this.cases.findById(caseId);
    if (!caseItem) throw new NotFoundException('Advising case not found');
    this.assertCaseAccess(caseItem.assignedAdvisorId?.toString(), actorId, role);

    const student = await this.academicProfiles
      .findOne({ studentId: caseItem.studentId })
      .lean();
    if (!student)
      throw new NotFoundException('Student academic profile not found');

    const activeCourses = await this.courses.find({ isActive: true });

    const recs = this.provider.generate({
      academicLevel: student.academicLevel,
      semester: (caseItem.semester as Semester) || 'first',
      completedCourses: student.completedCourses,
      failedCourses: student.failedCourses,
      inProgressCourses: [],
      maxCreditHours: dto.maxCredits ?? 18,
      academicWarningCount: student.academicWarnings ?? 0,
      courses: activeCourses,
    });

    await this.recommendations.deleteMany({ advisingCaseId: caseItem._id });
    const docs = await this.recommendations.insertMany(
      recs.map((rec) => ({
        advisingCaseId: caseItem._id,
        studentId: student.studentId,
        courseId: new Types.ObjectId(rec.courseId),
        score: rec.score,
        priority: rec.priority,
        eligible: rec.eligible,
        reasonCodes: rec.reasonCodes,
        explanation: (rec as any).explanation ?? rec.reasonCodes.join('. '),
        warnings: rec.warnings,
        blockedReasons: rec.blockedReasons,
        accepted: false,
        rejected: false,
        generationKey: `gen_${Date.now()}`,
      })),
    );

    await this.audit.record(
      caseItem._id,
      actorId,
      'RECOMMENDATIONS_GENERATED',
      'AdvisingCase',
      caseItem._id.toString(),
      { newValue: { count: docs.length } },
    );
    return docs;
  }

  async listRecommendations(caseId: string, actorId: string, role: Role) {
    const caseItem = await this.cases.findById(caseId).lean();
    if (!caseItem) throw new NotFoundException('Advising case not found');
    this.assertCaseAccess(
      caseItem.assignedAdvisorId?.toString(),
      actorId,
      role,
    );

    return this.recommendations
      .find({ advisingCaseId: new Types.ObjectId(caseId) })
      .populate('courseId', 'name nameAr nameEn code creditHours level semester')
      .sort({ score: -1 })
      .lean();
  }

  async decideRecommendation(
    id: string,
    dto: DecideRecommendationDto,
    actorId: string,
    role: Role,
  ) {
    const rec = await this.recommendations.findById(id);
    if (!rec) throw new NotFoundException('Recommendation not found');

    const caseItem = await this.cases.findById(rec.advisingCaseId);
    if (caseItem) {
      this.assertCaseAccess(
        caseItem.assignedAdvisorId?.toString(),
        actorId,
        role,
      );
    }

    const decision = dto.decision ?? (dto.accepted ? 'ACCEPTED' : 'REJECTED');
    rec.accepted = decision === 'ACCEPTED';
    rec.rejected = decision === 'REJECTED';
    if (dto.rejectionReason) rec.rejectionReason = dto.rejectionReason;
    await rec.save();

    await this.audit.record(
      rec.advisingCaseId,
      actorId,
      'RECOMMENDATION_DECIDED',
      'CourseRecommendation',
      rec._id.toString(),
      { newValue: { decision } },
    );
    return rec;
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
