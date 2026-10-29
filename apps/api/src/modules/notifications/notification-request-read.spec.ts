import { Types } from 'mongoose';
import { NotificationsService } from './notifications.service';
import {
  getRequestQueryContext,
  runWithRequestQueryMetrics,
} from '../../core/metrics/request-query-context';

describe('notification identity reads', () => {
  const first = new Types.ObjectId();
  const second = new Types.ObjectId();
  const users = { findById: jest.fn() };
  const profiles = { findOne: jest.fn() };
  let service: NotificationsService;
  const filter = (id: Types.ObjectId) =>
    (
      service as unknown as {
        buildStudentNotificationFilter(id: string): Promise<unknown>;
      }
    ).buildStudentNotificationFilter(String(id));
  beforeEach(() => {
    jest.clearAllMocks();
    // Exercise the read path without initializing external push credentials.
    service = Object.create(
      NotificationsService.prototype,
    ) as NotificationsService;
    Object.assign(service, { userModel: users, studentProfileModel: profiles });
    users.findById.mockImplementation((id: string) => ({
      select: jest.fn().mockReturnValue({
        lean: () => Promise.resolve({ _id: new Types.ObjectId(id) }),
      }),
    }));
    profiles.findOne.mockReturnValue({
      select: jest
        .fn()
        .mockReturnValue({ lean: () => Promise.resolve({ level: '2' }) }),
    });
  });
  it('reuses only the matching authenticated read and preserves target filters', async () => {
    await runWithRequestQueryMetrics('fixture', async () => {
      getRequestQueryContext()!.request.reads.set(
        'auth-user:' + first.toHexString(),
        Promise.resolve({ _id: first }),
      );
      expect(await filter(first)).toEqual({
        $or: [
          { targetType: 'all' },
          { targetStudentId: first },
          { targetType: 'level', targetLevel: '2' },
        ],
      });
      expect(users.findById).not.toHaveBeenCalled();
      await filter(second);
      expect(users.findById).toHaveBeenCalledWith(String(second));
    });
    await runWithRequestQueryMetrics('next-request', () => filter(first));
    expect(users.findById).toHaveBeenCalledTimes(2);
  });
  it('does not seed the authentication cache with its smaller fallback projection', async () => {
    await runWithRequestQueryMetrics('fixture', async () => {
      await filter(first);
      expect(
        getRequestQueryContext()!.request.reads.has(
          'auth-user:' + first.toHexString(),
        ),
      ).toBe(false);
    });
    expect(users.findById.mock.results[0].value.select).toHaveBeenCalledWith(
      '_id',
    );
  });
  it('fails closed when the authenticated read is missing or rejected', async () => {
    await runWithRequestQueryMetrics('fixture', async () => {
      getRequestQueryContext()!.request.reads.set(
        'auth-user:' + first.toHexString(),
        Promise.resolve(null),
      );
      await expect(filter(first)).rejects.toThrow('Student not found');
      getRequestQueryContext()!.request.reads.set(
        'auth-user:' + first.toHexString(),
        Promise.reject(new Error('Database unavailable')),
      );
      await expect(filter(first)).rejects.toThrow('Database unavailable');
    });
    expect(users.findById).not.toHaveBeenCalled();
    expect(profiles.findOne).not.toHaveBeenCalled();
  });
});
