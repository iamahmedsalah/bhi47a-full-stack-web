import api from '@/lib/api';
import type { Permission } from '@student-portal/shared';
import type {
  CreateStaffInput,
  StaffListParams,
  StaffListResponse,
  StaffMember,
  StaffProfileInput,
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
