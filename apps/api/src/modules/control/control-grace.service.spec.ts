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
    expect(preview.passRate).toEqual({
      threshold: 18,
      total: 8,
      passedBefore: 2,
      passedAfter: 2,
      ratioBefore: 0.25,
      ratioAfter: 0.25,
    });
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

  it('supports new_only, adjust (from originalGrade), reset (0), and protects manual post-grace edits', async () => {
    const c = fixture();
    // Set explicit midterm marks: s0 = 15, s1 = 25 (will cap at 30 on +10), s2 = 28 (caps at 30)
    // s3 = 30 (already max), s4 = absent, s5 = banned, s6 = held
    c.marks[0].grade = 15;
    c.marks[1].grade = 25;
    c.marks[2].grade = 28;
    c.marks[3].grade = 30;

    // Smart stateful mocks for sheet + grades
    c.grades.bulkWrite.mockImplementation((ops: Array<any>) => {
      for (const op of ops) {
        const mark = c.marks.find(
          (m) => String(m._id) === String(op.updateOne.filter._id),
        );
        if (!mark) continue;
        if (op.updateOne.update.$set) {
          Object.assign(mark, op.updateOne.update.$set);
        }
        if (op.updateOne.update.$inc?.rev) {
          mark.rev = (mark.rev ?? 0) + op.updateOne.update.$inc.rev;
        }
        if (op.updateOne.update.$unset?.grace !== undefined) {
          delete (mark as Record<string, unknown>).grace;
        }
      }
      return Promise.resolve({ matchedCount: ops.length });
    });

    // 1) Initial grace (+10)
    const initialPreview = await c.service.preview(
      c.user,
      String(c.sheet._id),
      {
        amount: 10,
        expectedRevision: 0,
        mode: 'initial',
      },
    );
    expect(initialPreview.counts.changed).toBe(3);
    await c.service.apply(c.user, String(c.sheet._id), {
      amount: 10,
      expectedRevision: 0,
      digest: initialPreview.digest,
      operationId: crypto.randomUUID(),
      mode: 'initial',
    });

    expect(c.marks[0].grade).toBe(25);
    expect((c.marks[0] as Record<string, any>).grace).toMatchObject({
      originalGrade: 15,
      appliedAmount: 10,
      actualAdded: 10,
    });
    expect(c.marks[1].grade).toBe(30);
    expect((c.marks[1] as Record<string, any>).grace).toMatchObject({
      originalGrade: 25,
      appliedAmount: 10,
      actualAdded: 5,
    });

    // 2) New student enters the midterm sheet later with grade 12 -> new_only applies ONLY to them!
    const newStudentId = new Types.ObjectId();
    const newMark = {
      _id: new Types.ObjectId(),
      studentId: newStudentId,
      studentCode: '999',
      grade: 12,
      maxGrade: 30,
      status: 'present',
      rev: 1,
      isPublished: false,
    };
    c.marks.push(newMark);
    c.scope.getRosterStudentIds = () =>
      Promise.resolve(new Set(c.marks.map((m) => String(m.studentId))));

    const statusBeforeNew = await c.service.getStatus(
      c.user,
      String(c.sheet._id),
    );
    expect(statusBeforeNew).toMatchObject({
      gracedCount: 3,
      eligibleNewCount: 1,
      manuallyModifiedCount: 0,
      legacyGrace: false,
    });

    const newOnlyPreview = await c.service.preview(
      c.user,
      String(c.sheet._id),
      {
        amount: 10,
        expectedRevision: c.sheet.revision,
        mode: 'new_only',
      },
    );
    expect(newOnlyPreview.counts.changed).toBe(1);
    expect(newOnlyPreview.modeStats?.alreadyGraced).toBe(3);
    expect(newOnlyPreview.sample[0]).toMatchObject({
      studentCode: '999',
      originalGrade: 12,
      before: 12,
      added: 10,
      after: 22,
    });

    await c.service.apply(c.user, String(c.sheet._id), {
      amount: 10,
      expectedRevision: c.sheet.revision,
      digest: newOnlyPreview.digest,
      operationId: crypto.randomUUID(),
      mode: 'new_only',
    });

    // Old graced students were NEVER touched again; new student moved 12 -> 22
    expect(c.marks[0].grade).toBe(25);
    expect(c.marks[1].grade).toBe(30);
    expect(newMark.grade).toBe(22);

    // Manually edit s2 after grace (simulating manual override rev bump)
    c.marks[2].grade = 29;
    c.marks[2].rev += 1;

    // 3) Adjust grace from 10 -> 8:
    // - s0 (original 15) moves from 25 -> 23
    // - s1 (original 25, capped at 30) recalculates min(25 + 8, 30) = 30 (NOT 28!)
    // - s2 (manually edited rev) is protected & skipped!
    // - newMark (original 12) moves from 22 -> 20
    const adjustPreview = await c.service.preview(c.user, String(c.sheet._id), {
      amount: 8,
      expectedRevision: c.sheet.revision,
      mode: 'adjust',
    });
    expect(adjustPreview.counts.changed).toBe(3);
    expect(adjustPreview.modeStats?.manuallyModified).toBe(1);

    await c.service.apply(c.user, String(c.sheet._id), {
      amount: 8,
      expectedRevision: c.sheet.revision,
      digest: adjustPreview.digest,
      operationId: crypto.randomUUID(),
      mode: 'adjust',
    });

    expect(c.marks[0].grade).toBe(23);
    expect(c.marks[1].grade).toBe(30);
    expect(c.marks[2].grade).toBe(29);
    expect(newMark.grade).toBe(20);
    expect(c.sheet.grace?.amount).toBe(8);

    // 4) Reset grace back to 0 (real original grades)
    const resetPreview = await c.service.preview(c.user, String(c.sheet._id), {
      amount: 0,
      expectedRevision: c.sheet.revision,
      mode: 'reset',
    });
    expect(resetPreview.counts.changed).toBe(3);
    expect(resetPreview.modeStats?.manuallyModified).toBe(1);

    await c.service.apply(c.user, String(c.sheet._id), {
      amount: 0,
      expectedRevision: c.sheet.revision,
      digest: resetPreview.digest,
      operationId: crypto.randomUUID(),
      mode: 'reset',
    });

    expect(c.marks[0].grade).toBe(15);
    expect(c.marks[1].grade).toBe(25);
    expect(c.marks[2].grade).toBe(29);
    expect(newMark.grade).toBe(12);
    expect((c.marks[0] as Record<string, any>).grace).toBeUndefined();
    expect(c.sheet.grace).toBeNull();
  });
});
