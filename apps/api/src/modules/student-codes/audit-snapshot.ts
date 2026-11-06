import { createHash } from 'node:crypto';
import type { Types } from 'mongoose';
import {
  formatStudentCode,
  parseStudentCode,
  type StudentCodeFinding,
  type StudentCodeFindingStatus,
} from '@student-portal/shared';
import type {
  StudentCodeEntry,
  StudentCodeYear,
} from './schemas/student-code.schema';

export interface CodeUser {
  _id: Types.ObjectId;
  role: string;
  studentCode?: string;
  username?: string;
  userCode?: string;
}
export interface CodeProfile {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  studentCode?: string;
  fullName?: string;
  fullNameAr?: string;
  fullNameEn?: string;
  department?: string;
  level?: string;
  academicYear?: string;
}
export interface SnapshotSources {
  users: CodeUser[];
  profiles: CodeProfile[];
  entries: StudentCodeEntry[];
  policy: StudentCodeYear | null;
  periodExists: boolean;
  truncated: boolean;
}
export function analyzeCodeSnapshot(
  academicYear: string,
  prefix: string,
  sources: SnapshotSources,
) {
  const allCodes = new Set<string>();
  const userCodes = new Map<string, CodeUser[]>();
  const profileCodes = new Map<string, CodeProfile[]>();
  for (const user of sources.users) {
    const aliases = new Set([
      user.studentCode,
      /^\d{6}$/.test(user.username ?? '') ? user.username : undefined,
      user.userCode?.match(/^STD-(\d{6})$/)?.[1],
    ]);
    for (const code of aliases)
      if (code?.startsWith(prefix)) {
        allCodes.add(code);
        const matches = userCodes.get(code) ?? [];
        matches.push(user);
        userCodes.set(code, matches);
      }
  }
  for (const profile of sources.profiles)
    if (profile.studentCode?.startsWith(prefix)) {
      allCodes.add(profile.studentCode);
      const matches = profileCodes.get(profile.studentCode) ?? [];
      matches.push(profile);
      profileCodes.set(profile.studentCode, matches);
    }
  const registry = new Map(
    sources.entries.map((entry) => [entry.studentCode, entry]),
  );
  for (const code of registry.keys()) allCodes.add(code);
  let maxSequence = Math.min(
    9999,
    Math.max(0, (sources.policy?.nextSequence ?? 1) - 1),
  );
  for (const code of allCodes)
    maxSequence = Math.max(maxSequence, parseStudentCode(code, prefix) ?? 0);
  for (let seq = 1; seq <= maxSequence; seq++)
    allCodes.add(formatStudentCode(prefix, seq));
  const rows: StudentCodeFinding[] = [...allCodes].sort().map((studentCode) => {
    const sequence = parseStudentCode(studentCode, prefix);
    const row: Partial<StudentCodeFinding> & {
      studentCode: string;
      sequence: number | undefined;
    } = { studentCode, sequence };
    if (sequence === undefined)
      return { ...row, status: 'REQUIRES_REVIEW', reason: 'MALFORMED_CODE' };
    const users = userCodes.get(studentCode) ?? [];
    const profiles = profileCodes.get(studentCode) ?? [];
    const owners = users.filter(
      (user) => user.role === 'student' && user.studentCode === studentCode,
    );
    const validOwner =
      owners.length === 1 &&
      profiles.length === 1 &&
      String(profiles[0].userId) === String(owners[0]._id);
    const entry = registry.get(studentCode);
    if (validOwner && users.length === 1) {
      Object.assign(row, {
        observedStudentId: String(owners[0]._id),
        studentProfileId: String(profiles[0]._id),
        studentName: profiles[0].fullNameEn || profiles[0].fullName,
        studentNameAr: profiles[0].fullNameAr || profiles[0].fullName,
        department: profiles[0].department,
        level: profiles[0].level,
        studentAcademicYear: profiles[0].academicYear,
        registryAcademicYear: entry?.academicYear,
      });
    }
    if (
      users.length > 1 ||
      profiles.length > 1 ||
      (owners.length && profiles.length && !validOwner)
    )
      return { ...row, status: 'REQUIRES_REVIEW', reason: 'OWNER_CONFLICT' };
    if (users.length && !owners.length)
      return { ...row, status: 'REQUIRES_REVIEW', reason: 'ALIAS_CONFLICT' };
    if (profiles.length && !owners.length)
      return { ...row, status: 'REQUIRES_REVIEW', reason: 'ORPHANED_PROFILE' };
    if (owners.length && !profiles.length)
      return { ...row, status: 'REQUIRES_REVIEW', reason: 'ORPHANED_USER' };
    if (
      entry &&
      (entry.academicYear !== academicYear ||
        entry.yearPrefix !== prefix ||
        entry.sequence !== sequence)
    )
      return {
        ...row,
        status: 'REQUIRES_REVIEW',
        reason:
          entry.academicYear !== academicYear
            ? 'REGISTRY_YEAR_MISMATCH'
            : 'REGISTRY_CONFLICT',
      };
    if (validOwner) {
      const currentStudentId = String(owners[0]._id);
      if (
        entry &&
        (entry.status !== 'ASSIGNED' ||
          String(entry.currentStudentId) !== currentStudentId)
      )
        return {
          ...row,
          status: 'REQUIRES_REVIEW',
          reason: 'REGISTRY_CONFLICT',
        };
      return {
        ...row,
        status: 'ASSIGNED',
        reason: 'CURRENT_OWNER',
        currentStudentId,
        studentProfileId: String(profiles[0]._id),
        studentName: profiles[0].fullNameEn || profiles[0].fullName,
        studentNameAr: profiles[0].fullNameAr || profiles[0].fullName,
        department: profiles[0].department,
        level: profiles[0].level,
      };
    }
    if (!entry) return { ...row, status: 'MISSING', reason: 'UNVERIFIED_GAP' };
    if (entry.status === 'ASSIGNED' && !users.length && !profiles.length)
      return {
        ...row,
        status: 'REQUIRES_REVIEW',
        reason: 'PREVIOUS_OWNER_MISSING',
      };
    if (entry.status === 'RELEASED')
      return { ...row, status: 'RELEASED', reason: 'PREVIOUS_OWNER_BLOCKED' };
    if (entry.status === 'RESERVED')
      return { ...row, status: 'RESERVED', reason: 'RESERVATION_HELD' };
    if (
      entry.status === 'AVAILABLE' &&
      (!entry.assignmentHistory.length || entry.reuseAuthorized) &&
      !entry.currentStudentId
    )
      return {
        ...row,
        status: 'AVAILABLE',
        reason: entry.reuseAuthorized
          ? 'ADMIN_REUSE_APPROVED'
          : 'CONFIRMED_AVAILABLE',
      };
    return { ...row, status: 'REQUIRES_REVIEW', reason: 'REGISTRY_CONFLICT' };
  });
  const summary: Record<StudentCodeFindingStatus, number> = {
    AVAILABLE: 0,
    RESERVED: 0,
    ASSIGNED: 0,
    RELEASED: 0,
    REQUIRES_REVIEW: 0,
    MISSING: 0,
  };
  for (const row of rows) summary[row.status]++;
  // No mutable contact/name/last-login fields: normal portal use must not invalidate a preview.
  const canonical = {
    academicYear,
    prefix,
    periodExists: sources.periodExists,
    truncated: sources.truncated,
    users: sources.users
      .map((user) => [
        String(user._id),
        user.role,
        user.studentCode,
        user.username,
        user.userCode,
      ])
      .sort(),
    profiles: sources.profiles
      .map((profile) => [
        String(profile._id),
        String(profile.userId),
        profile.studentCode,
      ])
      .sort(),
    entries: sources.entries
      .map((entry) => [
        entry.studentCode,
        entry.academicYear,
        entry.yearPrefix,
        entry.sequence,
        entry.status,
        entry.reuseAuthorized,
        String(entry.currentStudentId ?? ''),
        String(entry.registrationRequestId ?? ''),
        entry.assignmentHistory,
      ])
      .sort(),
    policy: sources.policy
      ? [
          sources.policy.academicYear,
          sources.policy.yearPrefix,
          sources.policy.allocationPrefix,
          sources.policy.nextSequence,
          sources.policy.revision,
        ]
      : null,
  };
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(canonical))
    .digest('hex');
  const mappingConflict = Boolean(
    sources.policy &&
    (sources.policy.academicYear !== academicYear ||
      (sources.policy.allocationPrefix ?? sources.policy.yearPrefix) !==
        prefix),
  );
  return {
    rows,
    summary,
    fingerprint,
    maxSequence,
    mappingConflict,
    canInitialize:
      sources.periodExists &&
      !sources.policy &&
      !sources.entries.length &&
      !sources.truncated &&
      summary.REQUIRES_REVIEW === 0,
  };
}
