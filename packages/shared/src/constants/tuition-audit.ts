export const TUITION_AUDIT_ACTION_TYPES = {
  MANUAL_SINGLE: 'manual_single',
  MANUAL_BULK: 'manual_bulk',
  EXCEL_UPLOAD: 'excel_upload',
  ENROLLMENT_SYNC: 'enrollment_sync',
} as const;

export type TuitionAuditActionType =
  (typeof TUITION_AUDIT_ACTION_TYPES)[keyof typeof TUITION_AUDIT_ACTION_TYPES];

export const TUITION_AUDIT_ACTION_TYPE_VALUES: TuitionAuditActionType[] =
  Object.values(TUITION_AUDIT_ACTION_TYPES);

export interface TuitionAuditLogDto {
  _id: string;
  studentProfileId: string;
  studentCode: string;
  studentName: string;
  level: string;
  department: string;
  previousTuitionStatus: string;
  newTuitionStatus: string;
  previousBlockStatus: boolean;
  newBlockStatus: boolean;
  blockReason?: string;
  actionType: TuitionAuditActionType;
  performedBy: string;
  performedByName: string;
  performedByRole: string;
  createdAt: string;
}
