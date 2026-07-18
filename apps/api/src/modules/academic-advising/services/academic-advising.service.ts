import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Course } from '../../courses/schemas/course.schema';
import { Grade } from '../../grades/schemas/grade.schema';
import { User } from '../../users/schemas/user.schema';
import { StudentProfile } from '../../students/schemas/student-profile.schema';
import { StudentAcademicProfile } from '../../registrations/schemas/student-academic-profile.schema';
import { CourseRegistration } from '../../registrations/schemas/course-registration.schema';
import { mergeAcademicCourseProgress } from '../../registrations/utils/academic-course-progress.util';
import { RulesBasedRecommendationProvider } from '../../registrations/recommendations/rules-based-recommendation.provider';
import type { Role } from '@student-portal/shared';
import { AdvisingCase } from '../schemas/advising-case.schema';
import { AdvisingPlan } from '../schemas/advising-plan.schema';
import {
  AdvisingGraph,
  type AdvisingGraphEdge,
  type AdvisingGraphNode,
} from '../schemas/advising-graph.schema';
import { CourseRecommendation } from '../schemas/course-recommendation.schema';
import { AdvisingNote } from '../schemas/advising-note.schema';
import { AdvisingAuditService } from './advising-audit.service';
import { PlanValidationService } from './plan-validation.service';
import type {
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

@Injectable()
export class AcademicAdvisingService {
  private readonly provider = new RulesBasedRecommendationProvider();
  constructor(
    @InjectModel(AdvisingCase.name) private readonly cases: Model<AdvisingCase>,
    @InjectModel(AdvisingPlan.name) private readonly plans: Model<AdvisingPlan>,
    @InjectModel(AdvisingGraph.name)
    private readonly graphs: Model<AdvisingGraph>,
    @InjectModel(CourseRecommendation.name)
    private readonly recommendations: Model<CourseRecommendation>,
    @InjectModel(AdvisingNote.name) private readonly notes: Model<AdvisingNote>,
    @InjectModel(Course.name) private readonly courses: Model<Course>,
    @InjectModel(Grade.name) private readonly grades: Model<Grade>,
    @InjectModel(CourseRegistration.name)
    private readonly registrations: Model<CourseRegistration>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(StudentProfile.name)
    private readonly studentProfiles: Model<StudentProfile>,
    @InjectModel(StudentAcademicProfile.name)
    private readonly academicProfiles: Model<StudentAcademicProfile>,
    private readonly validation: PlanValidationService,
    private readonly audit: AdvisingAuditService,
  ) {}

  async listStudents(
    query: AdvisingStudentsQueryDto,
    actorId: string,
    role: Role,
  ) {
    const assignedCases =
      role === 'staff'
        ? await this.cases
            .find({
              assignedAdvisorId: new Types.ObjectId(actorId),
              ...(query.status ? { status: query.status } : {}),
              ...(query.academicYear ? { academicYear: query.academicYear } : {}),
              ...(query.semester ? { semester: query.semester } : {}),
            })
            .sort({ updatedAt: -1 })
            .lean()
        : [];
    const advisorAssignments =
      role === 'staff'
        ? await this.academicProfiles
            .find({ advisorId: new Types.ObjectId(actorId) })
            .select('studentId')
            .lean()
        : [];
    const assignedStudentIds = [
      ...new Map(
        [...advisorAssignments, ...assignedCases].map((item) => [
          item.studentId.toString(),
          item.studentId,
        ]),
      ).values(),
    ];
    const userFilter: Record<string, unknown> = {
      role: 'student',
      isActive: true,
      ...(role === 'staff'
        ? { _id: { $in: assignedStudentIds } }
        : {}),
    };
    if (query.search)
      userFilter.$or = [
        { name: { $regex: this.escape(query.search), $options: 'i' } },
        { studentCode: { $regex: this.escape(query.search), $options: 'i' } },
      ];
    const users = await this.users
      .find(userFilter)
      .select('name studentCode avatarUrl email')
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean();
    const ids = users.map((user) => user._id);
    const [profiles, academics, cases, publishedGrades, gradedCourses] = await Promise.all([
      this.studentProfiles
        .find({
          userId: { $in: ids },
          ...(query.level ? { level: query.level } : {}),
        })
        .lean(),
      this.academicProfiles
        .find({
          studentId: { $in: ids },
          ...(query.minGpa !== undefined
            ? {
                gpa: {
                  $gte: query.minGpa,
                  ...(query.maxGpa !== undefined ? { $lte: query.maxGpa } : {}),
                },
              }
            : query.maxGpa !== undefined
              ? { gpa: { $lte: query.maxGpa } }
              : {}),
        })
        .lean(),
      role === 'staff'
        ? assignedCases
        : this.cases
            .find({
              studentId: { $in: ids },
              ...(query.status ? { status: query.status } : {}),
              ...(query.academicYear ? { academicYear: query.academicYear } : {}),
              ...(query.semester ? { semester: query.semester } : {}),
            })
            .sort({ updatedAt: -1 })
            .lean(),
      this.grades
        .find({ studentId: { $in: ids }, isPublished: true })
        .select('studentId courseCode examType grade maxGrade status')
        .lean(),
      this.courses.find({ isActive: true }).select('code creditHours').lean(),
    ]);
    const courseCredits = Object.fromEntries(
      gradedCourses.map((course) => [
        course.code.toUpperCase(),
        course.creditHours ?? 1,
      ]),
    );
    const profileMap = new Map(
      profiles.map((profile) => [profile.userId.toString(), profile]),
    );
    const academicMap = new Map(
      academics.map((profile) => [profile.studentId.toString(), profile]),
    );
    const caseMap = new Map(
      cases.map((item) => [item.studentId.toString(), item]),
    );
    const gradeMap = new Map<string, typeof publishedGrades>();
    for (const grade of publishedGrades) {
      const key = grade.studentId.toString();
      const records = gradeMap.get(key) ?? [];
      records.push(grade);
      gradeMap.set(key, records);
    }
    const items = users
      .filter(
        (user) =>
          profileMap.has(user._id.toString()) &&
          academicMap.has(user._id.toString()),
      )
      .map((user) => {
        const profile = profileMap.get(user._id.toString())!;
        const academic = academicMap.get(user._id.toString())!;
        const advisingCase = caseMap.get(user._id.toString());
        const progress = mergeAcademicCourseProgress({
          completedCourses: academic.completedCourses,
          failedCourses: academic.failedCourses,
          lowGradeCourses: academic.lowGradeCourses,
          grades: gradeMap.get(user._id.toString()) ?? [],
          courseCredits,
        });
        return {
          id: user._id,
          name: user.name,
          studentCode: user.studentCode,
          avatarUrl: user.avatarUrl,
          department: profile.department,
          academicLevel: academic.academicLevel,
          semester: query.semester ?? academic.semester,
          academicYear: query.academicYear,
          gpa: progress.calculatedGpa ?? academic.gpa,
          passedCourseCount: progress.completedCourses.length,
          failedCourseCount: progress.failedCourses.length,
          warningCount: academic.academicWarnings,
          expectedGraduation: academic.isGraduatingThisYear,
          assignedAdvisorId: advisingCase?.assignedAdvisorId,
          advisingStatus: advisingCase?.status ?? 'NOT_STARTED',
          caseId: advisingCase?._id,
        };
      });
    return {
      items,
      page: query.page,
      limit: query.limit,
      total: items.length,
      totalPages: items.length < query.limit ? query.page : query.page + 1,
    };
  }

  async listAdvisors() {
    const advisors = await this.users
      .find({ role: 'staff', isActive: true })
      .select('name email userCode studentCode permissions')
      .sort({ name: 1 })
      .lean();
    const advisorIds = advisors.map((advisor) => advisor._id);
    const [profileCounts, caseCounts] = await Promise.all([
      this.academicProfiles.aggregate<{ _id: Types.ObjectId; count: number }>([
        { $match: { advisorId: { $in: advisorIds } } },
        { $group: { _id: '$advisorId', count: { $sum: 1 } } },
      ]),
      this.cases.aggregate<{ _id: Types.ObjectId; count: number }>([
        {
          $match: {
            assignedAdvisorId: { $in: advisorIds },
            status: { $nin: ['CLOSED', 'REGISTERED'] },
          },
        },
        { $group: { _id: '$assignedAdvisorId', count: { $sum: 1 } } },
      ]),
    ]);
    const assigned = new Map(
      profileCounts.map((item) => [item._id.toString(), item.count]),
    );
    const activeCases = new Map(
      caseCounts.map((item) => [item._id.toString(), item.count]),
    );
    return advisors.map((advisor) => ({
      ...advisor,
      assignedStudentCount: assigned.get(advisor._id.toString()) ?? 0,
      activeCaseCount: activeCases.get(advisor._id.toString()) ?? 0,
    }));
  }

  async bulkAssignStudents(dto: BulkAssignAdvisorDto, actorId: string) {
    const advisor = await this.users.exists({
      _id: dto.advisorId,
      role: 'staff',
      isActive: true,
    });
    if (!advisor) throw new BadRequestException('Active advisor not found');
    const studentIds = dto.studentIds.map((id) => new Types.ObjectId(id));
    const academics = await this.academicProfiles
      .find({ studentId: { $in: studentIds } })
      .lean();
    if (academics.length !== studentIds.length) {
      throw new BadRequestException(
        'One or more students are missing an academic profile',
      );
    }
    await this.academicProfiles.updateMany(
      { studentId: { $in: studentIds } },
      { $set: { advisorId: new Types.ObjectId(dto.advisorId) } },
    );
    let assignedCount = 0;
    let skippedClosedCount = 0;
    for (const academic of academics) {
      const caseFilter = {
        studentId: academic.studentId,
        academicYear: dto.academicYear,
        semester: dto.semester,
      };
      const existingCase = await this.cases.findOne(caseFilter).lean();
      if (
        existingCase &&
        ['CLOSED', 'REGISTERED'].includes(existingCase.status)
      ) {
        skippedClosedCount += 1;
        continue;
      }
      await this.cases.findOneAndUpdate(
        caseFilter,
        {
          $set: {
            assignedAdvisorId: new Types.ObjectId(dto.advisorId),
            status: 'ASSIGNED',
          },
          $setOnInsert: {
            studentId: academic.studentId,
            academicYear: dto.academicYear,
            semester: academic.semester,
          },
          $push: {
            timeline: {
              status: 'ASSIGNED',
              changedAt: new Date(),
              actorId: new Types.ObjectId(actorId),
            },
          },
        },
        { upsert: true, new: true },
      );
      assignedCount += 1;
    }
    return {
      assignedCount,
      skippedClosedCount,
      advisorId: dto.advisorId,
      academicYear: dto.academicYear,
    };
  }

  async createCase(dto: CreateAdvisingCaseDto, actorId: string) {
    const student = await this.users.exists({
      _id: dto.studentId,
      role: 'student',
      isActive: true,
    });
    if (!student) throw new NotFoundException('Student not found');
    try {
      const item = await this.cases.create({
        ...dto,
        status: dto.assignedAdvisorId ? 'ASSIGNED' : 'NOT_STARTED',
        timeline: [
          {
            status: dto.assignedAdvisorId ? 'ASSIGNED' : 'NOT_STARTED',
            changedAt: new Date(),
            actorId,
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
    } catch (error) {
      if (this.isDuplicate(error)) {
        const existing = await this.cases
          .findOne({
            studentId: dto.studentId,
            academicYear: dto.academicYear,
            semester: dto.semester,
          })
          .lean();
        if (existing) return existing;
        throw new ConflictException(
          'An advising case already exists for this student and term',
        );
      }
      throw error;
    }
  }
  async listCases(actorId: string, role: Role) {
    return this.cases
      .find(role === 'staff' ? { assignedAdvisorId: actorId } : {})
      .populate('studentId', 'name studentCode avatarUrl')
      .populate('assignedAdvisorId', 'name email')
      .sort({ updatedAt: -1 })
      .lean();
  }
  async getCase(caseId: string, actorId: string, role: Role) {
    const item = await this.cases
      .findById(caseId)
      .populate('studentId', 'name studentCode avatarUrl email')
      .populate('assignedAdvisorId', 'name email')
      .lean();
    if (!item) throw new NotFoundException('Advising case not found');
    this.assertCaseAccess(item.assignedAdvisorId?.toString(), actorId, role);
    return item;
  }
  async getCourseMap(caseId: string, actorId: string, role: Role) {
    const advisingCase = await this.getCase(caseId, actorId, role);
    const studentId = this.objectIdOf(advisingCase.studentId);
    const [academic, courses, grades, recommendations, student, latestPlan, registration] =
      await Promise.all([
        this.academicProfiles.findOne({ studentId }).lean(),
        this.courses
          .find({ isActive: true })
          .sort({ level: 1, code: 1 })
          .lean(),
        this.grades
          .find({ studentId, isPublished: true })
          .sort({ courseCode: 1, examType: 1 })
          .lean(),
        this.recommendations
          .find({ advisingCaseId: caseId })
          .populate('courseId', 'code')
          .lean(),
        this.users.findById(studentId).select('name studentCode').lean(),
        this.plans
          .findOne({ advisingCaseId: caseId })
          .sort({ version: -1 })
          .populate('selectedCourses', 'code')
          .lean(),
        this.registrations
          .findOne({
            studentId,
            academicYear: advisingCase.academicYear,
            semester: advisingCase.semester,
          })
          .sort({ createdAt: -1 })
          .lean(),
      ]);
    if (!academic)
      throw new BadRequestException('Student academic profile is missing');

    const progress = mergeAcademicCourseProgress({
      completedCourses: academic.completedCourses,
      failedCourses: academic.failedCourses,
      lowGradeCourses: academic.lowGradeCourses,
      grades,
      courseCredits: Object.fromEntries(
        courses.map((course) => [
          course.code.toUpperCase(),
          course.creditHours ?? 1,
        ]),
      ),
    });
    const completed = new Set(progress.completedCourses);
    const failed = new Set(progress.failedCourses);
    const lowGrade = new Set(progress.lowGradeCourses);
    const selected = new Set([
      ...recommendations
        .filter((item) => item.accepted && !item.rejected)
        .map((item) => {
          const course = item.courseId as unknown as { code?: string };
          return course.code?.toUpperCase();
        })
        .filter((code): code is string => Boolean(code)),
      ...(latestPlan?.selectedCourses ?? [])
        .map((course) => {
          const populated = course as unknown as { code?: string };
          return populated.code?.toUpperCase();
        })
        .filter((code): code is string => Boolean(code)),
      ...(registration?.courses ?? []).map((code) => code.toUpperCase()),
    ]);
    const suggested = new Set(
      recommendations
        .filter((item) => item.eligible && !item.rejected)
        .map((item) => {
          const course = item.courseId as unknown as { code?: string };
          return course.code?.toUpperCase();
        })
        .filter((code): code is string => Boolean(code)),
    );
    const gradeMap = new Map<
      string,
      Array<{
        examType: string;
        grade: number;
        maxGrade: number;
        status: string;
      }>
    >();
    for (const grade of grades) {
      const code = grade.courseCode.toUpperCase();
      const entries = gradeMap.get(code) ?? [];
      entries.push({
        examType: grade.examType,
        grade: grade.grade,
        maxGrade: grade.maxGrade,
        status: grade.status,
      });
      gradeMap.set(code, entries);
    }
    const totalProgramCredits = courses.reduce(
      (sum, course) => sum + (course.creditHours ?? 0),
      0,
    );
    const completedCredits = courses.reduce(
      (sum, course) =>
        sum +
        (completed.has(course.code.toUpperCase())
          ? (course.creditHours ?? 0)
          : 0),
      0,
    );
    const performanceByCourse = new Map(
      progress.courseResults.map((result) => [result.courseCode, result]),
    );

    return {
      student: {
        name: student?.name,
        studentCode: student?.studentCode,
        gpa: progress.calculatedGpa ?? academic.gpa,
        academicLevel: academic.academicLevel,
        semester: advisingCase.semester,
      },
      summary: {
        passedCourses: completed.size,
        failedCourses: failed.size,
        completedCredits,
        remainingCredits: Math.max(0, totalProgramCredits - completedCredits),
        totalProgramCredits,
      },
      selectedCourses: [...selected],
      suggestedCourses: [...suggested],
      registration: registration
        ? {
            id: registration._id.toString(),
            status: registration.status,
            source: registration.source,
            courses: registration.courses,
          }
        : null,
      courses: courses.map((course) => {
        const code = course.code.toUpperCase();
        const exams = gradeMap.get(code) ?? [];
        const totalGrade = exams.reduce((sum, exam) => sum + exam.grade, 0);
        const totalMaxGrade = exams.reduce(
          (sum, exam) => sum + exam.maxGrade,
          0,
        );
        const coursePerformance = performanceByCourse.get(code);
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
          offeredTerms: course.offeredTerms ?? [],
          type: course.type,
          progressStatus: completed.has(code)
            ? 'passed'
            : failed.has(code)
              ? 'failed'
              : lowGrade.has(code)
                ? 'low_grade'
                : selected.has(code)
                  ? 'planned'
                  : suggested.has(code)
                    ? 'recommended'
                    : 'not_taken',
          gradeSummary: exams.length
            ? {
                totalGrade,
                totalMaxGrade,
                percentage: totalMaxGrade
                  ? Math.round((totalGrade / totalMaxGrade) * 100)
                  : 0,
                gradePoints: coursePerformance?.gradePoints ?? 0,
                hasFinal: exams.some((exam) => exam.examType === 'final'),
                exams,
              }
            : undefined,
        };
      }),
    };
  }
  async updateStatus(
    caseId: string,
    dto: UpdateCaseStatusDto,
    actorId: string,
    role: Role,
  ) {
    const current = await this.getCase(caseId, actorId, role);
    const updated = await this.cases.findByIdAndUpdate(
      caseId,
      {
        $set: { status: dto.status, reviewedAt: new Date() },
        $push: {
          timeline: { status: dto.status, changedAt: new Date(), actorId },
        },
      },
      { new: true },
    );
    await this.audit.record(
      caseId,
      actorId,
      'STATUS_CHANGED',
      'AdvisingCase',
      caseId,
      {
        previousValue: { status: current.status },
        newValue: { status: dto.status },
      },
    );
    return updated;
  }
  async assign(caseId: string, dto: AssignCaseDto, actorId: string) {
    const advisor = await this.users.exists({
      _id: dto.advisorId,
      role: { $in: ['staff', 'admin'] },
      isActive: true,
    });
    if (!advisor) throw new BadRequestException('Advisor not found');
    const updated = await this.cases.findByIdAndUpdate(
      caseId,
      {
        assignedAdvisorId: dto.advisorId,
        status: 'ASSIGNED',
        $push: {
          timeline: { status: 'ASSIGNED', changedAt: new Date(), actorId },
        },
      },
      { new: true },
    );
    if (!updated) throw new NotFoundException('Advising case not found');
    await this.audit.record(
      caseId,
      actorId,
      'ADVISOR_ASSIGNED',
      'AdvisingCase',
      caseId,
      { newValue: { advisorId: dto.advisorId } },
    );
    return updated;
  }

  async generate(
    caseId: string,
    dto: GenerateRecommendationsDto,
    actorId: string,
    role: Role,
  ) {
    const advisingCase = await this.getCase(caseId, actorId, role);
    this.assertCaseOpen(advisingCase.status);
    const studentId = this.objectIdOf(advisingCase.studentId);
    const academic = await this.academicProfiles.findOne({ studentId }).lean();
    if (!academic)
      throw new BadRequestException('Student academic profile is missing');
    const publishedGrades = await this.grades
      .find({ studentId, isPublished: true })
      .select('courseCode examType grade maxGrade status')
      .lean();
    const courses = await this.courses.find({ isActive: true }).lean();
    const progress = mergeAcademicCourseProgress({
      completedCourses: academic.completedCourses,
      failedCourses: academic.failedCourses,
      lowGradeCourses: academic.lowGradeCourses,
      grades: publishedGrades,
      courseCredits: Object.fromEntries(
        courses.map((course) => [
          course.code.toUpperCase(),
          course.creditHours ?? 1,
        ]),
      ),
    });
    const effectiveGpa = progress.calculatedGpa ?? academic.gpa;
    const generationKey = `${caseId}:${effectiveGpa}:${progress.completedCourses.join(',')}:${progress.failedCourses.join(',')}:${dto.maxCredits}:v3`;
    const output = this.provider.generate({
      courses: courses as never,
      completedCourses: progress.completedCourses,
      failedCourses: progress.failedCourses,
      academicLevel: academic.academicLevel,
      semester: advisingCase.semester as 'first' | 'second' | 'summer',
      maxCreditHours: Math.min(
        dto.maxCredits,
        academic.academicWarnings > 3 ? 12 : dto.maxCredits,
      ),
      academicWarningCount: academic.academicWarnings,
    });
    await this.recommendations.bulkWrite(
      output.flatMap((item) => {
        if (!item.courseId) return [];
        const courseId = new Types.ObjectId(item.courseId);
        return [
          {
            updateOne: {
              filter: { advisingCaseId: new Types.ObjectId(caseId), courseId },
              update: {
                $set: {
                  advisingCaseId: new Types.ObjectId(caseId),
                  studentId,
                  courseId,
                  score: item.score,
                  priority: item.priority,
                  eligible: item.eligible,
                  reasonCodes: item.reasonCodes,
                  explanation: item.explanation,
                  warnings: item.warnings,
                  blockedReasons: item.blockedReasons,
                  generationKey,
                },
              },
              upsert: true,
            },
          },
        ];
      }),
    );
    await this.cases.findByIdAndUpdate(caseId, {
      status: 'AUTO_RECOMMENDED',
      generatedAt: new Date(),
      $push: {
        timeline: {
          status: 'AUTO_RECOMMENDED',
          changedAt: new Date(),
          actorId,
        },
      },
    });
    await this.audit.record(
      caseId,
      actorId,
      'RECOMMENDATIONS_GENERATED',
      'AdvisingCase',
      caseId,
      { metadata: { generationKey, count: output.length } },
    );
    return this.listRecommendations(caseId, actorId, role);
  }
  async listRecommendations(caseId: string, actorId: string, role: Role) {
    await this.getCase(caseId, actorId, role);
    return this.recommendations
      .find({ advisingCaseId: caseId })
      .populate(
        'courseId',
        'code nameAr nameEn creditHours prerequisites semester type',
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
    if (dto.accepted === undefined && dto.decision === undefined)
      throw new BadRequestException('A recommendation decision is required');
    const item = await this.recommendations.findById(id);
    if (!item) throw new NotFoundException('Recommendation not found');
    const advisingCase = await this.getCase(
      item.advisingCaseId.toString(),
      actorId,
      role,
    );
    this.assertCaseOpen(advisingCase.status);
    const decision = dto.decision ?? (dto.accepted ? 'ACCEPTED' : 'REJECTED');
    item.accepted = decision === 'ACCEPTED';
    item.rejected = decision === 'REJECTED';
    item.rejectionReason =
      decision === 'REJECTED' ? dto.rejectionReason : undefined;
    await item.save();
    await this.audit.record(
      item.advisingCaseId,
      actorId,
      decision === 'ACCEPTED'
        ? 'RECOMMENDATION_ACCEPTED'
        : decision === 'REJECTED'
          ? 'RECOMMENDATION_REJECTED'
          : 'RECOMMENDATION_REMOVED',
      'CourseRecommendation',
      id,
    );
    return item;
  }

  async createPlan(
    caseId: string,
    dto: CreatePlanDto,
    actorId: string,
    role: Role,
  ) {
    const item = await this.getCase(caseId, actorId, role);
    this.assertCaseOpen(item.status);
    const studentId = this.objectIdOf(item.studentId);
    const existingRegistration = await this.registrations.exists({
      studentId,
      academicYear: item.academicYear,
      semester: item.semester,
    });
    if (existingRegistration) {
      throw new ConflictException(
        'This student already has a final registration for the advising term',
      );
    }
    const selectedCourses = await this.courses
      .find({ _id: { $in: dto.selectedCourses }, isActive: true })
      .select('_id creditHours')
      .lean();
    if (selectedCourses.length !== dto.selectedCourses.length)
      throw new BadRequestException(
        'One or more selected courses are not active or do not exist',
      );
    const totalCredits = selectedCourses.reduce(
      (total, course) => total + (course.creditHours ?? 0),
      0,
    );
    const latest = await this.plans
      .findOne({ advisingCaseId: caseId, type: dto.type })
      .sort({ version: -1 })
      .lean();
    const plan = await this.plans.create({
      ...dto,
      advisingCaseId: caseId,
      studentId,
      advisorId: actorId,
      academicYear: item.academicYear,
      semester: item.semester,
      totalCredits,
      version: (latest?.version ?? 0) + 1,
    });
    await this.cases.findByIdAndUpdate(caseId, {
      currentDraftId: plan._id,
      status: 'DRAFT',
      $push: { timeline: { status: 'DRAFT', changedAt: new Date(), actorId } },
    });
    await this.audit.record(
      caseId,
      actorId,
      'PLAN_CREATED',
      'AdvisingPlan',
      plan._id.toString(),
    );
    return plan;
  }
  async listPlans(caseId: string, actorId: string, role: Role) {
    await this.getCase(caseId, actorId, role);
    return this.plans
      .find({ advisingCaseId: caseId })
      .populate('selectedCourses', 'code nameAr nameEn creditHours')
      .sort({ version: -1 })
      .lean();
  }
  async getPlan(id: string, actorId: string, role: Role) {
    const plan = await this.plans
      .findById(id)
      .populate(
        'selectedCourses',
        'code nameAr nameEn creditHours prerequisites semester type',
      )
      .lean();
    if (!plan) throw new NotFoundException('Advising plan not found');
    await this.getCase(plan.advisingCaseId.toString(), actorId, role);
    return plan;
  }
  async updatePlan(
    id: string,
    dto: UpdatePlanDto,
    actorId: string,
    role: Role,
  ) {
    const plan = await this.getPlan(id, actorId, role);
    if (plan.status === 'APPROVED')
      throw new ConflictException('Approved plans are read-only');
    const update = { ...dto };
    delete (update as { version?: number }).version;
    const updated = await this.plans.findOneAndUpdate(
      { _id: id, version: dto.version },
      { $set: update, $inc: { version: 1 } },
      { new: true },
    );
    if (!updated)
      throw new ConflictException({
        code: 'PLAN_VERSION_CONFLICT',
        message:
          'This plan was updated by another user. Reload or compare changes before saving.',
      });
    await this.audit.record(
      plan.advisingCaseId,
      actorId,
      'PLAN_UPDATED',
      'AdvisingPlan',
      id,
    );
    return updated;
  }
  async validatePlan(id: string, actorId: string, role: Role) {
    const plan = await this.getPlan(id, actorId, role);
    const academic = await this.academicProfiles
      .findOne({ studentId: plan.studentId })
      .lean();
    if (!academic)
      throw new BadRequestException('Student academic profile is missing');
    const existingRegistration = await this.registrations.exists({
      studentId: plan.studentId,
      academicYear: plan.academicYear,
      semester: plan.semester,
    });
    if (existingRegistration) {
      throw new ConflictException(
        'A final registration already exists for this academic term',
      );
    }
    const courseIds = this.extractCourseIds(plan.selectedCourses);
    const courses = await this.courses.find({ _id: { $in: courseIds } }).lean();
    if (courses.length !== courseIds.length)
      throw new BadRequestException('Plan contains an unknown course');
    const publishedGrades = await this.grades
      .find({ studentId: plan.studentId, isPublished: true })
      .select('courseCode examType grade maxGrade status')
      .lean();
    const gradedCourses = await this.courses
      .find({ code: { $in: publishedGrades.map((grade) => grade.courseCode) } })
      .select('code creditHours')
      .lean();
    const progress = mergeAcademicCourseProgress({
      completedCourses: academic.completedCourses,
      failedCourses: academic.failedCourses,
      lowGradeCourses: academic.lowGradeCourses,
      grades: publishedGrades,
      courseCredits: Object.fromEntries(
        gradedCourses.map((course) => [
          course.code.toUpperCase(),
          course.creditHours ?? 1,
        ]),
      ),
    });
    const result = this.validation.validate({
      courses,
      completedCodes: progress.completedCourses,
      failedCodes: progress.failedCourses,
      gpa: progress.calculatedGpa ?? academic.gpa,
      maxCredits: academic.academicWarnings > 3 ? 12 : 18,
      overrideReasons: plan.overrideReasons,
      semester: plan.semester as 'first' | 'second' | 'summer',
    });
    await this.plans.findByIdAndUpdate(id, {
      validationResult: result,
      totalCredits: result.totalCredits,
      status: result.valid ? 'VALIDATED' : 'DRAFT',
    });
    return result;
  }
  async approvePlan(id: string, actorId: string, role: Role) {
    const plan = await this.getPlan(id, actorId, role);
    const result = await this.validatePlan(id, actorId, role);
    if (!result.valid)
      throw new BadRequestException({
        code: 'PLAN_VALIDATION_FAILED',
        ...result,
      });
    const approved = await this.plans.findByIdAndUpdate(
      id,
      { status: 'APPROVED', type: 'FINAL_APPROVED' },
      { new: true },
    );
    await this.cases.findByIdAndUpdate(plan.advisingCaseId, {
      approvedPlanId: id,
      status: 'APPROVED',
      approvedAt: new Date(),
      $push: {
        timeline: { status: 'APPROVED', changedAt: new Date(), actorId },
      },
    });
    await this.audit.record(
      plan.advisingCaseId,
      actorId,
      'PLAN_APPROVED',
      'AdvisingPlan',
      id,
    );
    return approved;
  }

  async getGraph(planId: string, actorId: string, role: Role) {
    await this.getPlan(planId, actorId, role);
    return (
      (await this.graphs.findOne({ planId }).lean()) ?? {
        planId,
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        layoutVersion: 1,
      }
    );
  }
  async saveGraph(
    planId: string,
    dto: SaveGraphDto,
    actorId: string,
    role: Role,
  ) {
    const plan = await this.getPlan(planId, actorId, role);
    if (plan.status === 'APPROVED')
      throw new ConflictException('Approved graphs are read-only');
    const nodeIds = new Set(dto.nodes.map((node) => node.id));
    if (nodeIds.size !== dto.nodes.length)
      throw new BadRequestException('Graph node IDs must be unique');
    if (
      dto.edges.some(
        (edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target),
      )
    )
      throw new BadRequestException('Graph contains a dangling edge');
    const selectedIds = new Set(
      this.extractCourseIds(plan.selectedCourses).map((courseId) =>
        courseId.toString(),
      ),
    );
    if (
      dto.nodes.some((node) => node.courseId && !selectedIds.has(node.courseId))
    )
      throw new BadRequestException(
        'Graph course nodes must belong to the plan',
      );
    const saved = await this.graphs.findOneAndUpdate(
      { planId },
      {
        ...dto,
        planId,
        nodes: dto.nodes,
        edges: dto.edges,
      },
      { upsert: true, new: true, runValidators: true },
    );
    await this.audit.record(
      plan.advisingCaseId,
      actorId,
      'GRAPH_SAVED',
      'AdvisingGraph',
      saved._id.toString(),
    );
    return saved;
  }

  async listNotes(caseId: string, actorId: string, role: Role) {
    await this.getCase(caseId, actorId, role);
    return this.notes
      .find({ advisingCaseId: caseId })
      .populate('authorId', 'name role')
      .sort({ createdAt: -1 })
      .lean();
  }
  async createNote(
    caseId: string,
    dto: CreateNoteDto,
    actorId: string,
    role: Role,
  ) {
    await this.getCase(caseId, actorId, role);
    const note = await this.notes.create({
      ...dto,
      advisingCaseId: caseId,
      authorId: actorId,
    });
    await this.audit.record(
      caseId,
      actorId,
      'NOTE_CREATED',
      'AdvisingNote',
      note._id.toString(),
    );
    return note;
  }
  async listAudit(caseId: string, actorId: string, role: Role) {
    await this.getCase(caseId, actorId, role);
    return this.audit.list(caseId);
  }
  async getStudentAdvising(studentId: string) {
    const advisingCase = await this.cases
      .findOne({ studentId })
      .sort({ updatedAt: -1 })
      .populate('assignedAdvisorId', 'name')
      .lean();
    if (!advisingCase) return null;
    const [plan, recommendations, notes] = await Promise.all([
      advisingCase.approvedPlanId
        ? this.plans
            .findById(advisingCase.approvedPlanId)
            .populate('selectedCourses', 'code nameAr nameEn creditHours')
            .lean()
        : null,
      this.recommendations
        .find({ advisingCaseId: advisingCase._id })
        .populate('courseId', 'code nameAr nameEn creditHours')
        .sort({ score: -1 })
        .lean(),
      this.notes
        .find({
          advisingCaseId: advisingCase._id,
          visibility: 'STUDENT_VISIBLE',
        })
        .lean(),
    ]);
    return { case: advisingCase, approvedPlan: plan, recommendations, notes };
  }
  async requestReview(studentId: string) {
    const item = await this.cases.findOneAndUpdate(
      { studentId, status: { $in: ['WAITING_FOR_STUDENT', 'APPROVED'] } },
      {
        status: 'REVISION_REQUESTED',
        $push: {
          timeline: {
            status: 'REVISION_REQUESTED',
            changedAt: new Date(),
            actorId: studentId,
          },
        },
      },
      { new: true },
    );
    if (!item)
      throw new BadRequestException('No advising plan is available for review');
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
    const item = await this.cases.findOneAndUpdate(
      { studentId, status: 'APPROVED' },
      { studentAcknowledgedAt: new Date() },
      { new: true },
    );
    if (!item)
      throw new BadRequestException('No approved advising plan is available');
    if (item.approvedPlanId) {
      await this.plans.findByIdAndUpdate(item.approvedPlanId, {
        studentAcknowledgedAt: new Date(),
      });
    }
    await this.audit.record(
      item._id,
      studentId,
      'PLAN_ACKNOWLEDGED',
      'AdvisingCase',
      item._id.toString(),
    );
    return item;
  }
  assistantDisabled(): never {
    throw new ServiceUnavailableException({
      code: 'FEATURE_DISABLED',
      message: 'The academic assistant is not enabled yet.',
    });
  }

  private assertCaseAccess(
    advisorId: string | undefined,
    actorId: string,
    role: Role,
  ) {
    if (role === 'staff' && advisorId !== actorId)
      throw new ForbiddenException('This advising case is not assigned to you');
  }
  private assertCaseOpen(status: string) {
    if (status === 'CLOSED')
      throw new BadRequestException(
        'Reopen the advising case before making changes',
      );
  }
  private objectIdOf(value: unknown): Types.ObjectId {
    if (value instanceof Types.ObjectId) return value;
    if (typeof value === 'object' && value && '_id' in value)
      return new Types.ObjectId(String(value._id));
    return new Types.ObjectId(String(value));
  }
  private extractCourseIds(value: unknown): Types.ObjectId[] {
    if (!Array.isArray(value)) return [];
    return value.map((item) => this.objectIdOf(item));
  }
  private escape(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  private isDuplicate(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: number }).code === 11000
    );
  }
}
