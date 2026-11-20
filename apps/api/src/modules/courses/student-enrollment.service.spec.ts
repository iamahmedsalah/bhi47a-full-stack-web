import 'reflect-metadata';
import { jest } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { PERMISSIONS } from '@student-portal/shared';
import type { AuthenticatedUser } from '../auth/types/authenticated-request';
import { StudentEnrollmentService } from './student-enrollment.service';
import { StudentEnrollmentController } from './student-enrollment.controller';
import { PERMISSIONS_KEY } from '../auth/decorators/permissions.decorator';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

function query<T>(value: T) {
  const chain = {
    select: jest.fn(() => chain),
    sort: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    lean: () => Promise.resolve(value),
  };
  return chain;
}
function fixture() {
  const studentId = new Types.ObjectId();
  const actor = {
    _id: String(new Types.ObjectId()),
    role: 'staff',
    permissions: [PERMISSIONS.COURSES_STUDENT_ENROLLMENT_MANAGE],
  } as AuthenticatedUser;
  const term = { academicYear: '2026-2027', semester: 'first' as const };
  const student = {
    userId: studentId,
    studentCode: '00111',
    fullName: 'Student',
    level: '1',
    department: 'BIS',
    enrollmentStatus: 'active',
  };
  const registration = {
    _id: new Types.ObjectId(),
    studentId,
    courses: ['111', '112'],
    totalCreditHours: 6,
    status: 'approved',
  };
  const course = {
    _id: new Types.ObjectId(),
    code: '111',
    name: 'Course',
    creditHours: 3,
    isActive: true,
  };
  const studentQuery = query([student]);
  const courseQuery = query([course]);
  const profiles = {
    findOne: jest.fn(() => query(student)),
    find: jest.fn(() => studentQuery),
  };
  const courses = {
    findById: jest.fn(() => query(course)),
    find: jest.fn(() => courseQuery),
  };
  const registrations = {
    findOne: jest.fn(() => query(registration)),
    updateOne: jest.fn(() => Promise.resolve({ matchedCount: 1 })),
  };
  const enrollment = {
    enrollStudentsBatch: jest.fn(() =>
      Promise.resolve({
        enrolledCount: 1,
        alreadyEnrolledCount: 0,
        errorCount: 0,
        errors: [] as string[],
      }),
    ),
  };
  const cache = { delPattern: jest.fn(() => Promise.resolve()) };
  const service = new StudentEnrollmentService(
    profiles as never,
    courses as never,
    registrations as never,
    enrollment as never,
    cache as never,
  );
  const input = async () => ({
    ...term,
    courseId: String(course._id),
    expectedVersion: (await service.detail(String(studentId), term)).version,
  });
  return {
    service,
    actor,
    studentId,
    term,
    student,
    registration,
    course,
    profiles,
    courses,
    registrations,
    enrollment,
    cache,
    input,
    studentQuery,
    courseQuery,
  };
}

describe('Individual administrative student enrollment', () => {
  it('protects all routes with the new permission and admin/staff roles', () => {
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, StudentEnrollmentController),
    ).toEqual([PERMISSIONS.COURSES_STUDENT_ENROLLMENT_MANAGE]);
    expect(Reflect.getMetadata(ROLES_KEY, StudentEnrollmentController)).toEqual(
      ['admin', 'staff'],
    );
  });
  it('returns only minimal student fields and caps escaped search results', async () => {
    const f = fixture();
    await f.service.searchStudents('00.*');
    expect(f.studentQuery.limit).toHaveBeenCalledWith(21);
    expect(f.studentQuery.select).toHaveBeenCalledWith(
      expect.not.stringMatching(/nationalId|phone|password/),
    );
    expect(f.profiles.find).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: expect.arrayContaining([{ studentCode: /^00\.\*/i }]),
      }),
    );
    expect(await f.service.searchStudents(' ')).toEqual({
      items: [],
      hasMore: false,
    });
  });
  it('scopes detail to one student/year/term and retains unavailable historical course entries', async () => {
    const f = fixture();
    const detail = await f.service.detail(String(f.studentId), f.term);
    expect(f.registrations.findOne).toHaveBeenCalledWith({
      studentId: f.studentId,
      ...f.term,
    });
    expect(detail.courses.map((c) => [c.code, c.missing])).toEqual([
      ['111', false],
      ['112', true],
    ]);
    expect(detail.version).toMatch(/^[a-f0-9]{64}$/);
  });
  it('uses existing enrollment rules without privileged credit overrides, preserving leading-zero student codes', async () => {
    const f = fixture();
    const dto = await f.input();
    expect(await f.service.add(f.actor, String(f.studentId), dto)).toEqual({
      enrolled: 1,
      alreadyEnrolled: 0,
    });
    expect(f.enrollment.enrollStudentsBatch).toHaveBeenCalledWith(
      dto.courseId,
      [{ studentCode: '00111' }],
      {
        ...f.term,
        requireApprovedRegistration: true,
        actor: { _id: f.actor._id, role: 'staff' },
      },
    );
    expect(f.cache.delPattern).toHaveBeenCalledWith('registrations:*');
  });
  it('does not treat ordinary course-write permission as enrollment permission', async () => {
    const f = fixture();
    const dto = await f.input();
    const actor = { ...f.actor, permissions: [PERMISSIONS.COURSES_WRITE] };
    await expect(
      f.service.add(actor, String(f.studentId), dto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      f.service.withdraw(actor, String(f.studentId), dto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.registrations.updateOne).not.toHaveBeenCalled();
  });
  it('allows administrators without explicit permissions', async () => {
    const f = fixture();
    await expect(
      f.service.add(
        { ...f.actor, role: 'admin', permissions: [] },
        String(f.studentId),
        await f.input(),
      ),
    ).resolves.toEqual({ enrolled: 1, alreadyEnrolled: 0 });
  });
  it('withdraws only the selected membership, adjusts credits and appends audit in the same update', async () => {
    const f = fixture();
    await f.service.withdraw(f.actor, String(f.studentId), await f.input());
    expect(f.registrations.updateOne).toHaveBeenCalledWith(
      {
        _id: f.registration._id,
        courses: ['111', '112'],
        status: 'approved',
        totalCreditHours: 6,
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          courses: ['112'],
          totalCreditHours: 3,
          lastEditedBy: new Types.ObjectId(f.actor._id),
        }),
        $push: {
          administrativeChanges: expect.objectContaining({
            action: 'withdraw',
            courseCode: '111',
            actorId: new Types.ObjectId(f.actor._id),
          }),
        },
      }),
    );
  });
  it('rejects stale previews and concurrent membership changes without overwriting them', async () => {
    const f = fixture();
    const dto = await f.input();
    f.registration.courses.push('113');
    await expect(
      f.service.withdraw(f.actor, String(f.studentId), dto),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(f.registrations.updateOne).not.toHaveBeenCalled();
    f.registrations.updateOne.mockResolvedValue({ matchedCount: 0 });
    await expect(
      f.service.withdraw(f.actor, String(f.studentId), await f.input()),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(f.cache.delPattern).not.toHaveBeenCalled();
  });
  it('preserves pending registration workflow and rejects inactive course/student additions', async () => {
    const f = fixture();
    f.registration.status = 'pending';
    await expect(
      f.service.add(f.actor, String(f.studentId), await f.input()),
    ).rejects.toBeInstanceOf(ConflictException);
    f.registration.status = 'approved';
    f.course.isActive = false;
    await expect(
      f.service.add(f.actor, String(f.studentId), await f.input()),
    ).rejects.toBeInstanceOf(NotFoundException);
    f.course.isActive = true;
    f.student.enrollmentStatus = 'withdrawn';
    await expect(
      f.service.add(f.actor, String(f.studentId), await f.input()),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(f.enrollment.enrollStudentsBatch).not.toHaveBeenCalled();
  });
  it('validates consecutive years before writing and bounds available course queries', async () => {
    const f = fixture();
    await expect(
      f.service.detail(String(f.studentId), {
        ...f.term,
        academicYear: '2026-2030',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await f.service.availableCourses(String(f.studentId), {
      ...f.term,
      search: '111',
    });
    expect(f.courseQuery.limit).toHaveBeenCalledWith(31);
    expect(f.courses.find).toHaveBeenCalledWith(
      expect.objectContaining({
        $and: expect.arrayContaining([{ isActive: true }]),
      }),
    );
  });
});
