import { AuthSessionService } from './auth-session.service';

describe('Account display names', () => {
  it('returns both student profile names for every page using the current account', async () => {
    const select = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        fullNameAr: 'أحمد علي',
        fullNameEn: 'Ahmed Ali',
      }),
    });
    const service = new AuthSessionService(
      {
        findByIdForAuth: jest.fn().mockResolvedValue({
          _id: 'student-id',
          role: 'student',
          name: 'Legacy',
        }),
      } as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      { findOne: jest.fn().mockReturnValue({ select }) } as never,
    );
    const result = await service.getMe('student-id');
    expect(result.nameAr).toBe('أحمد علي');
    expect(result.nameEn).toBe('Ahmed Ali');
    expect(select).toHaveBeenCalledWith('fullNameAr fullNameEn');
  });

  it('keeps staff names without fetching a student profile', async () => {
    const findOne = jest.fn();
    const service = new AuthSessionService(
      {
        findByIdForAuth: jest.fn().mockResolvedValue({
          _id: 'staff-id',
          role: 'staff',
          name: 'Ahmed',
          nameAr: 'أحمد',
        }),
      } as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      { findOne } as never,
    );
    expect((await service.getMe('staff-id')).nameAr).toBe('أحمد');
    expect(findOne).not.toHaveBeenCalled();
  });
});
