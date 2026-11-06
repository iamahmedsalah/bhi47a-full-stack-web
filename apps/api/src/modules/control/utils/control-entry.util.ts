import { CONTROL_SCORELESS_STATES } from '@student-portal/shared';

/** One grid row's mark as the API exposes it. */
export interface ControlEntry {
  studentId: string;
  score: number | null;
  /** `null` = no record yet ("not entered"); never confused with 0. */
  status: string | null;
  rev: number;
  isPublished: boolean | null;
  updatedAt: string | null;
}

interface GradeLike {
  studentId: { toString(): string };
  cleared?: boolean;
  grade?: number;
  status?: string;
  rev?: number;
  isPublished?: boolean;
  updatedAt?: Date;
}

export function toControlEntry(
  doc: GradeLike | null | undefined,
): ControlEntry | null {
  if (!doc) return null;
  const status = doc.cleared ? null : (doc.status ?? 'present');
  const scoreless = (CONTROL_SCORELESS_STATES as readonly string[]).includes(
    status ?? '',
  );
  return {
    studentId: doc.studentId.toString(),
    score: doc.cleared || scoreless ? null : (doc.grade ?? null),
    status,
    rev: doc.rev ?? 0,
    isPublished: doc.isPublished ?? null,
    updatedAt: doc.updatedAt ? doc.updatedAt.toISOString() : null,
  };
}
