import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Course, CourseDocument } from '../courses/schemas/course.schema';
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
  CreateGpaRegistrationRuleDto,
  QueryAdvisingRequestDto,
  QueryRegistrationDto,
  ReviewAdvisingRequestDto,
  SubmitRegistrationDto,
  UpdateGpaRegistrationRuleDto,
  UpsertStudentAcademicProfileDto,
} from './dto/registration.dto';
import {
  buildEligibleCourseList,
  hasPassedPrerequisites,
  normalizeCourseCodes,
  recommendCourses,
} from './utils/course-recommendation.util';
import {
  buildPaginationOptions,
  createPaginatedResult,
} from '../../common/utils/pagination.util';

interface EffectiveRule {
  minGpa: number;
  maxGpa: number;
  maxCreditHours: number;
  requiresAdvisor: boolean;
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
    private studentsService: StudentsService,
    private usersService: UsersService,
  ) {}

  async upsertAcademicProfile(dto: UpsertStudentAcademicProfileDto) {
    const update = {
      ...dto,
      completedCourses: normalizeCourseCodes(dto.completedCourses),
      failedCourses: normalizeCourseCodes(dto.failedCourses),
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
    const profile = await this.getAcademicProfile(studentId);
    const rule = await this.getRuleForGpa(profile.gpa);
    const response = {
      canRegisterDirectly: !rule.requiresAdvisor,
      maxCreditHours: rule.maxCreditHours,
      requiresAdvisor: rule.requiresAdvisor,
      gpa: profile.gpa,
      academicLevel: profile.academicLevel,
      semester: profile.semester,
      failedCourses: profile.failedCourses,
      advisingRequest: null as any,
    };

    if (rule.requiresAdvisor) {
      response.advisingRequest = await this.ensureAdvisingRequest(profile);
    }

    return response;
  }

  async getAvailableCourses(studentId: string) {
    const profile = await this.getAcademicProfile(studentId);
    const rule = await this.getRuleForGpa(profile.gpa);

    if (rule.requiresAdvisor) {
      await this.ensureAdvisingRequest(profile);
      throw new ForbiddenException(
        'Direct registration is blocked. Academic advising is required.',
      );
    }

    const courses = await this.courseModel.find({ isActive: true }).lean() as unknown as CourseDocument[];
    const eligibleCourses = buildEligibleCourseList({
      courses,
      completedCourses: profile.completedCourses,
      failedCourses: profile.failedCourses,
      academicLevel: profile.academicLevel,
      semester: profile.semester,
    });

    return {
      maxCreditHours: rule.maxCreditHours,
      courses: eligibleCourses,
    };
  }

  async submitDirectRegistration(
    studentId: string,
    dto: SubmitRegistrationDto,
  ) {
    const profile = await this.getAcademicProfile(studentId);
    const rule = await this.getRuleForGpa(profile.gpa);

    if (rule.requiresAdvisor) {
      await this.ensureAdvisingRequest(profile);
      throw new ForbiddenException(
        'Direct registration is blocked. Academic advising is required.',
      );
    }

    const validation = await this.validateCourseSelection(
      profile,
      dto.courseCodes,
      rule,
      true,
    );

    const registration = await new this.registrationModel({
      studentId: profile.studentId,
      courses: validation.courseCodes,
      totalCreditHours: validation.totalCreditHours,
      source: 'student',
      status: 'approved',
    }).save();

    registration.printableFormUrl = `/api/registrations/${registration._id.toString()}/print`;
    return registration.save();
  }

  async getMyAdvisingStatus(studentId: string) {
    const request = await this.advisingRequestModel
      .findOne({ studentId })
      .sort({ createdAt: -1 })
      .populate('assignedStaffId', 'name email')
      .lean();

    const registration = await this.registrationModel
      .findOne({ studentId, source: 'advisor' })
      .sort({ createdAt: -1 })
      .lean();

    return { request, registration };
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
    );

    request.staffApprovedCourses = validation.courseCodes;
    request.staffNotes = dto.staffNotes;
    request.status = dto.status;
    await request.save();

    if (dto.status === 'approved') {
      const registration = await new this.registrationModel({
        studentId: profile.studentId,
        courses: validation.courseCodes,
        totalCreditHours: validation.totalCreditHours,
        source: 'advisor',
        status: 'approved',
        advisorNotes: dto.staffNotes,
      }).save();
      registration.printableFormUrl = `/api/registrations/${registration._id.toString()}/print`;
      await registration.save();
    }

    return request;
  }

  async listRegistrations(query: QueryRegistrationDto) {
    const { page, limit, skip } = buildPaginationOptions(query);
    const filter: FilterQuery<CourseRegistrationDocument> = {};
    if (query.status) filter.status = query.status;

    const [items, total] = await Promise.all([
      this.registrationModel
        .find(filter)
        .populate('studentId', 'name studentCode nationalIdMasked')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.registrationModel.countDocuments(filter),
    ]);

    return createPaginatedResult(items, total, page, limit);
  }

  async getLatestStudentRegistration(studentId: string) {
    return this.registrationModel
      .findOne({ studentId })
      .sort({ createdAt: -1 })
      .lean();
  }

  async getPrintableForm(
    registrationId: string,
    requesterId: string,
    role: string,
  ) {
    const registration = await this.registrationModel.findById(registrationId);
    if (!registration) throw new NotFoundException('Registration not found');

    if (
      role === 'student' &&
      registration.studentId.toString() !== requesterId
    ) {
      throw new ForbiddenException('You can only print your own registration');
    }

    const [studentProfile, academicProfile, courses] = await Promise.all([
      this.studentsService.findByUserId(registration.studentId.toString()),
      this.getAcademicProfile(registration.studentId.toString()),
      this.courseModel
        .find({ code: { $in: registration.courses } })
        .sort({ code: 1 })
        .lean(),
    ]);

    const advisor =
      academicProfile.advisorId || registration.source === 'advisor'
        ? await this.resolveAdvisorName(academicProfile.advisorId)
        : undefined;

    return {
      instituteName: 'BIS Institute',
      title: 'Academic Course Registration Form',
      studentInformation: {
        studentName: studentProfile.fullName,
        studentCode: studentProfile.studentCode,
        nationalId: studentProfile.nationalIdMasked,
        academicLevel: academicProfile.academicLevel,
        semester: academicProfile.semester,
        gpa: academicProfile.gpa,
        advisorName: advisor,
      },
      registeredCourses: registration.courses.map((code) => {
        const course = courses.find((item) => item.code === code);
        return {
          code,
          courseName: course?.name ?? code,
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
    const courses = await this.courseModel.find({ isActive: true }).lean() as unknown as CourseDocument[];
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
    rule: EffectiveRule,
    requireEligiblePlan: boolean,
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
        !hasPassedPrerequisites(course, completedCourses),
    );
    if (blockedCourse) {
      throw new BadRequestException(
        `${blockedCourse.code} is already completed or blocked by prerequisites`,
      );
    }

    if (requireEligiblePlan) {
      const eligible = buildEligibleCourseList({
        courses: await this.courseModel.find({ isActive: true }).lean() as unknown as CourseDocument[],
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
    }

    const totalCreditHours = courses.reduce(
      (total, course) => total + (course.creditHours ?? 0),
      0,
    );

    if (totalCreditHours > rule.maxCreditHours) {
      throw new BadRequestException(
        `Total credit hours exceed the allowed limit of ${rule.maxCreditHours}`,
      );
    }

    return { courseCodes, totalCreditHours };
  }

  private async getAcademicProfile(studentId: string) {
    const profile = await this.academicProfileModel
      .findOne({
        studentId: new Types.ObjectId(studentId),
      })
      .lean();
    if (!profile) {
      throw new NotFoundException('Student academic profile not found');
    }
    return profile as unknown as StudentAcademicProfileDocument;
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
        maxCreditHours: rule.maxCreditHours,
        requiresAdvisor: rule.requiresAdvisor,
      };
    }

    return {
      minGpa: 0,
      maxGpa: 4,
      maxCreditHours: gpa < 2 ? 12 : 18,
      requiresAdvisor: gpa < 2,
    };
  }

  private inferAdvisingReason(
    profile: StudentAcademicProfileDocument,
  ): AdvisingReason {
    if (profile.failedCourses.length > 0) return 'failed_courses';
    if (profile.gpa < 2) return 'low_gpa';
    return 'probation';
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

  private assertValidRuleRange(minGpa: number, maxGpa: number) {
    if (minGpa > maxGpa) {
      throw new BadRequestException(
        'minGpa must be less than or equal to maxGpa',
      );
    }
  }
}
