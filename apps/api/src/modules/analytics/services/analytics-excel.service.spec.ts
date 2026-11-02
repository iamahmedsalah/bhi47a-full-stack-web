import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsExcelService } from './analytics-excel.service';
import { AnalyticsQueryService } from './analytics-query.service';
import type { AuthenticatedUser } from '../../auth/types/authenticated-request';

describe('AnalyticsExcelService', () => {
  let service: AnalyticsExcelService;

  const mockAdminUser: AuthenticatedUser = {
    _id: '507f1f77bcf86cd799439011',
    role: 'admin',
    email: 'admin@portal.edu',
    name: 'Admin User',
    permissions: [],
    mustChangePassword: false,
    tokenVersion: 1,
  };

  const mockQueryService = {
    getOverview: jest.fn().mockResolvedValue({
      kpis: {
        totalStudents: 100,
        activeStudents: 95,
        activeRate: 95,
        suspendedStudents: 2,
        withdrawnStudents: 3,
        graduatedStudents: 0,
        totalCourses: 10,
        activeCourses: 10,
        totalStaff: 5,
        doctorCount: 3,
        assistantLecturerCount: 1,
        teachingAssistantCount: 1,
        totalQuizzes: 4,
        publishedQuizzes: 4,
        activeQuizzes: 2,
        avgQuizParticipationRate: 85,
        avgQuizPassRate: 90,
        totalComplaints: 0,
        resolvedComplaints: 0,
        complaintResolutionRate: 0,
        urgentComplaints: 0,
      },
    }),
    getQuizzesAnalytics: jest.fn().mockResolvedValue([
      {
        quizId: 'q1',
        quizTitle: 'Midterm Quiz',
        quizTitleAr: 'كويز نصفي',
        courseId: 'c1',
        courseCode: 'BIS101',
        courseName: 'Intro to BIS',
        courseNameAr: 'مقدمة في نظم معلومات الأعمال',
        creatorId: 'u1',
        creatorName: 'Dr. Ahmed',
        creatorStaffType: 'doctor',
        academicYear: '2026-2027',
        semester: 'first',
        durationMinutes: 15,
        totalMarks: 10,
        passingMarks: 5,
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 86400000),
        isPublished: true,
        questionsCount: 10,
        eligibleCount: 50,
        startedCount: 45,
        submittedCount: 45,
        notStartedCount: 5,
        passedCount: 40,
        failedCount: 5,
        participationRate: 90,
        passRate: 88.9,
        avgScore: 8,
        avgPercentage: 80,
        highestScore: 10,
        lowestScore: 4,
        avgDurationSeconds: 450,
        terminatedByExitCount: 0,
        timedOutCount: 0,
      },
    ]),
    getStaffQuizPerformance: jest.fn().mockResolvedValue([
      {
        staffId: 'u1',
        staffName: 'Dr. Ahmed',
        staffNameAr: 'د. أحمد',
        staffType: 'doctor',
        role: 'staff',
        assignedCoursesCount: 2,
        quizzesCreatedCount: 3,
        publishedQuizzesCount: 3,
        draftQuizzesCount: 0,
        totalEligibleStudents: 100,
        totalSubmissions: 90,
        avgParticipationRate: 90,
        avgPassRate: 88.9,
        avgScorePercentage: 80,
      },
    ]),
    getCoursesAnalytics: jest.fn().mockResolvedValue([
      {
        courseId: 'c1',
        courseCode: 'BIS101',
        courseName: 'Intro to BIS',
        courseNameAr: 'مقدمة في نظم معلومات الأعمال',
        department: 'BIS',
        level: '1',
        creditHours: 3,
        doctorNames: ['د. أحمد'],
        teachingAssistantNames: ['م. محمود'],
        enrolledStudentsCount: 50,
        quizzesCount: 1,
        avgQuizParticipationRate: 90,
        avgQuizPassRate: 88.9,
        midtermGradedCount: 48,
        midtermAbsentCount: 2,
        midtermPassRate: 92,
        finalGradedCount: 49,
        finalAbsentCount: 1,
        finalPassRate: 94,
        overallPassRate: 94,
      },
    ]),
    getStudentsAnalytics: jest.fn().mockResolvedValue([
      {
        studentId: 's1',
        studentCode: '2026001',
        name: 'Student One',
        nameAr: 'طالب أول',
        department: 'BIS',
        level: '1',
        enrollmentStatus: 'active',
        gpa: 3.45,
        totalEarnedHours: 15,
        enrolledCoursesCount: 5,
        completedQuizzes: 1,
        passedQuizzes: 1,
        avgQuizScorePercentage: 90,
        complaintsCount: 0,
      },
    ]),
    getDetailedSubmissions: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsExcelService,
        { provide: AnalyticsQueryService, useValue: mockQueryService },
      ],
    }).compile();

    service = module.get<AnalyticsExcelService>(AnalyticsExcelService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should generate workbook in Arabic with RTL worksheets', async () => {
    const workbook = await service.generateComprehensiveWorkbook(
      { locale: 'ar' },
      mockAdminUser,
    );
    expect(workbook).toBeDefined();
    expect(workbook.worksheets.length).toBeGreaterThanOrEqual(10);

    const quizSheet = workbook.getWorksheet('تحليل الكويزات');
    expect(quizSheet).toBeDefined();
    expect(quizSheet?.views?.[0]?.rightToLeft).toBe(true);
    expect(quizSheet?.rowCount).toBeGreaterThan(1);

    const staffSheet = workbook.getWorksheet('أداء هيئة التدريس في الكويزات');
    expect(staffSheet).toBeDefined();

    const courseSheet = workbook.getWorksheet('تحليل المقررات الأكاديمية');
    expect(courseSheet).toBeDefined();
  });

  it('should generate workbook in English with LTR worksheets', async () => {
    const workbook = await service.generateComprehensiveWorkbook(
      { locale: 'en' },
      mockAdminUser,
    );
    expect(workbook).toBeDefined();
    const quizSheet = workbook.getWorksheet('Quiz Analysis');
    expect(quizSheet).toBeDefined();
    expect(quizSheet?.views?.[0]?.rightToLeft).toBe(false);
  });
});
