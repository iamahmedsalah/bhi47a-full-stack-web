import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { StudentsService } from './students.service';

describe('StudentsService Unit Tests', () => {
  let service: StudentsService;
  let mockStudentProfileModel: any;
  let mockTuitionAuditLogModel: any;
  let mockRegistrationModel: any;
  let mockRegistrationTermModel: any;
  let mockAdvisingCaseModel: any;
  let mockAcademicEmailModel: any;
  let mockAcademicProfileModel: any;
  let mockSystemSettingsModel: any;
  let mockUsersService: any;
  let mockEmailsService: any;
  let mockStudentQueryService: any;

  beforeEach(() => {
    const MockProfileConstructor: any = jest
      .fn()
      .mockImplementation((data) => ({
        ...data,
        save: jest
          .fn()
          .mockResolvedValue({ _id: new Types.ObjectId(), ...data }),
      }));
    MockProfileConstructor.countDocuments = jest.fn();
    MockProfileConstructor.aggregate = jest.fn();
    MockProfileConstructor.find = jest.fn();
    MockProfileConstructor.findOne = jest.fn();
    MockProfileConstructor.findById = jest.fn();
    MockProfileConstructor.findByIdAndDelete = jest.fn();
    MockProfileConstructor.create = jest.fn();
    MockProfileConstructor.updateMany = jest.fn();
    MockProfileConstructor.updateOne = jest.fn();
    MockProfileConstructor.findByIdAndUpdate = jest.fn();
    MockProfileConstructor.findOneAndUpdate = jest.fn();
    MockProfileConstructor.db = {
      collection: jest
        .fn()
        .mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) }),
    };

    mockStudentProfileModel = MockProfileConstructor;

    mockRegistrationModel = {
      find: jest.fn(),
    };

    mockRegistrationTermModel = {
      findOne: jest.fn(),
    };

    mockAdvisingCaseModel = {
      create: jest.fn().mockResolvedValue({}),
    };

    mockAcademicEmailModel = {
      create: jest.fn().mockResolvedValue({}),
      updateOne: jest.fn().mockResolvedValue({}),
    };

    mockAcademicProfileModel = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 5 }),
      updateOne: jest.fn().mockResolvedValue({}),
    };

    const MockSettingsConstructor: any = jest
      .fn()
      .mockImplementation((data) => ({
        ...data,
        save: jest
          .fn()
          .mockResolvedValue({ _id: new Types.ObjectId(), ...data }),
      }));
    MockSettingsConstructor.findOne = jest.fn();
    MockSettingsConstructor.create = jest.fn();
    mockSystemSettingsModel = MockSettingsConstructor;

    mockUsersService = {
      findById: jest.fn(),
      findByStudentCode: jest.fn(),
      countActiveOnlineStudents: jest.fn(),
      countActiveOnlineStaff: jest.fn().mockResolvedValue(5),
      createUser: jest.fn(),
      activateUser: jest.fn().mockResolvedValue(undefined),
      deactivateUser: jest.fn().mockResolvedValue(undefined),
    };

    mockEmailsService = {
      send: jest.fn(),
    };

    mockStudentQueryService = {
      findAll: jest.fn(),
      findById: jest.fn(),
    };

    mockTuitionAuditLogModel = {
      create: jest.fn().mockResolvedValue({}),
      countDocuments: jest.fn().mockResolvedValue(0),
      distinct: jest.fn().mockResolvedValue([]),
      find: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    };

    service = new StudentsService(
      mockStudentProfileModel,
      mockTuitionAuditLogModel,
      mockRegistrationModel,
      mockRegistrationTermModel,
      mockAdvisingCaseModel,
      mockAcademicEmailModel,
      mockAcademicProfileModel,
      mockSystemSettingsModel,
      mockUsersService,
      mockEmailsService,
      mockStudentQueryService,
      {} as import('../student-codes/student-codes.service').StudentCodesService,
    );
  });

  it.each([
    { failedCourses: [], hasAcademicResults: false },
    { failedCourses: ['COURSE101'], hasAcademicResults: true },
  ])(
    'distinguishes a recorded zero GPA from missing academic results',
    async ({ failedCourses, hasAcademicResults }) => {
      const userId = new Types.ObjectId();
      mockUsersService.findById.mockResolvedValue({ studentCode: '250001' });
      mockStudentProfileModel.findOne.mockResolvedValue({
        userId,
        studentCode: '250001',
        tuitionFeesStatus: 'paid',
      });
      mockAcademicProfileModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          gpa: 0,
          completedCreditHours: 0,
          completedCourses: [],
          failedCourses,
        }),
      });

      await expect(service.findByUserId(String(userId))).resolves.toMatchObject(
        {
          gpa: 0,
          completedCreditHours: 0,
          hasAcademicResults,
        },
      );
    },
  );

  describe('account status changes preserve student records', () => {
    it.each(['240512', '240517'])(
      'deactivates %s without deleting its profile or academic records',
      async (studentCode) => {
        const profile = {
          _id: new Types.ObjectId(),
          userId: new Types.ObjectId(),
          studentCode,
          enrollmentStatus: 'active',
          save: jest.fn().mockResolvedValue(undefined),
        };
        mockStudentProfileModel.findById.mockResolvedValue(profile);
        const deleteSpy = jest.spyOn(service, 'deleteStudent');

        await service.deactivate(profile._id.toString());

        expect(profile.enrollmentStatus).toBe('inactive');
        expect(profile.save).toHaveBeenCalledTimes(1);
        expect(mockUsersService.deactivateUser).toHaveBeenCalledWith(
          profile.userId.toString(),
        );
        expect(
          mockStudentProfileModel.findByIdAndDelete,
        ).not.toHaveBeenCalled();
        expect(mockStudentProfileModel.db.collection).not.toHaveBeenCalled();
        expect(deleteSpy).not.toHaveBeenCalled();

        mockStudentProfileModel.updateOne.mockImplementationOnce(() => {
          profile.enrollmentStatus = 'active';
          return Promise.resolve({ matchedCount: 1 });
        });
        await service.activate(profile._id.toString());
        expect(mockStudentProfileModel.updateOne).toHaveBeenCalledWith(
          {
            _id: profile._id.toString(),
            officialEnrollmentStatus: { $ne: 'CANCELLED' },
          },
          { $set: { enrollmentStatus: 'active' } },
        );
        expect(profile.enrollmentStatus).toBe('active');
        expect(mockUsersService.activateUser).toHaveBeenCalledWith(
          profile.userId.toString(),
        );
        expect(profile.studentCode).toBe(studentCode);
      },
    );

    it.each(['active', 'inactive', 'graduated', 'suspended'] as const)(
      'persists the %s enrollment status without deleting records',
      async (enrollmentStatus) => {
        const profile = { userId: new Types.ObjectId(), enrollmentStatus };
        mockStudentProfileModel.findByIdAndUpdate.mockResolvedValue(profile);
        mockStudentProfileModel.findOneAndUpdate.mockResolvedValue(profile);
        const id = new Types.ObjectId().toString();

        await service.update(id, { enrollmentStatus });

        const update =
          enrollmentStatus === 'active'
            ? mockStudentProfileModel.findOneAndUpdate
            : mockStudentProfileModel.findByIdAndUpdate;
        expect(update).toHaveBeenCalledWith(
          enrollmentStatus === 'active'
            ? { _id: id, officialEnrollmentStatus: { $ne: 'CANCELLED' } }
            : id,
          { $set: { enrollmentStatus } },
          { new: true, runValidators: true },
        );
        if (enrollmentStatus === 'active') {
          expect(mockUsersService.activateUser).toHaveBeenCalledWith(
            profile.userId.toString(),
          );
        } else if (
          enrollmentStatus === 'inactive' ||
          enrollmentStatus === 'suspended'
        ) {
          expect(mockUsersService.deactivateUser).toHaveBeenCalledWith(
            profile.userId.toString(),
          );
        }
        expect(
          mockStudentProfileModel.findByIdAndDelete,
        ).not.toHaveBeenCalled();
      },
    );

    it.each(['inactive', 'suspended'] as const)(
      'creates a %s student with portal access disabled',
      async (enrollmentStatus) => {
        const userId = new Types.ObjectId();
        mockUsersService.findByStudentCode.mockResolvedValue(null);
        mockUsersService.createUser.mockResolvedValue({
          _id: userId,
          isActive: true,
        });
        const result = await service.create({
          studentCode: '2026999',
          nationalId: '30101010101010',
          fullName: 'Synthetic Student',
          enrollmentStatus,
        } as Parameters<StudentsService['create']>[0]);

        expect(result.profile.enrollmentStatus).toBe(enrollmentStatus);
        expect(result.user.isActive).toBe(false);
        expect(mockUsersService.deactivateUser).toHaveBeenCalledWith(
          userId.toString(),
        );
      },
    );
  });

  describe('getStats()', () => {
    it('returns comprehensive student analytics including liveOnline active portal count', async () => {
      mockStudentProfileModel.countDocuments
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(90) // active
        .mockResolvedValueOnce(8) // suspended
        .mockResolvedValueOnce(2); // graduated

      mockStudentProfileModel.aggregate.mockResolvedValue([
        { _id: '1', count: 40 },
        { _id: '2', count: 30 },
        { _id: '3', count: 20 },
        { _id: '4', count: 10 },
      ]);

      const fakeUserId1 = new Types.ObjectId();
      const fakeUserId2 = new Types.ObjectId();
      const fakeUserId3 = new Types.ObjectId();

      mockStudentProfileModel.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            userId: fakeUserId1,
            level: '1',
            department: 'GENERAL',
            enrollmentStatus: 'active',
          },
          {
            userId: fakeUserId2,
            level: '3',
            department: 'BIS',
            enrollmentStatus: 'active',
          },
          {
            userId: fakeUserId3,
            level: '3',
            department: 'ACCOUNTING',
            enrollmentStatus: 'suspended',
          },
        ]),
      });

      mockAcademicProfileModel.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { studentId: fakeUserId1, gpa: 3.6, academicWarnings: 0 },
          { studentId: fakeUserId2, gpa: 2.8, academicWarnings: 0 },
          { studentId: fakeUserId3, gpa: 1.8, academicWarnings: 1 },
        ]),
      });

      mockUsersService.countActiveOnlineStudents.mockResolvedValue(15);

      const stats = await service.getStats();

      expect(stats.total).toBe(100);
      expect(stats.active).toBe(90);
      expect(stats.suspended).toBe(8);
      expect(stats.graduated).toBe(2);
      expect(stats.liveOnline).toBe(15);
      expect(stats.liveOnlineStaff).toBe(5);
      expect(mockUsersService.countActiveOnlineStudents).toHaveBeenCalledWith(
        60,
      );

      // Verify department breakdown
      expect(stats.departments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ department: 'General', enrolled: 1 }),
          expect.objectContaining({ department: 'BIS', enrolled: 1 }),
          expect.objectContaining({ department: 'ACCOUNTING', enrolled: 1 }),
        ]),
      );

      // Verify cohort retention
      expect(stats.cohortRetention).toBeDefined();
      expect(stats.cohortRetention.length).toBeGreaterThan(0);

      // Verify GPA distribution
      expect(stats.gpaDistribution).toBeDefined();
      const excellent = stats.gpaDistribution.find(
        (b: any) => b.range === '3.5 - 4.0',
      );
      const probation = stats.gpaDistribution.find(
        (b: any) => b.range === '< 2.0',
      );
      expect(excellent?.count).toBe(1);
      expect(probation?.count).toBe(1);

      // Verify in-memory caching: second call within TTL should return cached result without hitting DB again
      const cachedStats = await service.getStats();
      expect(cachedStats).toBe(stats);
      expect(mockStudentProfileModel.countDocuments).toHaveBeenCalledTimes(4);

      // Invalidate cache and verify DB is queried again
      service.invalidateStatsCache();
      mockStudentProfileModel.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      });
      mockAcademicProfileModel.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      });
      await service.getStats();
      expect(mockStudentProfileModel.countDocuments).toHaveBeenCalledTimes(8);
    });
  });

  describe('getTuitionStats()', () => {
    it('aggregates tuition and block stats in a single $facet query', async () => {
      mockStudentProfileModel.aggregate.mockResolvedValueOnce([
        {
          total: [{ count: 120 }],
          blocked: [{ count: 15 }],
          paid: [{ count: 85 }],
          unpaid: [{ count: 20 }],
          exempt: [{ count: 15 }],
        },
      ]);

      const stats = await service.getTuitionStats();

      expect(mockStudentProfileModel.aggregate).toHaveBeenCalledWith([
        expect.objectContaining({
          $facet: expect.objectContaining({
            total: [{ $count: 'count' }],
            blocked: expect.any(Array),
            paid: expect.any(Array),
            unpaid: expect.any(Array),
            exempt: expect.any(Array),
          }),
        }),
      ]);

      expect(stats).toEqual({
        total: 120,
        blocked: 15,
        paid: 85,
        unpaid: 20,
        exempt: 15,
        changedInLast4Hours: 0,
      });
    });

    it('handles empty facet results gracefully with zero defaults', async () => {
      mockStudentProfileModel.aggregate.mockResolvedValueOnce([
        {
          total: [],
          blocked: [],
          paid: [],
          unpaid: [],
          exempt: [],
        },
      ]);

      const stats = await service.getTuitionStats();

      expect(stats).toEqual({
        total: 0,
        blocked: 0,
        paid: 0,
        unpaid: 0,
        exempt: 0,
        changedInLast4Hours: 0,
      });
    });
  });

  describe('transferDepartment()', () => {
    it('throws BadRequestException if no studentIds are provided', async () => {
      await expect(service.transferDepartment([], 'BIS')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('successfully transfers students to target department and updates level', async () => {
      const studentId1 = new Types.ObjectId().toString();
      const studentId2 = new Types.ObjectId().toString();

      mockStudentProfileModel.updateMany.mockResolvedValue({
        modifiedCount: 2,
      });

      mockStudentProfileModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest
            .fn()
            .mockResolvedValue([
              { userId: new Types.ObjectId() },
              { userId: new Types.ObjectId() },
            ]),
        }),
      });

      mockAcademicProfileModel.updateMany.mockResolvedValue({
        modifiedCount: 2,
      });

      const result = await service.transferDepartment(
        [studentId1, studentId2],
        'BIS',
        '3',
      );

      expect(result.updatedCount).toBe(2);
      expect(result.message).toContain('نظم معلومات الأعمال');
      expect(mockStudentProfileModel.updateMany).toHaveBeenCalledWith(
        expect.any(Object),
        {
          $set: { department: 'BIS', level: '3' },
        },
      );
      expect(mockAcademicProfileModel.updateMany).toHaveBeenCalled();
    });

    it('transfers students to Accounting without level change', async () => {
      const studentId = new Types.ObjectId().toString();

      mockStudentProfileModel.updateMany.mockResolvedValue({
        modifiedCount: 1,
      });

      const result = await service.transferDepartment(
        [studentId],
        'ACCOUNTING',
      );

      expect(result.updatedCount).toBe(1);
      expect(result.message).toContain('المحاسبة والمراجعة');
      expect(mockStudentProfileModel.updateMany).toHaveBeenCalledWith(
        expect.any(Object),
        {
          $set: { department: 'ACCOUNTING' },
        },
      );
      expect(mockAcademicProfileModel.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('reset-password email language', () => {
    it.each(['ar', 'en'] as const)(
      'uses the admin request language %s',
      async (lang) => {
        const userId = new Types.ObjectId();
        mockStudentProfileModel.findById = jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            userId,
            fullName: 'Test Student',
            studentCode: '2026001',
            academicEmail: 'student@example.edu',
          }),
        });
        mockUsersService.findByIdWithNationalId = jest
          .fn()
          .mockResolvedValue({ email: 'student@example.edu' });
        mockUsersService.updatePassword = jest.fn().mockResolvedValue({});
        await service.resetPassword(
          new Types.ObjectId().toString(),
          { newPassword: 'Temporary-pass-123', mustChangePassword: true },
          undefined,
          lang,
        );
        expect(mockEmailsService.send).toHaveBeenCalledWith(
          expect.objectContaining({
            subject: expect.stringContaining(
              lang === 'ar' ? 'بوابة الطالب' : 'Student Portal',
            ),
            html: expect.stringContaining(`lang="${lang}"`),
            event: 'admin_password_reset',
          }),
        );
      },
    );
  });

  describe('create()', () => {
    it('rejects managed historical codes before creating another identity', async () => {
      mockStudentProfileModel.db.collection.mockReturnValueOnce({
        findOne: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
      });
      await expect(
        service.create({ studentCode: '270001' } as Parameters<
          StudentsService['create']
        >[0]),
      ).rejects.toMatchObject({
        response: { code: 'STUDENT_CODE_MANAGED_BY_ADMISSIONS' },
      });
      expect(mockUsersService.createUser).not.toHaveBeenCalled();
    });
    it('throws ConflictException if studentCode already exists', async () => {
      mockUsersService.findByStudentCode.mockResolvedValue({
        _id: 'existing-id',
      });

      await expect(
        service.create({
          studentCode: '2026001',
          nationalId: '30101010101010',
          fullName: 'Test Student',
        } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('creates student account and profile when valid', async () => {
      mockUsersService.findByStudentCode.mockResolvedValue(null);
      const fakeUserId = new Types.ObjectId();
      mockUsersService.createUser.mockResolvedValue({
        _id: fakeUserId,
        studentCode: '2026001',
      });
      mockStudentProfileModel.create.mockResolvedValue({
        _id: new Types.ObjectId(),
        userId: fakeUserId,
        studentCode: '2026001',
      });

      const result = await service.create({
        studentCode: '2026001',
        nationalId: '30101010101010',
        fullName: 'أحمد علي',
      } as any);

      expect(result).toBeDefined();
      expect(mockUsersService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'student',
          studentCode: '2026001',
          name: 'أحمد علي',
        }),
      );
      expect(mockStudentProfileModel).toHaveBeenCalled();
    });
  });

  describe('update()', () => {
    it('updates student profile and ignores studentCode to keep it immutable', async () => {
      const studentId = new Types.ObjectId().toString();
      const fakeUserId = new Types.ObjectId();
      const mockProfile = {
        _id: new Types.ObjectId(studentId),
        userId: fakeUserId,
        studentCode: '272055',
        fullName: 'أحمد علي',
        save: jest.fn().mockResolvedValue(true),
      };

      mockStudentProfileModel.findByIdAndUpdate.mockResolvedValue(mockProfile);
      mockUsersService.findById = jest.fn().mockResolvedValue({
        name: 'أحمد علي',
        save: jest.fn().mockResolvedValue(true),
      });

      const result = await service.update(studentId, {
        studentCode: '999999',
        fullName: 'أحمد علي معدل',
      });

      expect(result).toBeDefined();
      expect(mockStudentProfileModel.findByIdAndUpdate).toHaveBeenCalledWith(
        studentId,
        {
          $set: expect.not.objectContaining({
            studentCode: '999999',
          }),
        },
        { new: true, runValidators: true },
      );
    });
  });

  describe('Portal Settings & Academic Reset', () => {
    it('getPortalSettings returns default settings when record does not exist', async () => {
      mockSystemSettingsModel.findOne.mockResolvedValueOnce(null);
      mockSystemSettingsModel.create.mockResolvedValueOnce({
        registrationVisible: true,
        syllabiVisible: true,
        studentLoginMaintenance: false,
      });

      const res = await service.getPortalSettings();
      expect(res).toEqual({
        registrationVisible: true,
        syllabiVisible: true,
        studentLoginMaintenance: false,
        studentLoginMaintenanceEta: null,
        studentLoginMaintenanceMessage: null,
      });
      expect(mockSystemSettingsModel.create).toHaveBeenCalled();
    });

    it('updatePortalSettings persists updated flags, maintenance mode, ETA, and user id', async () => {
      const mockSettingsDoc: Record<string, any> = {
        registrationVisible: true,
        syllabiVisible: true,
        studentLoginMaintenance: false,
        studentLoginMaintenanceEta: null,
        studentLoginMaintenanceMessage: null,
        save: jest.fn().mockResolvedValue(true),
      };
      mockSystemSettingsModel.findOne.mockResolvedValueOnce(mockSettingsDoc);

      const adminId = new Types.ObjectId().toString();
      const eta = '2026-11-24T15:30:00.000Z';
      const res = await service.updatePortalSettings(
        {
          registrationVisible: false,
          syllabiVisible: false,
          studentLoginMaintenance: true,
          studentLoginMaintenanceEta: eta,
          studentLoginMaintenanceMessage: 'تحديث الخوادم',
        },
        adminId,
      );

      expect(res).toEqual({
        registrationVisible: false,
        syllabiVisible: false,
        studentLoginMaintenance: true,
        studentLoginMaintenanceEta: eta,
        studentLoginMaintenanceMessage: 'تحديث الخوادم',
      });
      expect(mockSettingsDoc.save).toHaveBeenCalled();
    });

    it('resetAcademicRecords resets warnings and gpa across profiles to 0', async () => {
      mockStudentProfileModel.updateMany.mockResolvedValueOnce({
        modifiedCount: 12,
      });
      mockAcademicProfileModel.updateMany
        .mockResolvedValueOnce({ modifiedCount: 12 }) // for warnings
        .mockResolvedValueOnce({ modifiedCount: 15 }); // for gpa

      const res = await service.resetAcademicRecords({
        resetWarnings: true,
        resetGpa: true,
      });

      expect(res.success).toBe(true);
      expect(res.warningsResetCount).toBe(24);
      expect(res.gpaResetCount).toBe(15);
      expect(mockStudentProfileModel.updateMany).toHaveBeenCalledWith(
        {},
        { $set: { academicWarnings: 0 } },
      );
      expect(mockAcademicProfileModel.updateMany).toHaveBeenCalledWith(
        {},
        { $set: { gpa: 0 } },
      );
    });
  });
});
