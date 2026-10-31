import { validate } from 'class-validator';
import { ValidationPipe } from '@nestjs/common';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { PERMISSIONS } from '@student-portal/shared';
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
});
