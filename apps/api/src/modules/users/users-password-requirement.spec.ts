import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UsersService } from './users.service';
import { NotFoundException, ValidationPipe } from '@nestjs/common';
import {
  PasswordRequirementCodesQuery,
  StudentPasswordRequirementDto,
} from '../students/dto/student.dto';

describe('student password requirement management', () => {
  it.each([true, false])(
    'sets one student requirement to %s without changing passwords or other account fields',
    async (enabled) => {
      const query = {
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({
          _id: '507f1f77bcf86cd799439011',
          studentCode: '20260001',
          mustChangePassword: enabled,
        }),
      };
      const findOneAndUpdate = jest.fn().mockReturnValue(query);
      const users = new UsersService({ findOneAndUpdate } as never);
      await expect(
        users.setStudentPasswordRequirement('20260001', enabled),
      ).resolves.toEqual({ studentCode: '20260001', enabled });
      expect(findOneAndUpdate).toHaveBeenCalledWith(
        { role: 'student', studentCode: '20260001' },
        { $set: { mustChangePassword: enabled } },
        { new: true },
      );
      expect(query.select).toHaveBeenCalledWith(
        '_id studentCode mustChangePassword',
      );
    },
  );

  it('returns not found for an unknown or non-student code', async () => {
    const query = {
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    };
    const users = new UsersService({
      findOneAndUpdate: jest.fn().mockReturnValue(query),
    } as never);
    await expect(
      users.setStudentPasswordRequirement('20260001', false),
    ).rejects.toThrow(NotFoundException);
  });

  describe('single student request validation', () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    });
    const metadata = {
      type: 'body' as const,
      metatype: StudentPasswordRequirementDto,
    };
    it.each([true, false])(
      'accepts an explicit boolean %s and trims the code',
      async (enabled) => {
        await expect(
          pipe.transform({ studentCode: ' 20260001 ', enabled }, metadata),
        ).resolves.toMatchObject({ studentCode: '20260001', enabled });
      },
    );
    it.each([
      { studentCode: '', enabled: true },
      { studentCode: '123', enabled: false },
      { studentCode: 'abc1234', enabled: false },
      { studentCode: '1234567890123', enabled: true },
      { studentCode: '20260001', enabled: 'false' },
      { studentCode: '20260001', enabled: 1 },
      { studentCode: '20260001' },
      { studentCode: '20260001', enabled: true, role: 'admin' },
    ])('rejects invalid request %j', async (input) => {
      await expect(pipe.transform(input, metadata)).rejects.toThrow();
    });
  });

  it('clears the flag for all students, including a partially enabled population, without resetting passwords', async () => {
    const updateMany = jest.fn().mockResolvedValue({ modifiedCount: 83 });
    const users = new UsersService({ updateMany } as never);
    expect(await users.toggleAllStudentsMustChangePassword(false)).toEqual({
      enabled: false,
      modifiedCount: 83,
    });
    expect(updateMany).toHaveBeenCalledWith(
      { role: 'student' },
      { $set: { mustChangePassword: false } },
    );
  });

  it('lists only required student codes, using bounded pagination and a minimal projection', async () => {
    const query = {
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([{ studentCode: '20260001' }]),
    };
    const model = {
      find: jest.fn().mockReturnValue(query),
      countDocuments: jest.fn().mockResolvedValue(101),
    };
    const users = new UsersService(model as never);
    expect(await users.getStudentsMustChangePasswordCodes(2, 100)).toEqual({
      items: ['20260001'],
      page: 2,
      limit: 100,
      total: 101,
      totalPages: 2,
    });
    expect(model.find).toHaveBeenCalledWith({
      role: 'student',
      mustChangePassword: true,
    });
    expect(model.countDocuments).toHaveBeenCalledWith({
      role: 'student',
      mustChangePassword: true,
    });
    expect(query.select).toHaveBeenCalledWith('studentCode -_id');
    expect(query.skip).toHaveBeenCalledWith(100);
    expect(query.limit).toHaveBeenCalledWith(100);
  });

  it.each([
    { page: '0' },
    { page: '1.5' },
    { page: 'x' },
    { limit: '101' },
    { limit: '-1' },
  ])('rejects invalid pagination %j', async (input) => {
    expect(
      (await validate(plainToInstance(PasswordRequirementCodesQuery, input)))
        .length,
    ).toBeGreaterThan(0);
  });
});
