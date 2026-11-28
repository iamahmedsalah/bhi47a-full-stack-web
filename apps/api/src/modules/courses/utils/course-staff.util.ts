import { Types, type FilterQuery } from 'mongoose';
import {
  isFacultyMember,
  isSupportingAcademicStaff,
} from '@student-portal/shared';
import type { CourseDocument } from '../schemas/course.schema';

export { isFacultyMember, isSupportingAcademicStaff };

type AssignmentKind = 'all' | 'doctor' | 'ta';
const fields = (kind: AssignmentKind) => ({
  singles:
    kind === 'doctor'
      ? ['doctorId']
      : kind === 'ta'
        ? ['teachingAssistantId', 'teachingAssistant']
        : ['doctorId', 'teachingAssistantId', 'teachingAssistant'],
  arrays:
    kind === 'doctor'
      ? ['doctorIds']
      : kind === 'ta'
        ? ['teachingAssistantIds']
        : ['doctorIds', 'teachingAssistantIds'],
  embedded:
    kind === 'doctor'
      ? ['doctors']
      : kind === 'ta'
        ? ['teachingAssistants']
        : ['doctors', 'teachingAssistants'],
});

function referenceId(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value instanceof Types.ObjectId) return value.toHexString();
  if (
    value &&
    typeof value === 'object' &&
    'toHexString' in value &&
    typeof (value as { toHexString?: unknown }).toHexString === 'function'
  ) {
    return (value as { toHexString(): string }).toHexString();
  }
  if (value && typeof value === 'object' && '_id' in value) {
    const id = value._id;
    if (typeof id === 'string') return id;
    if (id instanceof Types.ObjectId) return id.toHexString();
    if (
      id &&
      typeof id === 'object' &&
      'toHexString' in id &&
      typeof (id as { toHexString?: unknown }).toHexString === 'function'
    ) {
      return (id as { toHexString(): string }).toHexString();
    }
  }
  return undefined;
}

export function isAssignedToCourse(
  course: unknown,
  userId: string | Types.ObjectId,
  kind: AssignmentKind = 'all',
): boolean {
  if (!course || typeof course !== 'object') return false;
  const record = course as Record<string, unknown>;
  const id = String(userId);
  const paths = fields(kind);
  return (
    paths.singles.some((key) => referenceId(record[key]) === id) ||
    [...paths.arrays, ...paths.embedded].some((key) => {
      const values = record[key];
      return (
        Array.isArray(values) &&
        values.some((value: unknown) => referenceId(value) === id)
      );
    })
  );
}

export function courseStaffIds(course: object): string[] {
  const paths = fields('all');
  const record = course as Record<string, unknown>;
  return [
    ...new Set(
      [
        ...paths.singles.map((key) => referenceId(record[key])),
        ...[...paths.arrays, ...paths.embedded].flatMap((key) => {
          const values = record[key];
          return Array.isArray(values) ? values.map(referenceId) : [];
        }),
      ].filter((id): id is string => Boolean(id && Types.ObjectId.isValid(id))),
    ),
  ];
}

const storedGradeEntryIds = {
  $cond: [{ $isArray: '$gradeEntryStaffIds' }, '$gradeEntryStaffIds', []],
};

export function courseGradeEntryFilter(
  staffId: Types.ObjectId,
): FilterQuery<CourseDocument> {
  return {
    $or: [
      { gradeEntryStaffIds: staffId },
      {
        $expr: {
          $in: [String(staffId), storedGradeEntryIds],
        },
      },
    ],
  };
}

export function withoutGradeEntryStaff(staffIds: Types.ObjectId[]) {
  const values = staffIds.flatMap((staffId) => [staffId, String(staffId)]);
  return {
    $filter: {
      input: storedGradeEntryIds,
      as: 'member',
      cond: { $not: [{ $in: ['$$member', values] }] },
    },
  };
}

/** Keep assignments readable without a data rewrite, including pre-array records. */
export function courseStaffFilter(
  userId: string,
  kind: AssignmentKind = 'all',
): FilterQuery<CourseDocument> {
  if (!Types.ObjectId.isValid(userId)) return { _id: { $in: [] } };
  const objectId = new Types.ObjectId(userId);
  const paths = fields(kind);
  const array = (path: string) => ({
    $cond: [{ $isArray: `$${path}` }, `$${path}`, []],
  });
  // Mongoose casts strings in known ObjectId paths, so legacy string matches
  // must remain inside expressions, where query casting cannot erase them.
  const legacy = [
    ...paths.singles.map((path) => ({ $in: [`$${path}`, [objectId, userId]] })),
    ...paths.arrays.map((path) => ({ $in: [userId, array(path)] })),
    ...paths.embedded.map((path) => ({
      $in: [
        userId,
        { $map: { input: array(path), as: 'staff', in: '$$staff._id' } },
      ],
    })),
  ];
  const canonical = [
    ...(kind === 'ta' ? [] : [{ doctorId: objectId }]),
    ...paths.arrays.map((path) => ({ [path]: objectId })),
    ...paths.embedded.map((path) => ({ [`${path}._id`]: objectId })),
  ];
  return { $or: [...canonical, { $expr: { $or: legacy } }] };
}

export function isTeachingStaff(staffType?: string): boolean {
  return ['doctor', 'teaching_assistant', 'assistant_lecturer'].includes(
    (staffType ?? '').trim().toLowerCase(),
  );
}

export interface CourseContentActor {
  _id: { toString(): string };
  role: string;
  staffType?: string;
  permissions?: readonly string[];
}

export function canReadCourseContent(
  course: unknown,
  actor: CourseContentActor,
): boolean {
  return (
    actor.role === 'admin' ||
    (actor.role === 'staff' && isAssignedToCourse(course, String(actor._id)))
  );
}

export function canManageCourseContent(
  course: { contentSupervisorId?: Types.ObjectId },
  actor: CourseContentActor,
  owner: Types.ObjectId | string | undefined | null,
  permission: string,
): boolean {
  if (actor.role === 'admin') return true;
  if (
    !actor.permissions?.includes(permission) ||
    !canReadCourseContent(course, actor)
  ) {
    return false;
  }
  const id = String(actor._id);
  return (
    (Boolean(owner) && String(owner) === id) ||
    (actor.staffType === 'doctor' &&
      String(course.contentSupervisorId) === id &&
      isAssignedToCourse(course, id, 'doctor'))
  );
}
