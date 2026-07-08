import api, { PaginatedResponse } from '@/lib/api';

export type NotificationTarget = 'all' | 'level' | 'student';

export interface NotificationLog {
  _id: string;
  title: string;
  body: string;
  targetType: NotificationTarget;
  targetLevel?: string;
  targetStudentId?: {
    name: string;
    studentCode: string;
  };
  sentBy?: {
    name: string;
    email: string;
  };
  deliveryStatus?: 'pending' | 'queued' | 'sent' | 'failed' | 'skipped';
  pushSuccessCount?: number;
  pushFailureCount?: number;
  createdAt: string;
}

export interface StudentNotification {
  _id: string;
  title: string;
  body: string;
  isRead?: boolean;
  readAt?: string;
  createdAt: string;
}

export interface SendNotificationInput {
  title: string;
  body: string;
  targetType: NotificationTarget;
  targetLevel?: string;
  targetStudentCode?: string;
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
