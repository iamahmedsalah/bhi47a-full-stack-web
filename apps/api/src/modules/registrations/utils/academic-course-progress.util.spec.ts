import { mergeAcademicCourseProgress } from './academic-course-progress.util';

describe('mergeAcademicCourseProgress', () => {
  it('marks a course passed from published coursework and final grades', () => {
    expect(
      mergeAcademicCourseProgress({
        completedCourses: [],
        failedCourses: [],
        grades: [
          { courseCode: 'ACC101', examType: 'midterm', grade: 15, maxGrade: 20, status: 'present' },
          { courseCode: 'ACC101', examType: 'final', grade: 50, maxGrade: 60, status: 'present' },
        ],
      }),
    ).toMatchObject({ completedCourses: ['ACC101'], failedCourses: [] });
  });

  it('calculates a credit-weighted GPA on a 4.0 scale', () => {
    const result = mergeAcademicCourseProgress({
      grades: [
        { courseCode: 'PASS101', examType: 'final', grade: 100, maxGrade: 100, status: 'present' },
        { courseCode: 'FAIL101', examType: 'final', grade: 0, maxGrade: 100, status: 'present' },
      ],
      courseCredits: { PASS101: 3, FAIL101: 1 },
    });
    expect(result.calculatedGpa).toBe(3);
    expect(result.gradedCredits).toBe(4);
  });

  it('marks an absent final as failed', () => {
    expect(
      mergeAcademicCourseProgress({
        completedCourses: ['ECO101'],
        grades: [
          { courseCode: 'ECO101', examType: 'final', grade: 0, maxGrade: 60, status: 'absent' },
        ],
      }),
    ).toMatchObject({ completedCourses: [], failedCourses: ['ECO101'] });
  });

  it('does not finalize progress without a final exam record', () => {
    expect(
      mergeAcademicCourseProgress({
        completedCourses: [],
        failedCourses: [],
        grades: [
          { courseCode: 'BUS101', examType: 'midterm', grade: 20, maxGrade: 20, status: 'present' },
        ],
      }),
    ).toMatchObject({ completedCourses: [], failedCourses: [] });
  });
});
