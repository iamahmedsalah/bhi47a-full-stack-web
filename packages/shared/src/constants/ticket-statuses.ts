export const TICKET_STATUSES = {
  WAITING: 'waiting',
  UNDER_REVIEW: 'under_review',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
  REJECTED: 'rejected',
} as const;

export type TicketStatus = (typeof TICKET_STATUSES)[keyof typeof TICKET_STATUSES];

export const TICKET_STATUS_VALUES: TicketStatus[] = Object.values(TICKET_STATUSES);

export const TICKET_TYPES = {
  COMPLAINT: 'complaint',
  MAINTENANCE: 'maintenance',
} as const;

export type TicketType = (typeof TICKET_TYPES)[keyof typeof TICKET_TYPES];

export const TICKET_TYPE_VALUES: TicketType[] = Object.values(TICKET_TYPES);

export const TICKET_PRIORITIES = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
} as const;

export type TicketPriority = (typeof TICKET_PRIORITIES)[keyof typeof TICKET_PRIORITIES];

export const TICKET_PRIORITY_VALUES: TicketPriority[] = Object.values(TICKET_PRIORITIES);
