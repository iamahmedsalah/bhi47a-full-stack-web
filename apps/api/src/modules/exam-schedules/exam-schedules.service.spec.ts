import { Types } from 'mongoose';
import { NotFoundException } from '@nestjs/common';
import { ExamSchedulesService } from './exam-schedules.service';

describe('ExamSchedulesService Unit Tests', () => {
  let service: ExamSchedulesService;

  const mockConfigService: any = {
    get: jest.fn(),
  };

  const mockExamScheduleModel: any = jest.fn();
  const mockStudentModel: any = {};
  const mockNotificationsService: any = {
    sendNotification: jest.fn().mockResolvedValue({}),
  };

  const userId = new Types.ObjectId().toString();

  beforeEach(() => {
    jest.clearAllMocks();

    mockExamScheduleModel.find = jest.fn();
    mockExamScheduleModel.findById = jest.fn();
    mockExamScheduleModel.findByIdAndUpdate = jest.fn();
    mockExamScheduleModel.findByIdAndDelete = jest.fn();

    mockStudentModel.findOne = jest.fn();
    mockStudentModel.db = {
      model: jest.fn().mockReturnValue({
        findById: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(null),
        }),
      }),
    };

    service = new ExamSchedulesService(
      mockConfigService,
      mockExamScheduleModel,
      mockStudentModel,
      mockNotificationsService,
    );
  });

  describe('getStudentExamAssignment()', () => {
    it('returns student assignment and published schedules when profile exists', async () => {
      mockStudentModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          seatNumber: '2042',
          examRoom: 'Hall B',
          examFloor: '2',
          examBuilding: 'Building 1',
        }),
      });

      const schedules = [
        {
          _id: new Types.ObjectId(),
          title: 'Final Exam 2026',
          examType: 'final',
          isPublished: true,
        },
      ];

      mockExamScheduleModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(schedules),
        }),
      });

      const result = await service.getStudentExamAssignment(userId);

      expect(result.seatNumber).toBe('2042');
      expect(result.examRoom).toBe('Hall B');
      expect(result.schedules).toHaveLength(1);
      expect(result.schedules[0].title).toBe('Final Exam 2026');
    });

    it('does not throw 404 when student profile is missing and returns empty assignment with schedules', async () => {
      mockStudentModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      mockExamScheduleModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });

      const result = await service.getStudentExamAssignment(userId);

      expect(result.seatNumber).toBeNull();
      expect(result.examRoom).toBeNull();
      expect(result.examFloor).toBeNull();
      expect(result.examBuilding).toBeNull();
      expect(result.schedules).toEqual([]);
    });

    it('finds student profile by user studentCode if direct userId lookup is null', async () => {
      mockStudentModel.findOne
        .mockReturnValueOnce({
          lean: jest.fn().mockResolvedValue(null),
        })
        .mockReturnValueOnce({
          lean: jest.fn().mockResolvedValue({
            seatNumber: '3011',
            examRoom: 'Auditorium 1',
          }),
        });

      mockStudentModel.db.model.mockReturnValue({
        findById: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({ studentCode: '261360' }),
        }),
      });

      mockExamScheduleModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });

      const result = await service.getStudentExamAssignment(userId);

      expect(result.seatNumber).toBe('3011');
      expect(result.examRoom).toBe('Auditorium 1');
    });
  });

  describe('remove()', () => {
    it('throws NotFoundException if schedule does not exist', async () => {
      mockExamScheduleModel.findByIdAndDelete.mockResolvedValue(null);

      await expect(
        service.remove(new Types.ObjectId().toString()),
      ).rejects.toThrow(NotFoundException);
    });

    it('deletes schedule successfully', async () => {
      mockExamScheduleModel.findByIdAndDelete.mockResolvedValue({ _id: '123' });

      const res = await service.remove(new Types.ObjectId().toString());
      expect(res.message).toContain('تم حذف جدول الامتحانات بنجاح');
    });
  });
});
