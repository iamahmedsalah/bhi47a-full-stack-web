import {
  approvedCourseCurricula,
  getCourseCurricula,
  normalizeDepartment,
  type CurriculumCourse,
} from '@student-portal/shared';
export { normalizeDepartment } from '@student-portal/shared';

/** Resolve one programme view while retaining the shared course/book identity. */
export function courseForDepartment<T extends CurriculumCourse>(
  course: T,
  department?: string,
): T | null {
  const dept = normalizeDepartment(department);
  if (!dept) return null;
  const curricula = getCourseCurricula(course);
  const assignment =
    curricula.find((item) => item.department === dept) ??
    curricula.find((item) => item.department === 'GENERAL');
  if (!assignment) return null;
  const isCurriculumPlacement = Boolean(
    course.curricula?.length ||
    approvedCourseCurricula(course.code, course.academicLevel ?? course.level)
      .length,
  );
  return {
    ...course,
    curricula: [{ ...assignment }],
    academicLevel: assignment.academicLevel,
    level: assignment.academicLevel,
    semester: assignment.semester,
    type: assignment.type,
    department: assignment.department,
    offeredTerms: isCurriculumPlacement
      ? [assignment.semester]
      : course.offeredTerms,
  };
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
