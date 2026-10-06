import type {
  CourseDocument,
  CourseCurriculumDepartment,
} from '../schemas/course.schema';

const SHARED_LEVEL_THREE = new Set(['317', '411', '318', '319', '326']);
const DEPARTMENT_ALIASES: Record<string, CourseCurriculumDepartment> = {
  GENERAL: 'GENERAL',
  'BUSINESS INFORMATION SYSTEMS': 'BIS',
  'BUSINESS INFORMATION SYSTEM': 'BIS',
  'BIS DEPARTMENT': 'BIS',
  'نظم معلومات الأعمال': 'BIS',
  'قسم نظم معلومات الأعمال': 'BIS',
  BIS: 'BIS',
  ACCOUNTING: 'ACCOUNTING',
  ACCOUNTANT: 'ACCOUNTING',
  'ACCOUNTING DEPARTMENT': 'ACCOUNTING',
  'ACCOUNTANT DEPARTMENT': 'ACCOUNTING',
  'قسم المحاسبة': 'ACCOUNTING',
  محاسبة: 'ACCOUNTING',
  'المحاسبة والتمويل': 'ACCOUNTING',
  'المحاسبة والمراجعة': 'ACCOUNTING',
  'قسم المحاسبة والمراجعة': 'ACCOUNTING',
  'الشعبة العامة': 'GENERAL',
  عام: 'GENERAL',
};

export function normalizeDepartment(
  value?: string,
): CourseCurriculumDepartment | undefined {
  return value ? DEPARTMENT_ALIASES[value.trim().toUpperCase()] : undefined;
}

/** Return the student's curriculum view without mutating the stored course. */
export function courseForDepartment(
  course: CourseDocument,
  department?: string,
): CourseDocument | null {
  const dept = normalizeDepartment(department);
  if (!dept) return null;

  const assignment =
    course.curricula?.find((item) => item.department === dept) ??
    course.curricula?.find((item) => item.department === 'GENERAL');
  if (assignment) {
    return {
      ...course,
      academicLevel: assignment.academicLevel,
      level: assignment.academicLevel,
      semester: assignment.semester,
      offeredTerms: [assignment.semester],
      type: assignment.type,
      department: assignment.department,
    } as CourseDocument;
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
    } as CourseDocument;
  }
  return course;
}

export function coursesForDepartment(
  courses: CourseDocument[],
  department?: string,
): CourseDocument[] {
  return courses.flatMap((course) => {
    const resolved = courseForDepartment(course, department);
    return resolved ? [resolved] : [];
  });
}
