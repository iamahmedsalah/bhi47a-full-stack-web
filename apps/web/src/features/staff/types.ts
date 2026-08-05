import type { Permission } from '@student-portal/shared';

export interface StaffMember {
  _id: string;
  userCode?: string;
  name: string;
  username?: string;
  email?: string;
  phone?: string;
  role: 'staff';
  permissions: Permission[];
  isActive: boolean;
  deactivatedAt?: string;
  deactivationReason?: string;
  lastLoginAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StaffListResponse {
  items: StaffMember[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface StaffListParams {
  page: number;
  limit: number;
  search?: string;
  status: 'all' | 'active' | 'inactive';
}

export interface StaffProfileInput {
  name: string;
  email: string;
  username?: string;
  phone?: string;
}

export interface CreateStaffInput extends StaffProfileInput {
  password: string;
  permissions?: Permission[];
}
