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
});
