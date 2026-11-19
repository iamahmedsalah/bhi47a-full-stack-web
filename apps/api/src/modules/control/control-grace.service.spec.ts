import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ControlGraceService } from './services/control-grace.service';
import { ControlAccessService } from './services/control-access.service';
import { PERMISSIONS } from '@student-portal/shared';
import type { AuthenticatedUser } from '../auth/types/authenticated-request';

const chain = <T>(value: T) => {
  const q = {
    lean: () => Promise.resolve(value),
    session: (_s: unknown) => q,
    select: (_s: unknown) => q,
    sort: (_s: unknown) => q,
    limit: (_s: unknown) => q,
  };
  return q;
};
function fixture() {
  const user = {
    _id: String(new Types.ObjectId()),
    role: 'admin',
  } as AuthenticatedUser;
  const sheet = {
    _id: new Types.ObjectId(),
    courseId: new Types.ObjectId(),
    component: 'midterm',
    academicYear: '2026-2027',
    semester: 'first',
    workflowState: 'IN_REVIEW',
    locked: false,
    revision: 0,
    grace: undefined as undefined | Record<string, unknown>,
  };
  const marks = [0, 1, 28, 30, 0, 0, 10].map((grade, i) => ({
    _id: new Types.ObjectId(),
    studentId: new Types.ObjectId(),
    studentCode: String(i),
    grade,
    maxGrade: 30,
    status: i === 4 ? 'absent' : i === 5 ? 'banned' : 'present',
    rev: 1,
    isPublished: false,
  }));
  const missingId = String(new Types.ObjectId());
  const session = {
    withTransaction: (f: () => Promise<unknown>) => f(),
    endSession: jest.fn(),
  };
  const sheetModel = {
    db: { startSession: () => Promise.resolve(session) },
    findById: () => chain(sheet),
    updateOne: jest.fn(
      (_f: unknown, u: { $set: { grace: Record<string, unknown> } }) => {
        sheet.grace = u.$set.grace;
        sheet.revision++;
        return Promise.resolve({ matchedCount: 1 });
      },
    ),
  };
  const grades = {
    find: () => chain(marks),
    bulkWrite: jest.fn().mockResolvedValue({ matchedCount: 3 }),
  };
  const profiles = { find: () => chain([{ userId: marks[6].studentId }]) };
  const audit = { insertMany: jest.fn().mockResolvedValue([]) };
  const scope = {
    requireSheetInScope: jest
      .fn()
      .mockResolvedValue({ sheet, course: { code: '111' } }),
    getRosterStudentIds: () =>
      Promise.resolve(
        new Set([...marks.map((m) => String(m.studentId)), missingId]),
      ),
  };
  const schemes = {
    getScheme: () =>
      Promise.resolve({
        version: 1,
        components: [{ key: 'midterm', max: 30, step: 1, enabled: true }],
      }),
    freeze: jest.fn().mockResolvedValue(undefined),
  };
  const access = new ControlAccessService({} as never, {} as never);
  const service = new ControlGraceService(
    sheetModel as never,
    grades as never,
    profiles as never,
    audit as never,
    access,
    scope as never,
    schemes as never,
  );
  return {
    service,
    user,
    sheet,
    marks,
    grades,
    scope,
    audit,
    sheetModel,
    schemes,
  };
}
describe('once-only midterm grace marks', () => {
  it('refuses locked sheets and does not consume the operation when nobody can benefit', async () => {
    const c = fixture();
    c.sheet.locked = true;
    await expect(
      c.service.preview(c.user, String(c.sheet._id), {
        amount: 5,
        expectedRevision: 0,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    c.sheet.locked = false;
    for (const mark of c.marks) if (mark.status === 'present') mark.grade = 30;
    const preview = await c.service.preview(c.user, String(c.sheet._id), {
      amount: 5,
      expectedRevision: 0,
    });
    expect(preview.counts.changed).toBe(0);
    await expect(
      c.service.apply(c.user, String(c.sheet._id), {
        amount: 5,
        expectedRevision: 0,
        digest: preview.digest,
        operationId: crypto.randomUUID(),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(c.sheetModel.updateOne).not.toHaveBeenCalled();
  });
  it('includes zero and one, caps 28+5 at 30, leaves 30, absent, banned, held and blanks unchanged', async () => {
    const c = fixture();
    const preview = await c.service.preview(c.user, String(c.sheet._id), {
      amount: 5,
      expectedRevision: 0,
    });
    expect(preview.counts).toEqual({
      registered: 8,
      changed: 3,
      capped: 1,
      atMaximum: 1,
      absentOrBanned: 2,
      held: 1,
      unentered: 1,
      other: 0,
    });
    expect(preview.sample.map((r) => [r.before, r.added, r.after])).toEqual([
      [0, 5, 5],
      [1, 5, 6],
      [28, 2, 30],
    ]);
    expect(c.grades.bulkWrite).not.toHaveBeenCalled();
  });
  it('applies one transaction with per-grade audit evidence and returns the same receipt on retry', async () => {
    const c = fixture();
    const preview = await c.service.preview(c.user, String(c.sheet._id), {
      amount: 5,
      expectedRevision: 0,
    });
    const dto = {
      amount: 5,
      expectedRevision: 0,
      digest: preview.digest,
      operationId: crypto.randomUUID(),
    };
    const result = await c.service.apply(c.user, String(c.sheet._id), dto);
    expect(result).toMatchObject({
      amount: 5,
      changed: 3,
      capped: 1,
      actorId: c.user._id,
    });
    expect(c.audit.insertMany.mock.calls[0][0]).toHaveLength(4);
    expect(c.audit.insertMany.mock.calls[0][0][1]).toMatchObject({
      action: 'GRACE',
      oldValue: { score: 0 },
      newValue: { score: 5, added: 5 },
      actorId: new Types.ObjectId(c.user._id),
    });
    expect(await c.service.apply(c.user, String(c.sheet._id), dto)).toEqual(
      result,
    );
    expect(c.grades.bulkWrite).toHaveBeenCalledTimes(1);
    await expect(
      c.service.apply(c.user, String(c.sheet._id), {
        ...dto,
        operationId: crypto.randomUUID(),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('rejects stale previews after an individual mark changes without applying anything', async () => {
    const c = fixture();
    const p = await c.service.preview(c.user, String(c.sheet._id), {
      amount: 2,
      expectedRevision: 0,
    });
    c.marks[0].grade = 1;
    await expect(
      c.service.apply(c.user, String(c.sheet._id), {
        amount: 2,
        expectedRevision: 0,
        digest: p.digest,
        operationId: crypto.randomUUID(),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(c.grades.bulkWrite).not.toHaveBeenCalled();
  });
  it.each(['final', 'coursework'])(
    'rejects %s even for admins',
    async (component) => {
      const c = fixture();
      c.sheet.component = component;
      await expect(
        c.service.preview(c.user, String(c.sheet._id), {
          amount: 5,
          expectedRevision: 0,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
  it.each(['APPROVED', 'PENDING_APPROVAL'])(
    'rejects %s sheets',
    async (state) => {
      const c = fixture();
      c.sheet.workflowState = state;
      await expect(
        c.service.preview(c.user, String(c.sheet._id), {
          amount: 5,
          expectedRevision: 0,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    },
  );
  it.each([0, -1, NaN, Infinity, 31, 2.5])(
    'rejects invalid amount %s',
    async (amount) => {
      const c = fixture();
      await expect(
        c.service.preview(c.user, String(c.sheet._id), {
          amount,
          expectedRevision: 0,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
  it('enforces the dedicated permission and course scope', async () => {
    const c = fixture();
    const staff: AuthenticatedUser = {
      ...c.user,
      role: 'staff',
      permissions: [
        PERMISSIONS.CONTROL_ACCESS,
        PERMISSIONS.CONTROL_GRADES_ENTER,
      ],
    };
    await expect(
      c.service.preview(staff, String(c.sheet._id), {
        amount: 5,
        expectedRevision: 0,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    staff.permissions = [
      PERMISSIONS.CONTROL_ACCESS,
      PERMISSIONS.CONTROL_GRADES_GRACE,
    ];
    expect(
      (
        await c.service.preview(staff, String(c.sheet._id), {
          amount: 5,
          expectedRevision: 0,
        })
      ).counts.changed,
    ).toBe(3);
    c.scope.requireSheetInScope.mockRejectedValueOnce(new ForbiddenException());
    await expect(
      c.service.preview(staff, String(c.sheet._id), {
        amount: 5,
        expectedRevision: 0,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
