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
    find: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
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
      }),
    }),
  };

  const mockSubmissionModel = {
    aggregate: jest.fn().mockResolvedValue([
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
    aggregate: jest.fn().mockResolvedValue([
      {
        _id: quizFixtureId,
        startedCount: 52,
        terminatedByExitCount: 1,
        timedOutCount: 1,
      },
    ]),
  };

  const mockCourseModel = {
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
    aggregate: jest.fn().mockResolvedValue([{ _id: 'CS101', count: 60 }]),
  };

  const mockUserModel = {
    find: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    }),
    countDocuments: jest.fn().mockResolvedValue(5),
  };

  const mockGradeModel = {
    aggregate: jest.fn().mockResolvedValue([
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
    aggregate: jest.fn().mockResolvedValue([]),
  };

  const mockStudentProfileModel = {
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
    const overview = await service.getOverview({}, mockAdminUser);
    expect(overview).toBeDefined();
    expect(overview.kpis).toBeDefined();
    expect(overview.kpis.totalStudents).toBe(100);
    expect(overview.kpis.totalCourses).toBe(10);
  });
});
