import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsQueryService } from './services/analytics-query.service';
import { AnalyticsExcelService } from './services/analytics-excel.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-request';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;

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
    getOverview: jest.fn().mockResolvedValue({ kpis: {} }),
    getQuizzesAnalytics: jest.fn().mockResolvedValue([]),
    getStaffQuizPerformance: jest.fn().mockResolvedValue([]),
    getCoursesAnalytics: jest.fn().mockResolvedValue([]),
  };

  const mockExcelService = {
    generateComprehensiveWorkbook: jest.fn().mockResolvedValue({
      xlsx: {
        writeBuffer: jest
          .fn()
          .mockResolvedValue(Buffer.from('synthetic-workbook')),
      },
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        { provide: AnalyticsQueryService, useValue: mockQueryService },
        { provide: AnalyticsExcelService, useValue: mockExcelService },
      ],
    }).compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return overview', async () => {
    const result = await controller.getOverview({}, mockAdminUser);
    expect(result).toBeDefined();
    expect(mockQueryService.getOverview).toHaveBeenCalledWith(
      {},
      mockAdminUser,
    );
  });

  it('should return quizzes analytics', async () => {
    const result = await controller.getQuizzesAnalytics({}, mockAdminUser);
    expect(result).toBeDefined();
    expect(mockQueryService.getQuizzesAnalytics).toHaveBeenCalledWith(
      {},
      mockAdminUser,
    );
  });

  it('should return staff quiz performance', async () => {
    const result = await controller.getStaffQuizPerformance({}, mockAdminUser);
    expect(result).toBeDefined();
    expect(mockQueryService.getStaffQuizPerformance).toHaveBeenCalledWith(
      {},
      mockAdminUser,
    );
  });

  it('should return courses analytics', async () => {
    const result = await controller.getCoursesAnalytics({}, mockAdminUser);
    expect(result).toBeDefined();
    expect(mockQueryService.getCoursesAnalytics).toHaveBeenCalledWith(
      {},
      mockAdminUser,
    );
  });

  it('should export excel report and set headers', async () => {
    const res: any = {
      setHeader: jest.fn(),
      end: jest.fn(),
    };
    await controller.exportComprehensiveReport(
      { locale: 'ar' },
      mockAdminUser,
      res,
    );
    expect(mockExcelService.generateComprehensiveWorkbook).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('attachment; filename='),
    );
    expect(res.end).toHaveBeenCalledWith(Buffer.from('synthetic-workbook'));
  });

  it('keeps selected worksheet filters and identifies the download in its filename', async () => {
    const res = { setHeader: jest.fn(), end: jest.fn() };
    const query = {
      locale: 'en' as const,
      sheets: ['students' as const],
      level: '3',
      department: 'ACCOUNTING',
    };
    await controller.exportComprehensiveReport(
      query,
      mockAdminUser,
      res as never,
    );
    expect(
      mockExcelService.generateComprehensiveWorkbook,
    ).toHaveBeenLastCalledWith(query, mockAdminUser);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('academic-analytics-students-'),
    );
    expect(res.end).toHaveBeenCalledWith(Buffer.from('synthetic-workbook'));
  });
});
