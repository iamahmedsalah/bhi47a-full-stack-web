import { Types } from 'mongoose';
import { RegistrationsService } from './registrations.service';

function query<T>(result: T) {
  return {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  };
}

function setup(size: number) {
  const ids = Array.from({ length: size }, () => new Types.ObjectId());
  const profiles = ids.map((studentId) => ({
    studentId,
    academicLevel: '2',
    gpa: 3,
    completedCourses: ['PRE'],
    failedCourses: [],
    lowGradeCourses: [],
    academicWarnings: 0,
  }));
  const students = ids.map((userId) => ({
    userId,
    department: 'BIS',
    academicWarnings: 0,
  }));
  const rules = [
    { minGpa: 2, maxGpa: 4, maxCourses: 5, maxCreditHours: 15, isActive: true },
    { minGpa: 0, maxGpa: 4, maxCourses: 6, maxCreditHours: 18, isActive: true },
  ];
  const academic = {
    find: jest.fn((filter) =>
      query(
        profiles.filter((profile) =>
          filter.studentId.$in.some((id: Types.ObjectId) =>
            id.equals(profile.studentId),
          ),
        ),
      ),
    ),
    findOne: jest.fn((filter) =>
      query(
        profiles.find((profile) => profile.studentId.equals(filter.studentId)),
      ),
    ),
  };
  const student = {
    find: jest.fn((filter) =>
      query(
        students.filter((profile) =>
          filter.userId.$in.some((id: Types.ObjectId) =>
            id.equals(profile.userId),
          ),
        ),
      ),
    ),
    findOne: jest.fn((filter) =>
      query(students.find((profile) => profile.userId.equals(filter.userId))),
    ),
  };
  const gpa = {
    find: jest.fn(() => query(rules)),
    findOne: jest.fn(() => query(rules[0])),
  };
  const gradeRecords: Array<{
    studentId: Types.ObjectId;
    courseCode: string;
    examType: string;
    grade: number;
    maxGrade: number;
    status: string;
  }> = [];
  const grades = {
    find: jest.fn((filter) =>
      query(
        gradeRecords.filter((grade) =>
          filter.studentId.$in
            ? filter.studentId.$in.some((id: Types.ObjectId) =>
                id.equals(grade.studentId),
              )
            : grade.studentId.equals(filter.studentId),
        ),
      ),
    ),
  };
  const courseRecords = [{ code: 'TARGET', creditHours: 3 }];
  const courses = {
    find: jest.fn((filter) =>
      query(
        courseRecords.filter((course) => filter.code.$in.includes(course.code)),
      ),
    ),
  };
  const service = new RegistrationsService(
    academic as never,
    gpa as never,
    {} as never,
    {} as never,
    courses as never,
    grades as never,
    {} as never,
    {} as never,
    {} as never,
    student as never,
    {} as never,
    {} as never,
  );
  const course = {
    code: 'TARGET',
    academicLevel: '2',
    creditHours: 3,
    prerequisites: ['PRE'],
  };
  const reads = [
    academic.find,
    academic.findOne,
    student.find,
    student.findOne,
    gpa.find,
    gpa.findOne,
    grades.find,
    courses.find,
  ];
  return {
    service,
    ids,
    course,
    reads,
    academic,
    student,
    gpa,
    grades,
    courses,
    profiles,
    rules,
    gradeRecords,
    courseRecords,
  };
}

describe('administrative enrollment read workload', () => {
  it.each([25, 100, 500])(
    'keeps identical decisions for %i students with bounded reads',
    async (size) => {
      const h = setup(size);
      for (const id of h.ids)
        await expect(
          h.service.assertAdministrativeCourseAddition(
            String(id),
            h.course as never,
            [],
            'first',
          ),
        ).resolves.toBeUndefined();
      const baseline = h.reads.reduce(
        (sum, read) => sum + read.mock.calls.length,
        0,
      );
      expect(baseline).toBe(size * 5);
      h.reads.forEach((read) => read.mockClear());
      const context = await h.service.prepareAdministrativeEnrollment(
        h.ids.map(String),
        ['TARGET'],
      );
      for (const id of h.ids)
        await expect(
          h.service.assertAdministrativeCourseAddition(
            String(id),
            h.course as never,
            [],
            'first',
            false,
            context,
          ),
        ).resolves.toBeUndefined();
      const after = h.reads.reduce(
        (sum, read) => sum + read.mock.calls.length,
        0,
      );
      expect(after).toBe(2 + Math.ceil(size / 100) * 3);
      for (const [filter] of h.academic.find.mock.calls)
        expect(filter.studentId.$in.length).toBeLessThanOrEqual(100);
      expect(h.gpa.find).toHaveBeenCalledTimes(1);
      expect(h.gpa.findOne).not.toHaveBeenCalled();
      expect(h.academic.findOne).not.toHaveBeenCalled();
      console.info(
        `Enrollment validation mock reads, N=${size}: ${baseline} -> ${after}`,
      );
    },
  );

  it('preserves overlapping-rule precedence, limits, overrides and prerequisite rejection', async () => {
    const h = setup(1);
    const context = await h.service.prepareAdministrativeEnrollment(
      h.ids.map(String),
      ['TARGET'],
    );
    const id = String(h.ids[0]);
    const existing = ['A', 'B', 'C', 'D', 'E'];
    await expect(
      h.service.assertAdministrativeCourseAddition(
        id,
        h.course as never,
        existing,
        'first',
        false,
        context,
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'REGISTRATION_LIMIT_EXCEEDED',
        limits: { maxCourses: 5, proposedCourseCount: 6 },
      },
    });
    await expect(
      h.service.assertAdministrativeCourseAddition(
        id,
        h.course as never,
        existing,
        'first',
        true,
        context,
      ),
    ).resolves.toMatchObject({ maxCourses: 5 });
    await expect(
      h.service.assertAdministrativeCourseAddition(
        id,
        { ...h.course, prerequisites: ['MISSING'] } as never,
        [],
        'first',
        true,
        context,
      ),
    ).rejects.toThrow('prerequisites');
    await expect(
      h.service.assertAdministrativeCourseAddition(
        id,
        { ...h.course, academicLevel: '3' } as never,
        [],
        'first',
        true,
        context,
      ),
    ).rejects.toThrow('level');
    // A new import reloads rules, so edits never use a cross-request policy cache.
    await h.service.prepareAdministrativeEnrollment(h.ids.map(String), [
      'TARGET',
    ]);
    expect(h.gpa.find).toHaveBeenCalledTimes(2);
  });

  it('retains the legacy repair path when an academic profile is missing', async () => {
    const h = setup(1);
    h.academic.find.mockReturnValueOnce(query([]));
    const context = await h.service.prepareAdministrativeEnrollment(
      h.ids.map(String),
      ['TARGET'],
    );
    expect(context.profiles.size).toBe(0);
    await expect(
      h.service.assertAdministrativeCourseAddition(
        String(h.ids[0]),
        h.course as never,
        [],
        'first',
        false,
        context,
      ),
    ).resolves.toBeUndefined();
    expect(h.academic.findOne).toHaveBeenCalledTimes(1);
  });

  it('matches single-student GPA and decisions with published grades and weighted credits across batches', async () => {
    const h = setup(101);
    h.courseRecords.push(
      { code: 'HISTORY', creditHours: 4 },
      { code: 'SECOND', creditHours: 2 },
    );
    for (const studentId of h.ids) {
      h.gradeRecords.push(
        {
          studentId,
          courseCode: 'HISTORY',
          examType: 'final',
          grade: 90,
          maxGrade: 100,
          status: 'present',
        },
        {
          studentId,
          courseCode: 'SECOND',
          examType: 'final',
          grade: 40,
          maxGrade: 100,
          status: 'present',
        },
      );
    }
    const context = await h.service.prepareAdministrativeEnrollment(
      h.ids.map(String),
      ['TARGET'],
    );
    // The second hundred-student chunk reuses previously fetched grade credits.
    expect(
      h.courses.find.mock.calls.filter(([filter]) =>
        filter.code.$in.includes('HISTORY'),
      ),
    ).toHaveLength(1);
    for (const id of [h.ids[0], h.ids[100]]) {
      const single = await h.service['getAcademicProfile'](String(id));
      expect(context.profiles.get(String(id))).toMatchObject({
        gpa: single.gpa,
        completedCourses: single.completedCourses,
        failedCourses: single.failedCourses,
      });
      for (const snapshot of [undefined, context]) {
        await expect(
          h.service.assertAdministrativeCourseAddition(
            String(id),
            { ...h.course, minimumGpa: single.gpa + 0.01 } as never,
            [],
            'first',
            false,
            snapshot,
          ),
        ).rejects.toThrow('GPA');
        await expect(
          h.service.assertAdministrativeCourseAddition(
            String(id),
            { ...h.course, code: 'HISTORY' } as never,
            [],
            'first',
            true,
            snapshot,
          ),
        ).rejects.toThrow('completed');
      }
    }
  });

  it('does not reuse another student’s credit match for a differently cased legacy grade code', async () => {
    const h = setup(2);
    h.courseRecords.push(
      { code: 'HISTORY', creditHours: 4 },
      { code: 'SECOND', creditHours: 2 },
    );
    for (const [index, studentId] of h.ids.entries()) {
      h.gradeRecords.push(
        {
          studentId,
          courseCode: index === 0 ? 'HISTORY' : 'history',
          examType: 'final',
          grade: 90,
          maxGrade: 100,
          status: 'present',
        },
        {
          studentId,
          courseCode: 'SECOND',
          examType: 'final',
          grade: 40,
          maxGrade: 100,
          status: 'present',
        },
      );
    }
    const context = await h.service.prepareAdministrativeEnrollment(
      h.ids.map(String),
      ['TARGET'],
    );
    for (const id of h.ids) {
      const baseline = await h.service['getAcademicProfile'](String(id));
      expect(context.profiles.get(String(id))?.gpa).toBe(baseline.gpa);
    }
    expect(context.profiles.get(String(h.ids[0]))?.gpa).not.toBe(
      context.profiles.get(String(h.ids[1]))?.gpa,
    );
  });

  it.each([0, 2, 4, 4.01])(
    'matches inclusive GPA bounds and fallback at GPA %s',
    async (gpa) => {
      const h = setup(1);
      h.profiles[0].gpa = gpa;
      // Model the database sort and inclusive range, independently of the in-memory match.
      h.gpa.findOne.mockImplementation(() =>
        query(
          h.rules
            .filter((rule) => rule.minGpa <= gpa && rule.maxGpa >= gpa)
            .sort((a, b) => b.minGpa - a.minGpa)[0],
        ),
      );
      const baseline = await h.service['getRuleForGpa'](gpa);
      const context = await h.service.prepareAdministrativeEnrollment(
        h.ids.map(String),
        ['TARGET'],
      );
      const outcome = await h.service.assertAdministrativeCourseAddition(
        String(h.ids[0]),
        h.course as never,
        ['A', 'B', 'C', 'D', 'E', 'F'],
        'first',
        true,
        context,
      );
      expect(outcome?.maxCourses).toBe(Math.min(baseline.maxCourses, 6));
    },
  );
});
