import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Course, CourseDocument } from '../../courses/schemas/course.schema';
import type { Importer, ImportResult } from '../importer.interface';
import { parseSafeNumber } from '../upload-utils';

@Injectable()
export class CourseImporter implements Importer {
  readonly type = 'courses';

  constructor(
    @InjectModel(Course.name) private readonly courseModel: Model<CourseDocument>,
  ) {}

  private readonly levelMap: Record<string, string> = {
    '1': '1', 'أول': '1', 'الاول': '1', 'أولى': '1', 'الاولى': '1', 'الأولى': '1', 'first': '1', 'one': '1',
    '2': '2', 'ثاني': '2', 'ثانية': '2', 'الثاني': '2', 'الثانية': '2', 'second': '2', 'two': '2',
    '3': '3', 'ثالث': '3', 'ثالثة': '3', 'الثالث': '3', 'الثالثة': '3', 'third': '3', 'three': '3',
    '4': '4', 'رابع': '4', 'رابعة': '4', 'الرابع': '4', 'الرابعة': '4', 'fourth': '4', 'four': '4',
  };

  private readonly semesterMap: Record<string, string> = {
    'first': 'first', '1': 'first', 'أول': 'first', 'الاول': 'first', 'الأول': 'first', 'الفصل الأول': 'first',
    'second': 'second', '2': 'second', 'ثاني': 'second', 'الثاني': 'second', 'الفصل الثاني': 'second',
    'summer': 'summer', '3': 'summer', 'صيفي': 'summer', 'الصيفي': 'summer', 'الفصل الصيفي': 'summer',
  };

  validate(rows: Record<string, unknown>[]) {
    const errors: string[] = [];
    const validRows: { row: Record<string, unknown>; rowNum: number }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      const courseCode = String(row.courseCode || row.code || '').trim();
      const bilingualName = row.courseNameAr || row.courseNameEn || row.courseName;
      const cleanLevel = row.level
        ? this.levelMap[String(row.level).trim().toLowerCase()] ||
          String(row.level).trim()
        : '';
      const cleanSemester = row.semester
        ? this.semesterMap[String(row.semester).trim().toLowerCase()] ||
          String(row.semester).trim().toLowerCase()
        : '';

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

      const courseData = {
        code: courseCode.toUpperCase(),
        name: bilingualName,
        nameAr: (row.courseNameAr || row.courseName || row.courseNameEn) as string,
        nameEn: (row.courseNameEn || row.courseName || row.courseNameAr) as string,
        level: cleanLevel,
        academicLevel: cleanLevel,
        semester: cleanSemester,
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
      await this.courseModel.bulkWrite(courseOps, { ordered: false });
    }

    return { successCount, errors };
  }
}
