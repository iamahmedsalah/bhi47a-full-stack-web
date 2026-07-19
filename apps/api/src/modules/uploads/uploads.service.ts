import { BadRequestException, Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { AppLoggerService } from '../../core/logger/logger.service';
import type { Importer } from './importer.interface';
import { normalizeRowKeys } from './upload-utils';
import { StudentImporter } from './importers/student.importer';
import { CourseImporter } from './importers/course.importer';
import { GradeImporter } from './importers/grade.importer';
import { QuizImporter } from './importers/quiz.importer';
import { AttendanceImporter } from './importers/attendance.importer';
import { AcademicEmailImporter } from './importers/academic-email.importer';

const MAX_UPLOAD_ROWS = 5000;

/**
 * Thin orchestrator that delegates import work to type-specific importers.
 *
 * Responsibilities:
 * 1. Parse the uploaded Excel/CSV buffer.
 * 2. Normalize header keys (bilingual).
 * 3. Route to the correct importer based on the `type` parameter.
 * 4. Return a unified result with success/error counts.
 */
@Injectable()
export class UploadsService {
  private readonly importerMap: Map<string, Importer>;

  constructor(
    private readonly logger: AppLoggerService,
    studentImporter: StudentImporter,
    courseImporter: CourseImporter,
    gradeImporter: GradeImporter,
    quizImporter: QuizImporter,
    attendanceImporter: AttendanceImporter,
    academicEmailImporter: AcademicEmailImporter,
  ) {
    const importers: Importer[] = [
      studentImporter,
      courseImporter,
      gradeImporter,
      quizImporter,
      attendanceImporter,
      academicEmailImporter,
    ];
    this.importerMap = new Map(importers.map((imp) => [imp.type, imp]));
  }

  async processUpload(fileBuffer: Buffer, type: string, adminId: string) {
    const importer = this.importerMap.get(type);
    if (!importer) {
      throw new BadRequestException('Unknown upload type');
    }

    this.logger.log(
      `Processing upload file of type: ${type}`,
      'UploadsService',
    );

    const rows = this.parseWorkbook(fileBuffer);
    const { validRows, errors: validationErrors } = importer.validate(rows);
    const commitResult = await importer.commit(validRows, adminId);

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
  }

  private parseWorkbook(fileBuffer: Buffer): Record<string, unknown>[] {
    const workbook = XLSX.read(fileBuffer, {
      type: 'buffer',
      cellFormula: false,
      cellHTML: false,
    });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new BadRequestException(
        'Uploaded workbook does not contain sheets',
      );
    }
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(sheet);
    if (rawData.length > MAX_UPLOAD_ROWS) {
      throw new BadRequestException(
        `Uploaded file exceeds the ${MAX_UPLOAD_ROWS} row limit`,
      );
    }
    if (rawData.length === 0) {
      throw new BadRequestException('الملف المرفوع فارغ');
    }
    return rawData.map((r) => normalizeRowKeys(r as Record<string, unknown>));
  }
}
