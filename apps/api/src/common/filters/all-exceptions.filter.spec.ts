import { ConflictException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('enrollment error envelope', () => {
  it('preserves sanitized partial-write counts through the production filter', () => {
    const json = jest.fn();
    const response = { status: jest.fn().mockReturnValue({ json }) };
    const filter = new AllExceptionsFilter({ warn: jest.fn() } as never);
    filter.catch(
      new ConflictException({
        code: 'ENROLLMENT_CONCURRENT_UPDATE',
        message: 'Retry after reloading',
        partialWrite: {
          writeKind: 'registrations',
          plannedCount: 3,
          appliedCount: 1,
          rejectedCount: 1,
          uncertainCount: 0,
          unattemptedCount: 1,
          driverError: 'private-student-id',
        },
      }),
      {
        switchToHttp: () => ({
          getResponse: () => response,
          getRequest: () => ({
            method: 'POST',
            originalUrl: '/api/admin/courses/:id/enroll-students-batch',
          }),
        }),
      } as never,
    );
    expect(response.status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'ENROLLMENT_CONCURRENT_UPDATE',
        partialWrite: {
          writeKind: 'registrations',
          plannedCount: 3,
          appliedCount: 1,
          rejectedCount: 1,
          uncertainCount: 0,
          unattemptedCount: 1,
        },
      }),
    );
    expect(JSON.stringify(json.mock.calls)).not.toContain('private-student-id');
  });
});
