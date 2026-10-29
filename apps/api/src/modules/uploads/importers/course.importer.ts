import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Course,
  CourseDocument,
  type CourseCurriculum,
} from '../../courses/schemas/course.schema';
import type { Importer, ImportResult } from '../importer.interface';
import { parseSafeNumber } from '../upload-utils';

@Injectable()
export class CourseImporter implements Importer {
  readonly type = 'courses';

  constructor(
    @InjectModel(Course.name)
    private readonly courseModel: Model<CourseDocument>,
  ) {}

  private readonly levelMap: Record<string, string> = {
    '1': '1',
    أول: '1',
    الاول: '1',
    أولى: '1',
    الاولى: '1',
    الأولى: '1',
    first: '1',
    one: '1',
    '2': '2',
    ثاني: '2',
    ثانية: '2',
    الثاني: '2',
    الثانية: '2',
    second: '2',
    two: '2',
    '3': '3',
    ثالث: '3',
    ثالثة: '3',
    الثالث: '3',
    الثالثة: '3',
    third: '3',
    three: '3',
    '4': '4',
    رابع: '4',
    رابعة: '4',
    الرابع: '4',
    الرابعة: '4',
    fourth: '4',
    four: '4',
  };

  private readonly semesterMap: Record<string, string> = {
    first: 'first',
    '1': 'first',
    أول: 'first',
    الاول: 'first',
    الأول: 'first',
    'الفصل الأول': 'first',
    second: 'second',
    '2': 'second',
    ثاني: 'second',
    الثاني: 'second',
    'الفصل الثاني': 'second',
    summer: 'summer',
    '3': 'summer',
    صيفي: 'summer',
    الصيفي: 'summer',
    'الفصل الصيفي': 'summer',
  };

  validate(rows: Record<string, unknown>[]) {
    const errors: string[] = [];
    const validRows: { row: Record<string, unknown>; rowNum: number }[] = [];
    const seenCodes = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      const rawCode =
        typeof row.courseCode === 'string' || typeof row.courseCode === 'number'
          ? String(row.courseCode)
          : typeof row.code === 'string' || typeof row.code === 'number'
            ? String(row.code)
            : '';
      const courseCode = rawCode.trim();
      const normalizedCode = courseCode.toUpperCase();
      const bilingualName =
        row.courseNameAr || row.courseNameEn || row.courseName;
      const rawLevelStr =
        typeof row.level === 'string' || typeof row.level === 'number'
          ? String(row.level).trim()
          : '';
      const cleanLevel = rawLevelStr
        ? this.levelMap[rawLevelStr.toLowerCase()] || rawLevelStr
        : '';
      const rawSemStr =
        typeof row.semester === 'string' || typeof row.semester === 'number'
          ? String(row.semester).trim().toLowerCase()
          : '';
      const cleanSemester = rawSemStr
        ? this.semesterMap[rawSemStr] || rawSemStr
        : '';
      if (seenCodes.has(normalizedCode)) {
        errors.push(
          `Row ${rowNum}: duplicate course code ${normalizedCode} in this import`,
        );
        continue;
      }
      seenCodes.add(normalizedCode);

      const curriculaRaw =
        typeof row.programCurricula === 'string' ||
        typeof row.programCurricula === 'number'
          ? String(row.programCurricula).trim()
          : '';
      if (curriculaRaw) {
        const curricula: CourseCurriculum[] = [];
        const assignmentKeys = new Set<string>();
        const typeValues = [
          'required',
          'elective',
          'university_req',
          'institute_req',
          'specialization_req',
        ];
        const assignments = curriculaRaw.split('|');
        let invalidCurricula = false;
        for (const assignmentText of assignments) {
          const [
            rawDepartment,
            rawCurriculumLevel,
            rawCurriculumSemester,
            rawType,
          ] = assignmentText.split(':').map((part) => part.trim());
          const curriculumDepartment = rawDepartment?.toUpperCase();
          const curriculumLevel = rawCurriculumLevel
            ? this.levelMap[rawCurriculumLevel.toLowerCase()] ||
              rawCurriculumLevel
            : '';
          const curriculumSemester = rawCurriculumSemester
            ? this.semesterMap[rawCurriculumSemester.toLowerCase()] ||
              rawCurriculumSemester.toLowerCase()
            : '';
          const curriculumType = rawType?.toLowerCase();
          const key = curriculumDepartment ?? '';
          if (
            !['GENERAL', 'BIS', 'ACCOUNTING'].includes(
              curriculumDepartment ?? '',
            ) ||
            !['1', '2', '3', '4'].includes(curriculumLevel) ||
            !['first', 'second', 'summer'].includes(curriculumSemester) ||
            !typeValues.includes(curriculumType ?? '') ||
            assignmentKeys.has(key)
          ) {
            invalidCurricula = true;
            break;
          }
          assignmentKeys.add(key);
          curricula.push({
            department: curriculumDepartment as CourseCurriculum['department'],
            academicLevel: curriculumLevel as CourseCurriculum['academicLevel'],
            semester: curriculumSemester as CourseCurriculum['semester'],
            type: curriculumType as CourseCurriculum['type'],
          });
        }
        if (invalidCurricula || curricula.length === 0) {
          errors.push(
            `Row ${rowNum}: programCurricula must use DEPARTMENT:LEVEL:SEMESTER:TYPE entries separated by |`,
          );
          continue;
        }
        row._cleanCurricula = curricula;
      }

      const missingFields: string[] = [];
      if (!courseCode) missingFields.push('الكود');
      if (!bilingualName) missingFields.push('الاسم');
      if (!cleanLevel) missingFields.push('المستوى');
      if (!cleanSemester) missingFields.push('الفصل الدراسي');

      if (missingFields.length > 0) {
        errors.push(
          `السطر ${rowNum}: البيانات الأساسية ناقصة (${missingFields.join('، ')})`,
        );
        continue;
      }

      // Attach cleaned values for commit
      row._cleanLevel = cleanLevel;
      row._cleanSemester = cleanSemester;
      row._courseCode = courseCode;
      row._bilingualName = bilingualName;
      validRows.push({ row, rowNum });
    }

    return { validRows, errors };
  }

  async commit(
    validRows: { row: Record<string, unknown>; rowNum: number }[],
  ): Promise<ImportResult> {
    const errors: string[] = [];
    let successCount = 0;
    const courseOps: Parameters<typeof this.courseModel.bulkWrite>[0] = [];

    for (const { row } of validRows) {
      const courseCode = row._courseCode as string;
      const cleanLevel = row._cleanLevel as string;
      const cleanSemester = row._cleanSemester as string;
      const bilingualName = row._bilingualName as string;
      const offeredTerms = row.offeredTerms as string[] | undefined;
      const curricula = row._cleanCurricula as CourseCurriculum[] | undefined;

      const courseData = {
        code: courseCode.toUpperCase(),
        name: bilingualName,
        nameAr: (row.courseNameAr ||
          row.courseName ||
          row.courseNameEn) as string,
        nameEn: (row.courseNameEn ||
          row.courseName ||
          row.courseNameAr) as string,
        level: cleanLevel,
        academicLevel: cleanLevel,
        semester: cleanSemester,
        ...(curricula ? { curricula } : {}),
        department: row.department === 'محل' ? undefined : row.department,
        creditHours: parseSafeNumber(row.creditHours) ?? 3,
        prerequisites: (row.prerequisites as string[]) || [],
        coRequisites: (row.coRequisites as string[]) || [],
        equivalentCourses: (row.equivalentCourses as string[]) || [],
        offeredTerms: offeredTerms?.length ? offeredTerms : [cleanSemester],
        type: (row.courseType as string) || 'required',
        recommendedSemester: parseSafeNumber(row.recommendedSemester),
        minimumGpa: parseSafeNumber(row.minimumGpa),
        registrationPriority: parseSafeNumber(row.registrationPriority) ?? 0,
        description: row.description === 'محل' ? undefined : row.description,
        isActive: true,
      };

      courseOps.push({
        updateOne: {
          filter: { code: courseCode.toUpperCase() },
          update: { $set: courseData },
          upsert: true,
        },
      });

      successCount++;
    }

    if (courseOps.length > 0) {
      try {
        await this.courseModel.bulkWrite(courseOps, { ordered: false });
      } catch (err: unknown) {
        const bulkError = err as {
          writeErrors?: Array<{
            index?: number;
            errmsg?: string;
            message?: string;
          }>;
        };
        if (bulkError?.writeErrors?.length) {
          successCount = Math.max(
            0,
            courseOps.length - bulkError.writeErrors.length,
          );
          for (const we of bulkError.writeErrors) {
            const rowNum =
              we.index !== undefined && validRows[we.index]
                ? validRows[we.index].rowNum
                : '؟';
            errors.push(
              `السطر ${rowNum}: ${we.errmsg || we.message || 'خطأ أثناء حفظ المقرر'}`,
            );
          }
        } else {
          successCount = 0;
          const message =
            err instanceof Error ? err.message : 'خطأ أثناء حفظ المقررات';
          errors.push(`فشل حفظ المقررات: ${message}`);
        }
      }
    }

    return { successCount, errors };
  }
}
