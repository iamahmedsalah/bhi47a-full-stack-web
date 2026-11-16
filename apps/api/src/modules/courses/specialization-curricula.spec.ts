import {
  APPROVED_SPECIALIZATION_CURRICULA,
  approvedCourseCurricula,
  courseCurriculumSummary,
  getCourseCurricula,
} from '@student-portal/shared';
import seed from '../../database/seed.data.json';
import { courseForDepartment } from './utils/course-curriculum.util';
import { courseCurriculumFilter } from './utils/course-filter.util';

// Golden lists transcribed from the supplied official 2026/2027 PDFs.
describe('official specialization programme sheets', () => {
  it.each([
    ['ACCOUNTING', '3', 'first', ['317', '411', 'A11', 'B11', '326']],
    ['ACCOUNTING', '3', 'second', ['318', '319', 'A12', 'A13', 'A26', '425']],
    ['BIS', '3', 'first', ['317', '411', 'S11', 'S12', '515']],
    ['BIS', '3', 'second', ['318', '319', 'S13', 'S14', '422', '326']],
    ['BIS', '4', 'first', ['413', '414', 'S15', 'S16', 'S21', '412']],
    ['BIS', '4', 'second', ['315', '512', 'S17', 'S22', 'S23']],
  ])(
    '%s level %s %s matches the official list',
    (department, level, semester, codes) => {
      const actual = Object.entries(APPROVED_SPECIALIZATION_CURRICULA)
        .filter(([, items]) =>
          items.some(
            (item) =>
              item.department === department &&
              item.academicLevel === level &&
              item.semester === semester,
          ),
        )
        .map(([code]) => code);
      expect(actual.sort()).toEqual(codes.slice().sort());
    },
  );
  it('has only one course whose semester differs between the two programmes', () => {
    const differing = Object.entries(APPROVED_SPECIALIZATION_CURRICULA)
      .filter(
        ([, items]) => new Set(items.map((item) => item.semester)).size > 1,
      )
      .map(([code]) => code);
    expect(differing).toEqual(['326']);
    expect(
      approvedCourseCurricula('326').every((item) => item.type === 'elective'),
    ).toBe(true);
  });
  it('preserves existing explicit assignments and shared identity', () => {
    const curricula = [
      {
        department: 'ACCOUNTING' as const,
        academicLevel: '4' as const,
        semester: 'second' as const,
        type: 'required' as const,
      },
    ];
    expect(getCourseCurricula({ code: '413', curricula })).toBe(curricula);
    const original = {
      code: '317',
      level: '3',
      department: 'BIS',
      semester: 'first',
      syllabusPdfUrl: '/book.pdf',
      _id: 'stable-id',
    };
    expect(courseForDepartment(original, 'ACCOUNTING')).toMatchObject({
      _id: 'stable-id',
      syllabusPdfUrl: '/book.pdf',
      semester: 'first',
    });
    expect(
      courseForDepartment(
        { code: 'S11', level: '3', department: 'BIS' },
        'ACCOUNTING',
      ),
    ).toBeNull();
  });
  it('does not invent Accounting level four and keeps seed placement and prerequisites', () => {
    expect(
      Object.values(APPROVED_SPECIALIZATION_CURRICULA)
        .flat()
        .filter(
          (item) =>
            item.department === 'ACCOUNTING' && item.academicLevel === '4',
        ),
    ).toEqual([]);
    for (const [code, placements] of Object.entries(
      APPROVED_SPECIALIZATION_CURRICULA,
    )) {
      const item = seed.courses.find((course) => course.code === code)!;
      expect(item).toBeDefined();
      expect(placements).toContainEqual({
        department: item.department,
        academicLevel: item.academicLevel,
        semester: item.semester,
        type: item.type,
      });
    }
    expect(
      seed.courses.find((item) => item.code === '318')?.prerequisites,
    ).toEqual(['312', '313', '314', '316']);
    expect(
      seed.courses.find((item) => item.code === '326')?.prerequisites,
    ).toEqual([]);
  });
  it('shows a common semester once, with department detail only for a differing semester', () => {
    expect(courseCurriculumSummary({ code: '317', level: '3' }, 'ar')).toBe(
      'الفصل الأول',
    );
    expect(courseCurriculumSummary({ code: '326', level: '3' }, 'ar')).toBe(
      'المحاسبة والمراجعة: الفصل الأول — نظم معلومات الأعمال: الفصل الثاني',
    );
    expect(courseCurriculumSummary({ code: '326', level: '3' }, 'en')).toBe(
      'Accounting and Auditing: First semester — Business Information Systems: Second semester',
    );
  });
  it('matches legacy common courses in Accounting before pagination without a cross-placement match', () => {
    const filter = courseCurriculumFilter({
      department: 'ACCOUNTING',
      level: '3',
      semester: 'first',
    });
    expect(filter.$or).toContainEqual(
      expect.objectContaining({
        code: '317',
        'curricula.0': { $exists: false },
      }),
    );
    expect(filter.$or).toContainEqual({
      curricula: {
        $elemMatch: {
          academicLevel: '3',
          semester: 'first',
          department: 'ACCOUNTING',
        },
      },
    });
    expect(filter.$or).not.toContainEqual(
      expect.objectContaining({ code: 'S11' }),
    );
  });
});
