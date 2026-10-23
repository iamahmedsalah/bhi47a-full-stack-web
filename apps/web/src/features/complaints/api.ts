import type { PaginatedResponse } from '@/lib/api';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api-client';

export type ComplaintType =
  | 'complaint'
  | 'technical_issue'
  | 'academic'
  | 'financial'
  | 'facility'
  | 'other';

export type ComplaintStatus =
  | 'open'
  | 'in_review'
  | 'in_progress'
  | 'resolved'
  | 'closed';

export type ComplaintPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface ComplaintReply {
  senderId: string;
  senderName: string;
  senderRole: 'admin' | 'staff' | 'student';
  message: string;
  createdAt: string;
}

export interface ComplaintInternalNote {
  authorId: string;
  authorName: string;
  message: string;
  createdAt: string;
}

export interface ComplaintStatusHistory {
  fromStatus: string;
  toStatus: string;
  changedByName?: string;
  changedAt: string;
}

export interface Complaint {
  _id: string;
  ticketNumber: string;
  studentCode: string;
  studentName: string;
  type: ComplaintType;
  title: string;
  description: string;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  assignedGroup?: string;
  assignedStaffId?: string;
  assignedStaffName?: string;
  requesterName?: string;
  contactPhone?: string;
  contactEmail?: string;
  nationalId?: string;
  nationalIdMasked?: string;
  department?: string;
  replies: ComplaintReply[];
  internalNotes?: ComplaintInternalNote[];
  statusHistory?: ComplaintStatusHistory[];
  createdAt: string;
  updatedAt: string;
  screenshotUrl?: string;
}

export interface DepartmentStaffAssignment {
  staffId: string;
  staffName: string;
}

export interface ComplaintSettings {
  complaintsSystemOpen: boolean;
  blacklistedStudentCodes: string[];
  complaintOpenAt?: string;
  complaintCloseAt?: string;
  complaintDailyLimit?: number;
  departmentStaffAssignments?: Record<string, DepartmentStaffAssignment>;
  updatedAt?: string;
}

export interface AssignableStaff {
  _id: string;
  name: string;
  email?: string;
  role: 'admin' | 'staff';
}

export interface ComplaintListParams {
  limit?: number;
  page?: number;
  search?: string;
  status?: string;
  type?: string;
  priority?: string;
  assignedGroup?: string;
  assignedStaffId?: string;
  department?: string;
  dateFrom?: string;
  dateTo?: string;
}

export type ComplaintUpdatePayload = Partial<{
  status: string;
  priority: string;
  assignedGroup: string;
  department: string;
  assignedStaffId: string;
  internalNote: string;
}>;

export const complaintKeys = {
  all: ['complaints'] as const,
  adminLists: () => [...complaintKeys.all, 'admin-list'] as const,
  adminList: (params: ComplaintListParams) =>
    [...complaintKeys.adminLists(), params] as const,
  stats: () => [...complaintKeys.all, 'stats'] as const,
  settings: () => [...complaintKeys.all, 'settings'] as const,
  assignees: () => [...complaintKeys.all, 'assignees'] as const,
};

export function listAdminComplaints(params: ComplaintListParams) {
  return apiGet<PaginatedResponse<Complaint>>('/admin/complaints', { params });
}

export interface ComplaintSummary {
  total: number; open: number; review: number; working: number; resolved: number;
  technical: number; complaints: number; high: number; avgResolutionMs: number | null;
}

export function listAdminComplaintStats() {
  return apiGet<ComplaintSummary>('/admin/complaints/stats');
}

export function getComplaintSettings() {
  return apiGet<ComplaintSettings>('/admin/complaints/settings');
}

export function updateComplaintSettings(payload: ComplaintSettings) {
  return apiPost<ComplaintSettings, ComplaintSettings>(
    '/admin/complaints/settings',
    payload,
  );
}

export function listAssignableStaff() {
  return apiGet<AssignableStaff[]>('/admin/complaints/assignees');
}

export function updateComplaint(id: string, payload: ComplaintUpdatePayload) {
  return apiPatch<Complaint, ComplaintUpdatePayload>(
    `/admin/complaints/${id}`,
    payload,
  );
}

export function replyToComplaint(id: string, message: string) {
  return apiPost<Complaint, { message: string }>(
    `/admin/complaints/${id}/reply`,
    { message },
  );
}

export function deleteComplaint(id: string) {
  return apiDelete<{ success: boolean; id: string }>(`/admin/complaints/${id}`);
}

export function bulkDeleteComplaints(ids: string[]) {
  return apiPost<{ success: boolean; deletedCount: number }, { ids: string[] }>(
    '/admin/complaints/bulk-delete',
    { ids },
  );
}

export function clearAllComplaints() {
  return apiDelete<{ success: boolean; deletedCount: number }>(
    '/admin/complaints/all',
  );
}

