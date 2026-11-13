import {
  ForbiddenException,
  BadRequestException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  isReleasedGradeVisible,
  type GradeVisibilitySettings,
  PERMISSIONS,
} from '@student-portal/shared';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { GradesController } from './grades.controller';
import { GradesService } from './grades.service';
import { UpdateGradesSettingsDto } from './dto/grade.dto';

const student = { level: '1', studentCode: '260001' };
const midterm = { courseCode: 'CS101', examType: 'midterm' };
describe('Released grade visibility', () => {
  it('does not let a grade writer publish or withdraw through a single-grade payload', async () => {
    const saveGrade = jest.fn();
    const update = jest.fn();
    const controller = new GradesController({
      saveGrade,
      update,
    } as unknown as GradesService);
    const editor = {
      role: 'staff',
      permissions: [PERMISSIONS.GRADES_WRITE],
    } as Parameters<GradesController['saveGrade']>[1];
    for (const isPublished of [true, false]) {
      await expect(
        controller.saveGrade({ isPublished } as never, editor),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        controller.update('synthetic', { isPublished }, editor),
      ).rejects.toThrow(ForbiddenException);
    }
    expect(saveGrade).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    await controller.saveGrade({} as never, editor);
    expect(saveGrade).toHaveBeenCalledTimes(1);
  });
  it('filters student API rows and suppresses totals that could disclose hidden components', async () => {
    const chain = (value: unknown) => {
      const query = {
        select: () => query,
        sort: () => query,
        lean: () => Promise.resolve(value),
      };
      return query;
    };
    const studentId = '100000000000000000000001';
    const settings = {
      gradesPublishedExamTypes: ['final'],
      gradesPublishedLevels: ['1'],
    };
    const service = Object.assign(
      Object.create(GradesService.prototype) as GradesService,
      {
        gradeModel: { find: () => chain([]) },
        systemSettingsModel: { findOne: () => Promise.resolve(settings) },
        studentProfileModel: { findOne: () => chain(student) },
        courseModel: {
          find: () => chain([{ code: 'CS101', academicLevel: '1' }]),
        },
        releaseStoreFixture: {
          managedScopes: () => Promise.resolve(new Set()),
          studentMarks: () =>
            Promise.resolve([
              {
                ...midterm,
                status: 'absent',
                grade: null,
                academicYear: '2026-2027',
                semester: 'first',
              },
              {
                courseCode: 'CS101',
                examType: 'final',
                status: 'present',
                grade: 55,
                officialResult: { total: 72 },
              },
            ]),
        },
      },
    );
    jest
      .spyOn(service, 'controlReleases', 'get')
      .mockReturnValue(service.releaseStoreFixture as never);
    jest.spyOn(service, 'getStudentResultsStatus').mockResolvedValue({
      isOpen: true,
      studentLevel: '1',
      isLevelPublished: true,
    });
    const results = await service.findStudentResults(studentId);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      examType: 'final',
      grade: 55,
      status: 'present',
    });
    expect(results[0]).not.toHaveProperty('officialResult', { total: 72 });
    settings.gradesPublishedExamTypes = ['midterm', 'final'];
    const both = await service.findStudentResults(studentId);
    expect(both.map((row) => row.status)).toEqual(['absent', 'present']);
  });
  it('keeps existing published results visible with old settings', () => {
    expect(isReleasedGradeVisible({}, student, midterm)).toBe(true);
  });
  it('supports a single course/student exception to a globally hidden component', () => {
    const settings: GradeVisibilitySettings = {
      gradesPublishedExamTypes: ['final'],
      gradesVisibilityRules: [
        {
          courseCode: 'cs101',
          studentCode: '260001',
          examType: 'midterm',
          isVisible: true,
        },
      ],
    };
    expect(isReleasedGradeVisible(settings, student, midterm)).toBe(true);
    expect(
      isReleasedGradeVisible(
        settings,
        { ...student, studentCode: '260002' },
        midterm,
      ),
    ).toBe(false);
    expect(
      isReleasedGradeVisible(settings, student, {
        ...midterm,
        courseCode: 'CS102',
      }),
    ).toBe(false);
    expect(
      isReleasedGradeVisible(settings, student, {
        ...midterm,
        examType: 'final',
      }),
    ).toBe(true);
    expect(
      isReleasedGradeVisible(
        { ...settings, gradesSystemOpen: false },
        student,
        midterm,
      ),
    ).toBe(false);
    expect(
      isReleasedGradeVisible(
        { ...settings, gradesPublishedLevels: ['2'] },
        student,
        midterm,
      ),
    ).toBe(false);
  });
  it('opens exactly at the start and closes exactly at the end, including exceptions', () => {
    const settings = {
      gradesOpenAt: '2026-11-13T10:00:00Z',
      gradesCloseAt: '2026-11-13T11:00:00Z',
    };
    expect(
      isReleasedGradeVisible(
        settings,
        student,
        midterm,
        Date.parse(settings.gradesOpenAt) - 1,
      ),
    ).toBe(false);
    expect(
      isReleasedGradeVisible(
        settings,
        student,
        midterm,
        Date.parse(settings.gradesOpenAt),
      ),
    ).toBe(true);
    expect(
      isReleasedGradeVisible(
        settings,
        student,
        midterm,
        Date.parse(settings.gradesCloseAt),
      ),
    ).toBe(false);
  });
  it('uses the last matching rule without leaking a different component', () => {
    const settings: GradeVisibilitySettings = {
      gradesVisibilityRules: [
        { courseCode: 'CS101', isVisible: false },
        {
          studentCode: student.studentCode,
          examType: 'midterm',
          isVisible: true,
        },
      ],
    };
    expect(isReleasedGradeVisible(settings, student, midterm)).toBe(true);
    expect(
      isReleasedGradeVisible(settings, student, {
        ...midterm,
        examType: 'final',
      }),
    ).toBe(false);
  });
  it.each([
    ['updateSettings', PERMISSIONS.GRADES_VISIBILITY_MANAGE],
    ['publishGrades', PERMISSIONS.GRADES_PUBLISH],
    ['previewRelease', PERMISSIONS.GRADES_PUBLISH],
  ] as const)(
    'protects %s separately from grade editing',
    (method, permission) => {
      let permissions: string[] = [PERMISSIONS.GRADES_WRITE];
      const context = {
        // Metadata belongs to the original method, rather than a bound wrapper.
        getHandler: () => Reflect.get(GradesController.prototype, method),
        getClass: () => GradesController,
        switchToHttp: () => ({
          getRequest: () => ({ user: { role: 'staff', permissions } }),
        }),
      } as ExecutionContext;
      const guard = new PermissionsGuard(new Reflector());
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      permissions = [permission];
      expect(guard.canActivate(context)).toBe(true);
      permissions = [];
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    },
  );
  it('rejects invalid dates, levels and excessive rules; allows explicit schedule clearing', async () => {
    expect(
      await validate(
        plainToInstance(UpdateGradesSettingsDto, {
          gradesOpenAt: null,
          gradesCloseAt: null,
        }),
      ),
    ).toHaveLength(0);
    for (const input of [
      { gradesOpenAt: 'invalid' },
      { gradesPublishedLevels: ['5'] },
      { gradesSystemOpen: null },
      { gradesPublishedLevels: null },
      { gradesPublishedLevels: ['1', '1'] },
      { gradesPublishedExamTypes: null },
      { gradesVisibilityRules: null },
      {
        gradesVisibilityRules: Array.from({ length: 201 }, () => ({
          courseCode: 'CS101',
          isVisible: true,
        })),
      },
    ]) {
      expect(
        (await validate(plainToInstance(UpdateGradesSettingsDto, input)))
          .length,
      ).toBeGreaterThan(0);
    }
  });
  it('validates the merged schedule and actually clears stored dates', async () => {
    const settings = {
      gradesOpenAt: new Date('2026-11-13T10:00:00Z'),
      gradesCloseAt: new Date('2026-11-13T11:00:00Z'),
      save: jest.fn(),
    };
    const service = Object.assign(
      Object.create(GradesService.prototype) as GradesService,
      {
        systemSettingsModel: { findOne: jest.fn().mockResolvedValue(settings) },
      },
    );
    await expect(
      service.updateGradesSettings({ gradesOpenAt: '2026-11-13T12:00:00Z' }),
    ).rejects.toThrow(BadRequestException);
    await service.updateGradesSettings({
      gradesOpenAt: null,
      gradesCloseAt: null,
    });
    expect(settings.gradesOpenAt).toBeUndefined();
    expect(settings.gradesCloseAt).toBeUndefined();
    expect(settings.save).toHaveBeenCalledTimes(1);
  });
});
