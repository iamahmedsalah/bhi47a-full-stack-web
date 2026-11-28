import type {
  CourseCurriculum,
  Permission,
  StaffType,
  DoctorPrefix,
} from "@student-portal/shared";

export interface StaffMember {
  _id: string;
  userCode?: string;
  name: string;
  nameAr?: string;
  username?: string;
  email?: string;
  phone?: string;
  role: "admin" | "staff";
  staffType?: StaffType;
  titlePrefix?: DoctorPrefix | string;
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
  status: "all" | "active" | "inactive";
  role?: "all" | "staff" | "admin";
  staffType?: "all" | StaffType;
}

export interface StaffProfileInput {
  courseIds?: string[];
  gradeEntryCourseIds?: string[];
  permissions?: Permission[];
  name: string;
  nameAr?: string;
  email: string;
  username?: string;
  phone?: string;
  staffType?: StaffType;
  titlePrefix?: DoctorPrefix | string;
}

export interface CreateStaffInput extends StaffProfileInput {
  role?: "admin" | "staff";
  password: string;
  permissions?: Permission[];
}

export interface StaffAssignedCourse {
  doctorId?: string;
  doctorIds?: string[];
  doctors?: Array<{
    _id: string;
    name: string;
    nameAr?: string;
    staffType?: string;
    titlePrefix?: string;
  }>;
  teachingAssistantIds?: string[];
  teachingAssistants?: Array<{
    _id: string;
    name: string;
    nameAr?: string;
    staffType?: string;
    titlePrefix?: string;
  }>;
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
  type: "lecture" | "section" | "lab";
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string;
  building?: string;
  level?: string;
  semester?: string;
}
