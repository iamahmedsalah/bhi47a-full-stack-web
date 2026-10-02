import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AttendanceReportService } from './attendance-report.service';

describe('Attendance export permissions', () => {
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
