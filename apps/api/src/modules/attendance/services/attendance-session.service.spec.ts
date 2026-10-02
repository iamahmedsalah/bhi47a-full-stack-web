import { Types } from 'mongoose';
import { AttendanceSessionService } from './attendance-session.service';

describe('Attendance history pagination', () => {
  it('paginates the full filtered history, clamps stale pages, and summarizes only the current page', async () => {
    const id = new Types.ObjectId();
    const chain = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest
        .fn()
        .mockResolvedValue([
          { _id: id, status: 'OPEN', expiresAt: new Date(0) },
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
    const service = new AttendanceSessionService(
      sessions as never,
      records as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const staffId = new Types.ObjectId().toString();
    const result = await service.getSessionOverview(
      { _id: staffId, role: 'staff' },
      { page: 999, limit: 20, level: '4', courseCode: '315' },
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
