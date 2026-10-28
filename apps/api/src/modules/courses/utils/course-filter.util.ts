import type { FilterQuery } from 'mongoose';
import {
  APPROVED_SPECIALIZATION_CURRICULA,
  departmentAliases,
  normalizeDepartment,
} from '@student-portal/shared';
import type { CourseDocument } from '../schemas/course.schema';
import type { QueryCourseDto } from '../dto/course.dto';

/** Match the whole placement before pagination; never combine fields from two entries. */
export function courseCurriculumFilter(
  query: Pick<
    QueryCourseDto,
    'level' | 'academicLevel' | 'semester' | 'department'
  >,
): FilterQuery<CourseDocument> {
  const department = normalizeDepartment(query.department);
  const level = query.academicLevel ?? query.level;
  const placement = {
    ...(level ? { academicLevel: level } : {}),
    ...(query.semester ? { semester: query.semester } : {}),
  };
  if (!department && !level && !query.semester) return {};
  const explicit = { ...placement, ...(department ? { department } : {}) };
  const branches: FilterQuery<CourseDocument>[] = [
    { curricula: { $elemMatch: explicit } },
  ];
  if (department && department !== 'GENERAL') {
    branches.push({
      $and: [
        { curricula: { $elemMatch: { ...placement, department: 'GENERAL' } } },
        { curricula: { $not: { $elemMatch: { department } } } },
      ],
    });
  }
  const noCurricula = { 'curricula.0': { $exists: false } };
  const legacyConditions: FilterQuery<CourseDocument>[] = [
    noCurricula,
    { code: { $nin: Object.keys(APPROVED_SPECIALIZATION_CURRICULA) } },
  ];
  if (level)
    legacyConditions.push({
      $or: [
        { academicLevel: level },
        { academicLevel: { $exists: false }, level },
      ],
    });
  if (query.semester)
    legacyConditions.push({
      $or: [
        { offeredTerms: query.semester },
        { 'offeredTerms.0': { $exists: false }, semester: query.semester },
      ],
    });
  if (department) {
    const names = departmentAliases(department).concat(
      department === 'GENERAL' ? [] : departmentAliases('GENERAL'),
    );
    legacyConditions.push({
      $or: [
        {
          department: {
            $in: names.map(
              (name) =>
                new RegExp(
                  `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
                  'i',
                ),
            ),
          },
        },
        ...(department === 'GENERAL'
          ? []
          : [
              {
                code: { $in: ['317', '411', '318', '319'] },
                academicLevel: '3',
              },
            ]),
      ],
    });
  }
  branches.push({ $and: legacyConditions });
  for (const [code, placements] of Object.entries(
    APPROVED_SPECIALIZATION_CURRICULA,
  )) {
    const placement = placements.find(
      (item) =>
        (!department || item.department === department) &&
        (!level || item.academicLevel === level) &&
        (!query.semester || item.semester === query.semester),
    );
    if (placement)
      branches.push({
        ...noCurricula,
        code,
        $or: [
          { academicLevel: placement.academicLevel },
          { academicLevel: { $exists: false }, level: placement.academicLevel },
        ],
      });
  }
  return { $or: branches };
}
