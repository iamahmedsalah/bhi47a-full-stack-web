import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { Types } from 'mongoose';
import { AttendanceController } from '../attendance.controller';
import { AttendanceSessionAccessGuard } from './attendance-session-access.guard';

describe('attendance session access', () => {
  const sessionId = new Types.ObjectId();
  const recordId = new Types.ObjectId();
  const staffId = new Types.ObjectId();
  const user = { _id: staffId.toHexString(), role: 'staff' };
  const sessions = { exists: jest.fn() };
  const records = { findById: jest.fn() };
  const guard = new AttendanceSessionAccessGuard(
    new Reflector(),
    sessions as never,
    records as never,
  );

  function context(
    handler: keyof AttendanceController,
    id = sessionId.toHexString(),
    actor = user,
  ) {
    const routeHandler: unknown = Reflect.get(
      AttendanceController.prototype,
      handler,
    );
    if (typeof routeHandler !== 'function') throw new Error('Route not found');
    return new ExecutionContextHost(
      [{ user: actor, params: { id } }],
      AttendanceController,
      routeHandler,
    );
  }

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it.each([
    'getSessionDetails',
    'getCurrentQr',
    'liveSessionFeed',
    'getSessionRecords',
    'manualStudentCheckIn',
  ] as const)('limits %s to the session creator', async (handler) => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, context(handler).getHandler()),
    ).toContain(AttendanceSessionAccessGuard);
    sessions.exists.mockResolvedValueOnce(null).mockResolvedValueOnce({
      _id: sessionId,
    });

    await expect(guard.canActivate(context(handler))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(guard.canActivate(context(handler))).resolves.toBe(true);
    expect(sessions.exists).toHaveBeenCalledWith({
      _id: sessionId.toHexString(),
      createdBy: staffId,
    });
    expect(records.findById).not.toHaveBeenCalled();
  });

  it('resolves a record to its session before allowing a correction', async () => {
    records.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ sessionId }),
      }),
    });
    sessions.exists.mockResolvedValueOnce(null).mockResolvedValueOnce({
      _id: sessionId,
    });
    const request = context('manualUpdateRecord', recordId.toHexString());

    await expect(guard.canActivate(request)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(guard.canActivate(request)).resolves.toBe(true);
    expect(records.findById).toHaveBeenCalledWith(recordId.toHexString());
    expect(sessions.exists).toHaveBeenCalledWith({
      _id: sessionId,
      createdBy: staffId,
    });
  });

  it('rejects an invalid staff request before a lookup and preserves admin access', async () => {
    await expect(
      guard.canActivate(context('liveSessionFeed', 'invalid')),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      guard.canActivate(
        context('liveSessionFeed', sessionId.toHexString(), {
          ...user,
          role: 'admin',
        }),
      ),
    ).resolves.toBe(true);
    expect(sessions.exists).not.toHaveBeenCalled();
    expect(records.findById).not.toHaveBeenCalled();
  });
});
