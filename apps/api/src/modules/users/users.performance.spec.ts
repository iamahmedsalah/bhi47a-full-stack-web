import { ConfigService } from '@nestjs/config';
import { UsersService } from './users.service';
import { AuthSessionService } from '../auth/services/auth-session.service';
import { runWithRequestQueryMetrics } from '../../core/metrics/request-query-context';

describe('request-scoped auth user reads', () => {
  const id = '507f1f77bcf86cd799439011';
  function setup() {
    const account = {
      _id: id,
      role: 'student',
      name: 'Student',
      isActive: true,
      permissions: [],
      tokenVersion: 0,
      mustChangePassword: false,
    };
    const lean = jest.fn(() => Promise.resolve({ ...account }));
    const select = jest.fn().mockReturnValue({ lean });
    const findById = jest.fn(() => ({ select }));
    const updateOne = jest.fn().mockResolvedValue({ matchedCount: 0 });
    const users = new UsersService({ findById, updateOne } as never);
    const sessions = new AuthSessionService(
      users,
      {} as never,
      new ConfigService(),
    );
    return { account, users, sessions, lean, select, findById, updateOne };
  }

  it('reuses the strategy read for /me without loading credential fields', async () => {
    const test = setup();
    await runWithRequestQueryMetrics('first', async () => {
      await test.users.findByIdForAuth(id);
      expect(await test.sessions.getMe(id)).toMatchObject({
        _id: id,
        name: 'Student',
      });
    });
    expect(test.findById).toHaveBeenCalledTimes(1);
    expect(test.select.mock.calls[0]?.[0]).not.toMatch(
      /passwordHash|nationalId|googleLinkOtp|resetPassword/,
    );
    test.account.isActive = false;
    test.account.tokenVersion = 1;
    test.account.permissions = [];
    await runWithRequestQueryMetrics('next', async () => {
      expect(await test.users.findByIdForAuth(id)).toMatchObject({
        isActive: false,
        tokenVersion: 1,
      });
    });
    expect(test.findById).toHaveBeenCalledTimes(2);
  });

  it('does not share promises between simultaneous HTTP requests', async () => {
    const test = setup();
    await Promise.all(
      ['a', 'b'].map((request) =>
        runWithRequestQueryMetrics(request, () =>
          Promise.all([
            test.users.findByIdForAuth(id),
            test.users.findByIdForAuth(id),
          ]),
        ),
      ),
    );
    expect(test.findById).toHaveBeenCalledTimes(2);
  });

  it('keeps the late-heartbeat write conditional on no logout, while reusing its read', async () => {
    const test = setup();
    await runWithRequestQueryMetrics('heartbeat', async () => {
      await test.users.findByIdForAuth(id);
      await test.users.recordUserActivity(id, { route: '/dashboard' });
    });
    expect(test.findById).toHaveBeenCalledTimes(1);
    expect(test.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: id,
        $or: [{ lastLogoutAt: { $exists: false } }, { lastLogoutAt: null }],
      }),
      expect.any(Object),
    );
  });
});
