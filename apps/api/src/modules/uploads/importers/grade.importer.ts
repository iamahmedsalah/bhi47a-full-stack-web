import { validateHistoricalGrade } from '@student-portal/shared';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { calculateGradeScale } from '@student-portal/shared';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Course, CourseDocument } from '../../courses/schemas/course.schema';
import { Grade, GradeDocument } from '../../grades/schemas/grade.schema';
import { GradesService } from '../../grades/grades.service';
import type { Importer, ImportResult } from '../importer.interface';
import { normalizeStudentSemester, parseSafeNumber } from '../upload-utils';

interface ExamEntry {
  examType: string;
  grade: number;
  maxGrade: number;
}

@Injectable()
export class GradeImporter implements Importer {
  readonly type = 'grades';

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Course.name)
    private readonly courseModel: Model<CourseDocument>,
    @InjectModel(Grade.name) private readonly gradeModel: Model<GradeDocument>,
    private readonly gradesService: GradesService,
  ) {}

  /** Insert-only historical import; never bypasses an existing Control sheet. */
  async commitHistorical(
    rows: Record<string, unknown>[],
    actorId: string,
    rowOffset = 0,
  ): Promise<ImportResult> {
    const errors: string[] = [];
    let successCount = 0;
    const codeText = (value: unknown) =>
      typeof value === 'string' || typeof value === 'number'
        ? String(value).trim()
        : '';
    const [students, courses] = await Promise.all([
      this.userModel
        .find({
          role: 'student',
          studentCode: {
            $in: rows.map((row) => codeText(row.studentCode)),
          },
        })
        .select('_id studentCode')
        .lean(),
      this.courseModel
        .find({
          code: {
            $in: rows.map((row) => codeText(row.courseCode).toUpperCase()),
          },
        })
        .select('_id code name nameAr nameEn')
        .lean(),
    ]);
    const studentMap = new Map(
      students.map((student) => [student.studentCode, student]),
    );
    const courseMap = new Map(courses.map((course) => [course.code, course]));
    const controlScopes = new Map<string, boolean>();
    const processRow = async ([index, row]: [
      number,
      Record<string, unknown>,
    ]) => {
      const rowNum = rowOffset + index + 2;
      const parsed = validateHistoricalGrade(row);
      if (!parsed.ok) {
        errors.push(`Row ${rowNum}: ${parsed.message}`);
        return;
      }
      const mark = parsed.value;
      const student = studentMap.get(mark.studentCode),
        course = courseMap.get(mark.courseCode);
      if (!student || !course) {
        errors.push(
          `Row ${rowNum}: Student or course not found / \u0627\u0644\u0637\u0627\u0644\u0628 \u0623\u0648 \u0627\u0644\u0645\u0642\u0631\u0631 \u063a\u064a\u0631 \u0645\u0633\u062c\u0644`,
        );
        return;
      }
      const scope = `${course._id.toString()}|${mark.academicYear}|${mark.semester}`;
      if (!controlScopes.has(scope))
        controlScopes.set(
          scope,
          await this.gradesService.hasControlSheet(
            course._id,
            mark.academicYear,
            mark.semester,
          ),
        );
      if (controlScopes.get(scope)) {
        errors.push(
          `Row ${rowNum}: Existing Control sheet; use Control / \u064a\u0648\u062c\u062f \u0643\u0634\u0641 \u0643\u0646\u062a\u0631\u0648\u0644 \u0644\u0647\u0630\u0627 \u0627\u0644\u0645\u0642\u0631\u0631 \u0648\u0627\u0644\u0641\u0635\u0644`,
        );
        return;
      }
      const filter = {
        studentId: student._id,
        courseId: course._id,
        academicYear: mark.academicYear,
        semester: mark.semester,
        examType: mark.examType,
      };
      const existing = await this.gradeModel.findOne(filter).lean();
      if (existing) {
        if (
          existing.historicalImport &&
          !existing.controlManaged &&
          existing.grade === mark.grade &&
          existing.maxGrade === mark.maxGrade &&
          existing.status === mark.status
        )
          successCount++;
        else
          errors.push(
            `Row ${rowNum}: Existing grade differs; no overwrite / \u062f\u0631\u062c\u0629 \u0645\u0648\u062c\u0648\u062f\u0629 \u0644\u0646 \u064a\u062a\u0645 \u0627\u0633\u062a\u0628\u062f\u0627\u0644\u0647\u0627`,
          );
        return;
      }
      const percentage = Math.round((mark.grade / mark.maxGrade) * 10000) / 100;
      const scale = calculateGradeScale(percentage, mark.status);
      try {
        // Atomic insert-only upsert makes a lost-response retry safe.
        const saved = await this.gradeModel
          .findOneAndUpdate(
            filter,
            {
              $setOnInsert: {
                ...filter,
                studentCode: mark.studentCode,
                courseCode: course.code,
                courseName: course.name,
                courseNameAr: course.nameAr,
                courseNameEn: course.nameEn || course.name,
                grade: mark.grade,
                maxGrade: mark.maxGrade,
                status: mark.status,
                percentage,
                letterGrade: scale.letter,
                gradePoints: scale.points,
                isPublished: false,
                historicalImport: true,
                updatedBy: actorId,
                rev: 1,
              },
            },
            { upsert: true, new: true },
          )
          .lean();
        if (
          saved?.historicalImport &&
          !saved.controlManaged &&
          saved.grade === mark.grade &&
          saved.maxGrade === mark.maxGrade &&
          saved.status === mark.status
        )
          successCount++;
        else
          errors.push(
            `Row ${rowNum}: Concurrent grade conflict / \u062a\u0639\u0627\u0631\u0636 \u0645\u0639 \u062f\u0631\u062c\u0629 \u0645\u0648\u062c\u0648\u062f\u0629`,
          );
      } catch {
        errors.push(
          `Row ${rowNum}: Grade could not be saved / \u062a\u0639\u0630\u0631 \u062d\u0641\u0638 \u0627\u0644\u062f\u0631\u062c\u0629`,
        );
      }
    };
    // Bound database work per request; insert-only upserts preserve safe retries.
    const indexedRows = [...rows.entries()];
    for (let offset = 0; offset < indexedRows.length; offset += 4) {
      await Promise.all(indexedRows.slice(offset, offset + 4).map(processRow));
    }
    return { successCount, errors };
  }

  validate(rows: Record<string, unknown>[]) {
    const errors: string[] = [];
    const validRows: { row: Record<string, unknown>; rowNum: number }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      const hasStudent = Boolean(row.studentCode);
      const hasCourse = Boolean(row.courseCode);

      const hasStandardGrade = row.grade !== undefined && Boolean(row.examType);
      const hasBreakdown =
        row.midterm !== undefined ||
        row.final !== undefined ||
        row.coursework !== undefined ||
        row.practical !== undefined ||
        row.total !== undefined;

      if (!hasStudent || !hasCourse) {
        errors.push(
          `السطر ${rowNum}: بيانات الطالب أو المادة ناقصة (كود الطالب وكود المقرر إجباريان)`,
        );
        continue;
      }

      if (!hasStandardGrade && !hasBreakdown) {
        errors.push(
          `السطر ${rowNum}: لم يتم العثور على درجات صالحة (يرجى إدخال الدرجة ونوع الامتحان، أو تفصيل أعمال السنة والنهائي والمجموع)`,
        );
        continue;
      }

      validRows.push({ row, rowNum });
    }

    return { validRows, errors };
  }

  async commit(
    validRows: { row: Record<string, unknown>; rowNum: number }[],
  ): Promise<ImportResult> {
    const errors: string[] = [];
    let successCount = 0;
    const currentYear = new Date().getFullYear();
    const defaultAcademicYear = `${currentYear}-${currentYear + 1}`;

    if (validRows.length === 0) return { successCount: 0, errors };

    const studentCodes = Array.from(
      new Set(validRows.map((v) => String(v.row.studentCode).trim())),
    );
    const courseCodes = Array.from(
      new Set(
        validRows.map((v) => String(v.row.courseCode).trim().toUpperCase()),
      ),
    );

    const [students, courses] = await Promise.all([
      this.userModel
        .find({ studentCode: { $in: studentCodes }, role: 'student' })
        .lean(),
      this.courseModel.find({ code: { $in: courseCodes } }).lean(),
    ]);

    const studentMap = new Map(students.map((s) => [s.studentCode, s]));
    const courseMap = new Map(courses.map((c) => [c.code, c]));

    const gradeOps: Parameters<typeof this.gradeModel.bulkWrite>[0] = [];
    const lockCache = new Map<string, boolean>();
    const affectedStudentIds = new Set<string>();

    for (const { row, rowNum } of validRows) {
      const studentCode = String(row.studentCode).trim();
      const code = String(row.courseCode).trim().toUpperCase();

      const student = studentMap.get(studentCode);
      if (!student) {
        errors.push(
          `السطر ${rowNum}: كود الطالب (${studentCode}) غير مسجل بالمنظومة`,
        );
        continue;
      }

      const course = courseMap.get(code);
      if (!course) {
        errors.push(`السطر ${rowNum}: كود المادة (${code}) غير مسجل بالمنظومة`);
        continue;
      }

      const academicYear = (
        (row.academicYear as string) || defaultAcademicYear
      ).trim();
      const semester = normalizeStudentSemester(row.semester);
      const status = (row.status as string) || 'present';

      // Build exam entries either from breakdown columns or standard row
      const entries: ExamEntry[] = [];

      if (row.midterm !== undefined) {
        entries.push({
          examType: 'midterm',
          grade: Number(row.midterm),
          maxGrade: parseSafeNumber(row.maxMidterm) ?? 20,
        });
      }
      if (row.coursework !== undefined) {
        entries.push({
          examType: 'coursework',
          grade: Number(row.coursework),
          maxGrade: parseSafeNumber(row.maxCoursework) ?? 20,
        });
      }
      if (row.practical !== undefined) {
        entries.push({
          examType: 'practical',
          grade: Number(row.practical),
          maxGrade: parseSafeNumber(row.maxPractical) ?? 10,
        });
      }
      if (row.final !== undefined) {
        entries.push({
          examType: 'final',
          grade: Number(row.final),
          maxGrade: parseSafeNumber(row.maxFinal) ?? 60,
        });
      }

      if (entries.length === 0) {
        if (row.total !== undefined) {
          entries.push({
            examType: 'final',
            grade: Number(row.total),
            maxGrade: parseSafeNumber(row.maxGrade) ?? 100,
          });
        } else if (row.grade !== undefined && row.examType) {
          entries.push({
            examType: String((row.examType as string) || '')
              .trim()
              .toLowerCase(),
            grade: Number(row.grade),
            maxGrade: parseSafeNumber(row.maxGrade) ?? 100,
          });
        }
      }

      // A locked Control sheet rejects every write path, including Excel.
      const editableEntries: ExamEntry[] = [];
      for (const entry of entries) {
        const lockKey = `${String(course._id)}|${academicYear}|${semester}|${entry.examType}`;
        let editable = lockCache.get(lockKey);
        if (editable === undefined) {
          editable = await this.gradesService
            .assertSheetEditable(
              course._id,
              academicYear,
              semester,
              entry.examType,
            )
            .then(() => true)
            .catch(() => false);
          lockCache.set(lockKey, editable);
        }
        if (editable) {
          editableEntries.push(entry);
        } else {
          errors.push(
            `Row ${rowNum}: ${entry.examType} for ${course.code} requires the Control workbook. Open Control, download its Excel template, preview and commit there.`,
          );
        }
      }
      if (editableEntries.length === 0) continue;

      for (const entry of editableEntries) {
        const percentage =
          entry.maxGrade > 0
            ? Math.round((entry.grade / entry.maxGrade) * 10000) / 100
            : 0;
        const scale = calculateGradeScale(percentage, status);

        const gradeData = {
          studentId: student._id,
          studentCode,
          courseId: course._id,
          courseName: course.name,
          courseNameAr: course.nameAr,
          courseNameEn: course.nameEn || course.name,
          courseCode: course.code,
          examType: entry.examType,
          grade: entry.grade,
          maxGrade: entry.maxGrade,
          percentage,
          letterGrade: scale.letter,
          gradePoints: scale.points,
          status,
          academicYear,
          semester,
        };

        gradeOps.push({
          updateOne: {
            filter: {
              studentCode,
              courseCode: course.code,
              examType: entry.examType,
              academicYear,
              semester,
            },
            update: {
              $set: gradeData,
              // Importing stores marks only; publishing stays in the Grades
              // module, so new records start hidden from students.
              $setOnInsert: { isPublished: false },
              // Bump the revision so Control grids notice an Excel change.
              $inc: { rev: 1 },
            },
            upsert: true,
          },
        });
      }

      affectedStudentIds.add(student._id.toString());
      successCount++;
    }

    if (gradeOps.length > 0) {
      try {
        await this.gradeModel.bulkWrite(gradeOps, { ordered: false });
      } catch (err: unknown) {
        const bulkError = err as {
          writeErrors?: Array<{ errmsg?: string; message?: string }>;
        };
        if (bulkError?.writeErrors?.length) {
          successCount = Math.max(
            0,
            successCount - bulkError.writeErrors.length,
          );
          for (const we of bulkError.writeErrors) {
            errors.push(
              `خطأ أثناء حفظ الدرجة: ${we.errmsg || we.message || 'خطأ غير معروف'}`,
            );
          }
        } else {
          successCount = 0;
          const message =
            err instanceof Error ? err.message : 'خطأ أثناء حفظ الدرجات';
          errors.push(`فشل حفظ الدرجات: ${message}`);
        }
      }
      try {
        await this.gradesService.syncPublishedAcademicProgress(
          Array.from(affectedStudentIds),
        );
      } catch (syncErr: unknown) {
        const message =
          syncErr instanceof Error
            ? syncErr.message
            : 'تعذر تحديث التقدم الأكاديمي';
        errors.push(`تنبيه تحديث السجل الأكاديمي: ${message}`);
      }
    }

    return { successCount, errors };
  }
}
