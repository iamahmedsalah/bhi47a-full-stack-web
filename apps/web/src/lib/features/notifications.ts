import api, { PaginatedResponse } from '@/lib/api';

export type NotificationTarget = 'all' | 'level' | 'student';

export interface NotificationLog {
  _id: string;
  title: string;
  body: string;
  targetType: NotificationTarget;
  targetLevel?: string;
  targetStudentId?: {
    _id?: string;
    name?: string;
    studentCode?: string;
  };
  sentBy?: {
    name: string;
    email: string;
  };
  deliveryStatus?: 'pending' | 'queued' | 'sent' | 'failed' | 'skipped';
  pushSuccessCount?: number;
  pushFailureCount?: number;
  readCount?: number;
  readBy?: Array<{
    userId?: {
      _id?: string;
      name?: string;
      studentCode?: string;
    };
    readAt?: string;
  }>;
  createdAt: string;
}

export interface StudentNotification {
  _id: string;
  title: string;
  body: string;
  isRead?: boolean;
  readAt?: string;
  createdAt: string;
  meta?: {
    type?: string;
    complaintId?: string;
    ticketNumber?: string;
    courseId?: string;
    examType?: string;
    status?: string;
    titleAr?: string;
    titleEn?: string;
    bodyAr?: string;
    bodyEn?: string;
    [key: string]: any;
  };
}

export interface SendNotificationInput {
  title: string;
  body: string;
  targetType: NotificationTarget;
  targetLevel?: string;
  targetStudentCode?: string;
  sendWhatsApp?: boolean;
}

export async function listAdminNotifications() {
  const response = await api.get<PaginatedResponse<NotificationLog>>(
    '/admin/notifications',
  );
  return response.data;
}

export async function sendNotification(input: SendNotificationInput) {
  const response = await api.post<NotificationLog>('/admin/notifications', input);
  return response.data;
}

export async function listStudentNotifications() {
  const response = await api.get<PaginatedResponse<StudentNotification>>(
    '/students/me/notifications',
  );
  return response.data;
}

export async function markNotificationRead(id: string) {
  const response = await api.patch<StudentNotification>(
    `/students/me/notifications/${id}/read`,
  );
  return response.data;
}

export async function markAllNotificationsRead() {
  const response = await api.patch<{ modifiedCount: number }>(
    '/students/me/notifications/read-all',
  );
  return response.data;
}

export async function deleteNotification(id: string) {
  const response = await api.delete<StudentNotification>(
    `/students/me/notifications/${id}`,
  );
  return response.data;
}

export async function clearAllReadNotifications() {
  const response = await api.delete<{ modifiedCount: number }>(
    '/students/me/notifications/clear-read',
  );
  return response.data;
}

export async function deleteAdminNotification(id: string) {
  const response = await api.delete<{ message: string; id: string }>(
    `/admin/notifications/${id}`,
  );
  return response.data;
}
