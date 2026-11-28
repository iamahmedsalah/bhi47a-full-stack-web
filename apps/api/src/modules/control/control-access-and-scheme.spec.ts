import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { PERMISSIONS } from '@student-portal/shared';
import { ControlAccessService } from './services/control-access.service';
import { GradingSchemeService } from './services/grading-scheme.service';
import { ControlSheetsService } from './services/control-sheets.service';

const chain = <T>(value: T) => {
  const c: Record<string, unknown> = {};
  c.session = () => c;
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

  it('keeps review correction separate from doctor entry and approval', () => {
    const service = buildAccess();
    const staff = {
      _id: staffId,
      role: 'staff',
      permissions: [
        PERMISSIONS.CONTROL_ACCESS,
        PERMISSIONS.CONTROL_GRADES_ENTER,
        PERMISSIONS.CONTROL_SHEETS_REVIEW,
      ],
    } as Parameters<ControlAccessService['getCapabilities']>[0];
    expect(service.getCapabilities(staff).canEditReview).toBe(false);
    staff.permissions = [
      PERMISSIONS.CONTROL_ACCESS,
      PERMISSIONS.CONTROL_GRADES_REVIEW_EDIT,
    ];
    expect(service.getCapabilities(staff)).toMatchObject({
      canEditReview: true,
      canEnter: false,
      canApprove: false,
      canApproveFinal: false,
    });
  });

  it('retains every capability for admins while final approval remains explicit for staff', () => {
    const service = buildAccess();
    const admin = {
      _id: staffId,
      role: 'admin',
      permissions: [],
    } as Parameters<ControlAccessService['getCapabilities']>[0];
    expect(Object.values(service.getCapabilities(admin)).every(Boolean)).toBe(
      true,
    );
    expect(() =>
      service.assertPermission(admin, PERMISSIONS.CONTROL_FINAL_APPROVE),
    ).not.toThrow();
    const staff = {
      ...admin,
      role: 'staff',
      permissions: [
        PERMISSIONS.CONTROL_ACCESS,
        PERMISSIONS.CONTROL_SHEETS_APPROVE,
      ],
    } as typeof admin;
    expect(service.getCapabilities(staff).canApproveFinal).toBe(false);
    expect(() =>
      service.assertPermission(staff, PERMISSIONS.CONTROL_FINAL_APPROVE),
    ).toThrow(ForbiddenException);
  });

  it.each([
    [
      PERMISSIONS.CONTROL_SHEETS_REVIEW,
      true,
      false,
      false,
      false,
      false,
      false,
    ],
    [
      PERMISSIONS.CONTROL_SHEETS_APPROVE,
      false,
      true,
      false,
      false,
      false,
      false,
    ],
    [
      PERMISSIONS.CONTROL_FINAL_APPROVE,
      false,
      false,
      true,
      false,
      false,
      false,
    ],
    [
      PERMISSIONS.CONTROL_SHEETS_REOPEN,
      false,
      false,
      false,
      true,
      false,
      false,
    ],
    [
      PERMISSIONS.CONTROL_PETITIONS_CREATE,
      false,
      false,
      false,
      false,
      true,
      false,
    ],
    [
      PERMISSIONS.CONTROL_PETITIONS_APPROVE,
      false,
      false,
      false,
      false,
      false,
      true,
    ],
  ])(
    'keeps %s independent from other review/approval powers',
    (
      permission,
      review,
      approve,
      final,
      reopen,
      createPetitions,
      approvePetitions,
    ) => {
      const service = buildAccess();
      const user = {
        _id: staffId,
        role: 'staff' as const,
        permissions: [PERMISSIONS.CONTROL_ACCESS, permission],
      } as Parameters<ControlAccessService['getCapabilities']>[0];
      expect(service.getCapabilities(user)).toMatchObject({
        canReview: review,
        canApprove: approve,
        canApproveFinal: final,
        canReopen: reopen,
        canCreatePetitions: createPetitions,
        canApprovePetitions: approvePetitions,
      });
      for (const required of [
        PERMISSIONS.CONTROL_SHEETS_REVIEW,
        PERMISSIONS.CONTROL_SHEETS_APPROVE,
        PERMISSIONS.CONTROL_FINAL_APPROVE,
        PERMISSIONS.CONTROL_SHEETS_REOPEN,
        PERMISSIONS.CONTROL_PETITIONS_CREATE,
        PERMISSIONS.CONTROL_PETITIONS_APPROVE,
      ]) {
        if (required !== permission)
          expect(() => service.assertPermission(user, required)).toThrow(
            ForbiddenException,
          );
      }
    },
  );

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

  it('requires a separate grade grant per course, even with a global read scope', async () => {
    const otherCourseId = new Types.ObjectId();
    const teacher = {
      _id: staffId,
      name: 'Assistant',
      role: 'staff' as const,
      staffType: 'teaching_assistant',
      permissions: [
        PERMISSIONS.CONTROL_ACCESS,
        PERMISSIONS.CONTROL_GRADES_ENTER,
        PERMISSIONS.CONTROL_SCOPE_ALL,
      ],
      mustChangePassword: false,
      tokenVersion: 1,
    };
    let granted = true;
    const exists = jest.fn((filter: { _id: Types.ObjectId }) => ({
      lean: () =>
        Promise.resolve(granted && String(filter._id) === String(courseId)),
    }));
    const service = new ControlAccessService({ exists } as never, {} as never);
    await expect(
      service.assertCourseGradeWrite(teacher, courseId),
    ).resolves.toBeUndefined();
    expect(exists).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: courseId,
        $and: [
          expect.objectContaining({
            $or: expect.arrayContaining([
              { gradeEntryStaffIds: new Types.ObjectId(staffId) },
            ]),
          }),
        ],
        $or: expect.any(Array),
      }),
    );
    await expect(
      service.assertCourseGradeWrite(teacher, otherCourseId),
    ).rejects.toThrow(ForbiddenException);
    granted = false;
    await expect(
      service.assertCourseGradeWrite(teacher, courseId),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.assertCourseGradeWrite(
        { ...teacher, role: 'admin' },
        otherCourseId,
      ),
    ).resolves.toBeUndefined();
  });

  it('automatically authorizes assigned doctors to write grades while isolating TAs strictly to granted courses', async () => {
    const c1 = new Types.ObjectId();
    const c2 = new Types.ObjectId();
    const c3 = new Types.ObjectId();
    const doctorUser = {
      _id: staffId,
      name: 'Dr. Hany',
      role: 'staff' as const,
      staffType: 'doctor',
      permissions: [
        PERMISSIONS.CONTROL_ACCESS,
        PERMISSIONS.CONTROL_SHEETS_VIEW,
        PERMISSIONS.CONTROL_GRADES_ENTER,
      ],
      mustChangePassword: false,
      tokenVersion: 1,
    };
    const taUser = {
      ...doctorUser,
      name: 'TA Omar',
      staffType: 'teaching_assistant',
    };

    const grantedSet = new Set([String(c1), String(c2)]);
    const assignedIds = [c1, c2, c3];
    const containsGradeGrant = (filter: object) =>
      JSON.stringify(filter).includes('gradeEntryStaffIds');
    const courseModel = {
      exists: jest.fn(
        (filter: {
          _id?: Types.ObjectId | string;
          gradeEntryStaffIds?: unknown;
        }) => ({
          lean: () => {
            const targetId = filter._id ? String(filter._id) : '';
            const isAssigned = assignedIds.some(
              (id) => String(id) === targetId,
            );
            if (containsGradeGrant(filter)) {
              return Promise.resolve(
                isAssigned && grantedSet.has(targetId)
                  ? { _id: filter._id }
                  : null,
              );
            }
            return Promise.resolve(isAssigned ? { _id: filter._id } : null);
          },
        }),
      ),
      find: jest.fn((filter: Record<string, unknown>) =>
        chain(
          containsGradeGrant(filter)
            ? assignedIds
                .filter((id) => grantedSet.has(String(id)))
                .map((_id) => ({ _id }))
            : assignedIds.map((_id) => ({ _id })),
        ),
      ),
      findById: jest.fn(() => chain(null)),
      findOne: jest.fn(() => chain(null)),
    };
    const assignmentModel = {
      exists: jest.fn(() => chain(null)),
      find: jest.fn(() => chain([])),
    };
    const service = new ControlAccessService(
      courseModel as never,
      assignmentModel as never,
    );

    // Doctor is automatically authorized on all 3 assigned courses even when c3 is NOT in gradeEntryStaffIds
    await expect(service.canWriteCourseGrades(doctorUser, c3)).resolves.toBe(
      true,
    );
    const doctorScope = await service.listScopedCourseIds(
      doctorUser,
      '2026-2027',
      'first',
    );
    expect(doctorScope?.map(String)).toEqual([
      String(c1),
      String(c2),
      String(c3),
    ]);

    // TA Omar sees ONLY the 2 granted courses (c1, c2); c3 is completely hidden and blocked
    const taScope = await service.listScopedCourseIds(
      taUser,
      '2026-2027',
      'first',
    );
    expect(taScope?.map(String)).toEqual([String(c1), String(c2)]);
    await expect(
      service.hasCourseScope(
        taUser,
        { _id: c1, code: 'CS101' } as never,
        '2026-2027',
        'first',
      ),
    ).resolves.toBe(true);
    await expect(
      service.hasCourseScope(
        taUser,
        { _id: c3, code: 'CS103' } as never,
        '2026-2027',
        'first',
      ),
    ).resolves.toBe(false);
    await expect(service.canWriteCourseGrades(taUser, c1)).resolves.toBe(true);
    await expect(service.canWriteCourseGrades(taUser, c3)).resolves.toBe(false);
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
  it('defaults every new component to whole marks while preserving saved fractional steps', async () => {
    const stored = {
      components: [{ key: 'midterm', max: 20, step: 0.5, enabled: true }],
    };
    const model = { findOne: jest.fn(() => chain(null)) };
    const svc = new GradingSchemeService(
      model as never,
      {} as never,
      {} as never,
    );
    const fresh = await svc.getScheme(
      String(new Types.ObjectId()),
      '2026-2027',
      'first',
    );
    expect(fresh.components.map((c) => c.step)).toEqual([1, 1, 1]);
    model.findOne.mockReturnValue(chain(stored));
    const saved = await svc.getScheme(
      String(new Types.ObjectId()),
      '2026-2027',
      'first',
    );
    expect(saved.components.find((c) => c.key === 'midterm')).toMatchObject({
      max: 20,
      step: 0.5,
    });
  });
  const courseId = new Types.ObjectId().toString();
  const actorId = new Types.ObjectId().toString();

  it('freezes marked component schemes even when force is requested', async () => {
    const schemeModel = {
      db: {
        startSession: () =>
          Promise.resolve({
            withTransaction: (fn: () => Promise<unknown>) => fn(),
            endSession: jest.fn(),
          }),
      },
      updateOne: jest.fn().mockResolvedValue({}),
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
    await expect(
      svc.updateScheme(actorId, String(courseId), {
        academicYear: '2026-2027',
        semester: 'first',
        components: [{ key: 'midterm', max: 25, step: 0.5, enabled: true }],
        force: true,
        reason: 'Council decision',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(gradeModel.bulkWrite).not.toHaveBeenCalled();
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
    const session = {
      withTransaction: (fn: () => Promise<unknown>) => fn(),
      endSession: jest.fn(),
    };
    const sheetModel = {
      db: { startSession: jest.fn().mockResolvedValue(session) },
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
      canWriteCourseGrades: jest.fn().mockResolvedValue(true),
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
      [
        expect.objectContaining({
          action: 'LOCK',
          reason: 'Finalized midterm',
        }),
      ],
      expect.anything(),
    );

    const unlockedView = await svc.unlock(
      user,
      String(sheetId),
      'Fix typo on student 27001',
    );
    expect(unlockedView.sheet.locked).toBe(false);
    expect(auditModel.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          action: 'UNLOCK',
          reason: 'Fix typo on student 27001',
        }),
      ],
      expect.anything(),
    );
  });

  it('bulk-locks and bulk-unlocks selected courses and components, upserting unopened sheets as locked', async () => {
    const sheetsByKey = new Map<string, Record<string, any>>();
    const existingMidtermId = new Types.ObjectId();
    sheetsByKey.set(`${String(courseId)}:midterm`, {
      _id: existingMidtermId,
      academicYear: '2026-2027',
      semester: 'first',
      courseId,
      courseCode: 'CS101',
      component: 'midterm',
      locked: false,
      revision: 0,
    });

    const sheetModel = {
      db: {
        startSession: jest.fn().mockResolvedValue({
          withTransaction: async (fn: () => Promise<void>) => fn(),
          endSession: jest.fn().mockResolvedValue(undefined),
        }),
      },
      findOne: jest.fn((filter: Record<string, any>) =>
        chain(
          sheetsByKey.get(`${String(filter.courseId)}:${filter.component}`) ??
            null,
        ),
      ),
      updateOne: jest.fn(
        (filter: Record<string, any>, update: Record<string, any>) => {
          for (const [, val] of sheetsByKey) {
            if (String(val._id) === String(filter._id)) {
              if (update.$set) Object.assign(val, update.$set);
              if (update.$inc?.revision) val.revision += update.$inc.revision;
            }
          }
          return Promise.resolve({ modifiedCount: 1 });
        },
      ),
      create: jest.fn((docs: Array<Record<string, any>>) => {
        const created: Record<string, any> = {
          _id: new Types.ObjectId(),
          ...docs[0],
        };
        sheetsByKey.set(
          `${String(created.courseId)}:${String(created.component)}`,
          created,
        );
        return Promise.resolve([created]);
      }),
    };
    const courseModel = {
      find: jest.fn(() =>
        chain([{ _id: courseId, code: 'CS101', name: 'Intro' }]),
      ),
    };
    const auditModel = { create: jest.fn().mockResolvedValue({}) };
    const access = {
      canWriteCourseGrades: jest.fn().mockResolvedValue(true),
      assertPermission: jest.fn(),
      assertCourseScope: jest.fn().mockResolvedValue(undefined),
    };
    const schemes = {
      getScheme: jest.fn().mockResolvedValue({
        components: [
          { key: 'midterm', enabled: true },
          { key: 'coursework', enabled: true },
          { key: 'final', enabled: true },
        ],
      }),
    };

    const svc = new ControlSheetsService(
      sheetModel as never,
      courseModel as never,
      {} as never,
      {} as never,
      {} as never,
      auditModel as never,
      access as never,
      schemes as never,
    );

    const lockResult = await svc.bulkLock(user, {
      academicYear: '2026-2027',
      semester: 'first',
      courseIds: [String(courseId)],
      components: ['midterm', 'coursework', 'final'],
      reason: 'Close all control components',
    });

    expect(lockResult).toEqual({
      locked: true,
      affected: 3,
      createdAndLocked: 2,
      alreadyInState: 0,
      skippedDisabled: 0,
    });
    expect(sheetsByKey.get(`${String(courseId)}:midterm`)?.locked).toBe(true);
    expect(sheetsByKey.get(`${String(courseId)}:coursework`)?.locked).toBe(
      true,
    );
    expect(sheetsByKey.get(`${String(courseId)}:final`)?.locked).toBe(true);

    const unlockResult = await svc.bulkUnlock(user, {
      academicYear: '2026-2027',
      semester: 'first',
      courseIds: [String(courseId)],
      components: ['midterm', 'final'],
      reason: 'Reopen midterm and final only',
    });

    expect(unlockResult).toEqual({
      locked: false,
      affected: 2,
      createdAndLocked: 0,
      alreadyInState: 0,
      skippedDisabled: 0,
    });
    expect(sheetsByKey.get(`${String(courseId)}:midterm`)?.locked).toBe(false);
    expect(sheetsByKey.get(`${String(courseId)}:coursework`)?.locked).toBe(
      true,
    );
    expect(sheetsByKey.get(`${String(courseId)}:final`)?.locked).toBe(false);
  });
});
