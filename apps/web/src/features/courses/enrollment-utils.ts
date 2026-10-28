import {
  approvedCourseCurricula,
  getCourseCurricula,
  normalizeDepartment,
  type CurriculumCourse,
  type CourseEnrollmentResult,
} from "@student-portal/shared";

export function matchesEnrollmentCourse(
  course: CurriculumCourse,
  filters: { level: string; semester: string; department: string },
) {
  const placements = getCourseCurricula(course);
  const department = normalizeDepartment(filters.department);
  if (filters.department !== "all" && !department) return false;
  const scopedDepartment = placements.some((item) => item.department === department)
    ? department : "GENERAL";
  const scoped = filters.department === "all" ? placements
    : placements.filter((item) => item.department === scopedDepartment);
  const hasCurriculum = Boolean(course.curricula?.length ||
    approvedCourseCurricula(course.code, course.academicLevel ?? course.level).length);
  const legacyTerms = hasCurriculum ? undefined : course.offeredTerms;
  return scoped.some(
    (item) =>
      (filters.level === "all" || item.academicLevel === filters.level) &&
      (legacyTerms?.length ? legacyTerms.includes(filters.semester) : item.semester === filters.semester),
  );
}

export function mergeEnrollmentResults(
  previous: CourseEnrollmentResult | null,
  next: CourseEnrollmentResult,
  rowOffset: number,
): CourseEnrollmentResult {
  return {
    ...next,
    totalRows: (previous?.totalRows ?? 0) + next.totalRows,
    enrolledCount: (previous?.enrolledCount ?? 0) + next.enrolledCount,
    alreadyEnrolledCount:
      (previous?.alreadyEnrolledCount ?? 0) + next.alreadyEnrolledCount,
    skippedBlockedCount:
      (previous?.skippedBlockedCount ?? 0) + next.skippedBlockedCount,
    overriddenCount:
      (previous?.overriddenCount ?? 0) + (next.overriddenCount ?? 0),
    errorCount: (previous?.errorCount ?? 0) + next.errorCount,
    errors: [
      ...(previous?.errors ?? []),
      ...next.errors.map((message) =>
        message.replace(
          /^(السطر|Row) (\d+)/,
          (_, label: string, row: string) =>
            `${label} ${Number(row) + rowOffset}`,
        ),
      ),
    ],
    issues: [
      ...(previous?.issues ?? []),
      ...(next.issues ?? []).map((issue) => ({
        ...issue,
        row: issue.row + rowOffset,
      })),
    ],
  };
}

export function enrollmentResultStatus(
  result: CourseEnrollmentResult,
): "success" | "partial" | "failed" | "unchanged" {
  if (result.errorCount > 0)
    return result.enrolledCount > 0 ? "partial" : "failed";
  return result.enrolledCount > 0 ? "success" : "unchanged";
}

export function localizeEnrollmentError(message: string, locale: string) {
  const pieces = message.split(" / ");
  const translated =
    pieces.find((part) => {
      const arabic = /[\u0600-\u06ff]/.test(
        part.replace(/^(السطر|Row) \d+:\s*/, ""),
      );
      return locale === "ar" ? arabic : !arabic;
    }) ?? message;
  return locale === "ar"
    ? translated
    : translated.replace(/^السطر (\d+)/, "Row $1");
}
