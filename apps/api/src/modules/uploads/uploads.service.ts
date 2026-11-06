import { Types } from 'mongoose';
import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import * as ExcelJS from 'exceljs';
import * as JSZipLib from 'jszip';
const JSZip = (JSZipLib as any).default || JSZipLib;
import { AppLoggerService } from '../../core/logger/logger.service';
import type { Importer } from './importer.interface';
import { normalizeRowKeys, unwrapExcelCellValue } from './upload-utils';
import { StudentImporter } from './importers/student.importer';
import { CourseImporter } from './importers/course.importer';
import { GradeImporter } from './importers/grade.importer';
import { QuizImporter } from './importers/quiz.importer';
import { AttendanceImporter } from './importers/attendance.importer';
import { AcademicEmailImporter } from './importers/academic-email.importer';
import { AcademicWarningImporter } from './importers/academic-warning.importer';

const MAX_UPLOAD_ROWS = 5000;

/**
 * Orchestrator for data uploads and data reset / clean operations.
 *
 * Responsibilities:
 * 1. Parse Excel (.xlsx) via ExcelJS and CSV buffers securely without xlsx vulnerabilities.
 * 2. Normalize header keys (bilingual).
 * 3. Route to the correct importer based on the `type` parameter.
 * 4. Provide data wipe/reset capabilities for admins before fresh imports.
 */
@Injectable()
export class UploadsService {
  private readonly importerMap: Map<string, Importer>;

  constructor(
    private readonly logger: AppLoggerService,
    @InjectConnection() private readonly connection: Connection,
    studentImporter: StudentImporter,
    courseImporter: CourseImporter,
    gradeImporter: GradeImporter,
    quizImporter: QuizImporter,
    attendanceImporter: AttendanceImporter,
    academicEmailImporter: AcademicEmailImporter,
    academicWarningImporter: AcademicWarningImporter,
  ) {
    const importers: Importer[] = [
      studentImporter,
      courseImporter,
      gradeImporter,
      quizImporter,
      attendanceImporter,
      academicEmailImporter,
      academicWarningImporter,
    ];
    this.importerMap = new Map(importers.map((imp) => [imp.type, imp]));
  }

  async processUpload(
    fileBuffer: Buffer,
    type: string,
    adminId: string,
    sourceFile?: string,
  ) {
    const importer = this.importerMap.get(type);
    if (!importer) {
      throw new BadRequestException('Unknown upload type');
    }

    this.logger.log(
      `Processing upload file of type: ${type}`,
      'UploadsService',
    );

    const rows = await this.parseWorkbook(fileBuffer);
    try {
      await this.assertReusedIdentity(rows, type);
      const { validRows, errors: validationErrors } = importer.validate(rows);
      const commitResult = await importer.commit(validRows, adminId, {
        sourceFile,
        batchId: new Types.ObjectId().toString(),
      });

      const errors = [...validationErrors, ...commitResult.errors];
      const { successCount } = commitResult;

      this.logger.log(
        `Upload process finished: ${successCount} succeeded, ${errors.length} failed`,
        'UploadsService',
      );

      return {
        success: true,
        successCount,
        failedCount: errors.length,
        errors,
      };
    } catch (err: unknown) {
      if (err instanceof HttpException) {
        throw err;
      }
      const message =
        err instanceof Error ? err.message : 'حدث خطأ أثناء معالجة البيانات';
      this.logger.warn(
        `Unhandled error in processUpload(${type}): ${message}`,
        'UploadsService',
      );
      return {
        success: false,
        successCount: 0,
        failedCount: rows.length || 1,
        errors: [`فشل معالجة الملف: ${message}`],
      };
    }
  }

  async processBatchUpload(
    dto: {
      type: string;
      rows: Record<string, unknown>[];
      batchIndex?: number;
      totalBatches?: number;
      uploadSessionId?: string;
      sourceFile?: string;
      rowOffset?: number;
    },
    adminId: string,
  ) {
    const importer = this.importerMap.get(dto.type);
    if (!importer) {
      throw new BadRequestException('Unknown upload type');
    }

    if (!Array.isArray(dto.rows) || dto.rows.length === 0) {
      return {
        success: true,
        batchIndex: dto.batchIndex ?? 0,
        totalBatches: dto.totalBatches ?? 1,
        successCount: 0,
        failedCount: 0,
        errors: [],
      };
    }

    this.logger.log(
      `Processing batch ${(dto.batchIndex ?? 0) + 1}/${dto.totalBatches ?? 1} for ${dto.type} (${dto.rows.length} rows)`,
      'UploadsService',
    );

    try {
      // Normalize keys on incoming rows in case of Arabic/English variations
      const normalizedRows = dto.rows.map((row) => normalizeRowKeys(row));
      await this.assertReusedIdentity(normalizedRows, dto.type);

      const { validRows, errors: validationErrors } =
        importer.validate(normalizedRows);
      const commitResult = await importer.commit(validRows, adminId, {
        sourceFile: dto.sourceFile,
        batchId: dto.uploadSessionId,
        batchIndex: dto.batchIndex,
        rowOffset: dto.rowOffset,
      });

      const errors = [...validationErrors, ...commitResult.errors];
      const { successCount } = commitResult;

      return {
        success: true,
        batchIndex: dto.batchIndex ?? 0,
        totalBatches: dto.totalBatches ?? 1,
        successCount,
        failedCount: errors.length,
        errors,
      };
    } catch (err: unknown) {
      if (err instanceof HttpException) {
        throw err;
      }
      const message =
        err instanceof Error ? err.message : 'حدث خطأ أثناء معالجة الدفعة';
      this.logger.warn(
        `Unhandled error in processBatchUpload(${dto.type}): ${message}`,
        'UploadsService',
      );
      return {
        success: false,
        batchIndex: dto.batchIndex ?? 0,
        totalBatches: dto.totalBatches ?? 1,
        successCount: 0,
        failedCount: dto.rows.length,
        errors: [`فشل معالجة الدفعة: ${message}`],
      };
    }
  }

  async getWipeSummary() {
    const db = this.connection.db;
    if (!db) {
      throw new BadRequestException('Database connection is not available');
    }

    const [
      studentsCount,
      gradesCount,
      attendanceCount,
      registrationsCount,
      advisingCasesCount,
      quizzesCount,
      complaintsCount,
    ] = await Promise.all([
      db.collection('users').countDocuments({ role: 'student' }),
      db.collection('grades').countDocuments({}),
      db.collection('attendance').countDocuments({}),
      db.collection('course_registrations').countDocuments({}),
      db.collection('advising_cases').countDocuments({}),
      db.collection('course_quizzes').countDocuments({}),
      db.collection('complaints').countDocuments({}),
    ]);

    return {
      studentsCount,
      gradesCount,
      attendanceCount,
      registrationsCount,
      advisingCasesCount,
      quizzesCount,
      complaintsCount,
    };
  }

  /** A code alone no longer identifies a historical person after explicit reuse. */
  async assertReusedIdentity(rows: Record<string, unknown>[], type: string) {
    const token = (value: unknown) =>
      typeof value === 'string' || typeof value === 'number'
        ? String(value).trim()
        : '';
    if (type === 'students' || type === 'courses') return;
    const codes = [
      ...new Set(rows.map((row) => token(row.studentCode)).filter(Boolean)),
    ];
    if (!codes.length) return;
    const db = this.connection.db!;
    const reused = await db
      .collection('student_code_registry')
      .find(
        {
          studentCode: { $in: codes },
          'assignmentHistory.1': { $exists: true },
        },
        { projection: { studentCode: 1, currentStudentId: 1 } },
      )
      .limit(Math.min(codes.length, 10000))
      .toArray();
    for (const entry of reused) {
      for (const row of rows.filter(
        (item) => token(item.studentCode) === entry.studentCode,
      )) {
        const explicitId = row.studentId ?? row.userId;
        const matches =
          entry.currentStudentId &&
          ((explicitId &&
            token(explicitId) === String(entry.currentStudentId)) ||
            (row.nationalId &&
              (await db.collection('users').findOne(
                {
                  _id: entry.currentStudentId as Types.ObjectId,
                  role: 'student',
                  nationalId: token(row.nationalId),
                },
                { projection: { _id: 1 } },
              ))));
        if (!matches)
          throw new BadRequestException({
            code: 'CODE_REUSED_IDENTITY_REQUIRED',
            message:
              'الكود اتعاد استخدامه. أضف معرّف حساب الطالب الحالي أو رقمه القومي بجانب الكود علشان ملف قديم ما يغيّرش بيانات طالب جديد.',
          });
      }
    }
  }

  async wipeData(
    target:
      'students' | 'grades' | 'quizzes' | 'attendance' | 'complaints' | 'all',
    adminId: string,
  ) {
    const db = this.connection.db;
    if (!db) {
      throw new BadRequestException('Database connection is not available');
    }

    this.logger.warn(
      `Admin ${adminId} initiated data wipe for: ${target}`,
      'UploadsService',
    );
    const result: Record<string, number> = {};

    if (target === 'complaints') {
      const deletedComplaints = await db
        .collection('complaints')
        .deleteMany({});
      result.complaints = deletedComplaints.deletedCount;
      return { success: true, target, deletedCounts: result };
    }

    if (target === 'grades') {
      const deletedGrades = await db.collection('grades').deleteMany({});
      result.grades = deletedGrades.deletedCount;
      return { success: true, target, deletedCounts: result };
    }

    if (target === 'quizzes') {
      const deletedQuizzes = await db
        .collection('course_quizzes')
        .deleteMany({});
      result.quizzes = deletedQuizzes.deletedCount;
      return { success: true, target, deletedCounts: result };
    }

    if (target === 'attendance') {
      const deletedAttendance = await db
        .collection('attendance')
        .deleteMany({});
      result.attendance = deletedAttendance.deletedCount;
      return { success: true, target, deletedCounts: result };
    }

    if (target === 'students' || target === 'all') {
      const students = await db
        .collection('users')
        .find(
          { role: 'student' },
          { projection: { _id: 1, studentCode: 1, email: 1 } },
        )
        .toArray();
      const studentIds = students.map((s) => s._id);
      const studentCodes = students.map((s) => s.studentCode).filter(Boolean);

      const advisingCases = await db
        .collection('advising_cases')
        .find({ studentId: { $in: studentIds } }, { projection: { _id: 1 } })
        .toArray();
      const caseIds = advisingCases.map((c) => c._id);

      const advisingPlans = await db
        .collection('advising_plans')
        .find({ studentId: { $in: studentIds } }, { projection: { _id: 1 } })
        .toArray();
      const planIds = advisingPlans.map((p) => p._id);

      const [
        delUsers,
        delProfiles,
        delAcademicProfiles,
        delGrades,
        delQuizzes,
        delAttendance,
        delRegistrations,
        delCases,
        delPlans,
        _delGraphs,
        _delNotes,
        _delAuditLogs,
        _delRecommendations,
        _delRequests,
        delEmails,
      ] = await Promise.all([
        db.collection('users').deleteMany({
          role: 'student',
          $or: [
            { _id: { $in: studentIds } },
            { studentCode: { $in: studentCodes } },
          ],
        }),
        db
          .collection('student_profiles')
          .deleteMany({ userId: { $in: studentIds } }),
        db
          .collection('student_academic_profiles')
          .deleteMany({ studentId: { $in: studentIds } }),
        db.collection('grades').deleteMany({ studentId: { $in: studentIds } }),
        db
          .collection('course_quizzes')
          .deleteMany({ studentId: { $in: studentIds } }),
        db
          .collection('attendance')
          .deleteMany({ studentId: { $in: studentIds } }),
        db
          .collection('course_registrations')
          .deleteMany({ studentId: { $in: studentIds } }),
        db
          .collection('advising_cases')
          .deleteMany({ studentId: { $in: studentIds } }),
        db.collection('advising_plans').deleteMany({
          $or: [{ studentId: { $in: studentIds } }, { _id: { $in: planIds } }],
        }),
        db
          .collection('advising_graphs')
          .deleteMany({ planId: { $in: planIds } }),
        db
          .collection('advising_notes')
          .deleteMany({ advisingCaseId: { $in: caseIds } }),
        db
          .collection('advising_audit_logs')
          .deleteMany({ advisingCaseId: { $in: caseIds } }),
        db.collection('course_recommendations').deleteMany({
          $or: [
            { studentId: { $in: studentIds } },
            { advisingCaseId: { $in: caseIds } },
          ],
        }),
        db
          .collection('academic_advising_requests')
          .deleteMany({ studentId: { $in: studentIds } }),
        db
          .collection('academic_emails')
          .deleteMany({ studentId: { $in: studentIds } }),
      ]);

      // Cleanup notifications
      await db
        .collection('notifications')
        .deleteMany({ targetStudentId: { $in: studentIds } });
      await db.collection('notifications').updateMany({}, {
        $pull: {
          readBy: { userId: { $in: studentIds } },
          hiddenBy: { userId: { $in: studentIds } },
        },
      } as any);

      result.students = delUsers.deletedCount;
      result.studentProfiles = delProfiles.deletedCount;
      result.academicProfiles = delAcademicProfiles.deletedCount;
      result.grades = delGrades.deletedCount;
      result.quizzes = delQuizzes.deletedCount;
      result.attendance = delAttendance.deletedCount;
      result.registrations = delRegistrations.deletedCount;
      result.advisingCases = delCases.deletedCount;
      result.advisingPlans = delPlans.deletedCount;
      result.academicEmails = delEmails.deletedCount;

      this.logger.log(
        `Student data wipe completed: ${delUsers.deletedCount} students removed`,
        'UploadsService',
      );
      return { success: true, target, deletedCounts: result };
    }

    return { success: false, message: 'No action taken' };
  }

  private decodeXml(str: string): string {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
  }

  private async normalizeZipXml(fileBuffer: Buffer): Promise<Buffer> {
    try {
      const zip = await JSZip.loadAsync(fileBuffer);
      let modified = false;

      const fileNames = Object.keys(zip.files);
      for (const fileName of fileNames) {
        const file = zip.files[fileName];
        if (!file || file.dir) continue;

        const normalizedName = fileName.replace(/\\/g, '/');
        if (
          normalizedName.endsWith('.xml') ||
          normalizedName.endsWith('.rels')
        ) {
          const content = await file.async('string');
          const stripped = content.replace(
            /<(\/)?([a-zA-Z0-9_-]+):([a-zA-Z0-9_-]+)([\s>])/g,
            '<$1$3$4',
          );
          if (stripped !== content || normalizedName !== fileName) {
            if (normalizedName !== fileName) {
              zip.remove(fileName);
            }
            zip.file(normalizedName, stripped);
            modified = true;
          }
        } else if (normalizedName !== fileName) {
          const data = await file.async('uint8array');
          zip.remove(fileName);
          zip.file(normalizedName, data);
          modified = true;
        }
      }

      if (modified) {
        return await zip.generateAsync({
          type: 'nodebuffer',
          compression: 'DEFLATE',
        });
      }
    } catch {
      // Fall through to original buffer
    }
    return fileBuffer;
  }

  private async parseZipWorksheetFallback(
    fileBuffer: Buffer,
  ): Promise<Record<string, unknown>[]> {
    const zip = await JSZip.loadAsync(fileBuffer);

    // 1. Shared strings
    const sharedStrings: string[] = [];
    const sharedStringsFile =
      zip.file(/xl\/sharedStrings\.xml$/i)[0] ||
      zip.file(/sharedStrings\.xml$/i)[0];
    if (sharedStringsFile) {
      const ssXml = await sharedStringsFile.async('string');
      const siMatches = ssXml.match(/<si\b[\s\S]*?<\/si>/gi) || [];
      for (const si of siMatches) {
        const tMatches = (si.match(/<t\b[^>]*>([\s\S]*?)<\/t>/gi) ||
          []) as string[];
        const str = tMatches
          .map((m: string) => m.replace(/<[^>]+>/g, ''))
          .join('');
        sharedStrings.push(this.decodeXml(str));
      }
    }

    // 2. Worksheet
    const sheetFiles = Object.keys(zip.files).filter((k) =>
      /xl\/worksheets\/sheet\d+\.xml$/i.test(k.replace(/\\/g, '/')),
    );
    const targetSheetKey =
      sheetFiles[0] ||
      Object.keys(zip.files).find((k) => /sheet\d+\.xml$/i.test(k));
    if (!targetSheetKey) {
      throw new BadRequestException(
        'الملف المرفوع لا يحتوي على صفحات عمل صالحة',
      );
    }

    const sheetXml = await zip.files[targetSheetKey].async('string');
    const rowMatches = sheetXml.match(/<row\b[\s\S]*?<\/row>/gi) || [];
    if (rowMatches.length === 0) {
      throw new BadRequestException(
        'الملف المرفوع فارغ أو لا يحتوي على صفوف بيانات',
      );
    }

    const colIndexFromRef = (ref: string): number => {
      const letters = ref.replace(/[^A-Za-z]/g, '').toUpperCase();
      let index = 0;
      for (let i = 0; i < letters.length; i++) {
        index = index * 26 + (letters.charCodeAt(i) - 64);
      }
      return index > 0 ? index - 1 : 0;
    };

    let headers: string[] = [];
    const rows: Record<string, unknown>[] = [];

    for (
      let rIdx = 0;
      rIdx < rowMatches.length && rows.length < MAX_UPLOAD_ROWS;
      rIdx++
    ) {
      const rowXml = rowMatches[rIdx];
      const cellMatches =
        rowXml.match(/<c\b[\s\S]*?<\/c>|<c\b[^>]*\/>/gi) || [];
      const rowValues: string[] = [];

      for (const cellXml of cellMatches) {
        const rMatch = cellXml.match(/\br="([A-Za-z0-9]+)"/i);
        const cellRef = rMatch ? rMatch[1] : '';
        const colIdx = cellRef ? colIndexFromRef(cellRef) : rowValues.length;

        const tMatch = cellXml.match(/\bt="([a-zA-Z0-9]+)"/i);
        const cellType = tMatch ? tMatch[1] : '';

        let val = '';
        if (cellType === 's') {
          const vMatch = cellXml.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i);
          if (vMatch) {
            const ssIdx = parseInt(vMatch[1].trim(), 10);
            val = sharedStrings[ssIdx] ?? '';
          }
        } else if (cellType === 'inlineStr') {
          const tMatches = (cellXml.match(/<t\b[^>]*>([\s\S]*?)<\/t>/gi) ||
            []) as string[];
          val = this.decodeXml(
            tMatches.map((m: string) => m.replace(/<[^>]+>/g, '')).join(''),
          );
        } else {
          const vMatch = cellXml.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i);
          val = vMatch ? this.decodeXml(vMatch[1].trim()) : '';
        }

        rowValues[colIdx] = val.trim();
      }

      if (rIdx === 0) {
        headers = rowValues.map((v) => (v ? v.trim() : ''));
      } else {
        const rowData: Record<string, unknown> = {};
        let hasData = false;
        headers.forEach((header, index) => {
          if (!header) return;
          const cellVal = rowValues[index] ?? '';
          if (cellVal !== '') {
            hasData = true;
            rowData[header] = cellVal;
          } else {
            rowData[header] = '';
          }
        });
        if (hasData) {
          rows.push(normalizeRowKeys(rowData));
        }
      }
    }

    if (rows.length === 0) {
      throw new BadRequestException(
        'الملف المرفوع فارغ أو لا يحتوي على بيانات صالحة',
      );
    }

    return rows;
  }

  private parseXmlSpreadsheet(xmlText: string): Record<string, unknown>[] {
    const rowMatches = xmlText.match(/<Row\b[\s\S]*?<\/Row>/gi) || [];
    if (rowMatches.length === 0) {
      throw new BadRequestException('الملف المرفوع فارغ أو غير صالح');
    }

    let headers: string[] = [];
    const rows: Record<string, unknown>[] = [];

    for (
      let rIdx = 0;
      rIdx < rowMatches.length && rows.length < MAX_UPLOAD_ROWS;
      rIdx++
    ) {
      const rowXml = rowMatches[rIdx];
      const cellMatches =
        rowXml.match(/<Cell\b[\s\S]*?<\/Cell>|<Cell\b[^>]*\/>/gi) || [];
      const rowValues = cellMatches.map((cellXml) => {
        const dataMatch = cellXml.match(/<Data\b[^>]*>([\s\S]*?)<\/Data>/i);
        return dataMatch ? this.decodeXml(dataMatch[1].trim()) : '';
      });

      if (rIdx === 0) {
        headers = rowValues.map((v) => v.trim());
      } else {
        const rowData: Record<string, unknown> = {};
        let hasData = false;
        headers.forEach((header, index) => {
          if (!header) return;
          const cellVal = rowValues[index] ?? '';
          if (cellVal !== '') {
            hasData = true;
            rowData[header] = cellVal;
          } else {
            rowData[header] = '';
          }
        });
        if (hasData) {
          rows.push(normalizeRowKeys(rowData));
        }
      }
    }

    if (rows.length === 0) {
      throw new BadRequestException('الملف المرفوع فارغ أو غير صالح');
    }

    return rows;
  }

  private async parseWorkbook(
    fileBuffer: Buffer,
  ): Promise<Record<string, unknown>[]> {
    const isZipArchive =
      fileBuffer.length >= 2 &&
      fileBuffer[0] === 0x50 &&
      fileBuffer[1] === 0x4b; // 'PK'

    // 1. Binary Excel (.xlsx)
    if (isZipArchive) {
      const cleanBuffer = await this.normalizeZipXml(fileBuffer);
      try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(cleanBuffer as any);
        const worksheet = workbook.worksheets[0];
        if (worksheet && worksheet.rowCount > 0) {
          const rows: Record<string, unknown>[] = [];
          let headers: string[] = [];

          worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) {
              const values = row.values as unknown[];
              headers = (Array.isArray(values) ? values.slice(1) : []).map(
                (v) => String(unwrapExcelCellValue(v) ?? '').trim(),
              );
              return;
            }

            if (rows.length >= MAX_UPLOAD_ROWS) return;

            const values = row.values as unknown[];
            if (!Array.isArray(values)) return;

            const rowData: Record<string, unknown> = {};
            let hasData = false;

            headers.forEach((header, index) => {
              if (!header) return;
              const unwrapped = unwrapExcelCellValue(values[index + 1]);
              if (
                unwrapped !== null &&
                unwrapped !== undefined &&
                String(unwrapped).trim() !== ''
              ) {
                hasData = true;
                rowData[header] =
                  typeof unwrapped === 'string' ? unwrapped.trim() : unwrapped;
              } else {
                rowData[header] = '';
              }
            });

            if (hasData) {
              rows.push(normalizeRowKeys(rowData));
            }
          });

          if (rows.length > 0) {
            return rows;
          }
        }
      } catch (excelError: any) {
        this.logger.warn(
          `ExcelJS load failed (${excelError?.message || excelError}), falling back to raw zip worksheet parser`,
          'UploadsService',
        );
      }

      // Fallback: parse raw zip worksheet directly
      return await this.parseZipWorksheetFallback(fileBuffer);
    }

    // 2. XML Spreadsheet 2003 format
    const text = fileBuffer.toString('utf-8').replace(/^\uFEFF/, '');
    if (text.includes('<Workbook') || text.includes('<?xml')) {
      return this.parseXmlSpreadsheet(text);
    }

    // 3. Plain text CSV / TSV
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      throw new BadRequestException('الملف المرفوع فارغ أو غير صالح');
    }

    const headers = lines[0]
      .split(/[,;\t]/)
      .map((h) => h.trim().replace(/^["']|["']$/g, ''));

    const rows: Record<string, unknown>[] = [];
    for (let i = 1; i < lines.length && rows.length < MAX_UPLOAD_ROWS; i++) {
      const line = lines[i];
      const cells = line
        .split(/[,;\t]/)
        .map((c) => c.trim().replace(/^["']|["']$/g, ''));
      if (cells.some((c) => c.length > 0)) {
        const rowData: Record<string, unknown> = {};
        headers.forEach((header, index) => {
          if (header) {
            rowData[header] = cells[index] ?? '';
          }
        });
        rows.push(normalizeRowKeys(rowData));
      }
    }

    if (rows.length === 0) {
      throw new BadRequestException('الملف المرفوع فارغ');
    }

    return rows;
  }
}
