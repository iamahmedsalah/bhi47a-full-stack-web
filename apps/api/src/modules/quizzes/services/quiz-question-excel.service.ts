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
}
