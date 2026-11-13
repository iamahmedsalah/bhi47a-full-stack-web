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
  meta?: { sendWhatsApp?: boolean };
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
    courseCode?: string;
    examType?: string;
    status?: string;
    titleAr?: string;
    titleEn?: string;
    bodyAr?: string;
    bodyEn?: string;
    [key: string]: unknown;
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

export async function clearAllAdminNotifications() {
  const response = await api.delete<{ message: string; count: number }>(
    '/admin/notifications/clear-all',
  );
  return response.data;
}

export async function bulkDeleteAdminNotifications(ids: string[]) {
  const response = await api.post<{ message: string; count: number }>(
    '/admin/notifications/bulk-delete',
    { ids },
  );
  return response.data;
}

/**
 * Cleanly localizes notification title & body to avoid displaying mixed/duplicate
 * Arabic & English strings in the notification card.
 */
export function getLocalizedNotification(
  item: {
    title: string;
    body: string;
    meta?: {
      titleAr?: string;
      titleEn?: string;
      bodyAr?: string;
      bodyEn?: string;
      [key: string]: unknown;
    };
  },
  isAr: boolean,
): { title: string; body: string } {
  // 1. Meta takes highest priority
  let title = isAr ? item.meta?.titleAr : item.meta?.titleEn;
  let body = isAr ? item.meta?.bodyAr : item.meta?.bodyEn;

  // 2. If title wasn't found in meta, inspect delimiter ' | '
  if (!title) {
    if (item.title && item.title.includes(' | ')) {
      const parts = item.title.split(' | ');
      const arPart = parts.find((p) => /[\u0600-\u06FF]/.test(p));
      const enPart = parts.find((p) => !/[\u0600-\u06FF]/.test(p));
      title = (isAr ? arPart : enPart) || parts[0];
    } else {
      title = item.title;
    }
  }

  // 3. If body wasn't found in meta, inspect line breaks with Arabic/English separation
  if (!body) {
    if (item.body && item.body.includes('\n')) {
      const lines = item.body.split('\n').map((l) => l.trim()).filter(Boolean);
      const arLines = lines.filter((l) => /[\u0600-\u06FF]/.test(l));
      const enLines = lines.filter((l) => !/[\u0600-\u06FF]/.test(l));

      if (arLines.length > 0 && enLines.length > 0) {
        body = (isAr ? arLines : enLines).join('\n');
      } else {
        body = item.body;
      }
    } else {
      body = item.body;
    }
  }

  return {
    title: title || item.title || '',
    body: body || item.body || '',
  };
}
