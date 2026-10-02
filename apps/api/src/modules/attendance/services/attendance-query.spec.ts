import { Types } from 'mongoose';
import { validate } from 'class-validator';
import { QueryAttendanceSessionsDto } from '../dto/attendance-session.dto';
import {
  attendanceSessionFilter,
  attendanceSessionScope,
} from './attendance-query';

describe('Attendance session filters', () => {
  const staff = { _id: new Types.ObjectId().toString(), role: 'staff' };
  it('scopes staff history and exports to their own sessions', () => {
    expect(attendanceSessionScope(staff)).toEqual({
      createdBy: new Types.ObjectId(staff._id),
    });
    expect(attendanceSessionScope({ _id: staff._id, role: 'admin' })).toEqual(
      {},
    );
  });
  it('combines level, course, escaped search and ended status without overwriting ownership', () => {
    const now = new Date('2026-10-02T12:00:00Z');
    const filter = attendanceSessionFilter(
      staff,
      {
        page: 1,
        limit: 20,
        level: '4',
        courseCode: ' cs101 ',
        search: '.*[a]',
        status: 'ENDED',
      },
      now,
    );
    const conditions = filter.$and!;
    expect(conditions[0]).toEqual({ createdBy: new Types.ObjectId(staff._id) });
    expect(conditions).toContainEqual({ level: '4' });
    expect(conditions).toContainEqual({ courseCode: 'CS101' });
    expect(conditions).toContainEqual({
      $or: [
        { status: { $in: ['CLOSED', 'EXPIRED'] } },
        { status: 'OPEN', expiresAt: { $lte: now } },
      ],
    });
    const regex = conditions.at(-1)!.$or![0].courseCode as RegExp;
    expect(regex.test('prefix .*[a] suffix')).toBe(true);
    expect(regex.test('anything a')).toBe(false);
  });
  it('excludes expired open sessions from the live filter', () => {
    const now = new Date();
    expect(
      attendanceSessionFilter(
        staff,
        { page: 1, limit: 20, status: 'OPEN' },
        now,
      ).$and,
    ).toContainEqual({ status: 'OPEN', expiresAt: { $gt: now } });
  });
  it('rejects fractional pages and unbounded page sizes', async () => {
    const query = Object.assign(new QueryAttendanceSessionsDto(), {
      page: 1.5,
      limit: 1000,
      status: 'wrong',
    });
    expect(
      (await validate(query)).map((error) => error.property).sort(),
    ).toEqual(['limit', 'page', 'status']);
  });
});
