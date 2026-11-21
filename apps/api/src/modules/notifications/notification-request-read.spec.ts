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

describe('notification history projection', () => {
  it('keeps exact read totals and hydrates all reference types with one lookup', async () => {
    const id = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const aggregate = jest.fn().mockResolvedValue([
      {
        _id: id,
        sentBy: userId,
        targetStudentId: userId,
        readCount: 23,
        readBy: Array.from({ length: 5 }, () => ({
          userId,
          readAt: new Date(),
        })),
      },
    ]);
    const find = jest.fn().mockReturnValue({
      select: () => ({
        lean: () =>
          Promise.resolve([
            {
              _id: userId,
              name: 'Synthetic',
              email: 'test@example.test',
              studentCode: '111111',
            },
          ]),
      }),
    });
    const service: NotificationsService = Object.assign(
      Object.create(NotificationsService.prototype) as NotificationsService,
      {
        notificationModel: {
          aggregate,
          countDocuments: () => Promise.resolve(1),
        },
        userModel: { find },
      },
    );
    const result = await service.listSentHistory({ limit: 10 });
    expect(result.items[0].readCount).toBe(23);
    expect(result.items[0].readBy).toHaveLength(5);
    expect(result.items[0].sentBy).toMatchObject({
      email: 'test@example.test',
    });
    expect(result.items[0].targetStudentId).not.toHaveProperty('email');
    expect(find).toHaveBeenCalledTimes(1);
    expect(find.mock.calls[0][0]._id.$in).toEqual([String(userId)]);
    expect(aggregate.mock.calls[0][0][3].$addFields.readCount).toEqual({
      $size: { $ifNull: ['$readBy', []] },
    });
  });
});

describe('bulk notification updates', () => {
  it('checks targeting and the current read/hidden state in the write', async () => {
    const userId = new Types.ObjectId();
    const target = {
      $or: [{ targetType: 'all' }, { targetStudentId: userId }],
    };
    const updateMany = jest
      .fn()
      .mockResolvedValueOnce({ modifiedCount: 2 })
      .mockResolvedValueOnce({ modifiedCount: 0 });
    const service = Object.assign(
      Object.create(NotificationsService.prototype) as NotificationsService,
      {
        buildStudentNotificationFilter: jest.fn().mockResolvedValue(target),
        notificationModel: { updateMany },
      },
    );

    await expect(service.markAllAsRead(userId.toHexString())).resolves.toEqual({
      modifiedCount: 2,
    });
    expect(updateMany).toHaveBeenNthCalledWith(
      1,
      { ...target, 'readBy.userId': { $ne: userId } },
      { $push: { readBy: { userId, readAt: expect.any(Date) } } },
    );

    await expect(
      service.hideAllReadNotifications(userId.toHexString()),
    ).resolves.toEqual({ modifiedCount: 0 });
    expect(updateMany).toHaveBeenNthCalledWith(
      2,
      {
        ...target,
        'readBy.userId': userId,
        'hiddenBy.userId': { $ne: userId },
      },
      { $push: { hiddenBy: { userId, hiddenAt: expect.any(Date) } } },
    );
  });
});
