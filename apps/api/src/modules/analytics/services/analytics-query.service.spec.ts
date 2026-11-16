import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AnalyticsQueryService } from './analytics-query.service';
import { Quiz } from '../../quizzes/schemas/quiz.schema';
import { QuizSubmission } from '../../quizzes/schemas/quiz-submission.schema';
import { QuizAttempt } from '../../quizzes/schemas/quiz-attempt.schema';
import { Course } from '../../courses/schemas/course.schema';
import { CourseRegistration } from '../../registrations/schemas/course-registration.schema';
import { User } from '../../users/schemas/user.schema';
import { Grade } from '../../grades/schemas/grade.schema';
import { Complaint } from '../../complaints/schemas/complaint.schema';
import { StudentProfile } from '../../students/schemas/student-profile.schema';
import { StudentAcademicProfile } from '../../registrations/schemas/student-academic-profile.schema';
import type { AuthenticatedUser } from '../../auth/types/authenticated-request';
import { Types } from 'mongoose';

describe('AnalyticsQueryService', () => {
  let service: AnalyticsQueryService;
  const quizFixtureId = new Types.ObjectId();

  const mockAdminUser: AuthenticatedUser = {
    _id: new Types.ObjectId().toString(),
    role: 'admin',
    email: 'admin@portal.edu',
    name: 'Admin User',
    permissions: [],
    mustChangePassword: false,
    tokenVersion: 1,
  };

  const mockQuizModel = {
    find: jest
      .fn()
      .mockReturnValue({ sort: () => ({ lean: () => Promise.resolve([]) }) }),
    aggregate: jest.fn((_pipeline: unknown[]) =>
      Promise.resolve([
        {
          _id: quizFixtureId,
          title: 'Quiz 1',
          titleAr: 'الاختبار الأول',
          courseId: new Types.ObjectId(),
          courseCode: 'CS101',
          courseName: 'Intro to CS',
          creatorId: new Types.ObjectId(),
          academicYear: '2026-2027',
          semester: 'first',
          durationMinutes: 20,
          totalMarks: 20,
          passingMarks: 10,
          isPublished: true,
          questions: [{}, {}],
        },
      ]),
    ),
  };

  const mockSubmissionModel = {
    aggregate: jest
      .fn((_pipeline: unknown[]) => Promise.resolve([] as any[]))
      .mockResolvedValue([
        {
          _id: quizFixtureId,
          totalSubmissions: 50,
          passedCount: 45,
          failedCount: 5,
          avgScore: 16.5,
          avgPercentage: 82.5,
          highestScore: 20,
          lowestScore: 8,
          avgDurationSeconds: 600,
        },
      ]),
    find: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      }),
    }),
  };

  const mockAttemptModel = {
    aggregate: jest
      .fn((_pipeline: unknown[]) => Promise.resolve([] as any[]))
      .mockResolvedValue([
        {
          _id: quizFixtureId,
          startedCount: 52,
          terminatedByExitCount: 1,
          timedOutCount: 1,
        },
      ]),
  };

  const mockCourseModel = {
    aggregate: jest
      .fn()
      .mockResolvedValue([{ totalCourses: 10, activeCourses: 10 }]),
    find: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            _id: new Types.ObjectId(),
            code: 'CS101',
            name: 'Intro to CS',
            department: 'GEN',
            level: '1',
            creditHours: 3,
            isActive: true,
          },
        ]),
      }),
    }),
    countDocuments: jest.fn().mockResolvedValue(10),
  };

  const mockRegistrationModel = {
    aggregate: jest
      .fn((_pipeline: unknown[]) => Promise.resolve([] as any[]))
      .mockResolvedValue([{ _id: 'CS101', count: 60 }]),
  };

  const mockUserModel = {
    aggregate: jest
      .fn()
      .mockResolvedValue([{ doctorCount: 5, asstLectCount: 5, taCount: 5 }]),
    find: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    }),
    countDocuments: jest.fn().mockResolvedValue(5),
  };

  const mockGradeModel = {
    aggregate: jest
      .fn((_pipeline: unknown[]) => Promise.resolve([] as any[]))
      .mockResolvedValue([
        {
          _id: { courseCode: 'CS101', examType: 'final' },
          totalRecorded: 58,
          absentCount: 2,
          passedCount: 52,
        },
      ]),
  };

  const mockComplaintModel = {
    countDocuments: jest.fn().mockResolvedValue(0),
    aggregate: jest
      .fn((_pipeline: unknown[]) => Promise.resolve([] as any[]))
      .mockResolvedValue([]),
  };

  const mockStudentProfileModel = {
    aggregate: jest.fn().mockResolvedValue([
      {
        totalStudents: 100,
        activeStudents: 80,
        suspendedStudents: 5,
        withdrawnStudents: 5,
        graduatedStudents: 10,
      },
    ]),
    countDocuments: jest.fn().mockResolvedValue(100),
    find: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      }),
    }),
  };

  const mockAcademicProfileModel = {
    find: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsQueryService,
        { provide: getModelToken(Quiz.name), useValue: mockQuizModel },
        {
          provide: getModelToken(QuizSubmission.name),
          useValue: mockSubmissionModel,
        },
        {
          provide: getModelToken(QuizAttempt.name),
          useValue: mockAttemptModel,
        },
        { provide: getModelToken(Course.name), useValue: mockCourseModel },
        {
          provide: getModelToken(CourseRegistration.name),
          useValue: mockRegistrationModel,
        },
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: getModelToken(Grade.name), useValue: mockGradeModel },
        {
          provide: getModelToken(Complaint.name),
          useValue: mockComplaintModel,
        },
        {
          provide: getModelToken(StudentProfile.name),
          useValue: mockStudentProfileModel,
        },
        {
          provide: getModelToken(StudentAcademicProfile.name),
          useValue: mockAcademicProfileModel,
        },
      ],
    }).compile();

    service = module.get<AnalyticsQueryService>(AnalyticsQueryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should compute quizzes analytics with participation and pass rates accurately', async () => {
    const results = await service.getQuizzesAnalytics({}, mockAdminUser);
    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    if (results.length > 0) {
      expect(results[0].courseCode).toBe('CS101');
      expect(results[0].eligibleCount).toBe(60);
      expect(results[0].submittedCount).toBe(50);
      expect(results[0].passedCount).toBe(45);
      expect(results[0].participationRate).toBeCloseTo(83.3, 1);
      expect(results[0].passRate).toBe(90);
    }
  });

  it('should compute overview KPIs properly', async () => {
    const quizzes = jest.spyOn(service, 'getQuizzesAnalytics');
    const overview = await service.getOverview({}, mockAdminUser);
    expect(overview).toBeDefined();
    expect(overview.kpis).toBeDefined();
    expect(overview.kpis.totalStudents).toBe(100);
    expect(overview.kpis.totalCourses).toBe(10);
    expect(overview.kpis.activeStudents).toBe(80);
    expect(mockStudentProfileModel.countDocuments).not.toHaveBeenCalled();
    expect(mockUserModel.countDocuments).not.toHaveBeenCalled();
    expect(quizzes).toHaveBeenCalledTimes(1);
    quizzes.mockRestore();
  });

  it('retains term filters and both BSON reference forms in indexed quiz matching', async () => {
    await service.getQuizzesAnalytics(
      {
        department: 'BIS',
        level: '1',
        academicYear: '2026-2027',
        semester: 'first',
      },
      mockAdminUser,
    );
    const [pipeline] = mockQuizModel.aggregate.mock.calls.at(-1)!;
    const match = (pipeline[0] as { $match: Record<string, unknown> }).$match;
    expect(match).toMatchObject({
      academicYear: '2026-2027',
      semester: 'first',
    });
    const membership = (
      match.$and as Array<{ courseId: { $in: unknown[] } }>
    )[0].courseId.$in;
    expect(membership[0]).toBeInstanceOf(Types.ObjectId);
    expect(membership[1]).toBe(String(membership[0]));
    expect(JSON.stringify(match)).not.toContain('$expr');
  });
  it.each([
    ['ACCOUNTING', ['ACCOUNTING', 'Accounting', 'ACC', 'المحاسبة']],
    ['BIS', ['BIS', 'نظم معلومات الأعمال']],
    ['GENERAL', ['GENERAL', 'GEN', 'الشعبة العامة']],
  ])(
    'matches canonical and legacy %s department names within the requested level',
    async (department, names) => {
      await service.getStudentsAnalytics({
        department,
        level: '3',
        academicYear: '2027-2028',
      });
      const filter = mockStudentProfileModel.find.mock.calls.at(-1)?.[0] as {
        department: { $in: RegExp[] };
        level: string;
        academicYear: string;
      };
      expect(filter).toMatchObject({ level: '3', academicYear: '2027-2028' });
      for (const name of names)
        expect(
          filter.department.$in.some((pattern) => pattern.test(name)),
        ).toBe(true);
      expect(
        filter.department.$in.some((pattern) => pattern.test('OTHER')),
      ).toBe(false);
    },
  );
  it('matches both BSON and legacy string quiz references instead of silently returning zero submissions', async () => {
    await service.getQuizzesAnalytics({}, mockAdminUser);
    const pipeline = mockSubmissionModel.aggregate.mock.calls.at(-1)![0] as any;
    expect(pipeline[0].$match.quizId.$in).toEqual([
      quizFixtureId,
      String(quizFixtureId),
    ]);
  });

  it('keeps a genuine zero final pass rate instead of replacing it with the midterm rate', async () => {
    mockGradeModel.aggregate.mockResolvedValueOnce([
      {
        _id: { courseCode: 'CS101', examType: 'midterm' },
        totalRecorded: 10,
        absentCount: 0,
        passedCount: 10,
      },
      {
        _id: { courseCode: 'CS101', examType: 'final' },
        totalRecorded: 10,
        absentCount: 0,
        passedCount: 0,
      },
    ]);
    const result = await service.getCoursesAnalytics({}, mockAdminUser);
    expect(result[0].midtermPassRate).toBe(100);
    expect(result[0].finalPassRate).toBe(0);
    expect(result[0].overallPassRate).toBe(0);
  });

  it('joins string student IDs to academic records, and leaves missing academic metrics unset', async () => {
    const studentId = new Types.ObjectId();
    mockStudentProfileModel.find.mockReturnValueOnce({
      select: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            {
              userId: String(studentId),
              studentCode: '260001',
              fullName: 'Student',
            },
          ]),
        }),
      }),
    });
    mockAcademicProfileModel.find.mockReturnValueOnce({
      select: jest.fn().mockReturnValue({
        lean: jest
          .fn()
          .mockResolvedValue([
            { studentId, gpa: 3.25, completedCreditHours: 42 },
          ]),
      }),
    });
    mockSubmissionModel.aggregate.mockResolvedValueOnce([
      {
        _id: String(studentId),
        completedQuizzes: 2,
        passedQuizzes: 1,
        avgScorePercentage: 75,
      },
    ]);
    const [student] = await service.getStudentsAnalytics({
      academicYear: '2026-2027',
    });
    expect(student).toMatchObject({
      gpa: 3.25,
      totalEarnedHours: 42,
      completedQuizzes: 2,
      passedQuizzes: 1,
      avgQuizScorePercentage: 75,
    });
    const [pipeline] = mockSubmissionModel.aggregate.mock.calls.at(
      -1,
    )! as any[];
    expect(pipeline[0].$match.studentId.$in).toContainEqual(studentId);
    expect(pipeline[0].$match.studentId.$in).toContain(String(studentId));
  });
});
