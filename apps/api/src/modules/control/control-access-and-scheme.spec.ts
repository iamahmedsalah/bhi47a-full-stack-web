import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { PERMISSIONS } from '@student-portal/shared';
import { ControlAccessService } from './services/control-access.service';
import { GradingSchemeService } from './services/grading-scheme.service';
import { ControlSheetsService } from './services/control-sheets.service';

const chain = <T>(value: T) => {
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.sort = () => c;
  c.skip = () => c;
  c.limit = () => c;
  c.lean = () => Promise.resolve(value);
  return c;
};

describe('ControlAccessService', () => {
  const staffId = new Types.ObjectId().toString();
  const courseId = new Types.ObjectId();

  function buildAccess(opts: { assigned?: boolean; owned?: boolean } = {}) {
    const courseModel = {
      exists: jest.fn(() => chain(opts.owned ? { _id: courseId } : null)),
      find: jest.fn(() => chain(opts.owned ? [{ _id: courseId }] : [])),
    };
    const assignmentModel = {
      exists: jest.fn(() =>
        chain(opts.assigned ? { _id: new Types.ObjectId() } : null),
      ),
      find: jest.fn(() =>
        chain(opts.assigned ? [{ courseCode: 'CS101' }] : []),
      ),
    };
    return new ControlAccessService(
      courseModel as never,
      assignmentModel as never,
    );
  }

  it('gives staff no Control capabilities by default', () => {
    const svc = buildAccess();
    const caps = svc.getCapabilities({
      _id: staffId,
      role: 'staff',
      name: 'Dr. A',
      permissions: [],
      mustChangePassword: false,
      tokenVersion: 1,
    });
    expect(caps.canAccess).toBe(false);
    expect(caps.canEnter).toBe(false);
    expect(caps.scopeAll).toBe(false);
    expect(() =>
      svc.assertPermission(
        {
          _id: staffId,
          role: 'staff',
          name: 'Dr. A',
          permissions: [],
          mustChangePassword: false,
          tokenVersion: 1,
        },
        PERMISSIONS.CONTROL_SHEETS_VIEW,
      ),
    ).toThrow(ForbiddenException);
  });

  it('requires control.access even if a child permission is present', () => {
    const svc = buildAccess();
    const user = {
      _id: staffId,
      role: 'staff' as const,
      name: 'Dr. A',
      permissions: [PERMISSIONS.CONTROL_GRADES_ENTER],
      mustChangePassword: false,
      tokenVersion: 1,
    };
    expect(svc.getCapabilities(user).canEnter).toBe(false);
    expect(() =>
      svc.assertPermission(user, PERMISSIONS.CONTROL_GRADES_ENTER),
    ).toThrow(ForbiddenException);
  });

  it('enforces course scope for doctors unless control.scope.all is granted', async () => {
    const userWithoutScopeAll = {
      _id: staffId,
      role: 'staff' as const,
      name: 'Dr. A',
      permissions: [
        PERMISSIONS.CONTROL_ACCESS,
        PERMISSIONS.CONTROL_GRADES_ENTER,
      ],
      mustChangePassword: false,
      tokenVersion: 1,
    };
    const unassignedSvc = buildAccess({ assigned: false, owned: false });
    await expect(
      unassignedSvc.assertCourseScope(
        userWithoutScopeAll,
        { _id: courseId, code: 'CS101' } as never,
        '2026-2027',
        'first',
      ),
    ).rejects.toThrow(ForbiddenException);

    const assignedSvc = buildAccess({ assigned: true, owned: false });
    await expect(
      assignedSvc.assertCourseScope(
        userWithoutScopeAll,
        { _id: courseId, code: 'CS101' } as never,
        '2026-2027',
        'first',
      ),
    ).resolves.toBeUndefined();

    const scopeAllUser = {
      ...userWithoutScopeAll,
      permissions: [
        ...userWithoutScopeAll.permissions,
        PERMISSIONS.CONTROL_SCOPE_ALL,
      ],
    };
    await expect(
      unassignedSvc.assertCourseScope(
        scopeAllUser,
        { _id: courseId, code: 'CS101' } as never,
        '2026-2027',
        'first',
      ),
    ).resolves.toBeUndefined();
  });
});

describe('GradingSchemeService', () => {
  const courseId = new Types.ObjectId().toString();
  const actorId = new Types.ObjectId().toString();

  it('blocks changing max mark when grades exist unless force=true and reason provided', async () => {
    const schemeModel = {
      findOne: jest.fn(() => chain(null)),
      findOneAndUpdate: jest.fn().mockResolvedValue({ version: 2 }),
    };
    const gradeModel = {
      find: jest.fn(() =>
        chain([
          {
            _id: new Types.ObjectId(),
            grade: 18,
            status: 'present',
            studentId: new Types.ObjectId(),
          },
        ]),
      ),
      bulkWrite: jest.fn().mockResolvedValue({}),
    };
    const auditModel = { create: jest.fn().mockResolvedValue({}) };
    const svc = new GradingSchemeService(
      schemeModel as never,
      gradeModel as never,
      auditModel as never,
    );

    await expect(
      svc.updateScheme(actorId, courseId, {
        academicYear: '2026-2027',
        semester: 'first',
        components: [{ key: 'midterm', max: 25, step: 0.5, enabled: true }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    // Rejects if an existing mark (18) exceeds the new max (15) even with force=true
    await expect(
      svc.updateScheme(actorId, courseId, {
        academicYear: '2026-2027',
        semester: 'first',
        components: [{ key: 'midterm', max: 15, step: 0.5, enabled: true }],
        force: true,
        reason: 'Policy change',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    // Succeeds when force=true, reason given, and existing marks remain valid under new max (25)
    const updated = await svc.updateScheme(actorId, courseId, {
      academicYear: '2026-2027',
      semester: 'first',
      components: [{ key: 'midterm', max: 25, step: 0.5, enabled: true }],
      force: true,
      reason: 'Approved by council',
    });
    expect(updated.components.find((c) => c.key === 'midterm')?.max).toBe(25);
    expect(gradeModel.bulkWrite).toHaveBeenCalledTimes(1);
    expect(auditModel.create).toHaveBeenCalledTimes(1);
  });
});

describe('ControlSheetsService lock & unlock', () => {
  const sheetId = new Types.ObjectId();
  const courseId = new Types.ObjectId();
  const user = {
    _id: new Types.ObjectId().toString(),
    role: 'admin' as const,
    name: 'Admin',
    permissions: [],
    mustChangePassword: false,
    tokenVersion: 1,
  };

  it('locks and unlocks a sheet with audit entries', async () => {
    let locked = false;
    const sheetModel = {
      findById: jest.fn(() =>
        chain({
          _id: sheetId,
          courseId,
          academicYear: '2026-2027',
          semester: 'first',
          component: 'midterm',
          locked,
        }),
      ),
      findOneAndUpdate: jest.fn(
        (_, update: { $set?: { locked?: boolean } }) => {
          if (typeof update.$set?.locked === 'boolean')
            locked = update.$set.locked;
          return Promise.resolve({ _id: sheetId, locked });
        },
      ),
    };
    const courseModel = {
      findById: jest.fn(() =>
        chain({ _id: courseId, code: 'CS101', name: 'Intro' }),
      ),
    };
    const auditModel = { create: jest.fn().mockResolvedValue({}) };
    const access = {
      assertPermission: jest.fn(),
      assertCourseScope: jest.fn().mockResolvedValue(undefined),
      getCapabilities: jest.fn(() => ({
        canAccess: true,
        canView: true,
        canCreateSheets: true,
        canEnter: true,
        canEditPublished: true,
        canManageStates: true,
        canLock: true,
        canUnlock: true,
        canManageSchemes: true,
        canViewAudit: true,
        scopeAll: true,
      })),
    };
    const schemes = {
      requireEnabledComponent: jest.fn().mockResolvedValue({
        key: 'midterm',
        nameAr: 'ميدتيرم',
        nameEn: 'Midterm',
        max: 20,
        step: 0.5,
        enabled: true,
      }),
    };

    const svc = new ControlSheetsService(
      sheetModel as never,
      courseModel as never,
      {} as never,
      { findById: () => chain(null) } as never,
      {} as never,
      auditModel as never,
      access as never,
      schemes as never,
    );

    const lockedView = await svc.lock(
      user,
      String(sheetId),
      'Finalized midterm',
    );
    expect(lockedView.sheet.locked).toBe(true);
    expect(auditModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LOCK', reason: 'Finalized midterm' }),
    );

    const unlockedView = await svc.unlock(
      user,
      String(sheetId),
      'Fix typo on student 27001',
    );
    expect(unlockedView.sheet.locked).toBe(false);
    expect(auditModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UNLOCK',
        reason: 'Fix typo on student 27001',
      }),
    );
  });
});
