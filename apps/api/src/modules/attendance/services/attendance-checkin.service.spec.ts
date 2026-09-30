import { BadRequestException } from '@nestjs/common';
import { AttendanceCheckInService } from './attendance-checkin.service';
import { Types } from 'mongoose';

describe('AttendanceCheckInService', () => {
  let service: AttendanceCheckInService;
  let mockSessionModel: any;
  let mockRecordModel: any;
  let mockRegistrationModel: any;
  let mockStudentProfileModel: any;
  let mockTokenService: any;
  let mockRealtimeService: any;

  const mockStudent = {
    _id: new Types.ObjectId().toString(),
    name: 'Ahmed Soliman',
    studentCode: '2026001',
  };

  const mockSessionId = new Types.ObjectId();

  beforeEach(() => {
    mockSessionModel = {
      findById: jest.fn(),
    };
    mockRecordModel = {
      findOne: jest.fn(),
      create: jest.fn(),
    };
    mockRegistrationModel = {
      exists: jest.fn(),
    };
    mockStudentProfileModel = {
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          fullName: 'Ahmed Soliman',
          studentCode: '2026001',
          enrollmentStatus: 'active',
        }),
      }),
    };
    mockTokenService = {
      isManualCode: jest.fn().mockReturnValue(false),
      getManualCodeSessionSuffix: jest.fn(),
      validateManualCode: jest.fn(),
      validateToken: jest.fn(),
    };
    mockRealtimeService = {
      publishEvent: jest.fn(),
    };

    service = new AttendanceCheckInService(
      mockSessionModel,
      mockRecordModel,
      mockRegistrationModel,
      mockStudentProfileModel,
      mockTokenService,
      mockRealtimeService,
    );
  });

  it('should successfully check in student and record status as PRESENT within late threshold', async () => {
    const rawToken = `${mockSessionId.toString()}.100.validsignature32characterslong12`;

    const mockSession = {
      _id: mockSessionId,
      courseCode: 'CS101',
      courseName: 'Intro to Computer Science',
      sessionType: 'lecture',
      status: 'OPEN',
      startsAt: new Date(Date.now() - 3 * 60 * 1000), // 3 mins ago
      expiresAt: new Date(Date.now() + 12 * 60 * 1000), // 12 mins left
      lateThresholdMinutes: 10,
      sessionSecret: 'supersecret',
      qrRotationSeconds: 25,
      save: jest.fn(),
    };

    mockSessionModel.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockSession),
      }),
    });

    mockTokenService.validateToken.mockReturnValue({ valid: true });
    mockRegistrationModel.exists.mockResolvedValue(true);
    mockRecordModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });

    mockRecordModel.create.mockResolvedValue({
      _id: new Types.ObjectId(),
      status: 'present',
      method: 'qr',
      checkedInAt: new Date(),
    });

    const result = await service.checkIn(mockStudent, rawToken);

    expect(result.alreadyCheckedIn).toBe(false);
    expect(result.status).toBe('present');
    expect(mockRecordModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        courseCode: 'CS101',
        status: 'present',
        method: 'qr',
        studentCode: '2026001',
      }),
    );
    expect(mockRealtimeService.publishEvent).toHaveBeenCalled();
  });

  it('should mark student as LATE when check-in occurs after lateThresholdMinutes', async () => {
    const rawToken = `${mockSessionId.toString()}.100.validsignature32characterslong12`;

    const mockSession = {
      _id: mockSessionId,
      courseCode: 'CS101',
      courseName: 'Intro to Computer Science',
      sessionType: 'lecture',
      status: 'OPEN',
      startsAt: new Date(Date.now() - 15 * 60 * 1000), // started 15 mins ago
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 mins left
      lateThresholdMinutes: 10, // late after 10 mins!
      sessionSecret: 'supersecret',
      qrRotationSeconds: 25,
      save: jest.fn(),
    };

    mockSessionModel.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockSession),
      }),
    });

    mockTokenService.validateToken.mockReturnValue({ valid: true });
    mockRegistrationModel.exists.mockResolvedValue(true);
    mockRecordModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });

    mockRecordModel.create.mockResolvedValue({
      _id: new Types.ObjectId(),
      status: 'late',
      method: 'qr',
      checkedInAt: new Date(),
    });

    const result = await service.checkIn(mockStudent, rawToken);

    expect(result.status).toBe('late');
    expect(mockRecordModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'late',
      }),
    );
  });

  it('should handle duplicate scans idempotently and return original record', async () => {
    const rawToken = `${mockSessionId.toString()}.100.validsignature32characterslong12`;

    const mockSession = {
      _id: mockSessionId,
      courseCode: 'CS101',
      status: 'OPEN',
      startsAt: new Date(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      lateThresholdMinutes: 10,
      sessionSecret: 'supersecret',
      qrRotationSeconds: 25,
    };

    mockSessionModel.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockSession),
      }),
    });

    mockTokenService.validateToken.mockReturnValue({ valid: true });
    mockRegistrationModel.exists.mockResolvedValue(true);

    const initialCheckedInAt = new Date('2026-10-10T10:02:00Z');
    mockRecordModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        status: 'present',
        checkedInAt: initialCheckedInAt,
        sessionType: 'lecture',
      }),
    });

    const result = await service.checkIn(mockStudent, rawToken);

    expect(result.alreadyCheckedIn).toBe(true);
    expect(result.status).toBe('present');
    expect(result.checkedInAt).toBe(initialCheckedInAt);
    expect(mockRecordModel.create).not.toHaveBeenCalled();
  });

  it('should reject check-in when session is CLOSED', async () => {
    const rawToken = `${mockSessionId.toString()}.100.validsignature32characterslong12`;

    mockSessionModel.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: mockSessionId,
          status: 'CLOSED',
        }),
      }),
    });

    await expect(service.checkIn(mockStudent, rawToken)).rejects.toThrow(
      BadRequestException,
    );
  });
});
