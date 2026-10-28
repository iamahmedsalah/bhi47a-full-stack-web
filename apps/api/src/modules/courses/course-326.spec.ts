import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import * as ExcelJS from 'exceljs';
import { CourseImporter } from '../uploads/importers/course.importer';
import { normalizeRowKeys } from '../uploads/upload-utils';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { COURSE_326_CURRICULA, type Semester } from '@student-portal/shared';
import { CoursesService } from './courses.service';
import {
  CreateCourseDto,
  UpdateCourseDto,
  EnrollmentOptionsDto,
} from './dto/course.dto';
import { courseForDepartment } from './utils/course-curriculum.util';
import { isCourseOfferedForTerm } from '../registrations/utils/term-availability.util';

const course = {
  _id: new Types.ObjectId(),
  code: '326',
  name: 'Governmental Accounting',
  nameAr: 'المحاسبة في الوحدات الحكومية',
  nameEn: 'Governmental Accounting',
  level: '3',
  academicLevel: '3',
  semester: 'second' as const,
  department: 'BIS',
  creditHours: 3,
  type: 'elective',
  isActive: true,
  curricula: COURSE_326_CURRICULA.map((item) => ({ ...item })),
  syllabusPdfUrl: '/shared-book.pdf',
  offeredTerms: ['first', 'second'] as Semester[],
};
function query<T>(value: T) {
  return {
    sort: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
    then: (resolve: (result: T) => unknown) =>
      Promise.resolve(value).then(resolve),
  };
}
function harness(department = 'ACCOUNTING', semester = 'first') {
  const studentId = new Types.ObjectId();
  const profile = {
    userId: studentId,
    studentCode: '3001',
    level: '3',
    department,
    semester,
    academicYear: '2026-2027',
  };
  const courses = {
    find: jest.fn((_filter: unknown) => query([course])),
    countDocuments: jest.fn().mockResolvedValue(1),
  };
  const registrations = {
    findOne: jest.fn().mockReturnValue(query(null)),
    find: jest.fn().mockReturnValue(query([])),
    bulkWrite: jest.fn().mockResolvedValue({}),
  };
  const profiles = {
    findOne: jest.fn().mockReturnValue(query(profile)),
    find: jest.fn().mockReturnValue(query([profile])),
    bulkWrite: jest.fn().mockResolvedValue({}),
  };
  const users = { find: jest.fn().mockReturnValue(query([])) };
  const period = {
    assertAdministrativeCourseAddition: jest.fn().mockResolvedValue(undefined),
    resolveRegistrationPeriod: jest
      .fn()
      .mockResolvedValue({ academicYear: '2026-2027', semester }),
  };
  const service = new CoursesService(
    courses as never,
    {} as never,
    registrations as never,
    profiles as never,
    users as never,
    {} as never,
    undefined,
    period as never,
  );
  return {
    service,
    studentId,
    profile,
    courses,
    registrations,
    profiles,
    period,
  };
}

describe('326 department placements', () => {
  it('exports a real XLSX and preserves both placements when imported again', async () => {
    const h = harness();
    jest.spyOn(h.service, 'findAll').mockResolvedValue({
      items: [course],
      total: 1,
      page: 1,
      limit: 100,
      totalPages: 1,
    } as never);
    const data = await h.service.exportCourses(
      {},
      { _id: new Types.ObjectId().toHexString(), role: 'admin' },
    );
    expect(data.subarray(0, 2).toString()).toBe('PK');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(new Uint8Array(data).buffer);
    const sheet = workbook.worksheets[0];
    const row: Record<string, unknown> = {};
    sheet.getRow(1).eachCell((cell, index) => {
      row[cell.text] = sheet.getRow(2).getCell(index).value;
    });
    const importer = new CourseImporter({} as never);
    const result = importer.validate([normalizeRowKeys(row)]);
    expect(result.errors).toEqual([]);
    expect(result.validRows[0].row._cleanCurricula).toEqual(course.curricula);
    expect(row.courseNameAr).toBe(course.nameAr);
  });
  it('rejects conflicting department entries in the existing import format', () => {
    const importer = new CourseImporter({} as never);
    const result = importer.validate([
      {
        code: '326',
        courseName: course.nameAr,
        level: '3',
        semester: 'first',
        programCurricula:
          'ACCOUNTING:3:first:elective|ACCOUNTING:3:second:elective',
      },
    ]);
    expect(result.validRows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });
  it.each([
    ['ACCOUNTING', 'first', true],
    ['ACCOUNTING', 'second', false],
    ['BIS', 'first', false],
    ['BIS', 'second', true],
    ['BIS', 'summer', false],
  ] as const)('%s in %s: offered=%s', (department, semester, expected) => {
    const scoped = courseForDepartment(course, department);
    expect(scoped).not.toBeNull();
    expect(isCourseOfferedForTerm(scoped!, semester)).toBe(expected);
    expect(scoped?._id).toBe(course._id);
    expect(scoped?.syllabusPdfUrl).toBe(course.syllabusPdfUrl);
    expect(course.semester).toBe('second');
  });
  it('does not offer the specialized course to GENERAL or an unknown department', () => {
    expect(courseForDepartment(course, 'GENERAL')).toBeNull();
    expect(courseForDepartment(course, 'unknown')).toBeNull();
  });
  it('rejects conflicting placements in create and update DTOs', async () => {
    const duplicate = [
      course.curricula[0],
      { ...course.curricula[0], semester: 'second' },
    ];
    for (const dto of [
      plainToInstance(CreateCourseDto, { ...course, curricula: duplicate }),
      plainToInstance(UpdateCourseDto, { curricula: duplicate }),
    ]) {
      expect(
        (await validate(dto)).some((error) => error.property === 'curricula'),
      ).toBe(true);
    }
    expect(
      await validate(
        plainToInstance(UpdateCourseDto, { curricula: course.curricula }),
      ),
    ).toHaveLength(0);
  });
  it('filters before pagination and count using the same placement', async () => {
    const h = harness();
    await h.service.findAll({
      department: 'ACCOUNTING',
      level: '3',
      semester: 'first',
      page: 2,
      limit: 10,
    });
    const filter = h.courses.find.mock.calls[0][0];
    expect(h.courses.countDocuments).toHaveBeenCalledWith(filter);
    expect(JSON.stringify(filter)).toContain(
      '"$elemMatch":{"academicLevel":"3","semester":"first","department":"ACCOUNTING"}',
    );
    expect(h.courses.find.mock.results[0].value.skip).toHaveBeenCalledWith(10);
  });
});

describe('current student books', () => {
  it.each([
    ['ACCOUNTING', 'first'],
    ['BIS', 'second'],
  ])(
    'resolves %s books to %s and scopes approved registration to the current period',
    async (department, semester) => {
      const h = harness(department, semester);
      const result = await h.service.getStudentSyllabi(
        h.studentId.toHexString(),
      );
      expect(h.period.resolveRegistrationPeriod).toHaveBeenCalledWith(
        h.studentId.toHexString(),
        semester,
      );
      expect(h.registrations.findOne).toHaveBeenCalledWith({
        studentId: h.studentId,
        status: 'approved',
        academicYear: '2026-2027',
        semester,
      });
      expect(result.registeredCourses).toEqual([]);
      expect(result.availableLevelCourses).toHaveLength(1);
      expect(result.availableLevelCourses[0]).toMatchObject({
        code: '326',
        semester,
        isRegistered: false,
        syllabusPdfUrl: '/shared-book.pdf',
      });
    },
  );
  it('excludes 326 from the opposite semester before registration', async () => {
    const h = harness('ACCOUNTING', 'second');
    expect(
      (await h.service.getStudentSyllabi(h.studentId.toHexString()))
        .availableLevelCourses,
    ).toEqual([]);
  });
  it('keeps approved retake courses from earlier levels', async () => {
    const h = harness();
    h.registrations.findOne.mockReturnValue(
      query({ courses: ['326'], status: 'approved' }),
    );
    h.profile.level = '4';
    const result = await h.service.getStudentSyllabi(h.studentId.toHexString());
    expect(result.registeredCourses[0]).toMatchObject({
      code: '326',
      semester: 'first',
      isRegistered: true,
    });
  });
  it('rejects a missing department instead of guessing BIS', async () => {
    const h = harness('unknown');
    await expect(
      h.service.getStudentSyllabi(h.studentId.toHexString()),
    ).rejects.toThrow('department');
  });
});

describe('administrative limit override authorization and audit', () => {
  const actor = { _id: new Types.ObjectId().toHexString(), role: 'admin' };
  const reason = 'Approved by the academic administration';
  const limits = {
    currentCourseCount: 6,
    proposedCourseCount: 7,
    currentCreditHours: 18,
    proposedCreditHours: 21,
    maxCourses: 6,
    maxCreditHours: 18,
  };
  it.each([
    undefined,
    { ...actor, role: 'staff' },
    { ...actor, _id: 'invalid' },
  ])('rejects untrusted actors', async (caller) => {
    const h = harness();
    await expect(
      h.service.processEnrollmentRows(
        course as never,
        [{ studentCode: '3001' }],
        {
          semester: 'first',
          overrideRegistrationLimits: true,
          overrideReason: reason,
          actor: caller,
        },
      ),
    ).rejects.toThrow('administrators');
    expect(h.registrations.bulkWrite).not.toHaveBeenCalled();
  });
  it('requires a meaningful reason on both DTO and service', async () => {
    const h = harness();
    await expect(
      h.service.processEnrollmentRows(course as never, [], {
        overrideRegistrationLimits: true,
        overrideReason: 'short',
        actor,
      }),
    ).rejects.toThrow('reason');
    for (const raw of [undefined, '', 'short', ' '.repeat(20)]) {
      expect(
        (
          await validate(
            plainToInstance(
              EnrollmentOptionsDto,
              { overrideRegistrationLimits: true, overrideReason: raw },
              { enableImplicitConversion: true },
            ),
          )
        ).some((error) => error.property === 'overrideReason'),
      ).toBe(true);
    }
  });
  it.each(['false', 'true', false, true])(
    'parses multipart boolean %s without implicit truthiness',
    async (value) => {
      const dto = plainToInstance(
        EnrollmentOptionsDto,
        {
          overrideRegistrationLimits: value,
          skipBlocked: value,
          overrideReason: reason,
        },
        { enableImplicitConversion: true },
      );
      expect(dto.overrideRegistrationLimits).toBe(
        value === true || value === 'true',
      );
      expect(dto.skipBlocked).toBe(value === true || value === 'true');
      expect(await validate(dto)).toHaveLength(0);
    },
  );
  it('records the actor, reason and counts in the same existing-registration update', async () => {
    const h = harness();
    const regId = new Types.ObjectId();
    h.registrations.find.mockReturnValue(
      query([
        {
          _id: regId,
          studentId: h.studentId,
          courses: ['1', '2', '3', '4', '5', '6'],
        },
      ]),
    );
    h.period.assertAdministrativeCourseAddition.mockResolvedValue(limits);
    const result = await h.service.processEnrollmentRows(
      course as never,
      [{ studentCode: '3001' }],
      {
        semester: 'first',
        overrideRegistrationLimits: true,
        overrideReason: reason,
        actor,
      },
    );
    expect(result).toMatchObject({
      enrolledCount: 1,
      overriddenCount: 1,
      errorCount: 0,
    });
    expect(h.period.assertAdministrativeCourseAddition).toHaveBeenCalledWith(
      h.studentId.toHexString(),
      expect.anything(),
      ['1', '2', '3', '4', '5', '6'],
      'first',
      true,
    );
    expect(h.registrations.bulkWrite).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          updateOne: expect.objectContaining({
            filter: { _id: regId, courses: { $ne: '326' } },
            update: expect.objectContaining({
              $addToSet: { courses: '326' },
              $push: {
                administrativeLimitOverrides: expect.objectContaining({
                  ...limits,
                  actorId: new Types.ObjectId(actor._id),
                  reason,
                  courseCode: '326',
                }),
              },
            }),
          }),
        }),
      ],
      { ordered: false },
    );
  });
  it('does not record an override for students within limits', async () => {
    const h = harness();
    const result = await h.service.processEnrollmentRows(
      course as never,
      [{ studentCode: '3001' }],
      {
        semester: 'first',
        overrideRegistrationLimits: true,
        overrideReason: reason,
        actor,
      },
    );
    expect(result.overriddenCount).toBe(0);
    const ops = (h.registrations.bulkWrite.mock.calls as unknown[][])[0][0] as {
      insertOne: { document: Record<string, unknown> };
    }[];
    expect(ops[0].insertOne.document).not.toHaveProperty(
      'administrativeLimitOverrides',
    );
  });
  it('preserves department/semester rejection even with an administrative exception', async () => {
    const h = harness('BIS', 'first');
    const result = await h.service.processEnrollmentRows(
      course as never,
      [{ studentCode: '3001' }],
      {
        semester: 'first',
        overrideRegistrationLimits: true,
        overrideReason: reason,
        actor,
      },
    );
    expect(result).toMatchObject({
      enrolledCount: 0,
      overriddenCount: 0,
      errorCount: 1,
    });
    expect(h.period.assertAdministrativeCourseAddition).not.toHaveBeenCalled();
    expect(h.registrations.bulkWrite).not.toHaveBeenCalled();
  });
  it('returns structured counts without bypass when the exception is disabled', async () => {
    const h = harness();
    h.period.assertAdministrativeCourseAddition.mockRejectedValue(
      new BadRequestException({
        code: 'REGISTRATION_LIMIT_EXCEEDED',
        message: 'Limit exceeded',
        limits,
      }),
    );
    const result = await h.service.processEnrollmentRows(
      course as never,
      [{ studentCode: '3001' }],
      { semester: 'first' },
    );
    expect(result).toMatchObject({
      enrolledCount: 0,
      errorCount: 1,
      issues: [{ row: 2, code: 'REGISTRATION_LIMIT_EXCEEDED', limits }],
    });
    expect(h.registrations.bulkWrite).not.toHaveBeenCalled();
  });
});

describe('administrative enrollment', () => {
  it('returns an actionable format error for unsupported or corrupt workbooks', async () => {
    const h = harness();
    jest.spyOn(h.service, 'findOne').mockResolvedValue(course as never);
    await expect(
      h.service.enrollStudentsFromExcel(
        course._id.toHexString(),
        Buffer.from('invalid workbook'),
        'binary.xls',
      ),
    ).rejects.toThrow('XLSX or CSV');
    expect(h.registrations.bulkWrite).not.toHaveBeenCalled();
  });
  it('reports eligibility failures without writing a registration', async () => {
    const h = harness();
    h.period.assertAdministrativeCourseAddition.mockRejectedValue(
      new Error('Prerequisite not passed'),
    );
    const result = await h.service.processEnrollmentRows(
      course as never,
      [{ studentCode: '3001' }],
      { semester: 'first' },
    );
    expect(result.errorCount).toBe(1);
    expect(result.errors[0]).toContain('Prerequisite not passed');
    expect(h.registrations.bulkWrite).not.toHaveBeenCalled();
  });
  it.each([
    ['ACCOUNTING', 'first', 1],
    ['ACCOUNTING', 'second', 0],
    ['BIS', 'first', 0],
    ['BIS', 'second', 1],
  ])('enrolls %s in %s: %s', async (department, semester, enrolled) => {
    const h = harness(String(department), String(semester));
    const result = await h.service.processEnrollmentRows(
      course as never,
      [{ studentCode: '3001' }],
      { semester: semester as Semester, academicYear: '2026-2027' },
    );
    expect(result.enrolledCount).toBe(enrolled);
    expect(result.errorCount).toBe(enrolled ? 0 : 1);
    expect(h.registrations.bulkWrite).toHaveBeenCalledTimes(enrolled ? 1 : 0);
  });
  it('does not add an existing enrollment twice', async () => {
    const h = harness();
    h.registrations.find.mockReturnValue(
      query([
        { _id: new Types.ObjectId(), studentId: h.studentId, courses: ['326'] },
      ]),
    );
    const result = await h.service.processEnrollmentRows(
      course as never,
      [{ studentCode: '3001' }, { studentCode: '3001' }],
      { semester: 'first' },
    );
    expect(result.alreadyEnrolledCount).toBe(1);
    expect(result.enrolledCount).toBe(0);
    expect(h.registrations.bulkWrite).not.toHaveBeenCalled();
  });
});

describe('shared syllabus upload and removal', () => {
  function uploadHarness() {
    const doctorId = new Types.ObjectId();
    const document = {
      ...course,
      doctorIds: [doctorId],
      save: jest.fn().mockResolvedValue(undefined),
      syllabusPdfData: 'old-data',
    };
    const courses = { findById: jest.fn().mockResolvedValue(document) };
    const cache = { delPattern: jest.fn().mockResolvedValue(undefined) };
    const service = new CoursesService(
      courses as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      cache as never,
    );
    const buffer = Buffer.from('%PDF-1.7\nshared course book');
    const file = {
      fieldname: 'file',
      originalname: 'book.pdf',
      mimetype: 'application/pdf',
      encoding: '7bit',
      buffer,
      size: buffer.length,
    };
    return { doctorId, document, service, cache, file };
  }
  it('uploads once on the existing course and invalidates cached metadata', async () => {
    const h = uploadHarness();
    await h.service.uploadSyllabus(course._id.toHexString(), h.file, {
      role: 'staff',
      staffType: 'doctor',
      _id: h.doctorId,
    });
    expect(h.document.save).toHaveBeenCalledTimes(1);
    expect(h.document.syllabusPdfData).toBe(h.file.buffer.toString('base64'));
    expect(h.cache.delPattern).toHaveBeenCalledWith('courses:*');
    expect(h.document.curricula).toEqual(course.curricula);
  });
  it('rejects teaching assistants, unrelated doctors, invalid types and oversize files', async () => {
    const h = uploadHarness();
    for (const caller of [
      { role: 'staff', staffType: 'teaching_assistant', _id: h.doctorId },
      { role: 'staff', staffType: 'doctor', _id: new Types.ObjectId() },
    ]) {
      await expect(
        h.service.uploadSyllabus(course._id.toHexString(), h.file, caller),
      ).rejects.toThrow();
    }
    await expect(
      h.service.uploadSyllabus(
        course._id.toHexString(),
        { ...h.file, size: 4 * 1024 * 1024 + 1 },
        { role: 'admin' },
      ),
    ).rejects.toThrow('4MB');
    await expect(
      h.service.uploadSyllabus(
        course._id.toHexString(),
        { ...h.file, mimetype: 'text/plain', originalname: 'book.txt' },
        { role: 'admin' },
      ),
    ).rejects.toThrow();
    expect(h.document.save).not.toHaveBeenCalled();
  });
  it('surfaces storage failure instead of reporting upload success', async () => {
    const h = uploadHarness();
    h.document.save.mockRejectedValue(new Error('Storage unavailable'));
    await expect(
      h.service.uploadSyllabus(course._id.toHexString(), h.file, {
        role: 'admin',
      }),
    ).rejects.toThrow('Storage unavailable');
    expect(h.cache.delPattern).not.toHaveBeenCalled();
  });
  it('removes both URL and embedded data so a deleted PDF cannot still be downloaded', async () => {
    const h = uploadHarness();
    await h.service.removeSyllabus(course._id.toHexString(), { role: 'admin' });
    expect(h.document.syllabusPdfData).toBeUndefined();
    expect(h.document.syllabusPdfUrl).toBeUndefined();
    expect(h.cache.delPattern).toHaveBeenCalledWith('courses:*');
  });
  it('continues withholding book downloads from students blocked for unpaid fees', async () => {
    const profiles = {
      findOne: jest.fn().mockReturnValue(query({ isBlocked: true })),
    };
    const courses = { findById: jest.fn() };
    const service = new CoursesService(
      courses as never,
      {} as never,
      {} as never,
      profiles as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.downloadSyllabus(
        course._id.toHexString(),
        {},
        { role: 'student', _id: new Types.ObjectId() },
      ),
    ).rejects.toThrow();
    expect(courses.findById).not.toHaveBeenCalled();
  });
});
