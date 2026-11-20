import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Types } from 'mongoose';
import * as ExcelJS from 'exceljs';
import { CoursesService } from './courses.service';
import { WithdrawStudentsOptionsDto } from './dto/course.dto';

const term = { academicYear: '2026-2027', semester: 'first' as const };
const studentId = new Types.ObjectId();
const course = {
  _id: new Types.ObjectId(),
  code: 'CS201',
  name: 'Course',
  creditHours: 3,
};
function query<T>(value: T) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  };
}
function harness() {
  const registrations = {
    bulkWrite: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  };
  const profiles = {
    find: jest
      .fn()
      .mockReturnValue(query([{ studentCode: '00123', userId: studentId }])),
  };
  const users = { find: jest.fn().mockReturnValue(query([])) };
  const cache = { delPattern: jest.fn().mockResolvedValue(undefined) };
  const args = Array.from(
    { length: 12 },
    () => ({}),
  ) as unknown as ConstructorParameters<typeof CoursesService>;
  args[2] = registrations as never;
  args[3] = profiles as never;
  args[4] = users as never;
  args[6] = cache as never;
  const service = new CoursesService(...args);
  jest.spyOn(service, 'findOne').mockResolvedValue(course as never);
  const withdraw = (
    csv = 'student_code\n00123',
    options = term,
    name = 'students.csv',
  ) =>
    service.withdrawStudentsFromExcel(
      String(course._id),
      Buffer.from(csv),
      name,
      options,
      String(studentId),
    );
  return { service, registrations, profiles, users, cache, withdraw };
}

describe('Excel course withdrawal', () => {
  it('requires a specific academic year and semester before any writes', async () => {
    const h = harness();
    for (const options of [
      { ...term, academicYear: 'all' },
      { ...term, semester: 'all' },
    ]) {
      await expect(
        h.withdraw(undefined, options as typeof term),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(h.registrations.bulkWrite).not.toHaveBeenCalled();
  });

  it('validates required scope at the controller DTO boundary', async () => {
    expect(
      await validate(plainToInstance(WithdrawStudentsOptionsDto, {})),
    ).toHaveLength(2);
    expect(
      await validate(plainToInstance(WithdrawStudentsOptionsDto, term)),
    ).toHaveLength(0);
  });

  it('withdraws only the named student in the selected term using an atomic course/credit update', async () => {
    const h = harness();
    const result = await h.withdraw();
    expect(result).toMatchObject({
      withdrawnCount: 1,
      notEnrolledCount: 0,
      errorCount: 0,
    });
    const [operations] = h.registrations.bulkWrite.mock.calls[0] as unknown as [
      Array<{
        updateOne: {
          filter: Record<string, unknown>;
          update: Array<{ $set: Record<string, unknown> }>;
        };
      }>,
    ];
    const { filter, update: pipeline } = operations[0].updateOne;
    expect(filter).toMatchObject({ studentId, ...term });
    expect(filter).toHaveProperty('$expr');
    expect(pipeline[0].$set.courses).toMatchObject({
      $filter: { input: '$courses' },
    });
    expect(pipeline[0].$set.totalCreditHours).toHaveProperty('$max');
    expect(JSON.stringify(pipeline)).toContain('$totalCreditHours');
    expect(JSON.stringify(pipeline)).toContain('CS201');
    expect(h.cache.delPattern).toHaveBeenCalledWith('registrations:*');
  });

  it('deduplicates student codes and reports missing students and codes independently', async () => {
    const h = harness();
    const result = await h.withdraw(
      'student_code,name\n00123,A\n00123,A\nMISSING,B\n,C',
    );
    expect(result).toMatchObject({
      totalRows: 4,
      withdrawnCount: 1,
      duplicateCount: 1,
      errorCount: 2,
    });
    expect(result.errors.join(' ')).toContain('Student not found');
    expect(result.errors.join(' ')).toContain('Student code is required');
    expect(h.registrations.bulkWrite).toHaveBeenCalledTimes(1);
  });

  it('reports students already absent from the course without subtracting credits again', async () => {
    const h = harness();
    h.registrations.bulkWrite.mockResolvedValue({ modifiedCount: 0 });
    expect(await h.withdraw()).toMatchObject({
      withdrawnCount: 0,
      notEnrolledCount: 1,
      errorCount: 0,
    });
  });

  it('rejects ambiguous student identities without writes', async () => {
    const h = harness();
    h.users.find.mockReturnValue(
      query([{ _id: new Types.ObjectId(), code: '00123' }]),
    );
    expect(await h.withdraw()).toMatchObject({
      withdrawnCount: 0,
      errorCount: 1,
    });
    expect(h.registrations.bulkWrite).not.toHaveBeenCalled();
  });

  it('never treats a course code or student name column as a student code', async () => {
    const h = harness();
    expect(
      await h.withdraw('course_code,student_name\n00123,Name'),
    ).toMatchObject({ errorCount: 1, withdrawnCount: 0 });
    expect(h.registrations.bulkWrite).not.toHaveBeenCalled();
  });

  it('bounds database reads and writes to 100 students per batch', async () => {
    const h = harness();
    const profiles = Array.from({ length: 101 }, (_, i) => ({
      studentCode: `S${i}`,
      userId: new Types.ObjectId(),
    }));
    h.profiles.find.mockImplementation(
      (filter: { studentCode: { $in: string[] } }) =>
        query(
          profiles.filter((profile) =>
            filter.studentCode.$in.includes(profile.studentCode),
          ),
        ),
    );
    h.registrations.bulkWrite.mockImplementation((ops: unknown[]) =>
      Promise.resolve({ modifiedCount: ops.length }),
    );
    const result = await h.withdraw(
      'student_code\n' +
        profiles.map((profile) => profile.studentCode).join('\n'),
    );
    expect(result).toMatchObject({
      withdrawnCount: 101,
      errorCount: 0,
      notEnrolledCount: 0,
    });
    expect(h.profiles.find).toHaveBeenCalledTimes(2);
    expect(h.registrations.bulkWrite).toHaveBeenCalledTimes(2);
    const batches = h.registrations.bulkWrite.mock.calls as unknown as Array<
      [unknown[]]
    >;
    expect(batches.map(([operations]) => operations.length)).toEqual([100, 1]);
  });

  it('invalidates caches even when a database write fails after earlier work', async () => {
    const h = harness();
    h.registrations.bulkWrite.mockRejectedValueOnce(
      new Error('write interrupted'),
    );
    await expect(h.withdraw()).rejects.toThrow('write interrupted');
    expect(h.cache.delPattern).toHaveBeenCalledWith('courses:*');
    expect(h.cache.delPattern).toHaveBeenCalledWith('registrations:*');
  });

  it('reads an XLSX with Arabic headers and retains leading zeroes in text codes', async () => {
    const h = harness();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Students');
    sheet.addRow(['كود الطالب', 'الحالة']);
    sheet.addRow(['00123', 'محجوب']);
    const result = await h.service.withdrawStudentsFromExcel(
      String(course._id),
      Buffer.from(await workbook.xlsx.writeBuffer()),
      'students.xlsx',
      term,
      String(studentId),
    );
    expect(result).toMatchObject({ withdrawnCount: 1, errorCount: 0 });
    expect(h.profiles.find).toHaveBeenCalledWith({
      studentCode: { $in: ['00123', '00123'] },
    });
  });

  it.each([
    ['student_code', 'empty.csv'],
    ['invalid', 'broken.xlsx'],
    ['student_code\n00123', 'binary.xls'],
  ])(
    'rejects empty, corrupt or unsupported files before writing: %s %s',
    async (content, name) => {
      const h = harness();
      await expect(h.withdraw(content, term, name)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(h.registrations.bulkWrite).not.toHaveBeenCalled();
    },
  );
});
