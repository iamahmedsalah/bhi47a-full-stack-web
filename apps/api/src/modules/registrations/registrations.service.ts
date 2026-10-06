import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Course, CourseDocument } from '../courses/schemas/course.schema';
import { AdvisingPlan } from '../academic-advising/schemas/advising-plan.schema';
import { AdvisingCase } from '../academic-advising/schemas/advising-case.schema';
import { Grade, GradeDocument } from '../grades/schemas/grade.schema';
import { StudentsService } from '../students/students.service';
import { UsersService } from '../users/users.service';
import {
  AcademicAdvisingRequest,
  AcademicAdvisingRequestDocument,
  AdvisingReason,
} from './schemas/academic-advising-request.schema';
import {
  CourseRegistration,
  CourseRegistrationDocument,
} from './schemas/course-registration.schema';
import {
  GpaRegistrationRule,
  GpaRegistrationRuleDocument,
} from './schemas/gpa-registration-rule.schema';
import {
  StudentAcademicProfile,
  StudentAcademicProfileDocument,
} from './schemas/student-academic-profile.schema';
import {
  StudentProfile,
  StudentProfileDocument,
} from '../students/schemas/student-profile.schema';
import {
  AdminProxyRegistrationDto,
  AutoRegisterFirstYearDto,
  CreateAcademicYearDto,
  CreateGpaRegistrationRuleDto,
  QueryAdvisingRequestDto,
  QueryRegistrationDto,
  ReviewAdvisingRequestDto,
  SubmitRegistrationDto,
  UpdateGpaRegistrationRuleDto,
  UpsertStudentAcademicProfileDto,
  UpsertRegistrationTermDto,
} from './dto/registration.dto';
import {
  buildEligibleCourseList,
  hasPassedPrerequisites,
  normalizeCourseCodes,
  recommendCourses,
} from './utils/course-recommendation.util';
import { isCourseOfferedForTerm } from './utils/term-availability.util';
import { isRegistrationTermCurrentlyOpen } from './utils/registration-term.util';
import { isNewStudentWithoutAcademicHistory } from './utils/academic-standing.util';
import { getRegistrationSelectionLimits } from './utils/registration-selection.util';
import { isConsecutiveAcademicYear } from './utils/academic-year.util';
import { mergeAcademicCourseProgress } from './utils/academic-course-progress.util';
import { evaluateConfiguredAdvisingTriggers } from './utils/advising-requirement.util';
import {
  RegistrationTerm,
  RegistrationTermDocument,
} from './schemas/registration-term.schema';
import {
  buildPaginationOptions,
  createPaginatedResult,
} from '../../common/utils/pagination.util';

function normalizeSemester(val?: string): string {
  if (!val) return 'first';
  const clean = String(val).trim().toLowerCase();
  if (
    clean === '1' ||
    clean === 'first' ||
    clean === 'أول' ||
    clean === 'الاول' ||
    clean === 'الأول' ||
    clean === 'الفصل الأول'
  )
    return 'first';
  if (
    clean === '2' ||
    clean === 'second' ||
    clean === 'ثاني' ||
    clean === 'الثاني' ||
    clean === 'الفصل الثاني'
  )
    return 'second';
  if (
    clean === '3' ||
    clean === 'summer' ||
    clean === 'صيفي' ||
    clean === 'الصيفي' ||
    clean === 'الفصل الصيفي'
  )
    return 'summer';
  return clean;
}

interface EffectiveRule {
  minGpa: number;
  maxGpa: number;
  minCreditHours: number;
  maxCreditHours: number;
  minCourses: number;
  maxCourses: number;
  requiresAdvisor: boolean;
  requireForFailedCourses: boolean;
  requireForAcademicWarnings: boolean;
  academicWarningThreshold: number;
  requireForIncompleteCourses: boolean;
  requireForGraduationPlans: boolean;
  requireForSummerRegistration: boolean;
  exemptNewStudentsFromGpaRule: boolean;
}

interface SelectionOverrides {
  overridePrerequisites?: boolean;
  overrideMaxCreditHours?: boolean;
  approveIncompleteCompletion?: boolean;
  summerCourseLimit?: number;
}

interface CourseGradeSummary {
  totalGrade: number;
  totalMaxGrade: number;
  percentage: number;
  hasFinal: boolean;
  statuses: string[];
  exams: Array<{
    examType: string;
    grade: number;
    maxGrade: number;
    status: string;
  }>;
}

export interface AdvisingCourseMapResponse {
  student: {
    name?: string;
    studentCode?: string;
    gpa: number;
    academicLevel: string;
    semester: string;
  };
  selectedCourses: string[];
  suggestedCourses: string[];
  courses: Array<{
    _id: string;
    code: string;
    name: string;
    nameAr?: string;
    nameEn?: string;
    academicLevel?: string;
    level?: string;
    semester?: string;
    department?: string;
    creditHours?: number;
    prerequisites: string[];
    type?: string;
    progressStatus:
      | 'passed'
      | 'failed'
      | 'low_grade'
      | 'planned'
      | 'recommended'
      | 'not_taken';
    gradeSummary?: CourseGradeSummary;
  }>;
}

@Injectable()
export class RegistrationsService {
  constructor(
    @InjectModel(StudentAcademicProfile.name)
    private academicProfileModel: Model<StudentAcademicProfileDocument>,
    @InjectModel(GpaRegistrationRule.name)
    private gpaRuleModel: Model<GpaRegistrationRuleDocument>,
    @InjectModel(AcademicAdvisingRequest.name)
    private advisingRequestModel: Model<AcademicAdvisingRequestDocument>,
    @InjectModel(CourseRegistration.name)
    private registrationModel: Model<CourseRegistrationDocument>,
    @InjectModel(Course.name)
    private courseModel: Model<CourseDocument>,
    @InjectModel(Grade.name)
    private gradeModel: Model<GradeDocument>,
    @InjectModel(AdvisingPlan.name)
    private advisingPlanModel: Model<AdvisingPlan>,
    @InjectModel(AdvisingCase.name)
    private advisingCaseModel: Model<AdvisingCase>,
    @InjectModel(RegistrationTerm.name)
    private registrationTermModel: Model<RegistrationTermDocument>,
    @InjectModel(StudentProfile.name)
    private studentProfileModel: Model<StudentProfileDocument>,
    private studentsService: StudentsService,
    private usersService: UsersService,
  ) {}

  async upsertAcademicProfile(dto: UpsertStudentAcademicProfileDto) {
    const update = {
      ...dto,
      completedCourses: normalizeCourseCodes(dto.completedCourses),
      failedCourses: normalizeCourseCodes(dto.failedCourses),
      lowGradeCourses: normalizeCourseCodes(dto.lowGradeCourses),
      approvedICCourseCompletions: normalizeCourseCodes(
        dto.approvedICCourseCompletions,
      ),
      studentId: new Types.ObjectId(dto.studentId),
      advisorId: dto.advisorId ? new Types.ObjectId(dto.advisorId) : undefined,
    };

    return this.academicProfileModel.findOneAndUpdate(
      { studentId: update.studentId },
      { $set: update },
      { new: true, upsert: true },
    );
  }

  async listAcademicProfiles() {
    return this.academicProfileModel
      .find()
      .populate('studentId', 'name studentCode nationalIdMasked')
      .populate('advisorId', 'name email')
      .sort({ updatedAt: -1 })
      .lean();
  }

  async createGpaRule(dto: CreateGpaRegistrationRuleDto) {
    this.assertValidRuleRange(dto.minGpa, dto.maxGpa);
    this.assertValidRegistrationLimits(
      dto.minCreditHours ?? 10,
      dto.maxCreditHours,
      dto.minCourses ?? 4,
      dto.maxCourses ?? 6,
    );
    return new this.gpaRuleModel(dto).save();
  }

  async listGpaRules() {
    return this.gpaRuleModel.find().sort({ minGpa: 1 }).lean();
  }

  async updateGpaRule(id: string, dto: UpdateGpaRegistrationRuleDto) {
    const existing = await this.gpaRuleModel.findById(id);
    if (!existing) throw new NotFoundException('GPA rule not found');

    const minGpa = dto.minGpa ?? existing.minGpa;
    const maxGpa = dto.maxGpa ?? existing.maxGpa;
    this.assertValidRuleRange(minGpa, maxGpa);
    this.assertValidRegistrationLimits(
      dto.minCreditHours ?? existing.minCreditHours ?? 10,
      dto.maxCreditHours ?? existing.maxCreditHours,
      dto.minCourses ?? existing.minCourses ?? 4,
      dto.maxCourses ?? existing.maxCourses ?? 6,
    );

    return this.gpaRuleModel.findByIdAndUpdate(
      id,
      { $set: dto },
      { new: true },
    );
  }

  async deleteGpaRule(id: string) {
    await this.gpaRuleModel.findByIdAndDelete(id);
    return { message: 'GPA rule deleted successfully' };
  }

  async getEligibility(studentId: string) {
    const storedProfile = await this.getAcademicProfile(studentId);
    const registrationPeriod = await this.resolveRegistrationPeriod(
      studentId,
      storedProfile.semester,
    );
    const profile = {
      ...storedProfile,
      semester: registrationPeriod.semester,
    } as StudentAcademicProfileDocument;
    const rule = await this.getRuleForGpa(profile.gpa);
    const policy = await this.getSummerPolicy(profile, rule);
    const academicYear = registrationPeriod.academicYear;
    const registrationTerm = await this.getRegistrationTermStatus(
      academicYear,
      profile.semester,
    );

    const registration = await this.registrationModel.findOne({
      studentId: profile.studentId,
      academicYear,
      semester: profile.semester,
    });

    const requiresAdvisor = policy.requiresAdvisor;
    const reason = policy.reason;
    const warnings = [...policy.warnings];
    const selectionLimits = getRegistrationSelectionLimits(
      profile.semester,
      policy.maxCourses,
    );

    const response = {
      canRegisterDirectly:
        !requiresAdvisor && !registration && registrationTerm.isCurrentlyOpen,
      ...selectionLimits,
      requiresAdvisor,
      policyWarnings: warnings,
      gpa: profile.gpa,
      academicLevel: profile.academicLevel,
      semester: profile.semester,
      failedCourses: profile.failedCourses,
      advisingRequest: null as any,
      registrationTerm,
    };

    if (requiresAdvisor) {
      response.advisingRequest = await this.ensureAdvisingRequest(
        profile,
        reason,
        warnings,
      );
    }

    return response;
  }

  async getAvailableCourses(studentId: string) {
    const storedProfile = await this.getAcademicProfile(studentId);
    const registrationPeriod = await this.resolveRegistrationPeriod(
      studentId,
      storedProfile.semester,
    );
    const profile = {
      ...storedProfile,
      semester: registrationPeriod.semester,
    } as StudentAcademicProfileDocument;
    const rule = await this.getRuleForGpa(profile.gpa);
    const policy = await this.getSummerPolicy(profile, rule);
    const academicYear = registrationPeriod.academicYear;
    await this.assertRegistrationTermOpen(academicYear, profile.semester);

    const requiresAdvisor = policy.requiresAdvisor;
    const reason = policy.reason;
    const warnings = [...policy.warnings];
    const selectionLimits = getRegistrationSelectionLimits(
      profile.semester,
      policy.maxCourses,
    );

    if (requiresAdvisor) {
      await this.ensureAdvisingRequest(profile, reason, warnings);
      throw new ForbiddenException(
        'Direct registration is blocked. Academic advising is required.',
      );
    }

    const courses = (await this.courseModel
      .find({ isActive: true })
      .lean()) as unknown as CourseDocument[];
    const eligibleCourses = buildEligibleCourseList({
      courses,
      completedCourses: profile.completedCourses,
      failedCourses: profile.failedCourses,
      academicLevel: profile.academicLevel,
      semester: profile.semester,
    });

    return {
      ...selectionLimits,
      courses: eligibleCourses,
    };
  }

  async submitDirectRegistration(
    studentId: string,
    dto: SubmitRegistrationDto,
  ) {
    const storedProfile = await this.getAcademicProfile(studentId);
    const registrationPeriod = await this.resolveRegistrationPeriod(
      studentId,
      storedProfile.semester,
    );
    const profile = {
      ...storedProfile,
      semester: registrationPeriod.semester,
    } as StudentAcademicProfileDocument;
    const rule = await this.getRuleForGpa(profile.gpa);
    const policy = await this.getSummerPolicy(profile, rule);
    const academicYear = registrationPeriod.academicYear;
    await this.assertRegistrationTermOpen(academicYear, profile.semester);

    const existingReg = await this.registrationModel.findOne({
      studentId: profile.studentId,
      academicYear,
      semester: profile.semester,
    });

    if (existingReg) {
      throw new ConflictException(
        'Registration has already been submitted for this academic term and cannot be edited',
      );
    }

    const requiresAdvisor = policy.requiresAdvisor;
    const reason = policy.reason;
    const warnings = [...policy.warnings];

    if (requiresAdvisor) {
      await this.ensureAdvisingRequest(profile, reason, warnings);
      throw new ForbiddenException(
        'Direct registration is blocked. Academic advising is required.',
      );
    }

    const validation = await this.validateCourseSelection(
      profile,
      dto.courseCodes,
      rule,
      true,
      { summerCourseLimit: policy.maxCourses },
    );

    const registration = await new this.registrationModel({
      studentId: profile.studentId,
      courses: validation.courseCodes,
      totalCreditHours: validation.totalCreditHours,
      source: 'student',
      status: 'approved',
      academicYear,
      semester: profile.semester,
      editCount: 0,
    }).save();

    registration.printableFormUrl = `/api/registrations/${registration._id.toString()}/print`;
    return registration.save();
  }

  async requestIncompleteRegistrationAdvising(studentId: string) {
    const storedProfile = await this.getAcademicProfile(studentId);
    const registrationPeriod = await this.resolveRegistrationPeriod(
      studentId,
      storedProfile.semester,
    );
    const academicYear = registrationPeriod.academicYear;
    const profile = {
      ...storedProfile,
      semester: registrationPeriod.semester,
    } as StudentAcademicProfileDocument;
    const existingRegistration = await this.registrationModel.exists({
      studentId: profile.studentId,
      academicYear,
      semester: profile.semester,
    });
    if (existingRegistration) {
      throw new ConflictException(
        'Registration has already been submitted for this academic term',
      );
    }
    return this.advisingCaseModel.findOneAndUpdate(
      {
        studentId: profile.studentId,
        academicYear,
        semester: profile.semester,
      },
      {
        $set: {
          status: 'UNDER_REVIEW',
          ...(profile.advisorId
            ? { assignedAdvisorId: profile.advisorId }
            : {}),
        },
        $setOnInsert: {
          studentId: profile.studentId,
          academicYear,
          semester: profile.semester,
        },
        $push: {
          timeline: {
            status: 'UNDER_REVIEW',
            changedAt: new Date(),
            actorId: profile.studentId,
          },
        },
      },
      { new: true, upsert: true },
    );
  }

  async adminEditRegistration(
    id: string,
    dto: SubmitRegistrationDto,
    actorId: string,
  ) {
    const registration = await this.registrationModel.findById(id);
    if (!registration) throw new NotFoundException('Registration not found');

    const profile = await this.getAcademicProfile(
      registration.studentId.toString(),
    );
    const rule = await this.getRuleForGpa(profile.gpa);

    const validation = await this.validateCourseSelection(
      profile,
      dto.courseCodes,
      rule,
      false,
      {
        overridePrerequisites: true,
        overrideMaxCreditHours: true,
      },
    );

    registration.courses = validation.courseCodes;
    registration.totalCreditHours = validation.totalCreditHours;
    registration.lastEditedBy = new Types.ObjectId(actorId);
    registration.lastEditedAt = new Date();
    await registration.save();

    return registration;
  }

  async getMyAdvisingStatus(studentId: string) {
    const activeProfile = await this.getAcademicProfile(studentId);
    const registrationPeriod = await this.resolveRegistrationPeriod(
      studentId,
      activeProfile.semester,
    );
    const sid = new Types.ObjectId(studentId);

    const request = await this.advisingRequestModel
      .findOne({
        studentId: sid,
      })
      .sort({ createdAt: -1 })
      .populate('assignedStaffId', 'name email')
      .lean();

    const registration = await this.registrationModel
      .findOne({
        studentId: sid,
        academicYear: registrationPeriod.academicYear,
        semester: registrationPeriod.semester,
      })
      .sort({ createdAt: -1 })
      .populate('approvedBy', 'name email')
      .lean();

    const advisingCase = await this.advisingCaseModel
      .findOne({
        studentId: sid,
        academicYear: registrationPeriod.academicYear,
        semester: registrationPeriod.semester,
      })
      .sort({ updatedAt: -1 })
      .populate('assignedAdvisorId', 'name email')
      .lean();

    const approvedPlan = advisingCase?.approvedPlanId
      ? await this.advisingPlanModel
          .findById(advisingCase.approvedPlanId)
          .populate(
            'selectedCourses',
            'code nameAr nameEn creditHours semester offeredTerms',
          )
          .lean()
      : null;

    return { request, registration, advisingCase, approvedPlan };
  }

  async submitApprovedAdvisingPlan(studentId: string) {
    const storedProfile = await this.getAcademicProfile(studentId);
    const registrationPeriod = await this.resolveRegistrationPeriod(
      studentId,
      storedProfile.semester,
    );
    const profile = {
      ...storedProfile,
      semester: registrationPeriod.semester,
    } as StudentAcademicProfileDocument;
    const sid = new Types.ObjectId(studentId);

    // 1. Check visual AdvisingCase workflow
    const advisingCase = await this.advisingCaseModel
      .findOne({
        studentId: sid,
        academicYear: registrationPeriod.academicYear,
        semester: registrationPeriod.semester,
        status: { $in: ['APPROVED', 'REGISTERED', 'WAITING_FOR_STUDENT'] },
        approvedPlanId: { $exists: true },
      })
      .sort({ approvedAt: -1, updatedAt: -1 });

    // 2. Check legacy / Registration Office table approval workflow
    const advisingRequest = await this.advisingRequestModel
      .findOne({
        studentId: sid,
        status: 'approved',
        staffApprovedCourses: { $exists: true, $not: { $size: 0 } },
      })
      .sort({ reviewedAt: -1, updatedAt: -1 });

    if (!advisingCase?.approvedPlanId && !advisingRequest) {
      throw new ForbiddenException(
        'An approved academic advising plan is required',
      );
    }

    let courseCodes: string[] = [];
    let academicPlanId: Types.ObjectId | undefined;
    let approvedBy: Types.ObjectId | undefined;
    let advisorNotes: string | undefined;

    if (advisingCase?.approvedPlanId) {
      const plan = await this.advisingPlanModel.findOne({
        _id: advisingCase.approvedPlanId,
      });
      if (plan) {
        academicPlanId = plan._id;
        approvedBy = plan.advisorId;
        advisorNotes = plan.studentVisibleNotes ?? plan.advisorNotes;
        const selectedCourses = await this.courseModel
          .find({ _id: { $in: plan.selectedCourses }, isActive: true })
          .lean();
        courseCodes = selectedCourses.map((c) => c.code);
      }
    }

    if (courseCodes.length === 0 && advisingRequest) {
      courseCodes = advisingRequest.staffApprovedCourses;
      approvedBy =
        advisingRequest.reviewedBy ?? advisingRequest.assignedStaffId;
      advisorNotes = advisingRequest.staffNotes;
    }

    if (courseCodes.length === 0) {
      throw new BadRequestException(
        'The approved advising plan has no courses',
      );
    }

    const rule = await this.getRuleForGpa(profile.gpa);
    const policy = await this.getSummerPolicy(profile, rule);
    const academicYear = registrationPeriod.academicYear;

    const validation = await this.validateCourseSelection(
      profile,
      courseCodes,
      rule,
      false,
      {
        overridePrerequisites: true,
        overrideMaxCreditHours: true,
        summerCourseLimit: policy.maxCourses,
      },
    );

    const existing = await this.registrationModel.findOne({
      studentId: profile.studentId,
      academicYear,
      semester: profile.semester,
    });

    if (existing) {
      existing.courses = validation.courseCodes;
      existing.totalCreditHours = validation.totalCreditHours;
      existing.source = 'advisor';
      existing.status = 'approved';
      if (academicPlanId) existing.academicPlanId = academicPlanId;
      if (approvedBy) existing.approvedBy = approvedBy;
      if (advisorNotes) existing.advisorNotes = advisorNotes;
      existing.printableFormUrl = `/api/registrations/${existing._id.toString()}/print`;
      await existing.save();

      if (advisingCase) {
        await this.advisingCaseModel.findByIdAndUpdate(advisingCase._id, {
          status: 'REGISTERED',
        });
      }
      return existing;
    }

    const registration = await this.registrationModel.create({
      studentId: profile.studentId,
      academicPlanId,
      academicYear,
      semester: profile.semester,
      courses: validation.courseCodes,
      totalCreditHours: validation.totalCreditHours,
      source: 'advisor',
      status: 'approved',
      advisorNotes,
      approvedBy,
      approvedAt: new Date(),
    });

    registration.printableFormUrl = `/api/registrations/${registration._id.toString()}/print`;
    await registration.save();

    if (advisingCase) {
      await this.advisingCaseModel.findByIdAndUpdate(advisingCase._id, {
        status: 'REGISTERED',
      });
    }

    return registration;
  }

  async listAssignedAdvisingRequests(
    staffId: string,
    query: QueryAdvisingRequestDto,
  ) {
    return this.listAdvisingRequests(query, staffId);
  }

  async listAllAdvisingRequests(query: QueryAdvisingRequestDto) {
    return this.listAdvisingRequests(query);
  }

  async reviewAdvisingRequest(
    requestId: string,
    reviewerId: string,
    reviewerRole: string,
    dto: ReviewAdvisingRequestDto,
  ) {
    const request = await this.advisingRequestModel.findById(requestId);
    if (!request) throw new NotFoundException('Advising request not found');

    if (request.status === 'approved' || request.status === 'rejected') {
      throw new BadRequestException('This advising request is already closed');
    }

    if (
      reviewerRole === 'staff' &&
      request.assignedStaffId?.toString() !== reviewerId
    ) {
      throw new ForbiddenException(
        'This advising request is not assigned to you',
      );
    }

    const profile = await this.getAcademicProfile(request.studentId.toString());
    const rule = await this.getRuleForGpa(profile.gpa);
    const validation = await this.validateCourseSelection(
      profile,
      dto.staffApprovedCourses,
      rule,
      false,
      dto,
    );

    request.staffApprovedCourses = validation.courseCodes;
    request.staffNotes = dto.staffNotes;
    request.overridePrerequisites = dto.overridePrerequisites ?? false;
    request.overrideMaxCreditHours = dto.overrideMaxCreditHours ?? false;
    request.approveIncompleteCompletion =
      dto.approveIncompleteCompletion ?? false;
    request.summerCourseLimit = dto.summerCourseLimit;
    request.reviewedBy = new Types.ObjectId(reviewerId);
    request.reviewedAt = new Date();
    request.status = dto.status;
    await request.save();

    if (dto.status === 'approved') {
      const academicYear = await this.resolveAcademicYear(
        request.studentId.toString(),
        profile.semester,
      );
      const existingRegistration = await this.registrationModel.exists({
        studentId: profile.studentId,
        academicYear,
        semester: profile.semester,
      });
      if (existingRegistration) {
        throw new ConflictException(
          'A final registration already exists for this academic term',
        );
      }
      const registration = await new this.registrationModel({
        studentId: profile.studentId,
        courses: validation.courseCodes,
        totalCreditHours: validation.totalCreditHours,
        source: 'advisor',
        status: 'approved',
        advisorNotes: dto.staffNotes,
        approvedBy: new Types.ObjectId(reviewerId),
        approvedAt: new Date(),
        academicYear,
        semester: profile.semester,
      }).save();
      registration.printableFormUrl = `/api/registrations/${registration._id.toString()}/print`;
      await registration.save();
    }

    return request;
  }

  async getAdvisingCourseMap(
    requestId: string,
    reviewerId: string,
    reviewerRole: string,
  ): Promise<AdvisingCourseMapResponse> {
    const request = await this.advisingRequestModel.findById(requestId).lean();
    if (!request) throw new NotFoundException('Advising request not found');

    if (
      reviewerRole === 'staff' &&
      request.assignedStaffId?.toString() !== reviewerId
    ) {
      throw new ForbiddenException(
        'This advising request is not assigned to you',
      );
    }

    const [profile, courses, grades, student, registration] = await Promise.all(
      [
        this.getAcademicProfile(request.studentId.toString()),
        this.courseModel.find({ isActive: true }).sort({ code: 1 }).lean(),
        this.gradeModel
          .find({ studentId: request.studentId, isPublished: true })
          .sort({ courseCode: 1, examType: 1 })
          .lean(),
        this.resolveStudentPrintProfile(request.studentId.toString()),
        this.registrationModel
          .findOne({ studentId: request.studentId })
          .sort({ createdAt: -1 })
          .lean(),
      ],
    );

    const gradeSummaryByCourse = this.summarizeGradesByCourse(grades);
    const completed = new Set(normalizeCourseCodes(profile.completedCourses));
    const failed = new Set(normalizeCourseCodes(profile.failedCourses));
    const lowGrade = new Set(normalizeCourseCodes(profile.lowGradeCourses));
    const selected = new Set(
      normalizeCourseCodes([
        ...(request.staffApprovedCourses.length
          ? request.staffApprovedCourses
          : request.autoSuggestedCourses),
        ...(registration?.courses ?? []),
      ]),
    );
    const suggested = new Set(
      normalizeCourseCodes(request.autoSuggestedCourses),
    );

    return {
      student: {
        name: student.fullName,
        studentCode: student.studentCode,
        gpa: profile.gpa,
        academicLevel: profile.academicLevel,
        semester: profile.semester,
      },
      selectedCourses: [...selected],
      suggestedCourses: [...suggested],
      courses: courses.map((course) => {
        const code = course.code.toUpperCase();
        const gradeSummary = gradeSummaryByCourse.get(code);
        const gradePassed = gradeSummary
          ? gradeSummary.percentage >= 50 && gradeSummary.hasFinal
          : false;
        const gradeFailed = gradeSummary
          ? gradeSummary.hasFinal && gradeSummary.percentage < 50
          : false;
        const progressStatus =
          completed.has(code) || gradePassed
            ? 'passed'
            : failed.has(code) || gradeFailed
              ? 'failed'
              : lowGrade.has(code)
                ? 'low_grade'
                : selected.has(code)
                  ? 'planned'
                  : suggested.has(code)
                    ? 'recommended'
                    : 'not_taken';

        return {
          _id: course._id.toString(),
          code: course.code,
          name: course.name,
          nameAr: course.nameAr,
          nameEn: course.nameEn,
          academicLevel: course.academicLevel,
          level: course.level,
          semester: course.semester,
          department: course.department,
          creditHours: course.creditHours,
          prerequisites: course.prerequisites ?? [],
          type: course.type,
          progressStatus,
          gradeSummary: gradeSummary ?? undefined,
        };
      }),
    };
  }

  async listRegistrations(query: QueryRegistrationDto) {
    const { page, limit, skip } = buildPaginationOptions(query);
    const filter: FilterQuery<CourseRegistrationDocument> = {};
    if (query.status) filter.status = query.status;
    if (query.studentId) filter.studentId = new Types.ObjectId(query.studentId);
    if (query.semester) filter.semester = query.semester;
    if (query.academicYear) filter.academicYear = query.academicYear;
    if (query.source) filter.source = query.source;
    if (query.search) {
      const userIds = await this.studentsService.findUserIdsBySearch(
        query.search,
      );
      filter.studentId = { $in: userIds };
    }

    const [items, total] = await Promise.all([
      this.registrationModel
        .find(filter)
        .populate('studentId', 'name studentCode nationalId')
        .populate('approvedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.registrationModel.countDocuments(filter),
    ]);

    return createPaginatedResult(items, total, page, limit);
  }

  /** Admin/Staff proxy registration: register courses on behalf of a student. */
  async adminProxyRegistration(
    dto: AdminProxyRegistrationDto,
    actorId: string,
  ) {
    const profile = await this.getAcademicProfile(dto.studentId);
    const rule = await this.getRuleForGpa(profile.gpa);
    const academicYear = await this.resolveAcademicYear(
      dto.studentId,
      profile.semester,
    );
    await this.assertRegistrationTermOpen(academicYear, profile.semester);

    const validation = await this.validateCourseSelection(
      profile,
      dto.courseCodes,
      rule,
      false,
      {
        overridePrerequisites: true,
        overrideMaxCreditHours: true,
      },
    );

    const existing = await this.registrationModel.findOne({
      studentId: profile.studentId,
      academicYear,
      semester: profile.semester,
    });

    if (existing) {
      existing.courses = validation.courseCodes;
      existing.totalCreditHours = validation.totalCreditHours;
      existing.lastEditedBy = new Types.ObjectId(actorId);
      existing.lastEditedAt = new Date();
      existing.source = 'advisor';
      existing.status = 'approved';
      existing.approvedBy = new Types.ObjectId(actorId);
      existing.approvedAt = new Date();
      await existing.save();
      return existing;
    }

    const registration = await new this.registrationModel({
      studentId: profile.studentId,
      courses: validation.courseCodes,
      totalCreditHours: validation.totalCreditHours,
      source: 'advisor',
      status: 'approved',
      academicYear,
      semester: profile.semester,
      editCount: 0,
      approvedBy: new Types.ObjectId(actorId),
      approvedAt: new Date(),
    }).save();
    registration.printableFormUrl = `/api/registrations/${registration._id.toString()}/print`;
    await registration.save();
    return registration;
  }

  /**
   * Automated First-Year Course Registration:
   * Automatically enrolls Level 1 ("الفرقة الأولى") students into all required Level 1 semester courses.
   */
  async autoRegisterFirstYearStudents(
    dto?: AutoRegisterFirstYearDto,
    actorId?: string,
  ) {
    const defaultAcademicYear = '2026-2027';

    // 1. Build student filter for Level 1 active students
    const filter: FilterQuery<StudentProfileDocument> = {
      enrollmentStatus: 'active',
      $or: [
        { level: '1' },
        { level: { $regex: /^(1|الفرقة\s*الأولى|first|level\s*1)/i } },
      ],
    };

    if (dto?.studentCodes && dto.studentCodes.length > 0) {
      const cleanCodes = dto.studentCodes.map((c) => String(c).trim());
      filter.studentCode = { $in: cleanCodes };
    }

    if (dto?.department) {
      filter.department = String(dto.department).trim();
    }

    const students = await this.studentProfileModel.find(filter).lean();
    if (students.length === 0) {
      return {
        totalEligible: 0,
        registeredCount: 0,
        skippedCount: 0,
        message: 'لا يوجد طلاب مؤهلين للتسجيل التلقائي في الفرقة الأولى',
        results: [],
      };
    }

    // 2. Fetch all active level 1 courses
    const allCourses = await this.courseModel
      .find({
        isActive: { $ne: false },
        $or: [{ level: '1' }, { academicLevel: '1' }],
      })
      .lean();

    let registeredCount = 0;
    let skippedCount = 0;
    const results: Array<{
      studentCode: string;
      studentName: string;
      coursesCount: number;
      courseCodes: string[];
      status: 'registered' | 'updated' | 'skipped' | 'no_courses';
      notes?: string;
    }> = [];

    for (const student of students) {
      const studentCode = student.studentCode;
      const studentName = student.fullName || student.fullNameAr || 'طالب';
      const targetYear =
        dto?.academicYear || student.academicYear || defaultAcademicYear;
      const targetSemester = (dto?.semester ||
        normalizeSemester(student.semester) ||
        'first') as 'first' | 'second' | 'summer';

      // Match courses suitable for this student
      const eligibleCourses = allCourses.filter((c) => {
        const cSemester = normalizeSemester(c.semester);
        const offeredTerms = (c.offeredTerms || []).map((t) =>
          normalizeSemester(t),
        );
        const semesterMatches =
          cSemester === targetSemester || offeredTerms.includes(targetSemester);
        if (!semesterMatches) return false;

        // Skip electives for automated first year registration
        if (c.type === 'elective') return false;

        // Department matching
        if (
          c.department &&
          c.department.trim() &&
          student.department &&
          student.department.trim()
        ) {
          const cDept = c.department.trim().toLowerCase();
          const sDept = student.department.trim().toLowerCase();
          const isGeneral =
            cDept === 'عام' ||
            cDept === 'general' ||
            cDept === 'all' ||
            cDept === 'الكل';
          if (!isGeneral && !cDept.includes(sDept) && !sDept.includes(cDept)) {
            return false;
          }
        }

        return true;
      });

      if (eligibleCourses.length === 0) {
        skippedCount++;
        results.push({
          studentCode,
          studentName,
          coursesCount: 0,
          courseCodes: [],
          status: 'no_courses',
          notes: `لا توجد مقررات للفرقة الأولى في الفصل ${targetSemester}`,
        });
        continue;
      }

      const courseCodes = eligibleCourses.map((c) => c.code);
      const totalCreditHours = eligibleCourses.reduce(
        (sum, c) => sum + (c.creditHours || 3),
        0,
      );

      // Check existing registration
      const existing = await this.registrationModel.findOne({
        studentId: student.userId,
        academicYear: targetYear,
        semester: targetSemester,
      });

      if (existing && existing.status === 'approved' && !dto?.forceOverwrite) {
        skippedCount++;
        results.push({
          studentCode,
          studentName,
          coursesCount: existing.courses.length,
          courseCodes: existing.courses,
          status: 'skipped',
          notes: 'مسجل بالفعل ومؤكد',
        });
        continue;
      }

      const actorObjectId =
        actorId && Types.ObjectId.isValid(actorId)
          ? new Types.ObjectId(actorId)
          : undefined;

      if (existing) {
        existing.courses = courseCodes;
        existing.totalCreditHours = totalCreditHours;
        existing.source = 'system';
        existing.status = 'approved';
        existing.approvedAt = new Date();
        existing.approvedBy = actorObjectId;
        existing.advisorNotes =
          'تسجيل تلقائي لطلاب الفرقة الأولى (Automated First-Year Registration)';
        existing.printableFormUrl = `/api/registrations/${existing._id.toString()}/print`;
        await existing.save();

        registeredCount++;
        results.push({
          studentCode,
          studentName,
          coursesCount: courseCodes.length,
          courseCodes,
          status: 'updated',
        });
      } else {
        const newReg = new this.registrationModel({
          studentId: student.userId,
          courses: courseCodes,
          totalCreditHours,
          source: 'system',
          status: 'approved',
          academicYear: targetYear,
          semester: targetSemester,
          approvedAt: new Date(),
          approvedBy: actorObjectId,
          advisorNotes:
            'تسجيل تلقائي لطلاب الفرقة الأولى (Automated First-Year Registration)',
          editCount: 0,
        });
        newReg.printableFormUrl = `/api/registrations/${newReg._id.toString()}/print`;
        await newReg.save();

        registeredCount++;
        results.push({
          studentCode,
          studentName,
          coursesCount: courseCodes.length,
          courseCodes,
          status: 'registered',
        });
      }

      // Ensure StudentAcademicProfile is initialized
      await this.academicProfileModel.updateOne(
        { studentId: student.userId },
        {
          $set: {
            academicLevel: '1',
            semester: targetSemester,
          },
          $setOnInsert: {
            gpa: 0,
            completedCourses: [],
            failedCourses: [],
            lowGradeCourses: [],
            academicWarnings: 0,
            isGraduatingThisYear: false,
            approvedICCourseCompletions: [],
          },
        },
        { upsert: true },
      );
    }

    return {
      totalEligible: students.length,
      registeredCount,
      skippedCount,
      message: `تم التسجيل التلقائي بنجاح لـ ${registeredCount} طالب من أصل ${students.length}`,
      results,
    };
  }

  /**
   * Student Registration Roster for Admin:
   * Returns all students with their registration status for the active term.
   */
  async getStudentRegistrationRoster(query: QueryRegistrationDto) {
    const { page, limit, skip } = buildPaginationOptions(query);

    // Build academic profile filter
    const profileFilter: FilterQuery<StudentAcademicProfileDocument> = {};
    if (query.academicLevel) profileFilter.academicLevel = query.academicLevel;

    // If search is provided, find matching student IDs first
    if (query.search) {
      const matchingIds = await this.studentsService.findUserIdsBySearch(
        query.search,
      );
      profileFilter.studentId = { $in: matchingIds };
    }

    const profiles = await this.academicProfileModel
      .find(profileFilter)
      .populate('studentId', 'name studentCode')
      .sort({ academicLevel: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const studentIds = profiles.map((p) => p.studentId);

    // Get registrations for the active term
    const normalizedStudentIds = studentIds.map((id) =>
      id instanceof Types.ObjectId ? id : new Types.ObjectId(String(id)),
    );
    const [
      registrations,
      advisingCases,
      publishedGrades,
      gradedCourses,
      activeRules,
    ] = await Promise.all([
      this.registrationModel
        .find({
          studentId: { $in: normalizedStudentIds },
          ...(query.semester ? { semester: query.semester } : {}),
          ...(query.academicYear ? { academicYear: query.academicYear } : {}),
        })
        .sort({ createdAt: -1 })
        .lean(),
      this.advisingCaseModel
        .find({
          studentId: { $in: normalizedStudentIds },
          ...(query.semester ? { semester: query.semester } : {}),
          ...(query.academicYear ? { academicYear: query.academicYear } : {}),
        })
        .sort({ updatedAt: -1 })
        .lean(),
      this.gradeModel
        .find({ studentId: { $in: normalizedStudentIds }, isPublished: true })
        .select('studentId courseCode examType grade maxGrade status')
        .lean(),
      this.courseModel
        .find({ isActive: true })
        .select('code creditHours')
        .lean(),
      this.gpaRuleModel.find({ isActive: true }).sort({ minGpa: -1 }).lean(),
    ]);
    const courseCredits = Object.fromEntries(
      gradedCourses.map((course) => [
        course.code.toUpperCase(),
        course.creditHours ?? 1,
      ]),
    );

    const regMap = new Map<string, (typeof registrations)[0]>();
    for (const reg of registrations) {
      const key = reg.studentId.toString();
      if (!regMap.has(key)) regMap.set(key, reg);
    }
    const caseMap = new Map<string, (typeof advisingCases)[0]>();
    for (const advisingCase of advisingCases) {
      const key = advisingCase.studentId.toString();
      if (!caseMap.has(key)) caseMap.set(key, advisingCase);
    }
    const gradeMap = new Map<string, typeof publishedGrades>();
    for (const grade of publishedGrades) {
      const key = grade.studentId.toString();
      const records = gradeMap.get(key) ?? [];
      records.push(grade);
      gradeMap.set(key, records);
    }

    const items = profiles.map((profile) => {
      const studentObj = profile.studentId as unknown as {
        _id: Types.ObjectId;
        name?: string;
        studentCode?: string;
      };
      const sid = studentObj?._id?.toString() ?? profile.studentId.toString();
      const reg = regMap.get(sid);
      const advisingCase = caseMap.get(sid);
      const progress = mergeAcademicCourseProgress({
        completedCourses: profile.completedCourses,
        failedCourses: profile.failedCourses,
        lowGradeCourses: profile.lowGradeCourses,
        grades: gradeMap.get(sid) ?? [],
        courseCredits,
      });
      const effectiveProfile = { ...profile, ...progress };
      const effectiveGpa = progress.calculatedGpa ?? profile.gpa;
      const matchingRule = activeRules.find(
        (rule) => rule.minGpa <= effectiveGpa && rule.maxGpa >= effectiveGpa,
      );
      const configuredRequirement = matchingRule
        ? evaluateConfiguredAdvisingTriggers(
            {
              failedCourses: progress.failedCourses,
              academicWarnings: profile.academicWarnings,
              approvedICCourseCompletions: profile.approvedICCourseCompletions,
              semester: query.semester ?? profile.semester,
              isNewStudent:
                isNewStudentWithoutAcademicHistory(effectiveProfile),
            },
            {
              requiresAdvisor: matchingRule.requiresAdvisor,
              requireForFailedCourses:
                matchingRule.requireForFailedCourses ?? true,
              requireForAcademicWarnings:
                matchingRule.requireForAcademicWarnings ?? true,
              academicWarningThreshold:
                matchingRule.academicWarningThreshold ?? 1,
              requireForIncompleteCourses:
                matchingRule.requireForIncompleteCourses ?? true,
              requireForSummerRegistration:
                matchingRule.requireForSummerRegistration ?? false,
              exemptNewStudentsFromGpaRule:
                matchingRule.exemptNewStudentsFromGpaRule ?? true,
            },
          )
        : { requiresAdvisor: false };
      return {
        id: sid,
        name: studentObj?.name ?? '',
        studentCode: studentObj?.studentCode ?? '',
        academicLevel: profile.academicLevel,
        semester: profile.semester,
        gpa: effectiveGpa,
        passedCourseCount: progress.completedCourses.length,
        failedCourseCount: progress.failedCourses.length,
        academicWarnings: profile.academicWarnings ?? 0,
        registrationStatus: reg ? reg.status : 'not_registered',
        registeredHours: reg?.totalCreditHours ?? 0,
        registeredCourseCount: reg?.courses?.length ?? 0,
        registrationId: reg?._id?.toString(),
        registrationSource: reg?.source,
        advisingCaseId: advisingCase?._id.toString(),
        advisingCaseStatus: advisingCase?.status ?? 'NOT_STARTED',
        requiresAdvising:
          Boolean(advisingCase) || configuredRequirement.requiresAdvisor,
      };
    });

    // Filter by registration status if requested
    const registrationFiltered =
      query.status === 'approved'
        ? items.filter((i) => i.registrationStatus === 'approved')
        : query.status === 'pending'
          ? items.filter((i) => i.registrationStatus === 'not_registered')
          : items;

    const filtered =
      query.advising === 'case'
        ? registrationFiltered.filter((item) => Boolean(item.advisingCaseId))
        : query.advising === 'required'
          ? registrationFiltered.filter((item) => item.requiresAdvising)
          : query.advising === 'none'
            ? registrationFiltered.filter((item) => !item.requiresAdvising)
            : registrationFiltered;

    return createPaginatedResult(filtered, filtered.length, page, limit);
  }

  async getLatestStudentRegistration(studentId: string) {
    return this.registrationModel
      .findOne({ studentId })
      .sort({ createdAt: -1 })
      .populate('approvedBy', 'name email')
      .lean();
  }

  async listStudentRegistrationHistory(studentId: string) {
    return this.registrationModel
      .find({ studentId: new Types.ObjectId(studentId) })
      .sort({ academicYear: -1, semester: 1, createdAt: -1 })
      .populate('approvedBy', 'name email')
      .lean();
  }

  async getPrintableForm(
    registrationId: string,
    requesterId: string,
    role: string,
  ) {
    const registration = await this.registrationModel.findOne({
      _id: new Types.ObjectId(registrationId),
      ...(role === 'student'
        ? { studentId: new Types.ObjectId(String(requesterId)) }
        : {}),
    });
    if (!registration) {
      if (role === 'student') {
        throw new ForbiddenException(
          'You can only print your own registration',
        );
      }
      throw new NotFoundException('Registration not found');
    }

    const [studentProfile, academicProfile, courses] = await Promise.all([
      this.resolveStudentPrintProfile(registration.studentId.toString()),
      this.getAcademicProfile(registration.studentId.toString()),
      this.courseModel
        .find({ code: { $in: registration.courses } })
        .sort({ code: 1 })
        .lean(),
    ]);

    const advisorId = registration.approvedBy ?? academicProfile.advisorId;
    const advisor = advisorId
      ? await this.resolveAdvisorName(advisorId)
      : undefined;

    return {
      instituteName: 'BIS Institute',
      title: 'Academic Course Registration Form',
      studentInformation: {
        studentName: studentProfile.fullName,
        studentCode: studentProfile.studentCode,
        nationalId:
          studentProfile.nationalId ?? studentProfile.nationalIdMasked,
        academicLevel: academicProfile.academicLevel,
        semester: registration.semester,
        gpa: academicProfile.gpa,
        advisorName: advisor,
        approvedBy: advisor,
        approvedAt: registration.approvedAt?.toISOString().slice(0, 10),
      },
      registeredCourses: registration.courses.map((code) => {
        const course = courses.find((item) => item.code === code);
        return {
          code,
          courseName: course?.nameEn ?? course?.name ?? code,
          courseNameEn: course?.nameEn ?? course?.name ?? code,
          courseNameAr: course?.nameAr,
          creditHours: course?.creditHours ?? 0,
          type: course?.type ?? 'required',
          status:
            registration.source === 'advisor'
              ? 'advisor-approved'
              : 'registered',
        };
      }),
      totalCreditHours: registration.totalCreditHours,
      registrationStatus: registration.status,
      advisorNotes: registration.advisorNotes,
      studentSignature: '',
      advisorSignature: '',
      date: new Date().toISOString().slice(0, 10),
    };
  }

  private async listAdvisingRequests(
    query: QueryAdvisingRequestDto,
    assignedStaffId?: string,
  ) {
    const { page, limit, skip } = buildPaginationOptions(query);
    const filter: FilterQuery<AcademicAdvisingRequestDocument> = {};
    if (assignedStaffId)
      filter.assignedStaffId = new Types.ObjectId(assignedStaffId);
    if (query.status) filter.status = query.status;
    if (query.reason) filter.reason = query.reason;

    const [items, total] = await Promise.all([
      this.advisingRequestModel
        .find(filter)
        .populate('studentId', 'name studentCode nationalIdMasked')
        .populate('assignedStaffId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.advisingRequestModel.countDocuments(filter),
    ]);

    return createPaginatedResult(items, total, page, limit);
  }

  private async ensureAdvisingRequest(
    profile: StudentAcademicProfileDocument,
    reason?: AdvisingReason,
    policyWarnings: string[] = [],
  ) {
    const existing = await this.advisingRequestModel
      .findOne({
        studentId: profile.studentId,
        status: { $in: ['pending', 'reviewed'] },
      })
      .sort({ createdAt: -1 })
      .lean();

    if (existing) return existing;

    const rule = await this.getRuleForGpa(profile.gpa);
    const courses = (await this.courseModel
      .find({ isActive: true })
      .lean()) as unknown as CourseDocument[];
    const assignedStaffId = await this.assignStaffAdvisor(profile);
    const autoSuggestedCourses = recommendCourses({
      courses,
      completedCourses: profile.completedCourses,
      failedCourses: profile.failedCourses,
      academicLevel: profile.academicLevel,
      semester: profile.semester,
      maxCreditHours: rule.maxCreditHours,
    });

    return new this.advisingRequestModel({
      studentId: profile.studentId,
      assignedStaffId,
      reason: reason ?? this.inferAdvisingReason(profile),
      autoSuggestedCourses,
      staffApprovedCourses: autoSuggestedCourses,
      policyWarnings,
      status: 'pending',
    }).save();
  }

  private async assignStaffAdvisor(profile: StudentAcademicProfileDocument) {
    if (profile.advisorId) return profile.advisorId;

    const staff = await this.usersService.findActiveStaffAdvisors();
    if (staff.length === 0) return undefined;

    const staffIds = staff.map((advisor) => advisor._id);
    const aggResults = await this.advisingRequestModel.aggregate([
      {
        $match: {
          assignedStaffId: { $in: staffIds },
          status: { $in: ['pending', 'reviewed'] },
        },
      },
      {
        $group: {
          _id: '$assignedStaffId',
          count: { $sum: 1 },
        },
      },
    ]);

    const countsMap = new Map<string, number>();
    aggResults.forEach((result) => {
      if (result._id) {
        countsMap.set(result._id.toString(), result.count);
      }
    });

    const counts = staff.map((advisor) => ({
      advisor,
      count: countsMap.get(advisor._id.toString()) ?? 0,
    }));

    counts.sort((a, b) => a.count - b.count);
    return counts[0].advisor._id;
  }

  private async validateCourseSelection(
    profile: StudentAcademicProfileDocument,
    rawCourseCodes: string[],
    _rule: EffectiveRule,
    requireEligiblePlan: boolean,
    overrides: SelectionOverrides = {},
  ) {
    const courseCodes = normalizeCourseCodes(rawCourseCodes);
    const courses = await this.courseModel
      .find({
        code: { $in: courseCodes },
        isActive: true,
      })
      .lean();

    if (courses.length !== courseCodes.length) {
      throw new BadRequestException(
        'One or more selected courses are not active',
      );
    }

    const completedCourses = new Set(
      normalizeCourseCodes(profile.completedCourses),
    );
    const blockedCourse = courses.find(
      (course) =>
        completedCourses.has(course.code.toUpperCase()) ||
        (!overrides.overridePrerequisites &&
          !hasPassedPrerequisites(course, completedCourses)),
    );
    if (blockedCourse) {
      throw new BadRequestException(
        `${blockedCourse.code} is already completed or blocked by prerequisites`,
      );
    }

    const unavailableCourse = courses.find(
      (course) => !isCourseOfferedForTerm(course, profile.semester),
    );
    if (unavailableCourse) {
      throw new BadRequestException(
        `${unavailableCourse.code} is not offered in the ${profile.semester} semester`,
      );
    }

    if (requireEligiblePlan) {
      const eligible = buildEligibleCourseList({
        courses: (await this.courseModel
          .find({ isActive: true })
          .lean()) as unknown as CourseDocument[],
        completedCourses: profile.completedCourses,
        failedCourses: profile.failedCourses,
        academicLevel: profile.academicLevel,
        semester: profile.semester,
      });
      const eligibleCodes = new Set(eligible.map((course) => course.code));
      const invalidCourse = courseCodes.find(
        (code) => !eligibleCodes.has(code),
      );
      if (invalidCourse) {
        throw new BadRequestException(
          `${invalidCourse} is blocked by level, semester, completion, or prerequisites`,
        );
      }
      const missingEligibleCourses = eligible
        .map((course) => course.code)
        .filter((code) => !courseCodes.includes(code));
      if (missingEligibleCourses.length > 0) {
        throw new BadRequestException(
          `All available courses must be selected. Missing: ${missingEligibleCourses.join(', ')}`,
        );
      }
    }

    const totalCreditHours = courses.reduce(
      (total, course) => total + (course.creditHours ?? 0),
      0,
    );

    const approvedIC = new Set(
      normalizeCourseCodes(profile.approvedICCourseCompletions),
    );
    const selectedOnlyApprovedIC =
      overrides.approveIncompleteCompletion === true &&
      courseCodes.every((code) => approvedIC.has(code));
    const selectionLimits = getRegistrationSelectionLimits(
      profile.semester,
      overrides.summerCourseLimit,
    );

    if (
      totalCreditHours > selectionLimits.maxCreditHours &&
      !overrides.overrideMaxCreditHours &&
      !selectedOnlyApprovedIC
    ) {
      throw new BadRequestException(
        `Total credit hours exceed the allowed limit of ${selectionLimits.maxCreditHours}`,
      );
    }

    if (
      !overrides.overrideMaxCreditHours &&
      !selectedOnlyApprovedIC &&
      (totalCreditHours < selectionLimits.minCreditHours ||
        courseCodes.length < selectionLimits.minCourses ||
        courseCodes.length > selectionLimits.maxCourses)
    ) {
      throw new BadRequestException(
        `Registration requires ${selectionLimits.minCourses}-${selectionLimits.maxCourses} courses and ${selectionLimits.minCreditHours}-${selectionLimits.maxCreditHours} credit hours`,
      );
    }

    if (
      profile.semester === 'summer' &&
      courseCodes.length > selectionLimits.maxCourses &&
      !selectedOnlyApprovedIC
    ) {
      throw new BadRequestException(
        `Summer registration is limited to ${selectionLimits.maxCourses} courses`,
      );
    }

    return { courseCodes, totalCreditHours };
  }

  private async getAcademicProfile(studentId: string) {
    let profile = await this.academicProfileModel
      .findOne({
        studentId: new Types.ObjectId(studentId),
      })
      .lean();

    if (!profile) {
      // Repair legacy/imported students that predate academic-profile creation.
      const studentProfile = await this.studentsService
        .findByUserId(studentId)
        .catch(() => null);

      profile = await this.academicProfileModel
        .findOneAndUpdate(
          { studentId: new Types.ObjectId(studentId) },
          {
            $setOnInsert: {
              academicLevel: studentProfile?.level || '1',
              semester: normalizeSemester(studentProfile?.semester) as any,
              gpa: 0,
              completedCourses: [],
              failedCourses: [],
              lowGradeCourses: [],
              academicWarnings: 0,
              isGraduatingThisYear: false,
              approvedICCourseCompletions: [],
            },
          },
          { new: true, upsert: true },
        )
        .lean();
    }

    const publishedGrades = await this.gradeModel
      .find({
        studentId: new Types.ObjectId(studentId),
        isPublished: true,
      })
      .select('courseCode examType grade maxGrade status')
      .lean();
    const gradedCourses = await this.courseModel
      .find({
        code: {
          $in: [...new Set(publishedGrades.map((grade) => grade.courseCode))],
        },
      })
      .select('code creditHours')
      .lean();
    const progress = mergeAcademicCourseProgress({
      completedCourses: profile.completedCourses,
      failedCourses: profile.failedCourses,
      lowGradeCourses: profile.lowGradeCourses,
      grades: publishedGrades,
      courseCredits: Object.fromEntries(
        gradedCourses.map((course) => [
          course.code.toUpperCase(),
          course.creditHours ?? 1,
        ]),
      ),
    });

    return {
      ...profile,
      ...progress,
      gpa: progress.calculatedGpa ?? profile.gpa,
    } as unknown as StudentAcademicProfileDocument;
  }

  private async getRuleForGpa(gpa: number): Promise<EffectiveRule> {
    const rule = await this.gpaRuleModel
      .findOne({
        isActive: true,
        minGpa: { $lte: gpa },
        maxGpa: { $gte: gpa },
      })
      .sort({ minGpa: -1 })
      .lean();

    if (rule) {
      return {
        minGpa: rule.minGpa,
        maxGpa: rule.maxGpa,
        minCreditHours: rule.minCreditHours ?? 10,
        maxCreditHours: rule.maxCreditHours,
        minCourses: rule.minCourses ?? 4,
        maxCourses: rule.maxCourses ?? 6,
        requiresAdvisor: rule.requiresAdvisor,
        requireForFailedCourses: rule.requireForFailedCourses ?? true,
        requireForAcademicWarnings: rule.requireForAcademicWarnings ?? true,
        academicWarningThreshold: rule.academicWarningThreshold ?? 1,
        requireForIncompleteCourses: rule.requireForIncompleteCourses ?? true,
        requireForGraduationPlans: rule.requireForGraduationPlans ?? true,
        requireForSummerRegistration:
          rule.requireForSummerRegistration ?? false,
        exemptNewStudentsFromGpaRule: rule.exemptNewStudentsFromGpaRule ?? true,
      };
    }

    return {
      minGpa: 0,
      maxGpa: 4,
      minCreditHours: 10,
      maxCreditHours: 18,
      minCourses: 4,
      maxCourses: 6,
      requiresAdvisor: false,
      requireForFailedCourses: false,
      requireForAcademicWarnings: false,
      academicWarningThreshold: 1,
      requireForIncompleteCourses: false,
      requireForGraduationPlans: false,
      requireForSummerRegistration: false,
      exemptNewStudentsFromGpaRule: true,
    };
  }

  private inferAdvisingReason(
    profile: StudentAcademicProfileDocument,
  ): AdvisingReason {
    if (profile.failedCourses.length > 0) return 'failed_courses';
    if (profile.gpa < 2) return 'low_gpa';
    return 'probation';
  }

  private async getSummerPolicy(
    profile: StudentAcademicProfileDocument,
    rule: EffectiveRule,
  ) {
    const activeCourses = await this.courseModel
      .find({ isActive: true })
      .select('code semester')
      .lean();
    const completed = new Set(normalizeCourseCodes(profile.completedCourses));
    const remaining = activeCourses.filter(
      (course) => !completed.has(course.code.toUpperCase()),
    );
    let maxCourses = 2;
    const isNewStudent = isNewStudentWithoutAcademicHistory(profile);
    const configuredRequirement = evaluateConfiguredAdvisingTriggers(
      {
        failedCourses: profile.failedCourses,
        academicWarnings: profile.academicWarnings,
        approvedICCourseCompletions: profile.approvedICCourseCompletions,
        semester: profile.semester,
        isNewStudent,
      },
      rule,
    );
    let requiresAdvisor = configuredRequirement.requiresAdvisor;
    let reason: AdvisingReason =
      configuredRequirement.reason ?? this.inferAdvisingReason(profile);
    const warnings = [...configuredRequirement.warnings];

    if (rule.requireForGraduationPlans && profile.isGraduatingThisYear) {
      reason = 'summer_policy';
      if (profile.semester === 'summer' && remaining.length === 3) {
        maxCourses = 3;
        requiresAdvisor = true;
        warnings.push(
          'Graduating student may take all three remaining courses with approval.',
        );
      } else if (new Set(remaining.map((course) => course.semester)).size > 1) {
        requiresAdvisor = true;
        warnings.push('Graduation plan contains courses from mixed semesters.');
      }
    }

    return {
      maxCourses,
      requiresAdvisor,
      reason,
      warnings,
      remainingCourses: remaining.length,
    };
  }

  private async resolveAdvisorName(advisorId?: Types.ObjectId) {
    if (!advisorId) return undefined;
    try {
      const advisor = await this.usersService.findById(advisorId.toString());
      return advisor.name;
    } catch {
      return undefined;
    }
  }

  private async resolveStudentPrintProfile(studentId: string) {
    const profile = await this.studentsService
      .findByUserId(studentId)
      .catch(() => null);
    if (profile) return profile;

    const user = await this.usersService.findById(studentId);
    return {
      fullName: user.name,
      studentCode: user.studentCode ?? user.userCode ?? studentId,
      nationalId: user.nationalId,
      nationalIdMasked: user.nationalIdMasked,
    };
  }

  private async resolveAcademicYear(studentId: string, term?: string) {
    const profile = await this.studentsService
      .findByUserId(studentId)
      .catch(() => null);
    const semester = normalizeSemester(term ?? profile?.semester);
    const currentTerm = await this.registrationTermModel
      .findOne({ semester, isCurrent: true })
      .sort({ academicYear: -1 })
      .lean();
    if (currentTerm) return currentTerm.academicYear;

    const openTerms = await this.registrationTermModel
      .find({ semester, isOpen: true })
      .sort({ academicYear: -1 })
      .lean();
    const currentOpenTerm = openTerms.find((candidate) =>
      isRegistrationTermCurrentlyOpen(candidate),
    );

    return (
      currentOpenTerm?.academicYear ??
      profile?.academicYear ??
      `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`
    );
  }

  private async resolveRegistrationPeriod(
    studentId: string,
    preferredSemester?: string,
  ): Promise<{ academicYear: string; semester: string }> {
    const profile = await this.studentsService
      .findByUserId(studentId)
      .catch(() => null);

    const semester = normalizeSemester(preferredSemester ?? profile?.semester);
    const currentTerms = await this.registrationTermModel
      .find({ isCurrent: true })
      .sort({ updatedAt: -1, academicYear: -1 })
      .lean();

    const openCurrentTerm = currentTerms.find((term) =>
      isRegistrationTermCurrentlyOpen(term),
    );
    if (openCurrentTerm) {
      return {
        academicYear: openCurrentTerm.academicYear,
        semester: normalizeSemester(openCurrentTerm.semester),
      };
    }

    const preferredCurrentTerm = currentTerms.find(
      (term) => normalizeSemester(term.semester) === semester,
    );
    if (preferredCurrentTerm) {
      return {
        academicYear: preferredCurrentTerm.academicYear,
        semester,
      };
    }

    const openTerms = await this.registrationTermModel
      .find({ isOpen: true })
      .sort({ updatedAt: -1, academicYear: -1 })
      .lean();
    const currentOpenTerm = openTerms.find((term) =>
      isRegistrationTermCurrentlyOpen(term),
    );

    if (currentOpenTerm) {
      return {
        academicYear: currentOpenTerm.academicYear,
        semester: normalizeSemester(currentOpenTerm.semester),
      };
    }

    return {
      academicYear:
        profile?.academicYear ??
        `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
      semester,
    };
  }

  async listRegistrationTerms() {
    return this.registrationTermModel
      .find()
      .sort({ academicYear: -1, semester: 1 })
      .lean();
  }

  async listAcademicYears() {
    const [terms, registrationUsage, advisingUsage] = await Promise.all([
      this.registrationTermModel
        .find()
        .sort({ academicYear: -1, semester: 1 })
        .lean(),
      this.registrationModel.aggregate<{ _id: string; count: number }>([
        { $group: { _id: '$academicYear', count: { $sum: 1 } } },
      ]),
      this.advisingCaseModel.aggregate<{ _id: string; count: number }>([
        { $group: { _id: '$academicYear', count: { $sum: 1 } } },
      ]),
    ]);
    const registrationCounts = new Map(
      registrationUsage.map((item) => [item._id, item.count]),
    );
    const advisingCounts = new Map(
      advisingUsage.map((item) => [item._id, item.count]),
    );
    const grouped = new Map<string, typeof terms>();
    for (const term of terms) {
      const group = grouped.get(term.academicYear) ?? [];
      group.push(term);
      grouped.set(term.academicYear, group);
    }
    return Array.from(grouped.entries()).map(([academicYear, yearTerms]) => ({
      academicYear,
      isCurrent: yearTerms.some((term) => term.isCurrent),
      terms: yearTerms,
      registrationCount: registrationCounts.get(academicYear) ?? 0,
      advisingCaseCount: advisingCounts.get(academicYear) ?? 0,
    }));
  }

  async createAcademicYear(dto: CreateAcademicYearDto, adminId: string) {
    this.assertAcademicYear(dto.academicYear);
    const exists = await this.registrationTermModel.exists({
      academicYear: dto.academicYear,
    });
    if (exists) throw new ConflictException('Academic year already exists');
    const hasCurrent = await this.registrationTermModel.exists({
      isCurrent: true,
    });
    const makeCurrent = dto.makeCurrent === true || !hasCurrent;
    if (makeCurrent) {
      await this.registrationTermModel.updateMany(
        {},
        { $set: { isCurrent: false, isOpen: false } },
      );
    }
    await this.registrationTermModel.insertMany(
      (['first', 'second', 'summer'] as const).map((semester) => ({
        academicYear: dto.academicYear,
        semester,
        isOpen: false,
        isCurrent: makeCurrent,
        updatedBy: new Types.ObjectId(adminId),
      })),
    );
    return this.listAcademicYears();
  }

  async setCurrentAcademicYear(academicYear: string) {
    this.assertAcademicYear(academicYear);
    const exists = await this.registrationTermModel.exists({ academicYear });
    if (!exists) throw new NotFoundException('Academic year not found');
    await this.registrationTermModel.updateMany(
      { academicYear: { $ne: academicYear } },
      { $set: { isCurrent: false, isOpen: false } },
    );
    await this.registrationTermModel.updateMany(
      { academicYear },
      { $set: { isCurrent: true } },
    );
    return this.listAcademicYears();
  }

  async deleteAcademicYear(academicYear: string) {
    this.assertAcademicYear(academicYear);
    const terms = await this.registrationTermModel
      .find({ academicYear })
      .lean();
    if (!terms.length) throw new NotFoundException('Academic year not found');
    if (terms.some((term) => term.isCurrent)) {
      throw new ConflictException(
        'Set another academic year as current before deleting this year',
      );
    }
    const [registrationCount, advisingCaseCount] = await Promise.all([
      this.registrationModel.countDocuments({ academicYear }),
      this.advisingCaseModel.countDocuments({ academicYear }),
    ]);
    if (registrationCount || advisingCaseCount) {
      throw new ConflictException(
        'Academic year cannot be deleted because it contains registration or advising history',
      );
    }
    await this.registrationTermModel.deleteMany({ academicYear });
    return { deleted: true, academicYear };
  }

  async upsertRegistrationTerm(
    dto: UpsertRegistrationTermDto,
    adminId: string,
  ) {
    const opensAt = dto.opensAt ? new Date(dto.opensAt) : undefined;
    const closesAt = dto.closesAt ? new Date(dto.closesAt) : undefined;
    if (opensAt && closesAt && closesAt <= opensAt) {
      throw new BadRequestException(
        'Registration close date must be after the open date',
      );
    }
    const normSem = normalizeSemester(dto.semester);
    return this.registrationTermModel.findOneAndUpdate(
      { academicYear: dto.academicYear, semester: normSem },
      {
        $set: {
          isOpen: dto.isOpen,
          opensAt,
          closesAt,
          updatedBy: new Types.ObjectId(adminId),
        },
        $setOnInsert: {
          academicYear: dto.academicYear,
          semester: normSem,
        },
      },
      { new: true, upsert: true, runValidators: true },
    );
  }

  async toggleRegistrationTerm(id: string, isOpen: boolean, adminId?: string) {
    const term = await this.registrationTermModel.findByIdAndUpdate(
      id,
      {
        $set: {
          isOpen: Boolean(isOpen),
          ...(adminId ? { updatedBy: new Types.ObjectId(adminId) } : {}),
        },
      },
      { new: true },
    );
    if (!term) throw new NotFoundException('Registration term not found');
    return term;
  }

  async getRegistrationTermStatus(academicYear: string, semester: string) {
    const normSem = normalizeSemester(semester);
    const term = await this.registrationTermModel
      .findOne({
        academicYear,
        $or: [{ semester: normSem }, { semester }],
      })
      .lean();
    const isCurrentlyOpen = isRegistrationTermCurrentlyOpen(term);
    return {
      academicYear,
      semester: normSem,
      configured: Boolean(term),
      isOpen: term?.isOpen ?? false,
      isCurrentlyOpen,
      opensAt: term?.opensAt,
      closesAt: term?.closesAt,
    };
  }

  private async assertRegistrationTermOpen(
    academicYear: string,
    semester: string,
  ) {
    const status = await this.getRegistrationTermStatus(academicYear, semester);
    if (!status.isCurrentlyOpen) {
      throw new ForbiddenException(
        `Registration is closed for ${academicYear} ${semester} semester`,
      );
    }
    return status;
  }

  private summarizeGradesByCourse(grades: Grade[]) {
    const grouped = new Map<string, CourseGradeSummary>();

    grades.forEach((grade) => {
      const code = grade.courseCode.toUpperCase();
      const current = grouped.get(code) ?? {
        totalGrade: 0,
        totalMaxGrade: 0,
        percentage: 0,
        hasFinal: false,
        statuses: [],
        exams: [],
      };

      current.totalGrade += grade.grade;
      current.totalMaxGrade += grade.maxGrade;
      current.hasFinal = current.hasFinal || grade.examType === 'final';
      current.statuses.push(grade.status);
      current.exams.push({
        examType: grade.examType,
        grade: grade.grade,
        maxGrade: grade.maxGrade,
        status: grade.status,
      });
      current.percentage =
        current.totalMaxGrade > 0
          ? Math.round((current.totalGrade / current.totalMaxGrade) * 100)
          : 0;
      grouped.set(code, current);
    });

    return grouped;
  }

  private assertValidRuleRange(minGpa: number, maxGpa: number) {
    if (minGpa > maxGpa) {
      throw new BadRequestException(
        'minGpa must be less than or equal to maxGpa',
      );
    }
  }

  private assertAcademicYear(academicYear: string) {
    if (!isConsecutiveAcademicYear(academicYear)) {
      throw new BadRequestException(
        'Academic year must use consecutive years, for example 2026-2027',
      );
    }
  }

  private assertValidRegistrationLimits(
    minCreditHours: number,
    maxCreditHours: number,
    minCourses: number,
    maxCourses: number,
  ) {
    if (minCreditHours > maxCreditHours || minCourses > maxCourses) {
      throw new BadRequestException(
        'Minimum registration limits must not exceed maximum limits',
      );
    }
  }
}
