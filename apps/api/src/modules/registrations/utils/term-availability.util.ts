import type { Semester } from '@student-portal/shared';
import type { CourseDocument } from '../../courses/schemas/course.schema';

export function isCourseOfferedForTerm(
  course: Pick<CourseDocument, 'semester' | 'offeredTerms'>,
  semester: Semester,
): boolean {
  const offeredTerms = course.offeredTerms ?? [];
  return offeredTerms.length > 0
    ? offeredTerms.includes(semester)
    : course.semester === semester;
}
