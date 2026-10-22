import { z } from 'zod';

export type ComplaintType =
  | 'complaint'
  | 'technical_issue'
  | 'academic'
  | 'financial'
  | 'facility'
  | 'other';
export type ComplaintStatus = 'open' | 'in_review' | 'in_progress' | 'resolved' | 'closed';
export type ComplaintPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Reply {
  senderId: string;
  senderName: string;
  senderRole: 'admin' | 'staff' | 'student';
  message: string;
  createdAt: string;
}

export interface InternalNote {
  authorId: string;
  authorName: string;
  message: string;
  createdAt: string;
}

export interface StatusHistory {
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
  replies: Reply[];
  internalNotes?: InternalNote[];
  statusHistory?: StatusHistory[];
  createdAt: string;
  updatedAt: string;
  screenshotUrl?: string;
}

export const replyFormSchema = z.object({
  message: z.string().min(2, 'الرد يجب أن يحتوي على حرفين على الأقل'),
  isInternalNote: z.boolean().optional(),
});

export type ReplyFormValues = z.infer<typeof replyFormSchema>;
