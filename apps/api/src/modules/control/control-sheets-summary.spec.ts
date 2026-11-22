import { Types } from 'mongoose';
import {
  CONTROL_ENABLED_COMPONENT_KEYS,
  PERMISSIONS,
} from '@student-portal/shared';
import type { AuthenticatedUser } from '../auth/types/authenticated-request';
import { ControlSheetsService } from './services/control-sheets.service';

describe('control course summary projection', () => {
  it('preserves scoped summaries, IDs, legacy slugs, release flags and counts with projected sheets', async () => {
    const courseId = new Types.ObjectId();
    const finalId = new Types.ObjectId();
    const midtermId = new Types.ObjectId();
    const course = {
      _id: courseId,
      code: 'BIS101',
      name: 'Course',
      nameAr: 'مقرر',
      nameEn: 'Course',
      level: '1',
    };
    const sourceSheets = [
      {
        _id: finalId,
        courseId,
        component: 'final',
        slug: 'existing-final-slug',
        locked: true,
        workflowState: 'APPROVED',
        unusedPayload: 'not-needed',
      },
      {
        _id: midtermId,
        courseId,
        component: 'midterm',
        locked: false,
        workflowState: 'DRAFT',
        unusedPayload: 'not-needed',
      },
    ];
    let fields: string[] = [];
    const sheetQuery = {
      select: jest.fn((projection: string) => {
        fields = projection.split(' ');
        return sheetQuery;
      }),
      lean: jest.fn(() =>
        Promise.resolve(
          sourceSheets.map((sheet) =>
            Object.fromEntries(
              Object.entries(sheet).filter(([key]) => fields.includes(key)),
            ),
          ),
        ),
      ),
    };
    const findSheets = jest.fn().mockReturnValue(sheetQuery);
    const courseQuery = {
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([course]),
    };
    const findCourses = jest.fn().mockReturnValue(courseQuery);
    const access = {
      assertPermission: jest.fn(),
      listScopedCourseIds: jest.fn().mockResolvedValue([courseId]),
    };
    const toArray = jest
      .fn()
      .mockResolvedValue([{ scope: { courseId, component: 'final' } }]);
    const service = new ControlSheetsService(
      {
        find: findSheets,
        db: {
          collection: jest
            .fn()
            .mockReturnValue({ find: jest.fn().mockReturnValue({ toArray }) }),
        },
      } as never,
      { find: findCourses } as never,
      {
        aggregate: jest
          .fn()
          .mockResolvedValue([
            { _id: { courseId, examType: 'final' }, entered: 5, published: 3 },
          ]),
      } as never,
      {} as never,
      {
        aggregate: jest.fn().mockResolvedValue([{ _id: 'BIS101', n: 8 }]),
      } as never,
      {} as never,
      access as never,
      {} as never,
    );
    const user: AuthenticatedUser = {
      _id: new Types.ObjectId().toHexString(),
      role: 'staff',
      name: 'Reader',
      permissions: [PERMISSIONS.CONTROL_SHEETS_VIEW],
      mustChangePassword: false,
      tokenVersion: 0,
    };
    const term = {
      academicYear: '2026-2027',
      semester: 'first' as const,
      level: '1' as const,
    };
    const projected = await service.listCourses(user, term);
    expect(projected).toEqual({
      items: [
        {
          courseId: String(courseId),
          code: 'BIS101',
          name: 'Course',
          nameAr: 'مقرر',
          nameEn: 'Course',
          level: '1',
          rosterCount: 8,
          components: [
            {
              key: 'coursework',
              sheetId: null,
              slug: null,
              locked: false,
              workflowState: 'DRAFT',
              releaseActive: false,
              entered: 0,
              published: 0,
            },
            {
              key: 'midterm',
              sheetId: String(midtermId),
              slug: 'bis101-midterm-2026-2027-first',
              locked: false,
              workflowState: 'DRAFT',
              releaseActive: false,
              entered: 0,
              published: 0,
            },
            {
              key: 'final',
              sheetId: String(finalId),
              slug: 'existing-final-slug',
              locked: true,
              workflowState: 'APPROVED',
              releaseActive: true,
              entered: 5,
              published: 3,
            },
          ],
        },
      ],
    });
    expect(access.assertPermission).toHaveBeenCalledWith(
      user,
      PERMISSIONS.CONTROL_SHEETS_VIEW,
    );
    expect(access.listScopedCourseIds).toHaveBeenCalledWith(
      user,
      term.academicYear,
      term.semester,
    );
    expect(findCourses).toHaveBeenCalledWith({
      isActive: { $ne: false },
      _id: { $in: [courseId] },
      level: '1',
    });
    expect(findSheets).toHaveBeenCalledWith({
      courseId: { $in: [courseId] },
      academicYear: '2026-2027',
      semester: 'first',
      component: { $in: [...CONTROL_ENABLED_COMPONENT_KEYS] },
    });
    // Compare with the previous full-document result, not just the selected fields.
    sheetQuery.lean.mockImplementation(() => Promise.resolve(sourceSheets));
    expect(await service.listCourses(user, term)).toEqual(projected);
  });

  it('returns 4-stage workflow breakdown and actor history for getWorkflowHistory()', async () => {
    const courseId = new Types.ObjectId();
    const sheetId = new Types.ObjectId();
    const creatorId = new Types.ObjectId();
    const reviewerId = new Types.ObjectId();
    const approverId = new Types.ObjectId();
    const createdAt = new Date('2026-11-10T08:00:00.000Z');
    const submittedAt = new Date('2026-11-12T10:00:00.000Z');
    const approvedAt = new Date('2026-11-15T14:30:00.000Z');

    const sheet = {
      _id: sheetId,
      courseId,
      courseCode: 'BIS101',
      academicYear: '2026-2027',
      semester: 'first',
      component: 'midterm',
      slug: 'bis101-midterm-2026-2027-first',
      workflowState: 'APPROVED',
      locked: true,
      lockedBy: approverId,
      lockedAt: approvedAt,
      lockReason: 'Finalized',
      createdBy: creatorId,
      createdAt,
      submission: { submittedBy: creatorId.toHexString(), submittedAt },
      reviewSubmission: {
        submittedBy: reviewerId.toHexString(),
        submittedAt: approvedAt,
      },
      approvedBy: approverId,
      approvedAt,
    };

    const auditRows = [
      {
        _id: new Types.ObjectId(),
        action: 'APPROVE',
        actorId: approverId,
        oldValue: { workflowState: 'PENDING_APPROVAL' },
        newValue: { workflowState: 'APPROVED' },
        reason: 'Checked and verified',
        at: approvedAt,
      },
      {
        _id: new Types.ObjectId(),
        action: 'SUBMIT',
        actorId: creatorId,
        oldValue: { workflowState: 'DRAFT' },
        newValue: { workflowState: 'IN_REVIEW' },
        reason: null,
        at: submittedAt,
      },
    ];

    const access = {
      assertPermission: jest.fn(),
      assertCourseScope: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ControlSheetsService(
      {
        findById: jest
          .fn()
          .mockReturnValue({ lean: jest.fn().mockResolvedValue(sheet) }),
      } as never,
      {
        findById: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: courseId,
            code: 'BIS101',
            name: 'Principles of Economics',
            nameAr: 'مبادئ الاقتصاد',
            nameEn: 'Principles of Economics',
          }),
        }),
      } as never,
      {} as never,
      {
        find: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([
              {
                _id: creatorId,
                name: 'Dr. Ahmed',
                nameAr: 'أحمد علي',
                role: 'staff',
                staffType: 'doctor',
                titlePrefix: 'dr',
              },
              {
                _id: reviewerId,
                name: 'Control Officer',
                nameAr: 'مسؤول المراجعة',
                role: 'staff',
                staffType: 'administrative',
              },
              {
                _id: approverId,
                name: 'Admin User',
                nameAr: 'مدير النظام',
                role: 'admin',
              },
            ]),
          }),
        }),
      } as never,
      {} as never,
      {
        find: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(auditRows),
            }),
          }),
        }),
        findOne: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(null),
            }),
          }),
        }),
      } as never,
      access as never,
      {} as never,
    );

    const user: AuthenticatedUser = {
      _id: creatorId.toHexString(),
      role: 'admin',
      name: 'Admin',
      permissions: [PERMISSIONS.CONTROL_AUDIT_VIEW],
      mustChangePassword: false,
      tokenVersion: 0,
    };

    const history = await service.getWorkflowHistory(
      user,
      sheetId.toHexString(),
    );

    expect(access.assertPermission).toHaveBeenCalledWith(
      user,
      PERMISSIONS.CONTROL_AUDIT_VIEW,
    );

    expect(history.workflowState).toBe('APPROVED');
    expect(history.stages).toHaveLength(4);
    expect(history.stages[0]).toMatchObject({
      key: 'DRAFT',
      status: 'completed',
      actor: expect.objectContaining({ nameAr: 'أحمد علي' }),
    });
    expect(history.stages[3]).toMatchObject({
      key: 'APPROVED',
      status: 'completed',
      actor: expect.objectContaining({ nameAr: 'مدير النظام' }),
    });
    expect(history.events.map((e) => e.action)).toEqual([
      'APPROVE',
      'SUBMIT',
      'OPENED',
    ]);
  });
});
