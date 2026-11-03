import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ControlGradesService } from './services/control-grades.service';
import { ControlAccessService } from './services/control-access.service';

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
  c.select = () => c;
  c.lean = () => Promise.resolve(value);
  return c;
};

function build(options: {
  locked?: boolean;
  caps?: Partial<typeof baseCaps>;
  existing?: Record<string, unknown>[];
  inRoster?: boolean;
  priorOps?: string[];
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
    component: 'midterm',
    locked: options.locked ?? false,
  };
  const course = { _id: courseId, code: 'CS101', name: 'Intro' };
  const existing = (options.existing ?? []).map((d) => ({
    studentId,
    courseId,
    ...d,
  }));

  const gradeModel = {
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
    getCapabilities: jest.fn(() => ({ ...baseCaps, ...options.caps })),
  } as unknown as ControlAccessService;
  const schemes = {
    requireEnabledComponent: jest.fn().mockResolvedValue(rules),
    freeze: jest.fn().mockResolvedValue(undefined),
  };
  const gradesService = {
    syncPublishedAcademicProgress: jest.fn().mockResolvedValue([]),
  };

  const service = new ControlGradesService(
    gradeModel as never,
    { findById: () => chain(course) } as never,
    { find: () => chain([{ _id: studentId, studentCode: '27001' }]) } as never,
    { findById: () => chain(sheet) } as never,
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
    gradesService as never,
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
  };
}

describe('ControlGradesService.applyChanges', () => {
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
    expect(update.$setOnInsert).toEqual({ isPublished: false });
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

  it('requires control.states.manage and a reason for excused', async () => {
    const denied = build({});
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

    const noReason = build({ caps: { canManageStates: true } });
    const noReasonRes = await noReason.service.applyChanges(
      noReason.user,
      noReason.sheetId,
      {
        changes: [noReason.change({ score: undefined, status: 'excused' })],
      },
    );
    expect(noReasonRes.results[0]).toMatchObject({
      result: 'invalid',
      code: 'reason_required',
    });

    const ok = build({ caps: { canManageStates: true } });
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
      code: 'published_permission',
    });
    expect(gradeModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('allows a published edit with permission and reason, then re-syncs progress', async () => {
    const { service, user, sheetId, change, gradesService } = build({
      caps: { canEditPublished: true },
      existing: [{ grade: 10, status: 'present', rev: 3, isPublished: true }],
      updateResult: {
        _id: new Types.ObjectId(),
        grade: 12,
        status: 'present',
        rev: 4,
        isPublished: true,
      },
    });
    const { results } = await service.applyChanges(user, sheetId, {
      changes: [change({ score: 12, expectedRev: 3, reason: 'typing error' })],
    });
    expect(results[0].result).toBe('ok');
    expect(gradesService.syncPublishedAcademicProgress).toHaveBeenCalled();
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

  it('treats a unique-index collision on upsert as a conflict', async () => {
    const { service, user, sheetId, change } = build({
      upsertError: { code: 11000 },
    });
    const { results } = await service.applyChanges(user, sheetId, {
      changes: [change()],
    });
    expect(results[0].result).toBe('conflict');
  });

  it('applies a repeated opId only once', async () => {
    const { service, user, sheetId, change, gradeModel } = build({
      priorOps: ['op-repeat-1'],
    });
    const { results } = await service.applyChanges(user, sheetId, {
      changes: [change({ opId: 'op-repeat-1' })],
    });
    expect(results[0]).toMatchObject({ result: 'ok', duplicate: true });
    expect(gradeModel.findOneAndUpdate).not.toHaveBeenCalled();
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
