import type { CurriculumCourse } from '@student-portal/shared';

import {
  normalizeDepartment,
  getCourseCurricula,
} from '@student-portal/shared';

const SHARED_LEVEL_THREE = new Set(['317', '411', '318', '319', '326']);
export { normalizeDepartment } from '@student-portal/shared';

/** Return the student's curriculum view without mutating the stored course. */
export function courseForDepartment<T extends CurriculumCourse>(
  course: T,
  department?: string,
): T | null {
  const dept = normalizeDepartment(department);
  if (!dept) return null;

  const curricula =
    course.curricula?.length ||
    (course.code.toUpperCase() === '326' && course.academicLevel === '3')
      ? getCourseCurricula(course)
      : [];
  const assignment =
    curricula.find((item) => item.department === dept) ??
    curricula.find((item) => item.department === 'GENERAL');
  if (assignment) {
    return {
      ...course,
      curricula: [{ ...assignment }],
      academicLevel: assignment.academicLevel,
      level: assignment.academicLevel,
      semester: assignment.semester,
      offeredTerms: [assignment.semester],
      type: assignment.type,
      department: assignment.department,
    };
  }
  if (course.curricula?.length) return null;

  const code = course.code.toUpperCase();
  const legacyDepartment = normalizeDepartment(course.department);
  if (dept === 'GENERAL') {
    if (legacyDepartment !== 'GENERAL') return null;
  } else if (
    legacyDepartment !== 'GENERAL' &&
    legacyDepartment !== dept &&
    !(SHARED_LEVEL_THREE.has(code) && course.academicLevel === '3')
  ) {
    return null;
  }

  // Course 326 has distinct placements in the approved Level 3 plans.
  if (code === '326' && course.academicLevel === '3') {
    const semester = dept === 'ACCOUNTING' ? 'first' : 'second';
    return {
      ...course,
      level: '3',
      academicLevel: '3',
      semester,
      offeredTerms: [semester],
      type: 'elective',
      department: dept,
    };
  }
  return course;
}

export function coursesForDepartment<T extends CurriculumCourse>(
  courses: T[],
  department?: string,
): T[] {
  return courses.flatMap((course) => {
    const resolved = courseForDepartment(course, department);
    return resolved ? [resolved] : [];
  });
}
