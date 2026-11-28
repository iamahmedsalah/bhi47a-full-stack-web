import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ControlGradesService } from './services/control-grades.service';
import { ControlAccessService } from './services/control-access.service';
import { PERMISSIONS } from '@student-portal/shared';

const rules = {
  key: 'midterm',
  nameAr: 'ميدتيرم',
  nameEn: 'Midterm',
  max: 20,
  step: 0.5,
  enabled: true,
};

const baseCaps = {
  canAccess: true,
  canView: true,
  canCreateSheets: true,
  canEnter: true,
  canEditPublished: false,
  canManageStates: false,
  canLock: false,
  canUnlock: false,
  canManageSchemes: false,
  canViewAudit: false,
  scopeAll: false,
};

const chain = <T>(value: T) => {
  const c: Record<string, unknown> = {};
  c.session = () => c;
  c.select = () => c;
  c.lean = () => Promise.resolve(value);
  return c;
};

function build(options: {
  component?: 'midterm' | 'final';
  locked?: boolean;
  workflowState?: string;
  caps?: Partial<typeof baseCaps>;
  existing?: Record<string, unknown>[];
  inRoster?: boolean;
  priorOps?: string[];
  tuitionBlocked?: boolean;
  updateResult?: Record<string, unknown> | null;
  upsertError?: { code: number };
}) {
  const studentId = new Types.ObjectId();
  const courseId = new Types.ObjectId();
  const sheetId = new Types.ObjectId();
  const sheet = {
    _id: sheetId,
    courseId,
    academicYear: '2026-2027',
    semester: 'first',
    component: options.component ?? 'midterm',
    locked: options.locked ?? false,
    workflowState: options.workflowState ?? 'DRAFT',
  };
  const course = { _id: courseId, code: 'CS101', name: 'Intro' };
  const existing = (options.existing ?? []).map((d) => ({
    studentId,
    courseId,
    ...d,
  }));

  const session = {
    withTransaction: (fn: () => Promise<unknown>) => fn(),
    endSession: jest.fn(),
  };
  const gradeModel = {
    db: { startSession: jest.fn().mockResolvedValue(session) },
    find: jest.fn(() => chain(existing)),
    findOne: jest.fn(() => chain(existing[0] ?? null)),
    findOneAndUpdate: jest.fn(() => {
      if (options.upsertError)
        return {
          lean: () =>
            Promise.reject(
              Object.assign(new Error('Duplicate key'), options.upsertError),
            ),
        };
      return chain(
        options.updateResult === undefined
          ? {
              _id: new Types.ObjectId(),
              studentId,
              grade: 15,
              status: 'present',
              rev: 1,
              isPublished: false,
            }
          : options.updateResult === null
            ? null
            : { studentId, ...options.updateResult },
      );
    }),
    findOneAndDelete: jest.fn(() => chain(options.updateResult ?? null)),
  };
  const auditModel = {
    find: jest.fn(() =>
      chain((options.priorOps ?? []).map((opId) => ({ opId }))),
    ),
    insertMany: jest.fn().mockResolvedValue([]),
  };
  const access = {
    assertPermission: jest.fn(),
    assertCourseScope: jest.fn(),
    assertCourseGradeWrite: jest.fn(),
    getCapabilities: jest.fn(() => ({ ...baseCaps, ...options.caps })),
  } as unknown as ControlAccessService;
  const schemes = {
    requireEnabledComponent: jest
      .fn()
      .mockResolvedValue({ ...rules, key: options.component ?? 'midterm' }),
    freeze: jest.fn().mockResolvedValue(undefined),
  };
  const gradesService = {
    syncPublishedAcademicProgress: jest.fn().mockResolvedValue([]),
  };

  const service = new ControlGradesService(
    gradeModel as never,
    { findById: () => chain(course) } as never,
    { find: () => chain([{ _id: studentId, studentCode: '27001' }]) } as never,
    {
      findById: () => chain(sheet),
      updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
    } as never,
    auditModel as never,
    access,
    {
      getRosterStudentIds: jest
        .fn()
        .mockResolvedValue(
          new Set(options.inRoster === false ? [] : [String(studentId)]),
        ),
    } as never,
    schemes as never,
    {
      find: () => chain(options.tuitionBlocked ? [{ userId: studentId }] : []),
    } as never,
  );

  const user = { _id: new Types.ObjectId().toString(), role: 'staff' } as never;
  const change = (extra: Record<string, unknown> = {}) => ({
    studentId: String(studentId),
    score: 15,
    expectedRev: 0,
    opId: `op-${Math.random().toString(36).slice(2, 12)}`,
    ...extra,
  });
  return {
    service,
    user,
    sheetId: String(sheetId),
    change,
    gradeModel,
    auditModel,
    schemes,
    gradesService,
    access,
  };
}

describe('ControlGradesService.applyChanges', () => {
  it.each(['GRID', 'XLSX'] as const)(
    'rejects %s writes for tuition-held students without changing existing grades',
    async (source) => {
      const ctx = build({ tuitionBlocked: true });
      const result = await ctx.service.applyChanges(
        ctx.user,
        ctx.sheetId,
        { changes: [ctx.change()] },
        source,
      );
      expect(result.results[0]).toMatchObject({
        result: 'forbidden',
        code: 'tuition_blocked',
      });
      expect(result.summary.ok).toBe(0);
      expect(ctx.gradeModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(ctx.gradeModel.findOneAndDelete).not.toHaveBeenCalled();
      expect(ctx.auditModel.insertMany).not.toHaveBeenCalled();
    },
  );
  it('requires the separate correction permission during review and freezes pending approval', async () => {
    const actual = new ControlAccessService({} as never, {} as never);
    const ctx = build({ workflowState: 'IN_REVIEW' });
    jest
      .spyOn(ctx.access, 'assertPermission')
      .mockImplementation((user, permission) =>
        actual.assertPermission(user, permission),
      );
    const doctor = {
      ...ctx.user,
      role: 'staff',
      permissions: [
        PERMISSIONS.CONTROL_ACCESS,
        PERMISSIONS.CONTROL_GRADES_ENTER,
      ],
    } as never;
    await expect(
      ctx.service.applyChanges(doctor, ctx.sheetId, {
        changes: [ctx.change()],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const control = {
      ...ctx.user,
      role: 'staff',
      permissions: [
        PERMISSIONS.CONTROL_ACCESS,
        PERMISSIONS.CONTROL_GRADES_REVIEW_EDIT,
      ],
    } as never;
    const saved = await ctx.service.applyChanges(control, ctx.sheetId, {
      changes: [ctx.change()],
    });
    expect(saved.summary.ok).toBe(1);
    expect(ctx.auditModel.insertMany).toHaveBeenCalledTimes(1);
    const pending = build({ workflowState: 'PENDING_APPROVAL' });
    await expect(
      pending.service.applyChanges(pending.user, pending.sheetId, {
        changes: [pending.change()],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it.each(['excused', 'incomplete', 'withheld'] as const)(
    'rejects new midterm state %s even with state permission',
    async (status) => {
      const ctx = build({ caps: { canManageStates: true } });
      const result = await ctx.service.applyChanges(ctx.user, ctx.sheetId, {
        changes: [ctx.change({ status, score: undefined })],
      });
      expect(result.results[0]).toMatchObject({
        result: 'invalid',
        code: 'midterm_status',
      });
      expect(ctx.auditModel.insertMany).not.toHaveBeenCalled();
    },
  );

  it('saves a banned midterm without a reason only with state permission', async () => {
    const allowed = build({ caps: { canManageStates: true } });
    const result = await allowed.service.applyChanges(
      allowed.user,
      allowed.sheetId,
      {
        changes: [allowed.change({ status: 'banned', score: undefined })],
      },
    );
    expect(result.results[0].result).toBe('ok');
    expect(allowed.auditModel.insertMany).toHaveBeenCalledTimes(1);
    const denied = build({});
    const forbidden = await denied.service.applyChanges(
      denied.user,
      denied.sheetId,
      {
        changes: [denied.change({ status: 'banned', score: undefined })],
      },
    );
    expect(forbidden.results[0]).toMatchObject({
      result: 'forbidden',
      code: 'states_permission',
    });
  });

  it('keeps carried IC contributions read-only even for state managers', async () => {
    const ctx = build({
      caps: { canManageStates: true },
      existing: [
        {
          grade: 10,
          status: 'present',
          rev: 1,
          carriedFrom: { academicYear: '2025-2026', semester: 'first' },
        },
      ],
    });
    const result = await ctx.service.applyChanges(ctx.user, ctx.sheetId, {
      changes: [ctx.change({ score: 12, expectedRev: 1 })],
    });
    expect(result.results[0]).toMatchObject({
      result: 'forbidden',
      code: 'ic_carried_locked',
    });
    expect(ctx.auditModel.insertMany).not.toHaveBeenCalled();
  });

  it('rejects the whole call when the sheet is locked', async () => {
    const { service, user, sheetId, change, gradeModel } = build({
      locked: true,
    });
    await expect(
      service.applyChanges(user, sheetId, { changes: [change()] }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(gradeModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('stores a valid mark hidden, audits it and freezes the scheme', async () => {
    const { service, user, sheetId, change, gradeModel, auditModel, schemes } =
      build({});
    const { results, summary } = await service.applyChanges(user, sheetId, {
      changes: [change({ score: 15 })],
    });

    expect(results[0].result).toBe('ok');
    expect(summary.ok).toBe(1);
    const update = (
      gradeModel.findOneAndUpdate.mock.calls[0] as unknown[]
    )[1] as Record<string, any>;
    expect(update.$set.isPublished).toBe(false);
    expect(update.$set.controlManaged).toBe(true);
    expect(update.$inc).toEqual({ rev: 1 });
    expect(update.$set.grade).toBe(15);
    expect(update.$set.maxGrade).toBe(20);
    expect(auditModel.insertMany).toHaveBeenCalledTimes(1);
    const rows = (
      auditModel.insertMany.mock.calls[0] as unknown[]
    )[0] as Record<string, any>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'CREATE', source: 'GRID' });
    expect(schemes.freeze).toHaveBeenCalled();
  });

  it.each([
    [21, 'above_max'],
    [17.3, 'off_step'],
    [-1, 'negative'],
  ])('rejects %p without saving (%s)', async (score, code) => {
    const { service, user, sheetId, change, gradeModel, auditModel } = build(
      {},
    );
    const { results } = await service.applyChanges(user, sheetId, {
      changes: [change({ score })],
    });
    expect(results[0]).toMatchObject({ result: 'invalid', code });
    expect(gradeModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(auditModel.insertMany).not.toHaveBeenCalled();
  });

  it('keeps blank, zero and absent distinct', async () => {
    const zero = build({});
    const zeroRes = await zero.service.applyChanges(zero.user, zero.sheetId, {
      changes: [zero.change({ score: 0 })],
    });
    expect(zeroRes.results[0].entry).toMatchObject({ status: 'present' });
    const zeroUpdate = (
      zero.gradeModel.findOneAndUpdate.mock.calls[0] as unknown[]
    )[1] as Record<string, any>;
    expect(zeroUpdate.$set).toMatchObject({ grade: 0, status: 'present' });

    const absent = build({});
    await absent.service.applyChanges(absent.user, absent.sheetId, {
      changes: [absent.change({ score: undefined, status: 'absent' })],
    });
    const absentUpdate = (
      absent.gradeModel.findOneAndUpdate.mock.calls[0] as unknown[]
    )[1] as Record<string, any>;
    expect(absentUpdate.$set).toMatchObject({ grade: 0, status: 'absent' });

    const blank = build({});
    const blankRes = await blank.service.applyChanges(
      blank.user,
      blank.sheetId,
      {
        changes: [blank.change({ score: null })],
      },
    );
    expect(blankRes.results[0].result).toBe('ok');
    expect(blank.gradeModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(blank.gradeModel.findOneAndDelete).not.toHaveBeenCalled();
  });

  it('rejects a score together with a scoreless state', async () => {
    const { service, user, sheetId, change } = build({});
    const { results } = await service.applyChanges(user, sheetId, {
      changes: [change({ score: 5, status: 'absent' })],
    });
    expect(results[0]).toMatchObject({
      result: 'invalid',
      code: 'score_not_allowed',
    });
  });

  it.each(['banned', 'incomplete', 'excused', 'withheld'] as const)(
    'saves %s without a reason while retaining state permissions',
    async (status) => {
      const score = status === 'withheld' ? 12 : undefined;
      const allowed = build({
        component: 'final',
        caps: { canManageStates: true },
      });
      const result = await allowed.service.applyChanges(
        allowed.user,
        allowed.sheetId,
        { changes: [allowed.change({ status, score })] },
      );
      expect(result.results[0].result).toBe('ok');
      expect(allowed.auditModel.insertMany).toHaveBeenCalledTimes(1);
      const denied = build({ component: 'final' });
      const forbidden = await denied.service.applyChanges(
        denied.user,
        denied.sheetId,
        { changes: [denied.change({ status, score })] },
      );
      expect(forbidden.results[0]).toMatchObject({
        result: 'forbidden',
        code: 'states_permission',
      });
    },
  );
  it('requires control.states.manage but permits excused without a reason', async () => {
    const denied = build({ component: 'final' });
    const deniedRes = await denied.service.applyChanges(
      denied.user,
      denied.sheetId,
      {
        changes: [
          denied.change({
            score: undefined,
            status: 'excused',
            reason: 'medical',
          }),
        ],
      },
    );
    expect(deniedRes.results[0]).toMatchObject({
      result: 'forbidden',
      code: 'states_permission',
    });

    const noReason = build({
      component: 'final',
      caps: { canManageStates: true },
    });
    const noReasonRes = await noReason.service.applyChanges(
      noReason.user,
      noReason.sheetId,
      {
        changes: [noReason.change({ score: undefined, status: 'excused' })],
      },
    );
    expect(noReasonRes.results[0].result).toBe('ok');

    const ok = build({ component: 'final', caps: { canManageStates: true } });
    const okRes = await ok.service.applyChanges(ok.user, ok.sheetId, {
      changes: [
        ok.change({
          score: undefined,
          status: 'excused',
          reason: 'medical report',
        }),
      ],
    });
    expect(okRes.results[0].result).toBe('ok');
  });

  it('blocks editing a published grade without the permission', async () => {
    const { service, user, sheetId, change, gradeModel } = build({
      existing: [{ grade: 10, status: 'present', rev: 3, isPublished: true }],
    });
    const { results } = await service.applyChanges(user, sheetId, {
      changes: [change({ score: 12, expectedRev: 3 })],
    });
    expect(results[0]).toMatchObject({
      result: 'forbidden',
      code: 'unpublish_required',
    });
    expect(gradeModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('requires hiding published grades even with edit permission', async () => {
    const ctx = build({
      caps: { canEditPublished: true },
      existing: [{ grade: 10, status: 'present', rev: 3, isPublished: true }],
    });
    const response = await ctx.service.applyChanges(ctx.user, ctx.sheetId, {
      changes: [
        ctx.change({ score: 12, expectedRev: 3, reason: 'typing error' }),
      ],
    });
    expect(response.results[0]).toMatchObject({
      result: 'forbidden',
      code: 'unpublish_required',
    });
    expect(ctx.gradeModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('returns a conflict with the current value when the rev is stale', async () => {
    const { service, user, sheetId, change, auditModel } = build({
      existing: [{ grade: 10, status: 'present', rev: 5, isPublished: false }],
      updateResult: null,
    });
    const { results } = await service.applyChanges(user, sheetId, {
      changes: [change({ score: 12, expectedRev: 2 })],
    });
    expect(results[0]).toMatchObject({ result: 'conflict' });
    expect(results[0].current).toMatchObject({ score: 10, rev: 5 });
    expect(auditModel.insertMany).not.toHaveBeenCalled();
  });

  it('rejects operation IDs belonging to a different actor/scope/payload', async () => {
    const ctx = build({ priorOps: ['op-repeat-1'] });
    const result = await ctx.service.applyChanges(ctx.user, ctx.sheetId, {
      changes: [ctx.change({ opId: 'op-repeat-1' })],
    });
    expect(result.results[0]).toMatchObject({
      result: 'invalid',
      code: 'op_id_reused',
    });
    expect(ctx.gradeModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects students outside the roster', async () => {
    const { service, user, sheetId, change } = build({ inRoster: false });
    const { results } = await service.applyChanges(user, sheetId, {
      changes: [change()],
    });
    expect(results[0]).toMatchObject({
      result: 'invalid',
      code: 'not_in_roster',
    });
  });

  it('keeps good rows when another row in the batch is invalid', async () => {
    const { service, user, sheetId, change, auditModel } = build({});
    const good = change({ score: 15 });
    const bad = change({
      score: 99,
      studentId: new Types.ObjectId().toString(),
    });
    const { results, summary } = await service.applyChanges(user, sheetId, {
      changes: [good, bad],
    });
    expect(results.map((r) => r.result)).toEqual(['ok', 'invalid']);
    expect(summary).toMatchObject({ ok: 1, invalid: 1 });
    expect(auditModel.insertMany).toHaveBeenCalledTimes(1);
  });

  it('propagates a scope failure', async () => {
    const { service, user, sheetId, change } = build({});
    (
      service as unknown as { access: { assertCourseScope: jest.Mock } }
    ).access.assertCourseScope = jest
      .fn()
      .mockRejectedValue(new ForbiddenException());
    await expect(
      service.applyChanges(user, sheetId, { changes: [change()] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
