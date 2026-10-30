import type { CourseCurriculum, Permission, StaffType } from '@student-portal/shared';

export interface StaffMember {
  _id: string;
  userCode?: string;
  name: string;
  nameAr?: string;
  username?: string;
  email?: string;
  phone?: string;
  role: 'admin' | 'staff';
  staffType?: StaffType;
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
  role?: 'all' | 'staff' | 'admin';
  staffType?: 'all' | StaffType;
}

export interface StaffProfileInput {
  name: string;
  nameAr?: string;
  email: string;
  username?: string;
  phone?: string;
  role?: 'admin' | 'staff';
  staffType?: StaffType;
}

export interface CreateStaffInput extends StaffProfileInput {
  password: string;
  permissions?: Permission[];
}

export interface StaffAssignedCourse {
  doctorId?: string;
  doctorIds?: string[];
  teachingAssistantIds?: string[];
  teachingAssistants?: Array<{ _id: string; name: string; nameAr?: string }>;
  curricula?: CourseCurriculum[];
  _id: string;
  name: string;
  nameAr?: string;
  nameEn?: string;
  code: string;
  level?: string;
  academicLevel?: string;
  semester?: string;
  creditHours?: number;
  department?: string;
}

export interface StaffScheduleSlot {
  _id: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  courseNameAr?: string;
  staffId: string;
  staffName?: string;
  staffType?: string;
  type: 'lecture' | 'section' | 'lab';
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string;
  building?: string;
  level?: string;
  semester?: string;
}

