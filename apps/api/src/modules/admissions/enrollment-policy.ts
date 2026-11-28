import { BadRequestException } from '@nestjs/common';
import type { Connection, mongo } from 'mongoose';
import type { OfficialEnrollmentStatus } from '@student-portal/shared';

export interface ProvisionalPolicy {
  midterm: boolean;
  coursework: boolean;
  quiz: boolean;
  finalExam: boolean;
}

export const defaultProvisionalPolicy: ProvisionalPolicy = {
  midterm: false,
  coursework: false,
  quiz: false,
  finalExam: false,
};

export function provisionalPolicyKey(year: string, term: string) {
  const semester = term === '1' ? 'first' : term === '2' ? 'second' : term;
  return `${year}:${semester}`;
}

export function provisionalPolicies(
  connection: Connection,
): mongo.Collection<
  ProvisionalPolicy & { _id: string; updatedBy?: string; updatedAt?: Date }
> {
  return connection.db!.collection<
    ProvisionalPolicy & { _id: string; updatedBy?: string; updatedAt?: Date }
  >('admission_provisional_policies');
}

export async function loadProvisionalPolicy(
  connection: Connection,
  year?: string,
  term?: string,
) {
  if (!year || !term) return defaultProvisionalPolicy;
  return (
    (await provisionalPolicies(connection).findOne({
      _id: provisionalPolicyKey(year, term),
    })) ?? defaultProvisionalPolicy
  );
}

export function canFinalizeEnrollment(
  profile?: { officialEnrollmentStatus?: OfficialEnrollmentStatus } | null,
) {
  return (
    profile?.officialEnrollmentStatus !== 'PROVISIONAL' &&
    profile?.officialEnrollmentStatus !== 'CANCELLED'
  );
}

export async function canViewAdmissionResult(
  connection: Connection,
  profile:
    | {
        officialEnrollmentStatus?: OfficialEnrollmentStatus;
        academicYear?: string;
        semester?: string;
      }
    | null
    | undefined,
  component: string,
  year?: string,
  term?: string,
) {
  if (profile?.officialEnrollmentStatus === 'CANCELLED') return false;
  if (profile?.officialEnrollmentStatus !== 'PROVISIONAL') return true;
  if (!['midterm', 'coursework', 'quiz'].includes(component)) return false;
  const policy = await loadProvisionalPolicy(
    connection,
    year ?? profile.academicYear,
    term ?? profile.semester,
  );
  return policy[component as 'midterm' | 'coursework' | 'quiz'];
}

export function assertEnrollmentCanBeActivated(
  profile?: { officialEnrollmentStatus?: OfficialEnrollmentStatus } | null,
) {
  if (profile?.officialEnrollmentStatus === 'CANCELLED')
    throw new BadRequestException({
      code: 'ADMISSION_ARCHIVED',
      message: 'Reactivate this student from the admission decision history.',
    });
}
