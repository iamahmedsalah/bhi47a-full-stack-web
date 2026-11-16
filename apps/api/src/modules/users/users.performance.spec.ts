import { ConfigService } from '@nestjs/config';
import { UsersService } from './users.service';
import { AuthSessionService } from '../auth/services/auth-session.service';
import {
  AuthService,
  mapRouteToAction,
  parseDeviceFromUserAgent,
} from '../auth/auth.service';
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

  it('coalesces recent route heartbeats but preserves action and navigation writes', async () => {
    const test = setup();
    Object.assign(test.account, {
      lastActiveAt: new Date(),
      sessionStartedAt: new Date(),
      lastActionRoute: '/dashboard',
      lastAction: mapRouteToAction('/dashboard').action,
      lastActionAr: mapRouteToAction('/dashboard').actionAr,
      sessionDevice: parseDeviceFromUserAgent('synthetic-agent'),
    });
    const auth = new AuthService(
      {} as never,
      {} as never,
      {} as never,
      test.users,
    );
    await auth.recordHeartbeat(id, { route: '/dashboard' }, 'synthetic-agent');
    expect(test.updateOne).not.toHaveBeenCalled();
    await test.users.recordUserActivity(id, {
      route: '/dashboard',
      action: 'Download',
    });
    await test.users.recordUserActivity(id, { route: '/dashboard/results' });
    expect(test.updateOne).toHaveBeenCalledTimes(2);
  });

  it('preserves login and activity history on logout and clears only the session start', async () => {
    const login = new Date('2026-11-02T12:00:00Z');
    const row = {
      lastLoginAt: login,
      lastActiveAt: login,
      sessionStartedAt: login,
    };
    const findByIdAndUpdate = jest.fn(
      (
        _id: string,
        update: {
          $set: Record<string, unknown>;
          $unset?: Record<string, number>;
        },
      ) => {
        Object.assign(row, update.$set);
        for (const key of Object.keys(update.$unset ?? {}))
          Reflect.deleteProperty(row, key);
        return Promise.resolve();
      },
    );
    const users = new UsersService({ findByIdAndUpdate } as never);
    await users.recordLogout(id);
    expect(row.lastLoginAt).toBe(login);
    expect(row.lastActiveAt).toBe(login);
    expect(row.sessionStartedAt).toBeUndefined();
    expect(row).toMatchObject({ lastLogoutAt: expect.any(Date) });
  });

  it('returns the new login time even when auth data was already read in this request', async () => {
    const row = { _id: id, lastLoginAt: new Date(0) };
    const lean = jest.fn(() => Promise.resolve({ ...row }));
    const findById = jest.fn(() => ({ select: () => ({ lean }) }));
    const findByIdAndUpdate = jest.fn(
      (_id: string, update: { $set: Record<string, unknown> }) =>
        Promise.resolve(Object.assign(row, update.$set)),
    );
    const users = new UsersService({ findById, findByIdAndUpdate } as never);
    await runWithRequestQueryMetrics('login', async () => {
      expect((await users.findByIdForAuth(id))?.lastLoginAt?.getTime()).toBe(0);
      await users.resetAttemptsAndUpdateLastLogin(id);
      const current = await users.findByIdForAuth(id);
      expect(current?.lastLoginAt?.getTime()).toBeGreaterThan(0);
    });
    expect(lean).toHaveBeenCalledTimes(2);
  });
});
