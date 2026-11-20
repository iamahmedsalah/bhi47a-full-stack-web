import api from "@/lib/api";

export interface EnrollmentStudent {
  userId: string;
  studentCode: string;
  fullName: string;
  fullNameAr?: string;
  fullNameEn?: string;
  level: string;
  department?: string;
  academicYear: string;
  semester: string;
}
export interface EnrollmentCourse {
  _id?: string;
  code: string;
  name?: string;
  nameAr?: string;
  nameEn?: string;
  level?: string;
  creditHours?: number;
  missing?: boolean;
}
export type EnrollmentTerm = { academicYear: string; semester: string };
export interface StudentEnrollmentDetail {
  student: EnrollmentStudent;
  version: string;
  status: string | null;
  totalCreditHours: number;
  courses: EnrollmentCourse[];
}
export const enrollmentKeys = { all: ["student-course-enrollment"] as const };
const base = "/admin/course-student-enrollments";
export async function searchEnrollmentStudents(
  search: string,
  signal?: AbortSignal,
) {
  return (
    await api.get<{ items: EnrollmentStudent[]; hasMore: boolean }>(
      `${base}/students`,
      { params: { search }, signal },
    )
  ).data;
}
export async function getStudentEnrollment(
  studentId: string,
  term: EnrollmentTerm,
  signal?: AbortSignal,
) {
  return (
    await api.get<StudentEnrollmentDetail>(`${base}/${studentId}`, {
      params: term,
      signal,
    })
  ).data;
}
export async function searchEnrollmentCourses(
  studentId: string,
  term: EnrollmentTerm,
  search: string,
  signal?: AbortSignal,
) {
  return (
    await api.get<{ items: EnrollmentCourse[]; hasMore: boolean }>(
      `${base}/${studentId}/courses`,
      { params: { ...term, search }, signal },
    )
  ).data;
}
export async function changeStudentEnrollment(
  studentId: string,
  action: "add" | "withdraw",
  term: EnrollmentTerm,
  courseId: string,
  expectedVersion: string,
) {
  return (
    await api.post<{
      enrolled?: number;
      alreadyEnrolled?: number;
      withdrawn?: boolean;
    }>(`${base}/${studentId}/${action}`, { ...term, courseId, expectedVersion })
  ).data;
}
