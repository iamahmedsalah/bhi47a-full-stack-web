import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
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
  const transaction = {};

  beforeEach(() => {
    mockSessionModel = {
      findById: jest.fn(),
      exists: jest.fn().mockReturnValue({
        session: jest.fn().mockResolvedValue(null),
      }),
      updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
      db: {
        transaction: async (work: (session: object) => Promise<unknown>) =>
          work(transaction),
      },
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

  it.each([
    ['no registration', null],
    [
      'pending registration',
      {
        status: 'pending',
        academicYear: '2026-2027',
        semester: 'first',
        courses: ['CS101'],
      },
    ],
    [
      'rejected registration',
      {
        status: 'rejected',
        academicYear: '2026-2027',
        semester: 'first',
        courses: ['CS101'],
      },
    ],
    [
      'another course',
      {
        status: 'approved',
        academicYear: '2026-2027',
        semester: 'first',
        courses: ['CS102'],
      },
    ],
    [
      'another semester',
      {
        status: 'approved',
        academicYear: '2026-2027',
        semester: 'second',
        courses: ['CS101'],
      },
    ],
    [
      'another academic year',
      {
        status: 'approved',
        academicYear: '2025-2026',
        semester: 'first',
        courses: ['CS101'],
      },
    ],
  ])(
    'rejects QR attendance with %s before writing attendance',
    async (_label, registration) => {
      const session = {
        _id: mockSessionId,
        courseCode: 'CS101',
        academicYear: '2026-2027',
        semester: 'first',
        status: 'OPEN',
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + 600000),
        sessionSecret: 'secret',
        qrRotationSeconds: 20,
      };
      mockSessionModel.findById.mockReturnValue({
        select: jest
          .fn()
          .mockReturnValue({ exec: jest.fn().mockResolvedValue(session) }),
      });
      mockTokenService.validateToken.mockReturnValue({ valid: true });
      mockRecordModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });
      mockRegistrationModel.exists.mockImplementation(
        (filter: {
          status: string;
          courses: string;
          academicYear: string;
          semester: string;
        }) =>
          registration &&
          registration.status === filter.status &&
          registration.courses.includes(filter.courses) &&
          registration.academicYear === filter.academicYear &&
          registration.semester === filter.semester
            ? { _id: 'registration' }
            : null,
      );
      await expect(
        service.checkIn(
          mockStudent,
          `${mockSessionId.toString()}.100.validsignature32characterslong12`,
        ),
      ).rejects.toThrow('الطالب غير مسجل بالمقرر');
      expect(mockRegistrationModel.exists).toHaveBeenCalledTimes(1);
      expect(mockRecordModel.create).not.toHaveBeenCalled();
      expect(mockRealtimeService.publishEvent).not.toHaveBeenCalled();
    },
  );

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

    mockRecordModel.create.mockResolvedValue([
      {
        _id: new Types.ObjectId(),
        status: 'present',
        method: 'qr',
        checkedInAt: new Date(),
      },
    ]);

    const result = await service.checkIn(mockStudent, rawToken);

    expect(result.alreadyCheckedIn).toBe(false);
    expect(result.status).toBe('present');
    expect(mockRecordModel.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          courseCode: 'CS101',
          status: 'present',
          method: 'qr',
          studentCode: '2026001',
        }),
      ],
      { session: transaction },
    );
    expect(mockRealtimeService.publishEvent).toHaveBeenCalled();
    expect(mockSessionModel.updateOne).toHaveBeenCalledWith(
      {
        _id: mockSessionId,
        status: 'OPEN',
        expiresAt: { $gt: expect.any(Date) },
      },
      { $inc: { __v: 1 } },
      { session: transaction, timestamps: false },
    );

    mockRecordModel.create.mockClear();
    mockRealtimeService.publishEvent.mockClear();
    mockSessionModel.updateOne.mockResolvedValue({ matchedCount: 0 });
    await expect(service.checkIn(mockStudent, rawToken)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(mockRecordModel.create).not.toHaveBeenCalled();
    expect(mockRealtimeService.publishEvent).not.toHaveBeenCalled();

    // The session read can still show OPEN after a close or expiry wins the write.
    mockSessionModel.exists.mockReturnValue({
      session: jest.fn().mockResolvedValue({ _id: mockSessionId }),
    });
    await expect(service.checkIn(mockStudent, rawToken)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(mockRecordModel.create).not.toHaveBeenCalled();
    expect(mockRealtimeService.publishEvent).not.toHaveBeenCalled();
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

    mockRecordModel.create.mockResolvedValue([
      {
        _id: new Types.ObjectId(),
        status: 'late',
        method: 'qr',
        checkedInAt: new Date(),
      },
    ]);

    const result = await service.checkIn(mockStudent, rawToken);

    expect(result.status).toBe('late');
    expect(mockRecordModel.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          status: 'late',
        }),
      ],
      { session: transaction },
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

  it('should reject check-in when deviceId was already used by another student in this session', async () => {
    const rawToken = `${mockSessionId.toString()}.100.validsignature32characterslong12`;

    const mockSession = {
      _id: mockSessionId,
      courseCode: 'CS101',
      status: 'OPEN',
      startsAt: new Date(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      lateThresholdMinutes: 10,
      sessionSecret: 'supersecret',
      qrRotationSeconds: 20,
    };

    mockSessionModel.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockSession),
      }),
    });

    mockTokenService.validateToken.mockReturnValue({ valid: true });
    mockRegistrationModel.exists.mockResolvedValue(true);

    // Mock existing record for student is null, but device is used by another student
    mockRecordModel.findOne
      .mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue(null), // student not checked in yet
      })
      .mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(),
          studentId: new Types.ObjectId(), // another student
          deviceId: 'device-xyz-123',
        }),
      });

    await expect(
      service.checkIn(mockStudent, {
        token: rawToken,
        deviceId: 'device-xyz-123',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should reject check-in when student location is outside the geofence radius', async () => {
    const rawToken = `${mockSessionId.toString()}.100.validsignature32characterslong12`;

    const mockSession = {
      _id: mockSessionId,
      courseCode: 'CS101',
      status: 'OPEN',
      startsAt: new Date(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      lateThresholdMinutes: 10,
      sessionSecret: 'supersecret',
      qrRotationSeconds: 20,
      location: {
        latitude: 30.0444, // Cairo Center
        longitude: 31.2357,
        radiusMeters: 50, // 50m radius
      },
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

    // Student coordinates far away (Giza pyramids ~ 13km away)
    await expect(
      service.checkIn(mockStudent, {
        token: rawToken,
        latitude: 29.9792,
        longitude: 31.1342,
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});
