import api from "@/lib/api";
import { staffProfilePayload } from "./profile-payload";
import type { Permission } from "@student-portal/shared";
import type {
  CreateStaffInput,
  StaffAssignedCourse,
  StaffListParams,
  StaffListResponse,
  StaffMember,
  StaffProfileInput,
  StaffScheduleSlot,
} from "./types";

export async function listStaff(
  params: StaffListParams,
): Promise<StaffListResponse> {
  const response = await api.get<StaffListResponse>("/admin/staff", { params });
  return response.data;
}

export async function createStaff(
  input: CreateStaffInput,
): Promise<StaffMember> {
  const response = await api.post<StaffMember>("/admin/staff", input);
  return response.data;
}

export async function updateStaff(
  id: string,
  input: StaffProfileInput,
): Promise<StaffMember> {
  const response = await api.patch<StaffMember>(
    `/admin/staff/${id}`,
    staffProfilePayload(input),
  );
  return response.data;
}

export async function updateStaffPermissions(
  id: string,
  permissions: Permission[],
): Promise<StaffMember> {
  const response = await api.patch<StaffMember>(
    `/admin/staff/${id}/permissions`,
    {
      permissions,
    },
  );
  return response.data;
}

export async function resetStaffPassword(id: string, newPassword: string) {
  const response = await api.post<{ message: string }>(
    `/admin/staff/${id}/reset-password`,
    {
      newPassword,
    },
  );
  return response.data;
}

export async function deactivateStaff(
  id: string,
  reason?: string,
): Promise<StaffMember> {
  const response = await api.post<StaffMember>(
    `/admin/staff/${id}/deactivate`,
    { reason },
  );
  return response.data;
}

export async function activateStaff(id: string): Promise<StaffMember> {
  const response = await api.post<StaffMember>(`/admin/staff/${id}/activate`);
  return response.data;
}

export async function deleteStaff(
  id: string,
): Promise<{ success: boolean; message: string }> {
  const response = await api.delete<{ success: boolean; message: string }>(
    `/admin/staff/${id}`,
  );
  return response.data;
}

export async function getStaffCourses(
  staffId: string,
): Promise<StaffAssignedCourse[]> {
  const response = await api.get<{
    items: StaffAssignedCourse[];
    totalPages: number;
  }>("/admin/courses", {
    params: { staffId, page: 1, limit: 100 },
  });
  const courses = [...response.data.items];
  for (let page = 2; page <= response.data.totalPages; page++) {
    const next = await api.get<{ items: StaffAssignedCourse[] }>(
      "/admin/courses",
      { params: { staffId, page, limit: 100 } },
    );
    courses.push(...next.data.items);
  }
  return courses;
}

export async function getStaffSchedules(
  staffId: string,
): Promise<StaffScheduleSlot[]> {
  try {
    const response = await api.get<StaffScheduleSlot[]>(
      "/admin/course-schedules",
      {
        params: { staffId },
      },
    );
    return Array.isArray(response.data) ? response.data : [];
  } catch {
    return [];
  }
}

export async function getStaffCourseChoices(): Promise<StaffAssignedCourse[]> {
  return getStaffFormCoursePages("/admin/staff/course-choices");
}

export async function getStaffFormCourses(staffId: string): Promise<StaffAssignedCourse[]> {
  return getStaffFormCoursePages(`/admin/staff/${staffId}/courses`);
}

export async function getStaffGradeEntryCourseIds(staffId: string): Promise<string[]> {
  const response = await api.get<{ courseIds: string[] }>(
    `/admin/staff/${staffId}/grade-entry-courses`,
  );
  return Array.isArray(response.data?.courseIds) ? response.data.courseIds : [];
}

async function getStaffFormCoursePages(url: string): Promise<StaffAssignedCourse[]> {
  const courses: StaffAssignedCourse[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const response = await api.get<{
      items: StaffAssignedCourse[];
      totalPages: number;
    }>(url, { params: { page, limit: 100 } });
    courses.push(...response.data.items);
    totalPages = response.data.totalPages;
    page++;
  } while (page <= totalPages);
  return courses;
}
