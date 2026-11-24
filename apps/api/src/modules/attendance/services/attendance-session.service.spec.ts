import { Types } from 'mongoose';
import { AttendanceSessionService } from './attendance-session.service';

it('invalidates the QR session cache after saving a geofence change', async () => {
  const _id = new Types.ObjectId();
  const session = {
    _id,
    status: 'OPEN',
    location: undefined,
    save: jest.fn().mockResolvedValue(undefined),
  };
  const model = {
    findById: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(session),
    }),
  };
  const cache = { del: jest.fn().mockResolvedValue(undefined) };
  const service = new AttendanceSessionService(
    model as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    cache as never,
  );

  await service.updateSessionLocation(
    _id.toString(),
    { _id: new Types.ObjectId().toString(), role: 'admin' },
    { latitude: 30, longitude: 31, radiusMeters: 75 },
  );
  expect(session.location).toMatchObject({ radiusMeters: 75 });
  expect(cache.del).toHaveBeenCalledWith(
    `attendance:session:${_id.toString()}`,
  );
  expect(session.save.mock.invocationCallOrder[0]).toBeLessThan(
    cache.del.mock.invocationCallOrder[0],
  );
});

describe('Attendance history pagination', () => {
  it('paginates the full filtered history, clamps stale pages, and summarizes only the current page', async () => {
    const id = new Types.ObjectId();
    const instructorId = new Types.ObjectId();
    const chain = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        {
          _id: id,
          createdBy: instructorId,
          createdByName: 'Mr. Ahmed Soliman',
          academicPosition: 'instructor',
          status: 'OPEN',
          expiresAt: new Date(0),
        },
      ]),
    };
    const sessions = {
      countDocuments: jest.fn().mockResolvedValue(55),
      find: jest.fn().mockReturnValue(chain),
      distinct: jest.fn().mockResolvedValue(['4']),
      aggregate: jest
        .fn()
        .mockResolvedValue([
          { _id: { code: '315', level: '4' }, name: 'Course' },
        ]),
    };
    const records = {
      aggregate: jest
        .fn()
        .mockResolvedValueOnce([{ total: 150, present: 100, late: 50 }])
        .mockResolvedValueOnce([
          { _id: id, total: 5, present: 3, late: 1, excused: 1 },
        ]),
    };
    const users = {
      distinct: jest.fn().mockResolvedValue([instructorId]),
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            {
              _id: instructorId,
              name: 'Mr. Ahmed Soliman',
              nameAr: 'أحمد سليمان',
              staffType: 'assistant_lecturer',
            },
          ]),
        }),
      }),
    };
    const service = new AttendanceSessionService(
      sessions as never,
      records as never,
      {} as never,
      {} as never,
      users as never,
      {} as never,
      {} as never,
    );
    const staffId = new Types.ObjectId().toString();
    const result = await service.getSessionOverview(
      { _id: staffId, role: 'staff' },
      { page: 999, limit: 20, level: '4', courseCode: '315', search: 'أحمد' },
    );
    expect(result.total).toBe(55);
    expect(result.totalPages).toBe(3);
    expect(result.page).toBe(3);
    expect(chain.skip).toHaveBeenCalledWith(40);
    expect(chain.limit).toHaveBeenCalledWith(20);
    expect(sessions.find.mock.calls[0][0].$and).toContainEqual({
      createdBy: new Types.ObjectId(staffId),
    });
    expect(result.sessions[0].status).toBe('EXPIRED');
    expect(result.sessions[0]).toMatchObject({
      createdByNameAr: 'م. م أحمد سليمان',
      createdByNameEn: 'A.L. Ahmed Soliman',
      instructorStaffType: 'assistant_lecturer',
    });
    expect(sessions.find.mock.calls[0][0].$and).toContainEqual({
      $or: [
        { courseCode: /أحمد/i },
        { courseName: /أحمد/i },
        { createdByName: /أحمد/i },
        { createdBy: { $in: [instructorId] } },
      ],
    });
    expect(result.sessions[0].stats).toEqual({
      totalCheckedIn: 5,
      presentCount: 3,
      lateCount: 1,
      excusedCount: 1,
    });
    expect(records.aggregate.mock.calls[1][0][0]).toEqual({
      $match: { sessionId: { $in: [id] } },
    });
    expect(records.aggregate.mock.calls[0][0][0].$lookup.pipeline[0]).toEqual({
      $match: { createdBy: new Types.ObjectId(staffId) },
    });
  });
});
