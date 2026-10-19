import api from '@/lib/api';
import type { Permission } from '@student-portal/shared';
import type {
  CreateStaffInput,
  StaffAssignedCourse,
  StaffListParams,
  StaffListResponse,
  StaffMember,
  StaffProfileInput,
  StaffScheduleSlot,
} from './types';

export async function listStaff(params: StaffListParams): Promise<StaffListResponse> {
  const response = await api.get<StaffListResponse>('/admin/staff', { params });
  return response.data;
}

export async function createStaff(input: CreateStaffInput): Promise<StaffMember> {
  const response = await api.post<StaffMember>('/admin/staff', input);
  return response.data;
}

export async function updateStaff(id: string, input: StaffProfileInput): Promise<StaffMember> {
  const response = await api.patch<StaffMember>(`/admin/staff/${id}`, input);
  return response.data;
}

export async function updateStaffPermissions(
  id: string,
  permissions: Permission[],
): Promise<StaffMember> {
  const response = await api.patch<StaffMember>(`/admin/staff/${id}/permissions`, {
    permissions,
  });
  return response.data;
}

export async function resetStaffPassword(id: string, newPassword: string) {
  const response = await api.post<{ message: string }>(`/admin/staff/${id}/reset-password`, {
    newPassword,
  });
  return response.data;
}

export async function deactivateStaff(id: string, reason?: string): Promise<StaffMember> {
  const response = await api.post<StaffMember>(`/admin/staff/${id}/deactivate`, { reason });
  return response.data;
}

export async function activateStaff(id: string): Promise<StaffMember> {
  const response = await api.post<StaffMember>(`/admin/staff/${id}/activate`);
  return response.data;
}

export async function getStaffCourses(doctorId: string): Promise<StaffAssignedCourse[]> {
  try {
    const response = await api.get<{ items: StaffAssignedCourse[] }>('/admin/courses', {
      params: { doctorId, limit: 100 },
    });
    return response.data?.items ?? [];
  } catch {
    return [];
  }
}

export async function getStaffSchedules(staffId: string): Promise<StaffScheduleSlot[]> {
  try {
    const response = await api.get<StaffScheduleSlot[]>('/admin/course-schedules', {
      params: { staffId },
    });
    return Array.isArray(response.data) ? response.data : [];
  } catch {
    return [];
  }
}
