import { validate } from 'class-validator';
import { PERMISSIONS } from '@student-portal/shared';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { StaffManagementController } from './staff-management.controller';
import { StaffManagementService } from './staff-management.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffPermissionsDto } from './dto/update-staff-permissions.dto';

describe('Staff management security contracts', () => {
  it('protects the complete controller with the admin role', () => {
    expect(Reflect.getMetadata(ROLES_KEY, StaffManagementController)).toEqual([
      'admin',
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

  it('revokes sessions and forces password change after an admin reset', async () => {
    const users = {
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
    );

    expect(users.updateOne).toHaveBeenCalledWith(
      { _id: '507f1f77bcf86cd799439011', role: 'staff' },
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
});
