import type { CourseLevel, Semester } from "./course-levels";
import { approvedCourseCurricula } from "./specialization-curricula";

export const CURRICULUM_DEPARTMENTS = ["GENERAL", "BIS", "ACCOUNTING"] as const;
export type CourseCurriculumDepartment =
  (typeof CURRICULUM_DEPARTMENTS)[number];
export const COURSE_TYPES = [
  "required",
  "elective",
  "university_req",
  "institute_req",
  "specialization_req",
] as const;
export type CourseType = (typeof COURSE_TYPES)[number];
export interface CourseCurriculum {
  department: CourseCurriculumDepartment;
  academicLevel: CourseLevel;
  semester: Semester;
  type: CourseType;
}

export const COURSE_326_CURRICULA: readonly CourseCurriculum[] =
  approvedCourseCurricula("326");

const aliases: Record<string, CourseCurriculumDepartment> = {
  GENERAL: "GENERAL",
  عام: "GENERAL",
  "الشعبة العامة": "GENERAL",
  BIS: "BIS",
  "BUSINESS INFORMATION SYSTEMS": "BIS",
  "BUSINESS INFORMATION SYSTEM": "BIS",
  "BIS DEPARTMENT": "BIS",
  "نظم معلومات الأعمال": "BIS",
  "قسم نظم معلومات الأعمال": "BIS",
  ACCOUNTING: "ACCOUNTING",
  ACCOUNTANT: "ACCOUNTING",
  "ACCOUNTING DEPARTMENT": "ACCOUNTING",
  "ACCOUNTANT DEPARTMENT": "ACCOUNTING",
  "قسم المحاسبة": "ACCOUNTING",
  محاسبة: "ACCOUNTING",
  المحاسبة: "ACCOUNTING",
  "المحاسبة والتمويل": "ACCOUNTING",
  "المحاسبة والمراجعة": "ACCOUNTING",
  "قسم المحاسبة والمراجعة": "ACCOUNTING",
};
export function normalizeDepartment(
  value?: string,
): CourseCurriculumDepartment | undefined {
  return value ? aliases[value.trim().toUpperCase()] : undefined;
}
export function departmentAliases(
  department: CourseCurriculumDepartment,
): string[] {
  return Object.keys(aliases).filter((key) => aliases[key] === department);
}

export interface CurriculumCourse {
  code: string;
  curricula?: CourseCurriculum[];
  academicLevel?: string;
  level?: string;
  semester?: string;
  department?: string;
  type?: string;
  offeredTerms?: string[];
}

/** Includes the approved legacy placement without requiring a production reseed. */
export function getCourseCurricula(
  course: CurriculumCourse,
): CourseCurriculum[] {
  if (course.curricula?.length) return course.curricula;
  const approved = approvedCourseCurricula(
    course.code,
    course.academicLevel ?? course.level,
  );
  if (approved.length) return approved;
  const department = normalizeDepartment(course.department);
  if (!department) return [];
  return [
    {
      department,
      academicLevel: (course.academicLevel ?? course.level) as CourseLevel,
      semester: course.semester as Semester,
      type: (course.type ?? "required") as CourseType,
    },
  ];
}

export function curriculumDepartmentLabel(
  value: string | undefined,
  locale: string,
): string {
  const department = normalizeDepartment(value);
  const labels =
    locale === "ar"
      ? {
          GENERAL: "الشعبة العامة",
          BIS: "نظم معلومات الأعمال (BIS)",
          ACCOUNTING: "المحاسبة",
        }
      : {
          GENERAL: "General",
          BIS: "Business Information Systems (BIS)",
          ACCOUNTING: "Accounting",
        };
  return department ? labels[department] : value || "—";
}

export function courseCurriculumSummary(
  course: CurriculumCourse,
  locale: string,
): string {
  const labels: Record<string, string> =
    locale === "ar"
      ? { first: "الفصل الأول", second: "الفصل الثاني", summer: "الفصل الصيفي" }
      : {
          first: "First semester",
          second: "Second semester",
          summer: "Summer semester",
        };
  const placements = getCourseCurricula(course);
  const semesters = [...new Set(placements.map((item) => item.semester))];
  if (semesters.length === 1) return labels[semesters[0]] ?? semesters[0];
  return placements.length
    ? placements
        .map(
          (item) =>
            `${item.department === "BIS" ? "BIS" : curriculumDepartmentLabel(item.department, locale)}: ${labels[item.semester] ?? item.semester}`,
        )
        .join(" — ")
    : (labels[course.semester ?? ""] ?? course.semester ?? "—");
}
