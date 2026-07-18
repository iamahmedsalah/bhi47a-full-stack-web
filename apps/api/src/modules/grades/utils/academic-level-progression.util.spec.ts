import { calculatePromotedAcademicLevel } from './academic-level-progression.util';

const course = (code: string, level: '1' | '2', semester: 'first' | 'second') => ({
  code,
  academicLevel: level,
  level,
  semester,
  type: 'required',
  isActive: true,
});

describe('calculatePromotedAcademicLevel', () => {
  const courses = [
    course('L1F', '1', 'first'),
    course('L1S', '1', 'second'),
    course('L2F', '2', 'first'),
    course('L2S', '2', 'second'),
  ];

  it('promotes after both regular semesters are complete', () => {
    expect(
      calculatePromotedAcademicLevel({
        currentLevel: '1',
        courses,
        finalizedCourses: ['L1F', 'L1S'],
      }),
    ).toBe('2');
  });

  it('does not promote when either semester is incomplete', () => {
    expect(
      calculatePromotedAcademicLevel({
        currentLevel: '1',
        courses,
        finalizedCourses: ['L1F'],
      }),
    ).toBe('1');
  });

  it('can catch up multiple imported levels and never exceeds level 4', () => {
    expect(
      calculatePromotedAcademicLevel({
        currentLevel: '1',
        courses,
        finalizedCourses: ['L1F', 'L1S', 'L2F', 'L2S'],
      }),
    ).toBe('3');
    expect(
      calculatePromotedAcademicLevel({
        currentLevel: '4',
        courses,
        finalizedCourses: [],
      }),
    ).toBe('4');
  });

  it('promotes when all courses are finalized even if one course failed', () => {
    expect(
      calculatePromotedAcademicLevel({
        currentLevel: '1',
        courses,
        finalizedCourses: ['L1F', 'L1S'],
      }),
    ).toBe('2');
  });
});
