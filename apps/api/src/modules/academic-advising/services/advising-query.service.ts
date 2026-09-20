import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { Role } from '@student-portal/shared';
import { Course } from '../../courses/schemas/course.schema';
import { Grade } from '../../grades/schemas/grade.schema';
import { User } from '../../users/schemas/user.schema';
import { StudentProfile } from '../../students/schemas/student-profile.schema';
import { StudentAcademicProfile } from '../../registrations/schemas/student-academic-profile.schema';
import { CourseRegistration } from '../../registrations/schemas/course-registration.schema';
import { mergeAcademicCourseProgress } from '../../registrations/utils/academic-course-progress.util';
import { AdvisingCase } from '../schemas/advising-case.schema';
import { AdvisingPlan } from '../schemas/advising-plan.schema';
import { CourseRecommendation } from '../schemas/course-recommendation.schema';
import { AdvisingNote } from '../schemas/advising-note.schema';
import { AdvisingAuditLog } from '../schemas/advising-audit-log.schema';
import { AdvisingAuditService } from './advising-audit.service';
import type {
  AdvisingStudentsQueryDto,
  BulkAssignAdvisorDto,
  CreateNoteDto,
} from '../dto/advising.dto';

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
    avatarUrl?: string;
    gpa: number;
    academicLevel: string;
    semester: string;
  };
  summary: {
    passedCourses: number;
    failedCourses: number;
    completedCredits: number;
    remainingCredits: number;
    totalProgramCredits: number;
  };
  registration: {
    id: string;
    status: string;
    source: string;
    courses: string[];
  } | null;
  generationReadiness: {
    canGenerate: boolean;
    reason?:
      'FIRST_SEMESTER_REGISTRATION_REQUIRED' | 'FIRST_SEMESTER_GRADES_REQUIRED';
    missingCourseCodes: string[];
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
export class AdvisingQueryService {
  constructor(
    @InjectModel(AdvisingCase.name) private readonly cases: Model<AdvisingCase>,
    @InjectModel(AdvisingPlan.name) private readonly plans: Model<AdvisingPlan>,
    @InjectModel(CourseRecommendation.name)
    private readonly recommendations: Model<CourseRecommendation>,
    @InjectModel(AdvisingNote.name) private readonly notes: Model<AdvisingNote>,
    @InjectModel(AdvisingAuditLog.name)
    private readonly auditLogs: Model<AdvisingAuditLog>,
    @InjectModel(Course.name) private readonly courses: Model<Course>,
    @InjectModel(Grade.name) private readonly grades: Model<Grade>,
    @InjectModel(CourseRegistration.name)
    private readonly registrations: Model<CourseRegistration>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(StudentProfile.name)
    private readonly studentProfiles: Model<StudentProfile>,
    @InjectModel(StudentAcademicProfile.name)
    private readonly academicProfiles: Model<StudentAcademicProfile>,
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
              ...(query.academicYear
                ? { academicYear: query.academicYear }
                : {}),
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
      ...(role === 'staff' ? { _id: { $in: assignedStudentIds } } : {}),
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
    const [profiles, academics, cases, publishedGrades, gradedCourses] =
      await Promise.all([
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
                    ...(query.maxGpa !== undefined
                      ? { $lte: query.maxGpa }
                      : {}),
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
                ...(query.academicYear
                  ? { academicYear: query.academicYear }
                  : {}),
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
          },
          $setOnInsert: {
            studentId: academic.studentId,
            academicYear: dto.academicYear,
            semester: dto.semester,
            status: 'NOT_STARTED',
            riskLevel: 'LOW',
          },
          $push: {
            timeline: {
              status: existingCase?.status ?? 'NOT_STARTED',
              changedAt: new Date(),
              actorId: new Types.ObjectId(actorId),
              note: 'Advisor assigned',
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
      totalRequested: studentIds.length,
    };
  }

  async getCourseMap(
    caseId: string,
    actorId: string,
    role: Role,
  ): Promise<AdvisingCourseMapResponse> {
    const caseItem = await this.cases
      .findById(caseId)
      .populate('studentId', 'name studentCode avatarUrl')
      .lean();
    if (!caseItem) throw new NotFoundException('Advising case not found');
    this.assertCaseAccess(
      caseItem.assignedAdvisorId?.toString(),
      actorId,
      role,
    );

    const studentObj = caseItem.studentId as unknown as {
      _id: Types.ObjectId;
      name?: string;
      studentCode?: string;
      avatarUrl?: string;
    };
    const studentId = studentObj._id;

    const [
      profile,
      courses,
      grades,
      approvedPlan,
      recs,
      registration,
      firstRegistration,
    ] = await Promise.all([
      this.academicProfiles.findOne({ studentId }).lean(),
      this.courses.find({ isActive: true }).sort({ code: 1 }).lean(),
      this.grades
        .find({ studentId, isPublished: true })
        .sort({ courseCode: 1, examType: 1 })
        .lean(),
      caseItem.approvedPlanId
        ? this.plans.findById(caseItem.approvedPlanId).lean()
        : null,
      this.recommendations.find({ advisingCaseId: caseItem._id }).lean(),
      this.registrations
        .findOne({
          studentId,
          academicYear: caseItem.academicYear,
          semester: caseItem.semester,
          status: { $ne: 'rejected' },
        })
        .lean(),
      caseItem.semester === 'second'
        ? this.registrations
            .findOne({
              studentId,
              academicYear: caseItem.academicYear,
              semester: 'first',
              status: { $ne: 'rejected' },
            })
            .lean()
        : null,
    ]);

    if (!profile)
      throw new NotFoundException('Student academic profile not found');

    const gradeSummaryByCourse = this.summarizeGradesByCourse(grades);
    const courseCredits = Object.fromEntries(
      courses.map((course) => [
        course.code.trim().toUpperCase(),
        course.creditHours ?? 0,
      ]),
    );
    const progress = mergeAcademicCourseProgress({
      completedCourses: profile.completedCourses,
      failedCourses: profile.failedCourses,
      lowGradeCourses: profile.lowGradeCourses,
      grades,
      courseCredits,
    });
    const completed = new Set(progress.completedCourses);
    const failed = new Set(progress.failedCourses);
    const lowGrade = new Set(progress.lowGradeCourses);
    const completedCredits = progress.completedCourses.reduce(
      (total, code) => total + (courseCredits[code] ?? 0),
      0,
    );
    const totalProgramCredits = courses.reduce(
      (total, course) => total + (course.creditHours ?? 0),
      0,
    );

    const firstSemesterFinalized = new Set(
      [
        ...progress.completedCourses,
        ...progress.failedCourses,
        ...grades
          .filter(
            (grade) =>
              grade.academicYear === caseItem.academicYear &&
              grade.semester === 'first' &&
              grade.examType === 'final',
          )
          .map((grade) => grade.courseCode),
      ].map((code) => code.trim().toUpperCase()),
    );
    const missingFirstSemesterResults = (
      firstRegistration?.courses ?? []
    ).filter((code) => !firstSemesterFinalized.has(code.trim().toUpperCase()));
    const generationReadiness =
      caseItem.semester !== 'second'
        ? { canGenerate: true as const, missingCourseCodes: [] }
        : !firstRegistration?.courses.length
          ? {
              canGenerate: false as const,
              reason: 'FIRST_SEMESTER_REGISTRATION_REQUIRED' as const,
              missingCourseCodes: [],
            }
          : missingFirstSemesterResults.length > 0
            ? {
                canGenerate: false as const,
                reason: 'FIRST_SEMESTER_GRADES_REQUIRED' as const,
                missingCourseCodes: missingFirstSemesterResults,
              }
            : { canGenerate: true as const, missingCourseCodes: [] };

    const planCourseIds = new Set(
      (approvedPlan?.selectedCourses ?? []).map((id) => id.toString()),
    );
    const suggestedCourseIds = new Set(
      recs
        .filter(
          (rec) =>
            rec.isRecommendedForSemester ||
            (rec.isRecommendedForSemester == null && rec.eligible),
        )
        .map((rec) => rec.courseId.toString()),
    );

    return {
      student: {
        name: studentObj.name,
        studentCode: studentObj.studentCode,
        avatarUrl: studentObj.avatarUrl,
        gpa: progress.calculatedGpa ?? profile.gpa,
        academicLevel: profile.academicLevel,
        semester: caseItem.semester,
      },
      summary: {
        passedCourses: progress.completedCourses.length,
        failedCourses: progress.failedCourses.length,
        completedCredits,
        remainingCredits: Math.max(0, totalProgramCredits - completedCredits),
        totalProgramCredits,
      },
      registration: registration
        ? {
            id: registration._id.toString(),
            status: registration.status,
            source: registration.source,
            courses: registration.courses,
          }
        : null,
      generationReadiness,
      selectedCourses: approvedPlan
        ? courses
            .filter((c) => planCourseIds.has(c._id.toString()))
            .map((c) => c.code)
        : [],
      suggestedCourses: courses
        .filter((c) => suggestedCourseIds.has(c._id.toString()))
        .map((c) => c.code),
      courses: courses.map((course) => {
        const code = course.code.toUpperCase();
        const gradeSummary = gradeSummaryByCourse.get(code);
        const gradePassed = gradeSummary
          ? gradeSummary.percentage >= 50 && gradeSummary.hasFinal
          : false;
        const gradeFailed = gradeSummary
          ? gradeSummary.hasFinal && gradeSummary.percentage < 50
          : false;
        const isPlanned = planCourseIds.has(course._id.toString());
        const isSuggested = suggestedCourseIds.has(course._id.toString());

        const progressStatus =
          completed.has(code) || gradePassed
            ? 'passed'
            : failed.has(code) || gradeFailed
              ? 'failed'
              : lowGrade.has(code)
                ? 'low_grade'
                : isPlanned
                  ? 'planned'
                  : isSuggested
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

  async getStudentAdvising(studentId: string) {
    const sid = new Types.ObjectId(studentId);
    const caseItem = await this.cases
      .findOne({ studentId: sid })
      .sort({ updatedAt: -1 })
      .populate('assignedAdvisorId', 'name email')
      .lean();

    if (!caseItem) return null;

    const [approvedPlan, recommendations, notes] = await Promise.all([
      caseItem.approvedPlanId
        ? this.plans
            .findById(caseItem.approvedPlanId)
            .populate(
              'selectedCourses',
              'code nameAr nameEn creditHours semester',
            )
            .lean()
        : null,
      this.recommendations
        .find({ advisingCaseId: caseItem._id })
        .populate('courseId', 'code nameAr nameEn creditHours semester')
        .sort({ score: -1 })
        .lean()
        .then((items) => items.filter((item) => item.courseId != null)),
      this.notes
        .find({ caseId: caseItem._id, visibility: 'STUDENT' })
        .populate('authorId', 'name role')
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    return {
      case: caseItem,
      approvedPlan,
      recommendations,
      notes,
    };
  }

  async listNotes(caseId: string, actorId: string, role: Role) {
    const caseItem = await this.cases.findById(caseId).lean();
    if (!caseItem) throw new NotFoundException('Advising case not found');
    this.assertCaseAccess(
      caseItem.assignedAdvisorId?.toString(),
      actorId,
      role,
    );

    return this.notes
      .find({ caseId: new Types.ObjectId(caseId) })
      .populate('authorId', 'name email role')
      .sort({ createdAt: -1 })
      .lean();
  }

  async createNote(
    caseId: string,
    dto: CreateNoteDto,
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

    const note = await this.notes.create({
      caseId: caseItem._id,
      authorId: new Types.ObjectId(actorId),
      visibility: dto.visibility,
      content: dto.content,
      relatedCourseId: dto.relatedCourseId
        ? new Types.ObjectId(dto.relatedCourseId)
        : undefined,
      relatedNodeId: dto.relatedNodeId,
    });

    await this.audit.record(
      caseItem._id,
      actorId,
      'NOTE_CREATED',
      'AdvisingNote',
      note._id.toString(),
    );
    return note;
  }

  async listAudit(caseId: string, actorId: string, role: Role) {
    const caseItem = await this.cases.findById(caseId).lean();
    if (!caseItem) throw new NotFoundException('Advising case not found');
    this.assertCaseAccess(
      caseItem.assignedAdvisorId?.toString(),
      actorId,
      role,
    );

    return this.auditLogs
      .find({ advisingCaseId: new Types.ObjectId(caseId) })
      .populate('actorId', 'name email role')
      .sort({ createdAt: -1 })
      .lean();
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

  private assertCaseAccess(
    advisorId: string | undefined,
    actorId: string,
    role: Role,
  ) {
    if (role === 'staff' && advisorId !== actorId) {
      throw new ForbiddenException('You do not have access to this case');
    }
  }

  private escape(term: string) {
    return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
