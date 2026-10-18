import { BadRequestException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { QuizQuestion, QuestionType } from '../schemas/quiz.schema';

export interface ParsedQuestionRow {
  rowNum: number;
  question: QuizQuestion;
}

export interface ParseQuestionsResult {
  questions: QuizQuestion[];
  errors: string[];
  totalRows: number;
  validCount: number;
}

@Injectable()
export class QuizQuestionExcelService {
  /**
   * Parse an uploaded buffer (.xlsx, .xls, .csv) into validated QuizQuestion objects.
   */
  async parseQuestionsFile(
    fileBuffer: Buffer,
    originalFilename: string,
  ): Promise<ParseQuestionsResult> {
    const ext = (originalFilename.split('.').pop() || '').toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      throw new BadRequestException(
        'صيغة الملف غير مدعومة. يجب رفع ملف Excel (.xlsx, .xls) أو CSV (.csv)',
      );
    }

    let rows: Record<string, any>[] = [];
    if (ext === 'csv') {
      rows = this.parseCsv(fileBuffer);
    } else {
      rows = await this.parseExcel(fileBuffer);
    }

    if (rows.length === 0) {
      throw new BadRequestException(
        'الملف المرفوع فارغ أو لا يحتوي على صفوف بيانات',
      );
    }

    const errors: string[] = [];
    const questions: QuizQuestion[] = [];

    rows.forEach((row, index) => {
      const rowNum = index + 2; // Row 1 is header
      const questionText = this.cleanString(
        row.question_text || row['نص السؤال'] || row.question || row.text,
      );

      if (!questionText) {
        errors.push(`السطر ${rowNum}: نص السؤال (question_text) مطلوب.`);
        return;
      }

      const rawType = this.cleanString(
        row.type || row['نوع السؤال'] || row['النوع'] || row.question_type,
      ).toUpperCase();

      let questionType: QuestionType = 'mcq';
      if (
        rawType === 'TF' ||
        rawType === 'TRUE_FALSE' ||
        rawType === 'TRUE/FALSE' ||
        rawType === 'صح_خطأ' ||
        rawType === 'صح أو خطأ'
      ) {
        questionType = 'true_false';
      } else if (
        rawType === 'MCQ' ||
        rawType === 'MULTIPLE_CHOICE' ||
        rawType === 'اختيار من متعدد'
      ) {
        questionType = 'mcq';
      } else {
        errors.push(
          `السطر ${rowNum}: نوع السؤال "${rawType}" غير صالح. الأنواع المدعومة: MCQ أو TF.`,
        );
        return;
      }

      const optA = this.cleanString(row.option_a || row['الخيار أ'] || row.a);
      const optB = this.cleanString(row.option_b || row['الخيار ب'] || row.b);
      const optC = this.cleanString(row.option_c || row['الخيار ج'] || row.c);
      const optD = this.cleanString(row.option_d || row['الخيار د'] || row.d);
      const rawAnswer = this.cleanString(
        row.correct_answer || row['الإجابة الصحيحة'] || row.answer,
      );

      if (!rawAnswer) {
        errors.push(
          `السطر ${rowNum}: الإجابة الصحيحة (correct_answer) مطلوبة.`,
        );
        return;
      }

      const pointsRaw = row.points || row['الدرجات'] || row['الدرجة'];
      const points =
        pointsRaw !== undefined &&
        !isNaN(Number(pointsRaw)) &&
        Number(pointsRaw) > 0
          ? Number(pointsRaw)
          : 1;

      if (questionType === 'true_false') {
        const optionA = optA || 'صح';
        const optionB = optB || 'خطأ';
        const options = [optionA, optionB];

        let correctIndex = -1;
        const normAns = rawAnswer.toLowerCase();
        if (
          normAns === 'a' ||
          normAns === 'true' ||
          normAns === 't' ||
          normAns === '1' ||
          normAns === 'صح' ||
          normAns === optionA.toLowerCase()
        ) {
          correctIndex = 0;
        } else if (
          normAns === 'b' ||
          normAns === 'false' ||
          normAns === 'f' ||
          normAns === '2' ||
          normAns === 'خطأ' ||
          normAns === optionB.toLowerCase()
        ) {
          correctIndex = 1;
        } else {
          errors.push(
            `السطر ${rowNum}: إجابة سؤال الصح والخطأ "${rawAnswer}" غير صحيحة. يجب أن تكون True أو False (أو A / B أو صح / خطأ).`,
          );
          return;
        }

        questions.push({
          id: `q_${Date.now()}_${index + 1}`,
          text: questionText,
          type: 'true_false',
          options,
          correctOptionIndex: correctIndex,
          points,
        });
      } else {
        // MCQ: 4 options required
        if (!optA || !optB || !optC || !optD) {
          errors.push(
            `السطر ${rowNum}: أسئلة الاختيار من متعدد (MCQ) تتطلب إدخال جميع الخيارات الأربعة (option_a, option_b, option_c, option_d).`,
          );
          return;
        }

        const options = [optA, optB, optC, optD];
        let correctIndex = -1;
        const normAns = rawAnswer.toUpperCase();

        if (normAns === 'A' || normAns === '1') correctIndex = 0;
        else if (normAns === 'B' || normAns === '2') correctIndex = 1;
        else if (normAns === 'C' || normAns === '3') correctIndex = 2;
        else if (normAns === 'D' || normAns === '4') correctIndex = 3;
        else {
          // Check if matches option text directly
          const matched = options.findIndex(
            (o) => o.trim().toLowerCase() === rawAnswer.trim().toLowerCase(),
          );
          if (matched !== -1) {
            correctIndex = matched;
          }
        }

        if (correctIndex === -1) {
          errors.push(
            `السطر ${rowNum}: الإجابة الصحيحة "${rawAnswer}" لا تطابق أياً من الخيارات (A, B, C, D) ولا تطابق نص أحد الخيارات.`,
          );
          return;
        }

        questions.push({
          id: `q_${Date.now()}_${index + 1}`,
          text: questionText,
          type: 'mcq',
          options,
          correctOptionIndex: correctIndex,
          points,
        });
      }
    });

    return {
      questions,
      errors,
      totalRows: rows.length,
      validCount: questions.length,
    };
  }

  /**
   * Generates a sample Excel or CSV template for bulk questions import.
   */
  async generateSampleTemplate(
    format: 'xlsx' | 'csv' = 'xlsx',
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    if (format === 'csv') {
      const headers = [
        'question_text',
        'type',
        'option_a',
        'option_b',
        'option_c',
        'option_d',
        'correct_answer',
        'points',
      ];
      const escapeCsv = (val: any) => {
        const str = String(val ?? '');
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };
      const rows = [
        [
          'ما هو البروتوكول المستخدم لتصفح صفحات الويب الآمنة؟',
          'MCQ',
          'HTTP',
          'HTTPS',
          'FTP',
          'SMTP',
          'B',
          '2',
        ],
        [
          'لغة JavaScript تعمل في متصفح الويب وعلى الخادم بواسطة Node.js.',
          'TF',
          'True',
          'False',
          '',
          '',
          'True',
          '1',
        ],
        [
          'أي من العناصر التالية ليس نوع بيانات أولي في TypeScript؟',
          'MCQ',
          'string',
          'number',
          'Interface',
          'boolean',
          'C',
          '2',
        ],
      ];
      const headerLine = headers.map(escapeCsv).join(',');
      const rowLines = rows.map((r) => r.map(escapeCsv).join(','));
      // UTF-8 BOM (\uFEFF) ensures Excel on Windows correctly detects UTF-8 Arabic text
      const csvContent = '\uFEFF' + [headerLine, ...rowLines].join('\r\n');
      return {
        buffer: Buffer.from(csvContent, 'utf-8'),
        contentType: 'text/csv; charset=utf-8',
        filename: 'quiz-questions-template.csv',
      };
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Quiz Questions Template');

    sheet.columns = [
      { header: 'question_text', key: 'question_text', width: 45 },
      { header: 'type', key: 'type', width: 12 },
      { header: 'option_a', key: 'option_a', width: 25 },
      { header: 'option_b', key: 'option_b', width: 25 },
      { header: 'option_c', key: 'option_c', width: 25 },
      { header: 'option_d', key: 'option_d', width: 25 },
      { header: 'correct_answer', key: 'correct_answer', width: 16 },
      { header: 'points', key: 'points', width: 10 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0D9488' }, // Teal
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Sample rows
    sheet.addRow({
      question_text: 'ما هو البروتوكول المستخدم لتصفح صفحات الويب الآمنة؟',
      type: 'MCQ',
      option_a: 'HTTP',
      option_b: 'HTTPS',
      option_c: 'FTP',
      option_d: 'SMTP',
      correct_answer: 'B',
      points: 2,
    });

    sheet.addRow({
      question_text:
        'لغة JavaScript تعمل في متصفح الويب وعلى الخادم بواسطة Node.js.',
      type: 'TF',
      option_a: 'True',
      option_b: 'False',
      option_c: '',
      option_d: '',
      correct_answer: 'True',
      points: 1,
    });

    sheet.addRow({
      question_text: 'أي من العناصر التالية ليس نوع بيانات أولي في TypeScript؟',
      type: 'MCQ',
      option_a: 'string',
      option_b: 'number',
      option_c: 'Interface',
      option_d: 'boolean',
      correct_answer: 'C',
      points: 2,
    });

    const uint8Array = await workbook.xlsx.writeBuffer();
    return {
      buffer: Buffer.from(uint8Array),
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: 'quiz-questions-template.xlsx',
    };
  }

  private cleanString(val: any): string {
    if (val === null || val === undefined) return '';
    return String(val).trim();
  }

  private async parseExcel(buffer: Buffer): Promise<Record<string, any>[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount <= 1) return [];

    const rows: Record<string, any>[] = [];
    let headers: string[] = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        const values = row.values as any[];
        headers = (Array.isArray(values) ? values.slice(1) : []).map((v) =>
          this.cleanString(v).toLowerCase(),
        );
        return;
      }

      const values = row.values as any[];
      if (!Array.isArray(values)) return;

      const rowData: Record<string, any> = {};
      let hasData = false;
      headers.forEach((h, idx) => {
        if (!h) return;
        const cell = values[idx + 1];
        if (cell !== undefined && cell !== null && String(cell).trim() !== '') {
          hasData = true;
          rowData[h] = typeof cell === 'object' && cell.text ? cell.text : cell;
        }
      });

      if (hasData) {
        rows.push(rowData);
      }
    });

    return rows;
  }

  private parseCsv(buffer: Buffer): Record<string, any>[] {
    const text = buffer.toString('utf-8');
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length <= 1) return [];

    const headers = lines[0].split(/[,;\t]/).map((h) =>
      this.cleanString(h)
        .replace(/^["']|["']$/g, '')
        .toLowerCase(),
    );

    const rows: Record<string, any>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i]
        .split(/[,;\t]/)
        .map((p) => this.cleanString(p).replace(/^["']|["']$/g, ''));
      if (parts.some((p) => p.length > 0)) {
        const rowData: Record<string, any> = {};
        headers.forEach((h, idx) => {
          if (h) rowData[h] = parts[idx] ?? '';
        });
        rows.push(rowData);
      }
    }
    return rows;
  }

  async generateQuizAnalysisExcel(
    quiz: {
      title: string;
      courseCode: string;
      courseName?: string;
      totalMarks: number;
      passingMarks: number;
      durationMinutes?: number;
      creatorName?: string;
    },
    submissions: Array<{
      studentCode: string;
      studentName: string;
      score: number;
      totalMarks: number;
      percentage: number;
      isPassed: boolean;
      submittedAt: Date;
    }>,
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BH47A Student Portal';
    workbook.created = new Date();

    const totalStudents = submissions.length;
    const passedCount = submissions.filter((s) => s.isPassed).length;
    const failedCount = totalStudents - passedCount;
    const passRate =
      totalStudents > 0 ? Math.round((passedCount / totalStudents) * 100) : 0;
    const scores = submissions.map((s) => s.score);
    const avgScore =
      totalStudents > 0
        ? (scores.reduce((a, b) => a + b, 0) / totalStudents).toFixed(1)
        : '0';
    const maxScore = totalStudents > 0 ? Math.max(...scores) : 0;

    // Distribution
    const excellentCount = submissions.filter((s) => s.percentage >= 85).length;
    const veryGoodCount = submissions.filter(
      (s) => s.percentage >= 75 && s.percentage < 85,
    ).length;
    const goodCount = submissions.filter(
      (s) => s.percentage >= 65 && s.percentage < 75,
    ).length;
    const passCount = submissions.filter(
      (s) => s.percentage >= 50 && s.percentage < 65,
    ).length;
    const failBracketCount = submissions.filter(
      (s) => s.percentage < 50,
    ).length;

    // ── Sheet 1: Summary & Performance Analytics ──────────────────────
    const summarySheet = workbook.addWorksheet('تحليل الأداء والإحصائيات', {
      views: [{ rightToLeft: true }],
    });

    summarySheet.columns = [
      { width: 28 },
      { width: 32 },
      { width: 22 },
      { width: 22 },
      { width: 20 },
      { width: 20 },
    ];

    // Banner Title
    summarySheet.mergeCells('A1:F1');
    const titleCell = summarySheet.getCell('A1');
    titleCell.value =
      'المعهد العالي للعلوم الإدارية والتكنولوجيا - تقرير التحليل الشامل لأداء الاختبار';
    titleCell.font = {
      name: 'Calibri',
      size: 14,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0D9488' },
    };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    summarySheet.getRow(1).height = 36;

    // Info card block
    const addInfoRow = (
      rowNum: number,
      label1: string,
      val1: any,
      label2: string,
      val2: any,
    ) => {
      summarySheet.getCell(`A${rowNum}`).value = label1;
      summarySheet.getCell(`A${rowNum}`).font = {
        bold: true,
        color: { argb: 'FF334155' },
      };
      summarySheet.getCell(`A${rowNum}`).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' },
      };
      summarySheet.getCell(`B${rowNum}`).value = val1;
      summarySheet.getCell(`B${rowNum}`).font = { bold: true };

      summarySheet.getCell(`D${rowNum}`).value = label2;
      summarySheet.getCell(`D${rowNum}`).font = {
        bold: true,
        color: { argb: 'FF334155' },
      };
      summarySheet.getCell(`D${rowNum}`).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' },
      };
      summarySheet.getCell(`E${rowNum}`).value = val2;
      summarySheet.getCell(`E${rowNum}`).font = { bold: true };
      summarySheet.getRow(rowNum).height = 22;
    };

    addInfoRow(
      3,
      'عنوان الاختبار:',
      quiz.title,
      'المقرر الدراسي:',
      `${quiz.courseCode} - ${quiz.courseName || ''}`,
    );
    addInfoRow(
      4,
      'الدرجة الكلية:',
      quiz.totalMarks,
      'درجة النجاح:',
      `${quiz.passingMarks} (50%)`,
    );
    addInfoRow(
      5,
      'مدة الاختبار:',
      `${quiz.durationMinutes || 15} دقيقة`,
      'تاريخ إعداد التقرير:',
      new Date().toLocaleDateString('ar-EG'),
    );

    // Section 1 Header: KPIs
    summarySheet.mergeCells('A7:F7');
    const kpiHeader = summarySheet.getCell('A7');
    kpiHeader.value =
      'مؤشرات الأداء العامة لنتائج الطلاب (Key Performance Indicators)';
    kpiHeader.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
    kpiHeader.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F766E' },
    };
    kpiHeader.alignment = { vertical: 'middle', horizontal: 'center' };
    summarySheet.getRow(7).height = 28;

    // KPI Table Header
    const kpiTableHeaders = [
      'عدد الطلاب المشاركين',
      'عدد الطلاب الناجحين',
      'عدد الطلاب الراسبين',
      'نسبة النجاح',
      'متوسط الدرجات',
      'أعلى درجة',
    ];
    const kpiRow = summarySheet.getRow(8);
    kpiTableHeaders.forEach((th, i) => {
      const cell = kpiRow.getCell(i + 1);
      cell.value = th;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF14B8A6' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      };
    });
    kpiRow.height = 24;

    // KPI Values Row
    const kpiDataRow = summarySheet.getRow(9);
    const kpiValues = [
      totalStudents,
      `${passedCount} طالب`,
      `${failedCount} طالب`,
      `${passRate}%`,
      `${avgScore} / ${quiz.totalMarks}`,
      `${maxScore} / ${quiz.totalMarks}`,
    ];
    kpiValues.forEach((val, i) => {
      const cell = kpiDataRow.getCell(i + 1);
      cell.value = val;
      cell.font = { bold: true, size: 11 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      };
      if (i === 1) cell.font = { bold: true, color: { argb: 'FF16A34A' } };
      if (i === 2 && failedCount > 0)
        cell.font = { bold: true, color: { argb: 'FFDC2626' } };
      if (i === 3)
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE6FFFA' },
        };
    });
    kpiDataRow.height = 26;

    // Section 2 Header: Distribution
    summarySheet.mergeCells('A11:D11');
    const distHeader = summarySheet.getCell('A11');
    distHeader.value =
      'توزيع الدرجات والتقديرات الإحصائية (Score Distribution & Grade Tiers)';
    distHeader.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
    distHeader.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F766E' },
    };
    distHeader.alignment = { vertical: 'middle', horizontal: 'center' };
    summarySheet.getRow(11).height = 28;

    // Dist table header
    const distHeaders = [
      'التقدير والمستوى',
      'النطاق المئوي',
      'عدد الطلاب',
      'النسبة من الإجمالي',
    ];
    const distHeadRow = summarySheet.getRow(12);
    distHeaders.forEach((th, i) => {
      const cell = distHeadRow.getCell(i + 1);
      cell.value = th;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF14B8A6' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      };
    });
    distHeadRow.height = 24;

    const distRows = [
      [
        'ممتاز (Excellent)',
        '85% فأكثر',
        excellentCount,
        totalStudents > 0
          ? `${Math.round((excellentCount / totalStudents) * 100)}%`
          : '0%',
      ],
      [
        'جيد جداً (Very Good)',
        '75% إلى 84%',
        veryGoodCount,
        totalStudents > 0
          ? `${Math.round((veryGoodCount / totalStudents) * 100)}%`
          : '0%',
      ],
      [
        'جيد (Good)',
        '65% إلى 74%',
        goodCount,
        totalStudents > 0
          ? `${Math.round((goodCount / totalStudents) * 100)}%`
          : '0%',
      ],
      [
        'مقبول (Pass)',
        '50% إلى 64%',
        passCount,
        totalStudents > 0
          ? `${Math.round((passCount / totalStudents) * 100)}%`
          : '0%',
      ],
      [
        'راسب (Fail)',
        'أقل من 50%',
        failBracketCount,
        totalStudents > 0
          ? `${Math.round((failBracketCount / totalStudents) * 100)}%`
          : '0%',
      ],
    ];

    distRows.forEach((r, idx) => {
      const row = summarySheet.getRow(13 + idx);
      r.forEach((val, cIdx) => {
        const cell = row.getCell(cIdx + 1);
        cell.value = val;
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin' },
          bottom: { style: 'thin' },
          left: { style: 'thin' },
          right: { style: 'thin' },
        };
        if (idx === 4 && failBracketCount > 0) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFEE2E2' },
          };
          cell.font = { color: { argb: 'FFDC2626' }, bold: true };
        } else if (idx === 0 && excellentCount > 0) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFDCFCE7' },
          };
          cell.font = { color: { argb: 'FF15803D' }, bold: true };
        }
      });
      row.height = 22;
    });

    // ── Sheet 2: Submissions Roster ──────────────────────────────────
    const rosterSheet = workbook.addWorksheet('قائمة تسليمات الطلاب', {
      views: [{ rightToLeft: true }],
    });

    rosterSheet.columns = [
      { header: 'م', key: 'seq', width: 6 },
      { header: 'كود الطالب', key: 'studentCode', width: 16 },
      { header: 'اسم الطالب', key: 'studentName', width: 34 },
      { header: 'الدرجة المحققة', key: 'score', width: 16 },
      { header: 'الدرجة الكلية', key: 'totalMarks', width: 16 },
      { header: 'النسبة المئوية', key: 'percentage', width: 16 },
      { header: 'النتيجة', key: 'result', width: 14 },
      { header: 'تاريخ ووقت التسليم', key: 'submittedAt', width: 24 },
    ];

    const rosterHeaderRow = rosterSheet.getRow(1);
    rosterHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    rosterHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0D9488' },
    };
    rosterHeaderRow.alignment = { vertical: 'middle', horizontal: 'center' };
    rosterHeaderRow.height = 26;

    submissions.forEach((sub, i) => {
      const row = rosterSheet.addRow({
        seq: i + 1,
        studentCode: sub.studentCode,
        studentName: sub.studentName,
        score: sub.score,
        totalMarks: sub.totalMarks,
        percentage: `${sub.percentage}%`,
        result: sub.isPassed ? 'ناجح' : 'راسب',
        submittedAt: sub.submittedAt
          ? new Date(sub.submittedAt).toLocaleString('ar-EG', {
              dateStyle: 'short',
              timeStyle: 'short',
            })
          : '—',
      });
      row.height = 22;
      row.alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell('studentName').alignment = {
        vertical: 'middle',
        horizontal: 'right',
      };

      const resultCell = row.getCell('result');
      if (sub.isPassed) {
        resultCell.font = { color: { argb: 'FF16A34A' }, bold: true };
        resultCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFDCFCE7' },
        };
      } else {
        resultCell.font = { color: { argb: 'FFDC2626' }, bold: true };
        resultCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFEE2E2' },
        };
      }

      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          bottom: { style: 'thin' },
          left: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
    });

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const safeTitle = quiz.title.replace(/[/\\?%*:|"<>]/g, '_');
    return {
      buffer,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `quiz-analysis-${safeTitle}.xlsx`,
    };
  }
}
