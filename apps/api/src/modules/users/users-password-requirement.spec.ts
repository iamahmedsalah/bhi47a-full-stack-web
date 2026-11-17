import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UsersService } from './users.service';
import { PasswordRequirementCodesQuery } from '../students/dto/student.dto';

describe('student password requirement management', () => {
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
