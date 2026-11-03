import { AuthSessionService } from '../auth/services/auth-session.service';
import { Types } from 'mongoose';
import { QueryStaffDto } from './dto/query-staff.dto';
import { validate } from 'class-validator';
import { ValidationPipe, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { QueryStaffCoursesDto } from './dto/query-staff-courses.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import {
  PERMISSIONS,
  getStaffPrefix,
  inferDoctorPrefix,
  stripStaffTitlePrefix,
  formatStaffDisplayName,
  getStaffRoleLabel,
} from '@student-portal/shared';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { StaffManagementController } from './staff-management.controller';
import { StaffManagementService } from './staff-management.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffPermissionsDto } from './dto/update-staff-permissions.dto';

describe('Staff management security contracts', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const updateMetadata = { type: 'body' as const, metatype: UpdateStaffDto };
  it('accepts profile edits and trims optional fields, while rejecting injected account roles', async () => {
    await expect(
      pipe.transform(
        {
          name: '  Staff name  ',
          nameAr: 'اسم عربي',
          username: '',
          phone: '',
          staffType: 'assistant_lecturer',
        },
        updateMetadata,
      ),
    ).resolves.toMatchObject({
      name: 'Staff name',
      nameAr: 'اسم عربي',
      username: '',
      phone: '',
    });
    await expect(
      pipe.transform({ name: 'Staff name', role: 'admin' }, updateMetadata),
    ).rejects.toThrow('Bad Request');
  });
  it.each([
    { nameAr: 'س' },
    { username: 'a b' },
    { name: null },
    { email: null },
    { username: null },
    { phone: '1'.repeat(31) },
  ])('rejects invalid profile fields: %j', async (body) => {
    await expect(pipe.transform(body, updateMetadata)).rejects.toThrow(
      'Bad Request',
    );
  });
  it.each(['email', 'username'] as const)(
    'returns a field-specific %s conflict',
    async (field) => {
      const current = { role: 'staff', staffType: 'doctor' };
      const lookup = {
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            [field]: field === 'email' ? 'taken@example.test' : 'taken_user',
          }),
        }),
      };
      const users = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(current)
          .mockReturnValueOnce(lookup),
      };
      const service = new StaffManagementService(users as never, {} as never);
      try {
        await service.update(
          '507f1f77bcf86cd799439011',
          { [field]: field === 'email' ? 'taken@example.test' : 'taken_user' },
          '507f1f77bcf86cd799439012',
          'admin',
        );
        throw new Error('Expected a conflict');
      } catch (error: unknown) {
        expect(error).toHaveProperty(
          'response',
          expect.objectContaining({
            code:
              field === 'email' ? 'STAFF_EMAIL_TAKEN' : 'STAFF_USERNAME_TAKEN',
            errors: {
              [field]: field === 'email' ? 'emailTaken' : 'usernameTaken',
            },
          }),
        );
      }
    },
  );
  it('requires academic staff management permission for forms and course selectors', () => {
    const guard = new PermissionsGuard(new Reflector());
    for (const method of [
      'create',
      'update',
      'courseChoices',
      'assignedCourses',
    ] as const) {
      const context = (permissions: string[]) =>
        ({
          getHandler: () =>
            Object.getOwnPropertyDescriptor(
              StaffManagementController.prototype,
              method,
            )!.value as () => void,
          getClass: () => StaffManagementController,
          switchToHttp: () => ({
            getRequest: () => ({ user: { role: 'staff', permissions } }),
          }),
        }) as ExecutionContext;
      expect(() => guard.canActivate(context([]))).toThrow(
        'Insufficient permissions',
      );
      expect(() =>
        guard.canActivate(context([PERMISSIONS.STAFF_READ])),
      ).toThrow('Insufficient permissions');
      expect(
        guard.canActivate(context([PERMISSIONS.STAFF_CREATE_ACADEMIC])),
      ).toBe(true);
    }
  });
  it('bounds course selector pagination and rejects injected query fields', async () => {
    const metadata = { type: 'query' as const, metatype: QueryStaffCoursesDto };
    await expect(
      pipe.transform({ page: '2', limit: '100' }, metadata),
    ).resolves.toMatchObject({ page: 2, limit: 100 });
    for (const query of [
      { page: 0 },
      { limit: 101 },
      { staffId: 'injected' },
    ]) {
      await expect(pipe.transform(query, metadata)).rejects.toThrow(
        'Bad Request',
      );
    }
  });
  it('validates course IDs and permissions for both create and update', async () => {
    for (const Model of [CreateStaffDto, UpdateStaffDto]) {
      const dto = Object.assign(new Model(), {
        courseIds: ['invalid'],
        permissions: ['invalid'],
      });
      const errors = await validate(dto);
      expect(errors.map((error) => error.property)).toEqual(
        expect.arrayContaining(['courseIds', 'permissions']),
      );
    }
  });
  it('revokes existing sessions only when profile permissions actually change', async () => {
    const current = {
      role: 'staff',
      staffType: 'doctor',
      permissions: [PERMISSIONS.STUDENTS_READ],
      tokenVersion: 7,
      get: (key: string) =>
        key === 'permissions' ? current.permissions : undefined,
      set: (values: object) => Object.assign(current, values),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const service = new StaffManagementService(
      { findOne: jest.fn().mockResolvedValue(current) } as never,
      { create: jest.fn().mockResolvedValue({}) } as never,
    );
    jest.spyOn(service, 'getById').mockResolvedValue({} as never);
    await service.update(
      '507f1f77bcf86cd799439011',
      { permissions: [PERMISSIONS.STUDENTS_READ] },
      '507f1f77bcf86cd799439012',
      'admin',
    );
    expect(current.tokenVersion).toBe(7);
    await service.update(
      '507f1f77bcf86cd799439011',
      { permissions: [] },
      '507f1f77bcf86cd799439012',
      'admin',
    );
    expect(current.tokenVersion).toBe(8);
  });
  it('protects the complete controller with the admin and staff roles', () => {
    expect(Reflect.getMetadata(ROLES_KEY, StaffManagementController)).toEqual([
      'admin',
      'staff',
    ]);
  });

  it('rejects permission values outside the shared assignable catalog', async () => {
    const dto = new UpdateStaffPermissionsDto();
    dto.permissions = [PERMISSIONS.STUDENTS_READ, 'danger.fake'];

    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('permissions');
  });

  it('accepts valid, unique staff permissions', async () => {
    const dto = new UpdateStaffPermissionsDto();
    dto.permissions = [PERMISSIONS.STUDENTS_READ, PERMISSIONS.COMPLAINTS_REPLY];

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('requires strong temporary passwords for new staff accounts', async () => {
    const dto = Object.assign(new CreateStaffDto(), {
      name: 'Test Staff',
      email: 'staff@example.edu',
      password: 'short',
      permissions: [],
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'password')).toBe(true);
  });

  it('prevents non-admin actors from creating admin accounts', async () => {
    const users = {
      exists: jest.fn().mockResolvedValue(false),
    };
    const auditLogs = { create: jest.fn().mockResolvedValue({}) };
    const service = new StaffManagementService(
      users as never,
      auditLogs as never,
    );

    const dto = Object.assign(new CreateStaffDto(), {
      name: 'Fake Admin',
      email: 'fakeadmin@example.edu',
      password: 'StrongPassword123!',
      role: 'admin' as const,
      staffType: 'doctor' as const,
    });

    await expect(
      service.create(dto, '507f1f77bcf86cd799439012', 'staff'),
    ).rejects.toThrow(
      'Administrative staff cannot create administrator accounts',
    );
  });

  it('prevents non-admin actors from creating administrative staff accounts', async () => {
    const users = {
      exists: jest.fn().mockResolvedValue(false),
    };
    const auditLogs = { create: jest.fn().mockResolvedValue({}) };
    const service = new StaffManagementService(
      users as never,
      auditLogs as never,
    );

    const dto = Object.assign(new CreateStaffDto(), {
      name: 'Another Admin Staff',
      email: 'adminstaff@example.edu',
      password: 'StrongPassword123!',
      role: 'staff' as const,
      staffType: 'administrative' as const,
    });

    await expect(
      service.create(dto, '507f1f77bcf86cd799439012', 'staff'),
    ).rejects.toThrow(
      'Administrative staff may only create Doctor and Teaching Assistant accounts',
    );
  });

  it('revokes sessions and forces password change after a password reset', async () => {
    const mockStaff = {
      _id: '507f1f77bcf86cd799439011',
      role: 'staff',
      staffType: 'doctor',
    };
    const users = {
      findOne: jest.fn().mockResolvedValue(mockStaff),
      updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
    };
    const auditLogs = { create: jest.fn().mockResolvedValue({}) };
    const service = new StaffManagementService(
      users as never,
      auditLogs as never,
    );

    await service.resetPassword(
      '507f1f77bcf86cd799439011',
      { newPassword: 'TemporaryPass123!' },
      '507f1f77bcf86cd799439012',
      'admin',
    );

    expect(users.updateOne).toHaveBeenCalledWith(
      { _id: '507f1f77bcf86cd799439011', role: { $in: ['staff', 'admin'] } },
      expect.objectContaining({
        $set: expect.objectContaining({ mustChangePassword: true }),
        $unset: expect.objectContaining({ refreshTokenHash: 1 }),
        $inc: { tokenVersion: 1 },
      }),
    );
    const update = users.updateOne.mock.calls[0][1];
    expect(update.$set.passwordHash).not.toBe('TemporaryPass123!');
    expect(auditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'password_reset' }),
    );
  });

  it('permanently deletes staff and records audit log when actor is admin', async () => {
    const mockStaff = {
      _id: '507f1f77bcf86cd799439011',
      userCode: 'STF-0010',
      name: 'Dr. Test',
      email: 'test@example.com',
      username: 'drtest',
      role: 'staff',
    };
    const users = {
      findOne: jest.fn().mockResolvedValue(mockStaff),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    };
    const auditLogs = { create: jest.fn().mockResolvedValue({}) };
    const service = new StaffManagementService(
      users as never,
      auditLogs as never,
    );

    const result = await service.delete(
      '507f1f77bcf86cd799439011',
      '507f1f77bcf86cd799439099',
      'admin',
    );

    expect(users.findOne).toHaveBeenCalledWith({
      _id: '507f1f77bcf86cd799439011',
      role: { $in: ['staff', 'admin'] },
    });
    expect(auditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'deleted',
        targetStaffId: expect.anything(),
        actorId: expect.anything(),
      }),
    );
    expect(users.deleteOne).toHaveBeenCalledWith({
      _id: mockStaff._id,
    });
    expect(result.success).toBe(true);
  });

  it.each(['prof', 'assoc_prof', 'dr'] as const)(
    'includes the saved %s title in the current account response',
    async (titlePrefix) => {
      const session = new AuthSessionService(
        {
          findByIdForAuth: jest.fn().mockResolvedValue({
            _id: new Types.ObjectId(),
            role: 'staff',
            staffType: 'doctor',
            name: 'Doctor Name',
            titlePrefix,
          }),
        } as never,
        {} as never,
        {} as never,
      );
      expect(
        (await session.getMe('507f1f77bcf86cd799439011')).titlePrefix,
      ).toBe(titlePrefix);
    },
  );

  describe('doctor title persistence across public staff responses', () => {
    function setup() {
      const stored: Record<string, unknown> = {
        _id: new Types.ObjectId(),
        role: 'staff',
        staffType: 'doctor',
        name: 'Doctor Name',
        isActive: true,
      };
      stored.get = (key: string) => stored[key];
      stored.set = (values: object) => Object.assign(stored, values);
      stored.save = jest.fn().mockResolvedValue(stored);
      const query = (value: unknown) => {
        const result = Promise.resolve(value);
        return Object.assign(result, {
          select: () => result,
          session: () => result,
          sort: () => result,
          skip: () => result,
          limit: () => result,
          lean: () => Promise.resolve(value),
        });
      };
      const users = {
        findOne: jest.fn((filter: Record<string, unknown>) =>
          query(filter._id && !filter.$or ? stored : null),
        ),
        find: jest.fn(() => query([stored])),
        countDocuments: jest.fn().mockResolvedValue(1),
        create: jest.fn(
          (payload: Record<string, unknown> | Record<string, unknown>[]) => {
            Object.assign(
              stored,
              Array.isArray(payload) ? payload[0] : payload,
            );
            return Promise.resolve(Array.isArray(payload) ? [stored] : stored);
          },
        ),
        db: {
          transaction: jest.fn((callback: (session: object) => unknown) =>
            callback({}),
          ),
        },
      };
      const assignments = { sync: jest.fn().mockResolvedValue(undefined) };
      const service = new StaffManagementService(
        users as never,
        { create: jest.fn().mockResolvedValue({}) } as never,
        { hash: jest.fn().mockResolvedValue('synthetic-hash') } as never,
        assignments as never,
      );
      return { stored, service, assignments, users };
    }

    it.each(['doctor', 'teaching_assistant', 'assistant_lecturer'] as const)(
      'lets a staff manager create and edit %s courses and permissions atomically',
      async (staffType) => {
        const { service, stored, assignments, users } = setup();
        const actor = '507f1f77bcf86cd799439012';
        const courseIds = ['507f1f77bcf86cd799439013'];
        const created = await service.create(
          {
            name: 'Managed academic',
            email: 'academic@example.test',
            password: 'SyntheticPassword123!',
            staffType,
            courseIds,
            permissions: [PERMISSIONS.ATTENDANCE_READ],
          },
          actor,
          'staff',
        );
        expect(created.permissions).toEqual([PERMISSIONS.ATTENDANCE_READ]);
        expect(assignments.sync).toHaveBeenCalledWith(
          stored,
          courseIds,
          expect.any(Object),
        );
        const updated = await service.update(
          created._id,
          {
            courseIds: [],
            permissions: [PERMISSIONS.STUDENTS_READ],
          },
          actor,
          'staff',
        );
        expect(updated.permissions).toEqual([PERMISSIONS.STUDENTS_READ]);
        expect(stored.tokenVersion).toBe(1);
        expect(assignments.sync).toHaveBeenLastCalledWith(
          stored,
          [],
          expect.any(Object),
        );
        expect(users.db.transaction).toHaveBeenCalledTimes(2);
      },
    );

    it.each(['admin', 'administrative'] as const)(
      'keeps %s accounts protected from staff manager form edits',
      async (type) => {
        const { service, stored, assignments } = setup();
        Object.assign(
          stored,
          type === 'admin' ? { role: 'admin' } : { staffType: type },
        );
        await expect(
          service.update(
            String(stored._id),
            {
              courseIds: [],
              permissions: [],
            },
            '507f1f77bcf86cd799439012',
            'staff',
          ),
        ).rejects.toThrow(
          type === 'admin' ? 'cannot be customized' : 'cannot modify',
        );
        expect(assignments.sync).not.toHaveBeenCalled();
        expect(stored.save).not.toHaveBeenCalled();
      },
    );

    it.each(['prof', 'assoc_prof', 'dr'] as const)(
      'returns %s after creation, listing, updating and reloading',
      async (titlePrefix) => {
        const { stored, service } = setup();
        const actor = '507f1f77bcf86cd799439012';
        const created = await service.create(
          {
            name: 'Doctor Name',
            email: 'doctor@example.test',
            password: 'SyntheticPassword123!',
            staffType: 'doctor',
            titlePrefix,
          },
          actor,
          'admin',
        );
        expect(created.titlePrefix).toBe(titlePrefix);
        expect(stored.titlePrefix).toBe(titlePrefix);
        const listed = await service.list(
          Object.assign(new QueryStaffDto(), {
            page: 1,
            limit: 20,
            status: 'all',
          }),
          'admin',
        );
        expect(listed.items[0].titlePrefix).toBe(titlePrefix);
        const changed = titlePrefix === 'dr' ? 'prof' : 'dr';
        expect(
          (
            await service.update(
              created._id,
              { titlePrefix: changed },
              actor,
              'admin',
            )
          ).titlePrefix,
        ).toBe(changed);
        expect((await service.getById(created._id)).titlePrefix).toBe(changed);
        // Editing a legacy prefixed name cannot override an explicitly saved choice.
        expect(
          (
            await service.update(
              created._id,
              { name: 'Prof. Doctor Name' },
              actor,
              'admin',
            )
          ).titlePrefix,
        ).toBe(changed);
        const assistant = await service.update(
          created._id,
          { staffType: 'teaching_assistant' },
          actor,
          'admin',
        );
        expect(assistant.staffType).toBe('teaching_assistant');
        expect(assistant.titlePrefix).toBeUndefined();
        expect(stored.titlePrefix).toBeUndefined();
      },
    );

    it('never stores a doctor title on an administrator account', async () => {
      const { stored, service } = setup();
      const created = await service.create(
        {
          name: 'Administrator',
          email: 'admin@example.test',
          password: 'SyntheticPassword123!',
          role: 'admin',
          staffType: 'doctor',
          titlePrefix: 'prof',
        },
        '507f1f77bcf86cd799439012',
        'admin',
      );
      expect(created.titlePrefix).toBeUndefined();
      expect(stored.titlePrefix).toBeUndefined();
    });

    it.each([
      ['ا.د. أحمد', 'prof'],
      ['ا.م. أحمد', 'assoc_prof'],
      ['أ.م.د. أحمد', 'assoc_prof'],
      ['د. أحمد', 'dr'],
      ['استاذ مشارك أحمد', 'assoc_prof'],
    ] as const)(
      'recognizes and strips the Arabic title in %s',
      (rawName, prefix) => {
        expect(inferDoctorPrefix(rawName)).toBe(prefix);
        expect(stripStaffTitlePrefix(rawName)).toBe('أحمد');
      },
    );
  });

  describe('Doctor title prefix handling and academic localization', () => {
    it('accepts valid doctor prefixes in UpdateStaffDto and CreateStaffDto', async () => {
      for (const prefix of ['dr', 'prof', 'assoc_prof'] as const) {
        await expect(
          pipe.transform(
            { staffType: 'doctor', titlePrefix: prefix },
            updateMetadata,
          ),
        ).resolves.toMatchObject({
          staffType: 'doctor',
          titlePrefix: prefix,
        });

        const createDto = new CreateStaffDto();
        createDto.name = 'Doctor Name';
        createDto.email = 'doc@institute.edu';
        createDto.password = 'StrongP@ssw0rd123';
        createDto.staffType = 'doctor';
        createDto.titlePrefix = prefix;
        const errors = await validate(createDto);
        expect(errors).toHaveLength(0);
      }
    });

    it('rejects invalid titlePrefix values', async () => {
      await expect(
        pipe.transform(
          { staffType: 'doctor', titlePrefix: 'invalid_title' },
          updateMetadata,
        ),
      ).rejects.toThrow('Bad Request');
    });

    it('infers doctor prefixes accurately from Arabic and English titles in raw names', () => {
      expect(inferDoctorPrefix('أ.د. هاني حسين')).toBe('prof');
      expect(inferDoctorPrefix('أستاذ دكتور أحمد')).toBe('prof');
      expect(inferDoctorPrefix('Prof. Dr. Hany Hussien')).toBe('prof');
      expect(inferDoctorPrefix('Prof. Hany')).toBe('prof');

      expect(inferDoctorPrefix('أ.م. هاني حسين')).toBe('assoc_prof');
      expect(inferDoctorPrefix('أستاذ مساعد دكتور')).toBe('assoc_prof');
      expect(inferDoctorPrefix('Assoc. Prof. Hany Hussien')).toBe('assoc_prof');

      expect(inferDoctorPrefix('د. هاني حسين')).toBe('dr');
      expect(inferDoctorPrefix('Dr. Hany Hussien')).toBe('dr');
      expect(inferDoctorPrefix('أحمد سليمان')).toBeUndefined();
    });

    it('formats display names with canonical Arabic and English doctor prefixes', () => {
      const profStaff = {
        name: 'Hany Hussien',
        nameAr: 'هاني حسين',
        staffType: 'doctor',
        titlePrefix: 'prof',
      };
      expect(getStaffPrefix(profStaff, 'ar')).toBe('أ.د.');
      expect(getStaffPrefix(profStaff, 'en')).toBe('Prof. Dr.');
      expect(formatStaffDisplayName(profStaff, 'ar')).toBe('أ.د. هاني حسين');
      expect(formatStaffDisplayName(profStaff, 'en')).toBe(
        'Prof. Dr. Hany Hussien',
      );

      const assocProfStaff = {
        name: 'Hany Hussien',
        nameAr: 'هاني حسين',
        staffType: 'doctor',
        titlePrefix: 'assoc_prof',
      };
      expect(getStaffPrefix(assocProfStaff, 'ar')).toBe('أ.م.');
      expect(getStaffPrefix(assocProfStaff, 'en')).toBe('Assoc. Prof.');
      expect(formatStaffDisplayName(assocProfStaff, 'ar')).toBe(
        'أ.م. هاني حسين',
      );
      expect(formatStaffDisplayName(assocProfStaff, 'en')).toBe(
        'Assoc. Prof. Hany Hussien',
      );

      const drStaff = {
        name: 'Hany Hussien',
        nameAr: 'هاني حسين',
        staffType: 'doctor',
        titlePrefix: 'dr',
      };
      expect(getStaffPrefix(drStaff, 'ar')).toBe('د.');
      expect(getStaffPrefix(drStaff, 'en')).toBe('Dr.');
      expect(formatStaffDisplayName(drStaff, 'ar')).toBe('د. هاني حسين');
      expect(formatStaffDisplayName(drStaff, 'en')).toBe('Dr. Hany Hussien');
    });

    it('returns localized academic role labels reflecting doctor ranks', () => {
      expect(getStaffRoleLabel('doctor', 'staff', 'ar', 'prof')).toBe(
        'أستاذ دكتور',
      );
      expect(getStaffRoleLabel('doctor', 'staff', 'en', 'prof')).toBe(
        'Professor (Doctor)',
      );
      expect(getStaffRoleLabel('doctor', 'staff', 'ar', 'assoc_prof')).toBe(
        'أستاذ مساعد',
      );
      expect(getStaffRoleLabel('doctor', 'staff', 'en', 'assoc_prof')).toBe(
        'Associate Professor',
      );
      expect(getStaffRoleLabel('doctor', 'staff', 'ar', 'dr')).toBe(
        'أستاذ مقرر (دكتور)',
      );
      expect(getStaffRoleLabel('teaching_assistant', 'staff', 'ar')).toBe(
        'معيد (هيئة تدريس)',
      );
      expect(getStaffRoleLabel('assistant_lecturer', 'staff', 'ar')).toBe(
        'مدرس مساعد (هيئة تدريس)',
      );
    });
  });
});
