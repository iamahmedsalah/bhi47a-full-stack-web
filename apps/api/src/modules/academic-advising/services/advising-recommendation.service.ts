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
import { CourseRecommendation } from '../schemas/course-recommendation.schema';
import { Course, CourseDocument } from '../../courses/schemas/course.schema';
import { StudentAcademicProfile } from '../../registrations/schemas/student-academic-profile.schema';
import {
  StudentProfile,
  StudentProfileDocument,
} from '../../students/schemas/student-profile.schema';
import { CourseRegistration } from '../../registrations/schemas/course-registration.schema';
import { Grade } from '../../grades/schemas/grade.schema';
import { RulesBasedRecommendationProvider } from '../../registrations/recommendations/rules-based-recommendation.provider';
import { mergeAcademicCourseProgress } from '../../registrations/utils/academic-course-progress.util';
import { AdvisingAuditService } from './advising-audit.service';
import {
  AdvisingRules,
  AdvisingRulesDocument,
} from '../schemas/advising-rules.schema';
import type { UpdateAdvisingRulesDto } from '../dto/update-advising-rules.dto';
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
    @InjectModel(StudentProfile.name)
    private readonly studentProfiles: Model<StudentProfileDocument>,
    @InjectModel(CourseRegistration.name)
    private readonly registrations: Model<CourseRegistration>,
    @InjectModel(Grade.name) private readonly grades: Model<Grade>,
    @InjectModel(AdvisingRules.name)
    private readonly rulesModel: Model<AdvisingRulesDocument>,
    private readonly audit: AdvisingAuditService,
  ) {}

  async getRules(): Promise<AdvisingRules> {
    const rules = await this.rulesModel.findOne().lean();
    if (rules) return rules as AdvisingRules;
    return {
      maxCoursesLimit: 6,
      preventHigherLevelCourses: true,
      allowLowGradeImprovementFallback: true,
      enforceDepartmentLevel3And4: true,
      probationMaxCredits: 12,
      regularMaxCredits: 18,
      graduatingMaxCredits: 21,
      summerMaxCredits: 9,
      summerProbationMaxCredits: 6,
    };
  }

  async updateRules(
    dto: UpdateAdvisingRulesDto,
    actorId: string,
  ): Promise<AdvisingRules> {
    const existing = await this.rulesModel.findOne();
    if (existing) {
      Object.assign(existing, dto);
      existing.updatedBy = new Types.ObjectId(actorId);
      await existing.save();
      return existing.toObject() as AdvisingRules;
    }
    const created = await this.rulesModel.create({
      ...dto,
      updatedBy: new Types.ObjectId(actorId),
    });
    return created.toObject() as AdvisingRules;
  }

  async generate(
    caseId: string,
    dto: GenerateRecommendationsDto,
    actorId: string,
    role: Role,
  ) {
    const caseItem = await this.cases.findById(caseId);
    if (!caseItem) throw new NotFoundException('Advising case not found');
    this.assertCaseAccess(
      caseItem.assignedAdvisorId?.toString(),
      actorId,
      role,
    );

    const [student, studentProfile] = await Promise.all([
      this.academicProfiles.findOne({ studentId: caseItem.studentId }).lean(),
      this.studentProfiles.findOne({ userId: caseItem.studentId }).lean(),
    ]);
    if (!student)
      throw new NotFoundException('Student academic profile not found');

    await this.assertPreviousSemesterReady(caseItem, student);

    const activeCourses = await this.courses.find({ isActive: true });

    const grades = await this.grades
      .find({ studentId: caseItem.studentId })
      .lean();
    const courseCredits = Object.fromEntries(
      activeCourses.map((course) => [
        course.code.trim().toUpperCase(),
        course.creditHours ?? 0,
      ]),
    );
    const progress = mergeAcademicCourseProgress({
      completedCourses: student.completedCourses,
      failedCourses: student.failedCourses,
      lowGradeCourses: student.lowGradeCourses,
      grades,
      courseCredits,
    });

    const semester = (caseItem.semester as Semester) || 'first';
    const isSummer = semester === 'summer';
    const studentGpa = progress.calculatedGpa ?? student.gpa ?? 0;
    const warningCount = student.academicWarnings ?? 0;
    const isProbation = warningCount >= 2 || studentGpa < 2.0;
    const isGraduating =
      student.academicLevel === '4' ||
      (progress.completedCourses?.length ?? 0) >= 30;

    const rules = await this.getRules();

    const defaultMaxCredits = isSummer
      ? isProbation
        ? (rules.summerProbationMaxCredits ?? 6)
        : (rules.summerMaxCredits ?? 9)
      : isProbation
        ? (rules.probationMaxCredits ?? 12)
        : isGraduating
          ? (rules.graduatingMaxCredits ?? 21)
          : (rules.regularMaxCredits ?? 18);

    const maxCredits = dto.maxCredits ?? defaultMaxCredits;

    const recs = this.provider.generate({
      academicLevel: student.academicLevel,
      semester,
      completedCourses: progress.completedCourses,
      failedCourses: progress.failedCourses,
      lowGradeCourses: progress.lowGradeCourses,
      inProgressCourses: [],
      maxCreditHours: maxCredits,
      maxCourses: rules.maxCoursesLimit ?? 6,
      department: rules.enforceDepartmentLevel3And4
        ? studentProfile?.department
        : undefined,
      allowHigherLevelCourses: !rules.preventHigherLevelCourses,
      academicWarningCount: warningCount,
      courses: activeCourses,
    });

    const recommended = recs.filter((rec) => rec.isRecommendedForSemester);
    const generationKey = `gen_${Date.now()}`;

    await this.recommendations.deleteMany({ advisingCaseId: caseItem._id });
    const docs = await this.recommendations.insertMany(
      recs.map((rec) => ({
        advisingCaseId: caseItem._id,
        studentId: student.studentId,
        courseId: new Types.ObjectId(rec.courseId),
        score: rec.score,
        priority: rec.priority,
        eligible: rec.eligible,
        isRecommendedForSemester: rec.isRecommendedForSemester,
        reasonCodes: rec.reasonCodes,
        explanation: rec.explanation,
        warnings: rec.warnings,
        blockedReasons: rec.blockedReasons,
        accepted: false,
        rejected: false,
        generationKey,
      })),
    );

    await this.audit.record(
      caseItem._id,
      actorId,
      'RECOMMENDATIONS_GENERATED',
      'AdvisingCase',
      caseItem._id.toString(),
      {
        newValue: {
          count: docs.length,
          recommendedCount: recommended.length,
        },
      },
    );
    return {
      recommendations: docs,
      recommendedCount: recommended.length,
      recommendedCreditHours: recommended.reduce(
        (total, rec) => total + rec.creditHours,
        0,
      ),
      maxCreditHours: maxCredits,
    };
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
      .populate(
        'courseId',
        'name nameAr nameEn code creditHours level semester',
      )
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

  private async assertPreviousSemesterReady(
    caseItem: AdvisingCase,
    student: StudentAcademicProfile,
  ) {
    if (caseItem.semester !== 'second') return;

    const firstSemesterRegistration = await this.registrations
      .findOne({
        studentId: caseItem.studentId,
        academicYear: caseItem.academicYear,
        semester: 'first',
        status: { $ne: 'rejected' },
      })
      .lean();

    if (!firstSemesterRegistration?.courses.length) {
      throw new BadRequestException(
        'Cannot generate second-semester recommendations until the student has a first-semester registration for this academic year.',
      );
    }

    const publishedFinalCourseCodes = await this.grades.distinct('courseCode', {
      studentId: caseItem.studentId,
      academicYear: caseItem.academicYear,
      semester: 'first',
      examType: 'final',
      isPublished: true,
    });
    const finalized = new Set(
      [
        ...student.completedCourses,
        ...student.failedCourses,
        ...publishedFinalCourseCodes,
      ].map((code) => code.trim().toUpperCase()),
    );
    const missingResults = firstSemesterRegistration.courses.filter(
      (code) => !finalized.has(code.trim().toUpperCase()),
    );

    if (missingResults.length > 0) {
      throw new BadRequestException(
        `Cannot generate second-semester recommendations until first-semester final grades are published and added to the student profile. Missing results: ${missingResults.join(', ')}.`,
      );
    }
  }
}
