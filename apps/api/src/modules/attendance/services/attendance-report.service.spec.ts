import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { AttendanceController } from '../attendance.controller';
import { DeleteAttendanceRecordsDto } from '../dto/attendance-session.dto';
import { PERMISSIONS_KEY } from '../../auth/decorators/permissions.decorator';
import {
  ATTENDANCE_RECORD_DELETE_LIMIT,
  PERMISSIONS,
} from '@student-portal/shared';
import { validate } from 'class-validator';
import { AttendanceReportService } from './attendance-report.service';

describe('Attendance record deletion', () => {
  const sessionId = new Types.ObjectId();
  const actorId = new Types.ObjectId();
  const recordIds = [new Types.ObjectId(), new Types.ObjectId()];
  const selected = recordIds.map(String);

  it.each(['deleteSession', 'deleteSessionRecords'])(
    'requires the delegated deletion permission for %s',
    (method) => {
      const handler = Object.getOwnPropertyDescriptor(
        AttendanceController.prototype,
        method,
      )!.value as () => void;
      expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([
        PERMISSIONS.ATTENDANCE_DELETE,
      ]);
    },
  );

  it.each([
    ['admin', 2],
    ['staff', 0],
  ] as const)(
    'lets %s delete a scoped session with %i records in one transaction',
    async (role, deletedCount) => {
      const transaction = {};
      const deleteOne = jest.fn().mockResolvedValue({ deletedCount: 1 });
      const deleteMany = jest.fn().mockResolvedValue({ deletedCount });
      const closeSessionStream = jest.fn();
      const service = new AttendanceReportService(
        { deleteMany } as never,
        {
          deleteOne,
          db: {
            transaction: async (work: (session: object) => Promise<unknown>) =>
              work(transaction),
          },
        } as never,
        {} as never,
        { closeSessionStream } as never,
        {} as never,
      );
      const user = { _id: actorId.toString(), role };
      await expect(
        service.deleteSession(sessionId.toString(), user),
      ).resolves.toEqual({ deletedCount });
      expect(deleteOne).toHaveBeenCalledWith(
        {
          _id: sessionId,
          ...(role === 'staff' ? { createdBy: actorId } : {}),
        },
        { session: transaction },
      );
      expect(deleteMany).toHaveBeenCalledWith(
        { sessionId },
        { session: transaction },
      );
      expect(closeSessionStream).toHaveBeenCalledWith(sessionId.toString());
    },
  );

  it('does not delete records when the session is missing or outside staff scope', async () => {
    const deleteMany = jest.fn();
    const closeSessionStream = jest.fn();
    const service = new AttendanceReportService(
      { deleteMany } as never,
      {
        deleteOne: jest.fn().mockResolvedValue({ deletedCount: 0 }),
        db: {
          transaction: async (work: (session: object) => Promise<unknown>) =>
            work({}),
        },
      } as never,
      {} as never,
      { closeSessionStream } as never,
      {} as never,
    );
    await expect(
      service.deleteSession(sessionId.toString(), {
        _id: actorId.toString(),
        role: 'staff',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(deleteMany).not.toHaveBeenCalled();
    expect(closeSessionStream).not.toHaveBeenCalled();
  });

  it('validates a non-empty bounded list of record IDs', async () => {
    const check = (ids: string[]) =>
      validate(
        Object.assign(new DeleteAttendanceRecordsDto(), { recordIds: ids }),
      );
    await expect(check(selected)).resolves.toHaveLength(0);
    for (const ids of [
      [],
      ['invalid'],
      [selected[0], selected[0]],
      Array.from({ length: ATTENDANCE_RECORD_DELETE_LIMIT + 1 }, () =>
        new Types.ObjectId().toString(),
      ),
    ]) {
      await expect(check(ids)).resolves.not.toHaveLength(0);
    }
  });

  it.each(['admin', 'staff'])(
    'limits deletion by %s to selected IDs in the requested session and supports retries',
    async (role) => {
      const exists = jest.fn().mockResolvedValue({ _id: sessionId });
      const deleteMany = jest
        .fn()
        .mockResolvedValueOnce({ deletedCount: 2 })
        .mockResolvedValueOnce({ deletedCount: 0 });
      const service = new AttendanceReportService(
        { deleteMany } as never,
        { exists } as never,
        {} as never,
        {} as never,
        {} as never,
      );
      const user = { _id: actorId.toString(), role };
      await expect(
        service.deleteSessionRecords(sessionId.toString(), user, selected),
      ).resolves.toEqual({ deletedCount: 2 });
      expect(exists).toHaveBeenCalledWith({
        _id: sessionId,
        ...(role === 'staff' ? { createdBy: actorId } : {}),
      });
      expect(deleteMany).toHaveBeenCalledWith({
        sessionId,
        _id: { $in: recordIds },
      });
      await expect(
        service.deleteSessionRecords(sessionId.toString(), user, selected),
      ).resolves.toEqual({ deletedCount: 0 });
    },
  );

  it('does not delete records for sessions outside staff scope', async () => {
    const deleteMany = jest.fn();
    const service = new AttendanceReportService(
      { deleteMany } as never,
      { exists: jest.fn().mockResolvedValue(null) } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.deleteSessionRecords(
        sessionId.toString(),
        { _id: actorId.toString(), role: 'staff' },
        selected,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(deleteMany).not.toHaveBeenCalled();
  });
});

describe('Attendance export permissions', () => {
  it.each(['doctor', 'teaching_assistant', 'assistant_lecturer', 'admin'])(
    'rejects manual registration by %s when the student is not enrolled',
    async (staffType) => {
      const studentId = new Types.ObjectId();
      const sessionId = new Types.ObjectId();
      const session = {
        _id: sessionId,
        courseCode: 'CS101',
        academicYear: '2026-2027',
        semester: 'first',
      };
      const records = { findOne: jest.fn(), create: jest.fn() };
      const registrations = { exists: jest.fn().mockResolvedValue(null) };
      const realtime = { publishEvent: jest.fn() };
      const service = new AttendanceReportService(
        records as never,
        {
          findById: jest
            .fn()
            .mockReturnValue({ lean: jest.fn().mockResolvedValue(session) }),
        } as never,
        {
          findOne: jest.fn().mockReturnValue({
            lean: jest
              .fn()
              .mockResolvedValue({ _id: studentId, name: 'Student' }),
          }),
        } as never,
        realtime as never,
        registrations as never,
      );
      await expect(
        service.manualStudentCheckIn(
          sessionId.toString(),
          { _id: new Types.ObjectId().toString(), name: 'Staff', staffType },
          { studentCode: '2026001', status: 'present' },
        ),
      ).rejects.toThrow('الطالب غير مسجل بالمقرر');
      expect(registrations.exists).toHaveBeenCalledWith({
        studentId,
        courses: 'CS101',
        academicYear: '2026-2027',
        semester: 'first',
        status: 'approved',
      });
      expect(records.findOne).not.toHaveBeenCalled();
      expect(records.create).not.toHaveBeenCalled();
      expect(realtime.publishEvent).not.toHaveBeenCalled();
    },
  );

  it('allows manual attendance for an approved enrollment in the session term', async () => {
    const studentId = new Types.ObjectId();
    const sessionId = new Types.ObjectId();
    const records = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(([record]) => [
        {
          ...record,
          _id: new Types.ObjectId(),
        },
      ]),
    };
    const service = new AttendanceReportService(
      records as never,
      {
        updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
        db: {
          transaction: async (work: (session: object) => Promise<unknown>) =>
            work({}),
        },
        findById: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: sessionId,
            courseCode: 'CS101',
            academicYear: '2026-2027',
            semester: 'first',
          }),
        }),
      } as never,
      {
        findOne: jest.fn().mockReturnValue({
          lean: jest
            .fn()
            .mockResolvedValue({ _id: studentId, name: 'Student' }),
        }),
      } as never,
      { publishEvent: jest.fn() } as never,
      {
        exists: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
      } as never,
    );
    const result = await service.manualStudentCheckIn(
      sessionId.toString(),
      { _id: new Types.ObjectId().toString(), name: 'Staff' },
      { studentCode: '2026001', status: 'present' },
    );
    expect(result.status).toBe('present');
    expect(records.create).toHaveBeenCalledTimes(1);
  });
  it('resolves localized recorder names for legacy attendance without exposing user data', async () => {
    const markerId = new Types.ObjectId();
    const record = {
      markedBy: markerId,
      markedByName: 'Mr. Ahmed',
      studentName: 'Student',
    };
    const recordsQuery = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([record]),
    };
    const select = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        {
          _id: markerId,
          name: 'Ahmed Soliman',
          nameAr: 'أحمد سليمان',
          role: 'staff',
          staffType: 'assistant_lecturer',
        },
      ]),
    });
    const users = { find: jest.fn().mockReturnValue({ select }) };
    const service = new AttendanceReportService(
      {
        find: jest.fn().mockReturnValue(recordsQuery),
        countDocuments: jest.fn().mockResolvedValue(1),
      } as never,
      {} as never,
      users as never,
      {} as never,
      {} as never,
    );
    const result = await service.getSessionRecords(
      new Types.ObjectId().toString(),
      { page: 1, limit: 20 },
    );
    expect(result.items[0].markedByNameAr).toContain('أحمد سليمان');
    expect(result.items[0].markedByNameEn).toContain('Ahmed Soliman');
    expect(result.items[0].markedByName).toBe('Mr. Ahmed');
    expect(result.items[0]).not.toHaveProperty('nameAr');
    expect(select).toHaveBeenCalledWith(
      'name nameAr role staffType titlePrefix',
    );
  });

  it('keeps the recorded name when its account no longer exists', async () => {
    const query = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([{ markedByName: 'Former lecturer' }]),
    };
    const users = { find: jest.fn() };
    const service = new AttendanceReportService(
      {
        find: jest.fn().mockReturnValue(query),
        countDocuments: jest.fn().mockResolvedValue(1),
      } as never,
      {} as never,
      users as never,
      {} as never,
      {} as never,
    );
    const result = await service.getSessionRecords(
      new Types.ObjectId().toString(),
      { page: 1, limit: 20 },
    );
    expect(result.items[0].markedByNameAr).toBe('Former lecturer');
    expect(users.find).not.toHaveBeenCalled();
  });
  it('rejects exports of another lecturer session before reading its records', async () => {
    const records = { find: jest.fn() };
    const sessions = {
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ createdBy: new Types.ObjectId() }),
      }),
    };
    const service = new AttendanceReportService(
      records as never,
      sessions as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.exportAttendance(
        { _id: new Types.ObjectId().toString(), role: 'staff' },
        { page: 1, limit: 20 },
        new Types.ObjectId().toString(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(records.find).not.toHaveBeenCalled();
  });
  it('rejects invalid session identifiers', async () => {
    const service = new AttendanceReportService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.exportAttendance(
        { _id: new Types.ObjectId().toString(), role: 'admin' },
        { page: 1, limit: 20 },
        'invalid',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
