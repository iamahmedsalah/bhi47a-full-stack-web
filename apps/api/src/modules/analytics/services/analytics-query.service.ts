import { courseCurriculumFilter } from '../../courses/utils/course-filter.util';
import {
  normalizeDepartment,
  departmentAliases,
  type CourseLevel,
} from '@student-portal/shared';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model, type FilterQuery } from 'mongoose';
import { Quiz, QuizDocument } from '../../quizzes/schemas/quiz.schema';
import {
  QuizSubmission,
  QuizSubmissionDocument,
} from '../../quizzes/schemas/quiz-submission.schema';
import {
  QuizAttempt,
  QuizAttemptDocument,
} from '../../quizzes/schemas/quiz-attempt.schema';
import { Course, CourseDocument } from '../../courses/schemas/course.schema';
import {
  CourseRegistration,
  CourseRegistrationDocument,
} from '../../registrations/schemas/course-registration.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Grade, GradeDocument } from '../../grades/schemas/grade.schema';
import {
  Complaint,
  ComplaintDocument,
} from '../../complaints/schemas/complaint.schema';
import {
  StudentProfile,
  StudentProfileDocument,
} from '../../students/schemas/student-profile.schema';
import {
  StudentAcademicProfile,
  StudentAcademicProfileDocument,
} from '../../registrations/schemas/student-academic-profile.schema';
import { AnalyticsQueryDto } from '../dto/analytics-query.dto';
import type { AuthenticatedUser } from '../../auth/types/authenticated-request';
import {
  isAssignedToCourse,
  isTeachingStaff,
} from '../../courses/utils/course-staff.util';
import {
  formatStaffDisplayName,
  type QuizItemAnalytics,
  type StaffQuizStats,
  type CourseItemAnalytics,
  type AcademicAnalyticsOverview,
} from '@student-portal/shared';

@Injectable()
export class AnalyticsQueryService {
  private readonly logger = new Logger(AnalyticsQueryService.name);

  constructor(
    @InjectModel(Quiz.name) private readonly quizModel: Model<QuizDocument>,
    @InjectModel(QuizSubmission.name)
    private readonly submissionModel: Model<QuizSubmissionDocument>,
    @InjectModel(QuizAttempt.name)
    private readonly attemptModel: Model<QuizAttemptDocument>,
    @InjectModel(Course.name)
    private readonly courseModel: Model<CourseDocument>,
    @InjectModel(CourseRegistration.name)
    private readonly registrationModel: Model<CourseRegistrationDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Grade.name) private readonly gradeModel: Model<GradeDocument>,
    @InjectModel(Complaint.name)
    private readonly complaintModel: Model<ComplaintDocument>,
    @InjectModel(StudentProfile.name)
    private readonly studentProfileModel: Model<StudentProfileDocument>,
    @InjectModel(StudentAcademicProfile.name)
    private readonly academicProfileModel: Model<StudentAcademicProfileDocument>,
  ) {}

  private courseScope(query: AnalyticsQueryDto): FilterQuery<CourseDocument> {
    return courseCurriculumFilter({
      department: normalizeDepartment(query.department),
      level: query.level as CourseLevel | undefined,
      semester: query.semester,
    });
  }

  /**
   * Determine if the caller should be restricted to courses/quizzes they own or are assigned to.
   */
  private async getStaffAccessibleCourseIds(
    user: AuthenticatedUser,
  ): Promise<Types.ObjectId[] | null> {
    if (user.role === 'admin') return null; // Unrestricted
    if (user.role === 'staff' && isTeachingStaff(user.staffType)) {
      const allCourses = await this.courseModel
        .find()
        .select(
          '_id doctorId doctorIds doctors teachingAssistantIds teachingAssistants teachingAssistantId teachingAssistant',
        )
        .lean();
      const assigned = allCourses.filter((c) =>
        isAssignedToCourse(c, user._id),
      );
      return assigned.map((c) => c._id);
    }
    return null;
  }

  /**
   * Resolves enrolled student counts per course code from course_registrations.
   */
  async getEnrolledCountsMap(
    academicYear?: string,
    semester?: string,
  ): Promise<Map<string, number>> {
    const regFilter: FilterQuery<CourseRegistrationDocument> = {
      status: { $in: ['approved', 'registered', 'confirmed'] },
    };
    if (academicYear) regFilter.academicYear = academicYear;
    if (semester) regFilter.semester = semester;

    const pipeline = [
      { $match: regFilter },
      { $unwind: '$courses' },
      {
        $group: {
          _id: {
            course: { $toUpper: { $trim: { input: '$courses' } } },
            student: { $toString: '$studentId' },
          },
        },
      },
      { $group: { _id: '$_id.course', count: { $sum: 1 } } },
    ];

    const results = await this.registrationModel.aggregate(pipeline);
    const countMap = new Map<string, number>();
    for (const r of results) {
      if (r._id) {
        countMap.set(String(r._id).toUpperCase(), r.count);
      }
    }
    return countMap;
  }

  /**
   * 1. Get Quizzes Analytics with participant counts, eligible students, and pass rates.
   */
  async getQuizzesAnalytics(
    query: AnalyticsQueryDto,
    user: AuthenticatedUser,
  ): Promise<QuizItemAnalytics[]> {
    const staffCourseIds = await this.getStaffAccessibleCourseIds(user);
    const quizFilter: FilterQuery<QuizDocument> = {};

    if (staffCourseIds) {
      quizFilter.$or = [
        { courseId: { $in: staffCourseIds } },
        { creatorId: new Types.ObjectId(user._id) },
      ];
    }
    if (query.academicYear) quizFilter.academicYear = query.academicYear;
    if (query.semester) quizFilter.semester = query.semester;
    if (query.department || query.level) {
      const courses = await this.courseModel
        .find(this.courseScope(query))
        .sort({ code: 1 })
        .lean();
      quizFilter.$and = [
        {
          $expr: {
            $in: [
              { $toString: '$courseId' },
              courses.map((course) => String(course._id)),
            ],
          },
        },
      ];
    }

    const quizzes = await this.quizModel
      .find(quizFilter)
      .sort({ createdAt: -1 })
      .lean();

    if (quizzes.length === 0) return [];

    const enrolledMap = await this.getEnrolledCountsMap(
      query.academicYear,
      query.semester,
    );

    // Aggregate submissions per quiz
    // Aggregation pipelines do not apply Mongoose ObjectId casting. Older imports
    // stored references as strings; include both representations.
    const quizIds = quizzes.flatMap((q) => [q._id, String(q._id)]);
    const submissionAgg = await this.submissionModel.aggregate([
      { $match: { quizId: { $in: quizIds } } },
      {
        $group: {
          _id: { $toString: '$quizId' },
          totalSubmissions: { $sum: 1 },
          passedCount: { $sum: { $cond: ['$isPassed', 1, 0] } },
          failedCount: { $sum: { $cond: ['$isPassed', 0, 1] } },
          avgScore: { $avg: '$score' },
          avgPercentage: { $avg: '$percentage' },
          highestScore: { $max: '$score' },
          lowestScore: { $min: '$score' },
          avgDurationSeconds: { $avg: '$durationSeconds' },
        },
      },
    ]);
    const subMap = new Map(submissionAgg.map((s) => [String(s._id), s]));

    // Aggregate attempts (for timeouts and exits)
    const attemptAgg = await this.attemptModel.aggregate([
      { $match: { quizId: { $in: quizIds } } },
      {
        $group: {
          _id: { $toString: '$quizId' },
          startedCount: { $sum: 1 },
          terminatedByExitCount: {
            $sum: { $cond: [{ $eq: ['$status', 'terminated_by_exit'] }, 1, 0] },
          },
          timedOutCount: {
            $sum: { $cond: [{ $eq: ['$status', 'timed_out'] }, 1, 0] },
          },
        },
      },
    ]);
    const attemptMap = new Map(attemptAgg.map((a) => [String(a._id), a]));

    // Fetch creators staffType and names
    const creatorIds = [
      ...new Set(quizzes.map((q) => q.creatorId).filter(Boolean)),
    ];
    const creators = await this.userModel
      .find({ _id: { $in: creatorIds } })
      .select('_id name nameAr staffType role')
      .lean();
    const creatorMap = new Map(creators.map((c) => [String(c._id), c]));

    return quizzes.map((q) => {
      const qId = String(q._id);
      const sub = subMap.get(qId);
      const att = attemptMap.get(qId);
      const creator = q.creatorId ? creatorMap.get(String(q.creatorId)) : null;

      const codeUpper = (q.courseCode || '').toUpperCase();
      const eligibleCount =
        enrolledMap.get(codeUpper) ??
        enrolledMap.get(String(q.courseId)) ??
        sub?.totalSubmissions ??
        0;

      const submittedCount = sub?.totalSubmissions ?? 0;
      const startedCount = Math.max(att?.startedCount ?? 0, submittedCount);
      const notStartedCount = Math.max(0, eligibleCount - startedCount);
      const passedCount = sub?.passedCount ?? 0;
      const failedCount = sub?.failedCount ?? 0;

      const participationRate =
        eligibleCount > 0
          ? Math.round((submittedCount / eligibleCount) * 1000) / 10
          : submittedCount > 0
            ? 100
            : 0;
      const passRate =
        submittedCount > 0
          ? Math.round((passedCount / submittedCount) * 1000) / 10
          : 0;

      return {
        quizId: qId,
        quizTitle: q.title,
        quizTitleAr: q.titleAr,
        courseId: String(q.courseId),
        courseCode: q.courseCode || '',
        courseName: q.courseName || '',
        courseNameAr: q.courseNameAr,
        creatorId: String(q.creatorId || ''),
        creatorName: creator?.name || q.creatorName || '',
        creatorNameAr: creator?.nameAr,
        creatorStaffType:
          creator?.staffType ||
          (creator?.role === 'admin' ? 'admin' : 'doctor'),
        academicYear: q.academicYear,
        semester: q.semester,
        durationMinutes: q.durationMinutes ?? 15,
        totalMarks: q.totalMarks ?? 10,
        passingMarks: q.passingMarks ?? 5,
        startsAt: q.startsAt,
        endsAt: q.endsAt,
        isPublished: Boolean(q.isPublished),
        questionsCount: Array.isArray(q.questions) ? q.questions.length : 0,
        eligibleCount,
        startedCount,
        submittedCount,
        notStartedCount,
        passedCount,
        failedCount,
        participationRate,
        passRate,
        avgScore: sub ? Math.round((sub.avgScore ?? 0) * 10) / 10 : 0,
        avgPercentage: sub ? Math.round((sub.avgPercentage ?? 0) * 10) / 10 : 0,
        highestScore: sub?.highestScore ?? 0,
        lowestScore: sub?.lowestScore ?? 0,
        avgDurationSeconds: sub ? Math.round(sub.avgDurationSeconds ?? 0) : 0,
        terminatedByExitCount: att?.terminatedByExitCount ?? 0,
        timedOutCount: att?.timedOutCount ?? 0,
      };
    });
  }

  /**
   * 2. Get Staff Quiz Performance breakdown (Doctors, Assistant Lecturers, Teaching Assistants).
   */
  async getStaffQuizPerformance(
    query: AnalyticsQueryDto,
    user: AuthenticatedUser,
  ): Promise<StaffQuizStats[]> {
    const isAcademic = user.role === 'staff' && isTeachingStaff(user.staffType);

    const staffFilter: FilterQuery<UserDocument> = {
      $or: [
        { role: 'staff' },
        {
          staffType: {
            $in: ['doctor', 'assistant_lecturer', 'teaching_assistant'],
          },
        },
      ],
    };
    if (isAcademic) {
      staffFilter._id = new Types.ObjectId(user._id);
    }

    const staffUsers = await this.userModel
      .find(staffFilter)
      .select('_id name nameAr staffType role titlePrefix')
      .lean();

    const quizAnalytics = await this.getQuizzesAnalytics(query, user);

    // Group quizzes by creatorId
    const staffQuizMap = new Map<string, QuizItemAnalytics[]>();
    for (const qa of quizAnalytics) {
      if (qa.creatorId) {
        const list = staffQuizMap.get(qa.creatorId) || [];
        list.push(qa);
        staffQuizMap.set(qa.creatorId, list);
      }
    }

    // Find assigned courses count for each staff member
    const allCourses = await this.courseModel
      .find()
      .select(
        '_id doctorId doctorIds doctors teachingAssistantIds teachingAssistants teachingAssistantId teachingAssistant',
      )
      .lean();

    return staffUsers.map((staff) => {
      const sId = String(staff._id);
      const quizzes = staffQuizMap.get(sId) || [];
      const assignedCount = allCourses.filter((c) =>
        isAssignedToCourse(c, sId),
      ).length;

      const totalQuizzes = quizzes.length;
      const publishedCount = quizzes.filter((q) => q.isPublished).length;
      const draftCount = totalQuizzes - publishedCount;

      const totalEligible = quizzes.reduce(
        (sum, q) => sum + q.eligibleCount,
        0,
      );
      const totalSubmissions = quizzes.reduce(
        (sum, q) => sum + q.submittedCount,
        0,
      );
      const totalPassed = quizzes.reduce((sum, q) => sum + q.passedCount, 0);

      const avgParticipationRate =
        totalEligible > 0
          ? Math.round((totalSubmissions / totalEligible) * 1000) / 10
          : 0;
      const avgPassRate =
        totalSubmissions > 0
          ? Math.round((totalPassed / totalSubmissions) * 1000) / 10
          : 0;

      const validPercentages = quizzes
        .filter((q) => q.submittedCount > 0)
        .map((q) => q.avgPercentage);
      const avgScorePercentage =
        validPercentages.length > 0
          ? Math.round(
              (validPercentages.reduce((a, b) => a + b, 0) /
                validPercentages.length) *
                10,
            ) / 10
          : 0;

      return {
        staffId: sId,
        staffName: staff.name,
        staffNameAr: staff.nameAr,
        staffType: staff.staffType || 'doctor',
        titlePrefix: (staff as any).titlePrefix,
        role: staff.role,
        assignedCoursesCount: assignedCount,
        quizzesCreatedCount: totalQuizzes,
        publishedQuizzesCount: publishedCount,
        draftQuizzesCount: draftCount,
        totalEligibleStudents: totalEligible,
        totalSubmissions,
        avgParticipationRate,
        avgPassRate,
        avgScorePercentage,
        lastQuizCreatedAt: quizzes[0]?.startsAt ?? null,
      };
    });
  }

  /**
   * 3. Get Course Analytics: Enrolled students count, Quizzes, Midterm/Final pass rates.
   */
  async getCoursesAnalytics(
    query: AnalyticsQueryDto,
    user: AuthenticatedUser,
  ): Promise<CourseItemAnalytics[]> {
    const staffCourseIds = await this.getStaffAccessibleCourseIds(user);
    const courseFilter: FilterQuery<CourseDocument> = this.courseScope(query);
    if (staffCourseIds) {
      courseFilter._id = { $in: staffCourseIds };
    }

    const courses = await this.courseModel
      .find(courseFilter)
      .sort({ department: 1, level: 1, code: 1 })
      .lean();

    if (courses.length === 0) return [];

    const enrolledMap = await this.getEnrolledCountsMap(
      query.academicYear,
      query.semester,
    );
    const quizzes = await this.getQuizzesAnalytics(query, user);

    // Group quizzes by courseId or courseCode
    const quizMap = new Map<string, QuizItemAnalytics[]>();
    for (const q of quizzes) {
      const key = q.courseCode.toUpperCase();
      const list = quizMap.get(key) || [];
      list.push(q);
      quizMap.set(key, list);
    }

    // Aggregate grades for midterm and final exams
    const gradeMatch: FilterQuery<GradeDocument> = {
      isPublished: true,
    };
    if (query.academicYear) gradeMatch.academicYear = query.academicYear;
    if (query.semester) gradeMatch.semester = query.semester;

    const gradesAgg = await this.gradeModel.aggregate([
      { $match: gradeMatch },
      {
        $group: {
          _id: {
            courseCode: { $toUpper: '$courseCode' },
            examType: '$examType',
          },
          totalRecorded: { $sum: 1 },
          absentCount: {
            $sum: { $cond: [{ $in: ['$status', ['absent', 'banned']] }, 1, 0] },
          },
          passedCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', 'present'] },
                    {
                      $gte: [
                        {
                          $cond: [
                            { $gt: ['$maxGrade', 0] },
                            { $divide: ['$grade', '$maxGrade'] },
                            0,
                          ],
                        },
                        0.5,
                      ],
                    },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    const gradeMap = new Map<
      string,
      { totalRecorded: number; absentCount: number; passedCount: number }
    >();
    for (const g of gradesAgg) {
      const key = `${g._id.courseCode}__${g._id.examType}`;
      gradeMap.set(key, g);
    }

    // Resolve Doctor and TA names
    const staffIdsToFetch: Types.ObjectId[] = [];
    courses.forEach((c) => {
      if (c.doctorId && Types.ObjectId.isValid(c.doctorId)) {
        staffIdsToFetch.push(new Types.ObjectId(c.doctorId));
      }
      if (Array.isArray(c.doctorIds)) {
        c.doctorIds.forEach((id: any) => {
          if (Types.ObjectId.isValid(id))
            staffIdsToFetch.push(new Types.ObjectId(id));
        });
      }
      if (Array.isArray(c.teachingAssistantIds)) {
        c.teachingAssistantIds.forEach((id: any) => {
          if (Types.ObjectId.isValid(id))
            staffIdsToFetch.push(new Types.ObjectId(id));
        });
      }
    });

    const staffList = await this.userModel
      .find({ _id: { $in: staffIdsToFetch } })
      .select('_id name nameAr staffType role')
      .lean();
    const staffLookup = new Map(staffList.map((s) => [String(s._id), s]));

    return courses.map((c) => {
      const codeUpper = (c.code || '').toUpperCase();
      const enrolled = enrolledMap.get(codeUpper) ?? 0;
      const cQuizzes = quizMap.get(codeUpper) || [];

      // Doctors
      const docNames: string[] = [];
      if (c.doctorId && staffLookup.has(String(c.doctorId))) {
        docNames.push(
          formatStaffDisplayName(
            staffLookup.get(String(c.doctorId)),
            query.locale || 'ar',
          ),
        );
      }
      if (Array.isArray(c.doctorIds)) {
        c.doctorIds.forEach((id: any) => {
          const s = staffLookup.get(String(id));
          if (
            s &&
            !docNames.includes(formatStaffDisplayName(s, query.locale || 'ar'))
          ) {
            docNames.push(formatStaffDisplayName(s, query.locale || 'ar'));
          }
        });
      }

      // TAs
      const taNames: string[] = [];
      if (Array.isArray(c.teachingAssistantIds)) {
        c.teachingAssistantIds.forEach((id: any) => {
          const s = staffLookup.get(String(id));
          if (s) taNames.push(formatStaffDisplayName(s, query.locale || 'ar'));
        });
      }

      // Quiz aggregates
      const quizzesCount = cQuizzes.length;
      const avgQuizParticipation =
        quizzesCount > 0
          ? Math.round(
              (cQuizzes.reduce((sum, q) => sum + q.participationRate, 0) /
                quizzesCount) *
                10,
            ) / 10
          : 0;
      const avgQuizPass =
        quizzesCount > 0
          ? Math.round(
              (cQuizzes.reduce((sum, q) => sum + q.passRate, 0) /
                quizzesCount) *
                10,
            ) / 10
          : 0;

      // Midterm
      const mid = gradeMap.get(`${codeUpper}__midterm`);
      const midGraded = mid?.totalRecorded ?? 0;
      const midAbsent = mid?.absentCount ?? 0;
      const midPassed = mid?.passedCount ?? 0;
      const midtermPassRate =
        midGraded > 0 ? Math.round((midPassed / midGraded) * 1000) / 10 : 0;

      // Final
      const fin = gradeMap.get(`${codeUpper}__final`);
      const finGraded = fin?.totalRecorded ?? 0;
      const finAbsent = fin?.absentCount ?? 0;
      const finPassed = fin?.passedCount ?? 0;
      const finalPassRate =
        finGraded > 0 ? Math.round((finPassed / finGraded) * 1000) / 10 : 0;

      const overallPassRate = finGraded > 0 ? finalPassRate : midtermPassRate;

      return {
        courseId: String(c._id),
        courseCode: c.code || '',
        courseName: c.name || '',
        courseNameAr: c.nameAr,
        department: c.department || '',
        level: c.level || '1',
        creditHours: c.creditHours ?? 3,
        doctorNames: docNames,
        teachingAssistantNames: taNames,
        enrolledStudentsCount: enrolled,
        quizzesCount,
        avgQuizParticipationRate: avgQuizParticipation,
        avgQuizPassRate: avgQuizPass,
        midtermGradedCount: midGraded,
        midtermAbsentCount: midAbsent,
        midtermPassRate,
        finalGradedCount: finGraded,
        finalAbsentCount: finAbsent,
        finalPassRate,
        overallPassRate,
      };
    });
  }

  /**
   * 4. Get Student Academic Data (Privacy-safe: no national ID, no phone).
   * Queries StudentProfile joined with StudentAcademicProfile.
   */
  async getStudentsAnalytics(query: AnalyticsQueryDto): Promise<any[]> {
    const profileFilter: FilterQuery<StudentProfileDocument> = {};
    if (query.academicYear) profileFilter.academicYear = query.academicYear;
    if (query.semester) profileFilter.semester = query.semester;
    if (query.department) {
      const department = normalizeDepartment(query.department);
      profileFilter.department = department
        ? {
            $in: [
              ...departmentAliases(department),
              ...(department === 'GENERAL'
                ? ['GEN']
                : department === 'ACCOUNTING'
                  ? ['ACC']
                  : []),
            ].map(
              (alias) =>
                new RegExp(
                  `^${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
                  'i',
                ),
            ),
          }
        : query.department;
    }
    if (query.level) profileFilter.level = query.level;

    const profiles = await this.studentProfileModel
      .find(profileFilter)
      .select(
        'userId studentCode fullName fullNameAr fullNameEn department level enrollmentStatus gpa',
      )
      .sort({ studentCode: 1 })
      .lean();

    if (profiles.length === 0) return [];

    const userIds = profiles
      .map((p) => p.userId)
      .filter(Boolean)
      .map(String);
    const userReferences = userIds.flatMap((id) =>
      Types.ObjectId.isValid(id) ? [id, new Types.ObjectId(id)] : [id],
    );

    // Fetch Academic Profiles for GPA & Earned Hours
    const academicProfiles = await this.academicProfileModel
      .find({ $expr: { $in: [{ $toString: '$studentId' }, userIds] } })
      .select('studentId gpa completedCreditHours')
      .lean();
    const gpaMap = new Map(
      academicProfiles.map((ap) => [String(ap.studentId), ap]),
    );

    // Get count of registered courses per student
    const termFilter = {
      ...(query.academicYear ? { academicYear: query.academicYear } : {}),
      ...(query.semester ? { semester: query.semester } : {}),
    };
    const regAgg = await this.registrationModel.aggregate([
      {
        $match: {
          studentId: { $in: userReferences },
          ...termFilter,
          status: { $in: ['approved', 'registered', 'confirmed'] },
        },
      },
      { $unwind: '$courses' },
      {
        $group: {
          _id: { $toString: '$studentId' },
          enrolledCoursesCount: { $sum: 1 },
        },
      },
    ]);
    const regMap = new Map(
      regAgg.map((r) => [String(r._id), r.enrolledCoursesCount]),
    );

    // Restrict student quiz metrics to the same term and course scope as the report.
    const quizFilter: FilterQuery<QuizDocument> = { ...termFilter };
    if (query.department || query.level) {
      const courses = await this.courseModel
        .find(this.courseScope(query))
        .sort({ code: 1 })
        .lean();
      quizFilter.$expr = {
        $in: [
          { $toString: '$courseId' },
          courses.map((course) => String(course._id)),
        ],
      };
    }
    const scopedQuizzes = await this.quizModel
      .find(quizFilter)
      .sort({ createdAt: -1 })
      .lean();
    const scopedQuizIds = scopedQuizzes.flatMap((q) => [q._id, String(q._id)]);

    // Quiz submissions per student
    const subAgg = await this.submissionModel.aggregate([
      {
        $match: {
          studentId: { $in: userReferences },
          quizId: { $in: scopedQuizIds },
        },
      },
      {
        $group: {
          _id: { $toString: '$studentId' },
          completedQuizzes: { $sum: 1 },
          passedQuizzes: { $sum: { $cond: ['$isPassed', 1, 0] } },
          avgScorePercentage: { $avg: '$percentage' },
        },
      },
    ]);
    const subMap = new Map(subAgg.map((s) => [String(s._id), s]));

    // Complaints per student
    const compAgg = await this.complaintModel.aggregate([
      { $match: { studentId: { $in: userReferences } } },
      { $group: { _id: { $toString: '$studentId' }, count: { $sum: 1 } } },
    ]);
    const compMap = new Map(compAgg.map((c) => [String(c._id), c.count]));

    return profiles.map((p) => {
      const uId = String(p.userId);
      const sub = subMap.get(uId);
      const ap = gpaMap.get(uId);
      const legacyGpa = (p as typeof p & { gpa?: number }).gpa;
      const gpa = ap?.gpa ?? legacyGpa;
      const enrolledCourses = regMap.get(uId) ?? 0;
      const completed = sub?.completedQuizzes ?? 0;
      const passed = sub?.passedQuizzes ?? 0;
      const avgScore = sub
        ? Math.round((sub.avgScorePercentage ?? 0) * 10) / 10
        : 0;
      const complaintsCount = compMap.get(uId) ?? 0;

      return {
        studentId: uId,
        studentCode: p.studentCode || '',
        name: p.fullNameEn || p.fullName || '',
        nameAr: p.fullNameAr || p.fullName || '',
        department: p.department || '',
        level: p.level || '1',
        enrollmentStatus: p.enrollmentStatus || 'active',
        gpa: gpa != null ? Math.round(gpa * 100) / 100 : null,
        totalEarnedHours: ap?.completedCreditHours ?? null,
        enrolledCoursesCount: enrolledCourses,
        completedQuizzes: completed,
        passedQuizzes: passed,
        avgQuizScorePercentage: completed > 0 ? avgScore : null,
        complaintsCount,
      };
    });
  }

  /**
   * 5. Get Detailed Submissions (for optional Sheet 10).
   */
  async getDetailedSubmissions(
    query: AnalyticsQueryDto,
    user: AuthenticatedUser,
  ): Promise<any[]> {
    const quizzes = await this.getQuizzesAnalytics(query, user);
    const quizMap = new Map(quizzes.map((q) => [q.quizId, q]));

    return this.submissionModel
      .find({
        $expr: {
          $in: [{ $toString: '$quizId' }, quizzes.map((quiz) => quiz.quizId)],
        },
      })
      .sort({ submittedAt: -1 })
      .limit(5000)
      .lean()
      .then((subs) =>
        subs.map((s) => {
          const q = quizMap.get(String(s.quizId));
          return {
            studentCode: s.studentCode,
            studentName: s.studentName,
            studentNameAr: s.studentNameAr,
            courseCode: q?.courseCode || '',
            courseName: q?.courseName || '',
            quizTitle: q?.quizTitle || '',
            creatorName: q?.creatorName || '',
            score: s.score,
            totalMarks: s.totalMarks,
            percentage: s.percentage,
            isPassed: s.isPassed,
            startedAt: s.startedAt,
            submittedAt: s.submittedAt,
            durationSeconds: s.durationSeconds,
          };
        }),
      );
  }

  /**
   * 6. Get General Overview and Aggregated KPIs.
   */
  async getOverview(
    query: AnalyticsQueryDto,
    user: AuthenticatedUser,
  ): Promise<AcademicAnalyticsOverview> {
    const [
      totalStudents,
      activeStudents,
      suspendedStudents,
      withdrawnStudents,
      graduatedStudents,
    ] = await Promise.all([
      this.studentProfileModel.countDocuments(),
      this.studentProfileModel.countDocuments({ enrollmentStatus: 'active' }),
      this.studentProfileModel.countDocuments({
        enrollmentStatus: 'suspended',
      }),
      this.studentProfileModel.countDocuments({
        enrollmentStatus: 'withdrawn',
      }),
      this.studentProfileModel.countDocuments({
        enrollmentStatus: 'graduated',
      }),
    ]);

    const activeRate =
      totalStudents > 0
        ? Math.round((activeStudents / totalStudents) * 1000) / 10
        : 0;

    const [totalCourses, activeCourses] = await Promise.all([
      this.courseModel.countDocuments(),
      this.courseModel.countDocuments({ isActive: true }),
    ]);

    const [doctorCount, asstLectCount, taCount] = await Promise.all([
      this.userModel.countDocuments({ staffType: 'doctor' }),
      this.userModel.countDocuments({ staffType: 'assistant_lecturer' }),
      this.userModel.countDocuments({ staffType: 'teaching_assistant' }),
    ]);

    const [totalComplaints, resolvedComplaints, urgentComplaints] =
      await Promise.all([
        this.complaintModel.countDocuments(),
        this.complaintModel.countDocuments({
          status: { $in: ['resolved', 'closed'] },
        }),
        this.complaintModel.countDocuments({ priority: 'urgent' }),
      ]);

    const complaintResolutionRate =
      totalComplaints > 0
        ? Math.round((resolvedComplaints / totalComplaints) * 1000) / 10
        : 0;

    const [quizzes, staffPerf, coursePerf] = await Promise.all([
      this.getQuizzesAnalytics(query, user),
      this.getStaffQuizPerformance(query, user),
      this.getCoursesAnalytics(query, user),
    ]);

    const totalQuizzes = quizzes.length;
    const publishedQuizzes = quizzes.filter((q) => q.isPublished).length;
    const now = new Date();
    const activeQuizzes = quizzes.filter(
      (q) => q.isPublished && (!q.endsAt || new Date(q.endsAt) > now),
    ).length;

    const avgQuizPart =
      totalQuizzes > 0
        ? Math.round(
            (quizzes.reduce((sum, q) => sum + q.participationRate, 0) /
              totalQuizzes) *
              10,
          ) / 10
        : 0;

    const avgQuizPass =
      totalQuizzes > 0
        ? Math.round(
            (quizzes.reduce((sum, q) => sum + q.passRate, 0) / totalQuizzes) *
              10,
          ) / 10
        : 0;

    return {
      kpis: {
        totalStudents,
        activeStudents,
        activeRate,
        suspendedStudents,
        withdrawnStudents,
        graduatedStudents,
        totalCourses,
        activeCourses,
        totalStaff: doctorCount + asstLectCount + taCount,
        doctorCount,
        assistantLecturerCount: asstLectCount,
        teachingAssistantCount: taCount,
        totalQuizzes,
        publishedQuizzes,
        activeQuizzes,
        avgQuizParticipationRate: avgQuizPart,
        avgQuizPassRate: avgQuizPass,
        totalComplaints,
        resolvedComplaints,
        complaintResolutionRate,
        urgentComplaints,
      },
      quizzesTopPerforming: quizzes.slice(0, 10),
      staffPerformance: staffPerf,
      coursePerformance: coursePerf,
      generatedAt: new Date().toISOString(),
    };
  }
}
