export const ADVISING_STATUSES = [
  'NOT_STARTED',
  'AUTO_RECOMMENDED',
  'ASSIGNED',
  'UNDER_REVIEW',
  'DRAFT',
  'WAITING_FOR_STUDENT',
  'REVISION_REQUESTED',
  'APPROVED',
  'REGISTERED',
  'CLOSED',
] as const;
export type AdvisingStatus = (typeof ADVISING_STATUSES)[number];
export const PLAN_TYPES = [
  'SYSTEM_RECOMMENDATION',
  'ADVISOR_DRAFT',
  'FINAL_APPROVED',
] as const;
export type AdvisingPlanType = (typeof PLAN_TYPES)[number];
export const PLAN_STATUSES = [
  'DRAFT',
  'VALIDATED',
  'APPROVED',
  'ARCHIVED',
] as const;
export type AdvisingPlanStatus = (typeof PLAN_STATUSES)[number];
export const NOTE_VISIBILITIES = ['INTERNAL', 'STUDENT_VISIBLE'] as const;
export type AdvisingNoteVisibility = (typeof NOTE_VISIBILITIES)[number];
export const GRAPH_NODE_TYPES = [
  'SEMESTER',
  'COURSE',
  'DECISION',
  'WARNING',
  'MILESTONE',
] as const;
export type AdvisingGraphNodeType = (typeof GRAPH_NODE_TYPES)[number];
export const GRAPH_EDGE_TYPES = [
  'PREREQUISITE',
  'RECOMMENDATION',
  'SEQUENCE',
] as const;
export type AdvisingGraphEdgeType = (typeof GRAPH_EDGE_TYPES)[number];
