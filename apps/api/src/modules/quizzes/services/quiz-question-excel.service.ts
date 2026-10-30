import { BadRequestException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
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
      rows = await this.parseCsv(fileBuffer);
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

      const optA = this.cleanString(row.option_a ?? row['الخيار أ'] ?? row.a);
      const optB = this.cleanString(row.option_b ?? row['الخيار ب'] ?? row.b);
      const optC = this.cleanString(row.option_c ?? row['الخيار ج'] ?? row.c);
      const optD = this.cleanString(row.option_d ?? row['الخيار د'] ?? row.d);
      const rawAnswer = this.cleanString(
        row.correct_answer ?? row['الإجابة الصحيحة'] ?? row.answer,
      );

      if (!rawAnswer) {
        errors.push(
          `السطر ${rowNum}: الإجابة الصحيحة (correct_answer) مطلوبة.`,
        );
        return;
      }

      const pointsRaw = this.cleanString(
        row.points ?? row['الدرجات'] ?? row['الدرجة'],
      );
      const points = pointsRaw === '' ? 1 : Number(pointsRaw);
      if (!Number.isFinite(points) || points < 0.5) {
        errors.push(
          `Row / السطر ${rowNum}: points must be at least 0.5 / الدرجة لا تقل عن 0.5.`,
        );
        return;
      }

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
    const headers = [
      'question_text',
      'type',
      'option_a',
      'option_b',
      'option_c',
      'option_d',
      'correct_answer',
      'points',
      'instructions',
    ];
    const instructions = [
      [
        'Start / البداية',
        'Edit only Quiz Questions Template. Keep headers and delete sample questions. One question per row.',
        'عدّل ورقة Quiz Questions Template فقط. احتفظ بالعناوين واحذف الأسئلة النموذجية. سؤال واحد في كل صف.',
      ],
      [
        'MCQ',
        'Set type=MCQ. Fill all four options. correct_answer is A/B/C/D. B means option_b (the second option).',
        'اكتب MCQ في type وأدخل الخيارات الأربعة. الإجابة A/B/C/D؛ الحرف B يعني option_b أي الخيار الثاني.',
      ],
      [
        'TF: T',
        'Set type=TF, option_a=True, option_b=False; leave option_c/d blank. correct_answer=T or True means true (option_a).',
        'اكتب TF في type وTrue في option_a وFalse في option_b واترك الخيارين الآخرين فارغين. T أو True في correct_answer تعني صح (الخيار الأول).',
      ],
      [
        'TF: F',
        'For type=TF, correct_answer=F or False means false (option_b). T/F belong in correct_answer, not type.',
        'للسؤال TF اكتب F أو False في correct_answer للإجابة خطأ (الخيار الثاني). T وF للإجابة وليسا لنوع السؤال.',
      ],
      [
        'Points / الدرجات',
        'Use a positive points value (at least 0.5). A blank points cell defaults to 1.',
        'أدخل درجة موجبة لا تقل عن 0.5؛ الخانة الفارغة درجتها 1.',
      ],
      [
        'Upload / الرفع',
        'A valid file replaces ALL questions in the editor. Re-uploading does not append. Save the quiz to apply. Files with row errors leave existing questions unchanged.',
        'الملف الصالح يستبدل جميع أسئلة المحرر ولا يضيف إليها عند إعادة الرفع. احفظ الاختبار لتطبيق التحديث. عند وجود أخطاء لا تتغير الأسئلة الحالية.',
      ],
      [
        'CSV',
        'Keep the header first. The instructions column is guidance only and is ignored during import. Quoted commas and multiline text are supported.',
        'احتفظ بالعناوين في الصف الأول. عمود instructions للإرشاد ولا يتم استيراده. يمكن استخدام الفواصل والنص متعدد الأسطر داخل علامات الاقتباس.',
      ],
    ];
    const rows = [
      [
        'ما هو بروتوكول تصفح الويب الآمن؟',
        'MCQ',
        'HTTP',
        'HTTPS',
        'FTP',
        'SMTP',
        'B',
        2,
        instructions[1].slice(1).join(' / '),
      ],
      [
        'JavaScript can run in a browser and on a server.',
        'TF',
        'True',
        'False',
        '',
        '',
        'T',
        1,
        instructions[2].slice(1).join(' / '),
      ],
      [
        'The number 2 is greater than 5.',
        'TF',
        'True',
        'False',
        '',
        '',
        'F',
        1,
        instructions[3].slice(1).join(' / '),
      ],
    ];

    if (format === 'csv') {
      const escapeCsv = (value: string | number) => {
        const text = String(value ?? '');
        return /[,"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      };
      // Instructions remain in columns, never prose rows that could be mistaken for questions.
      const csv = [headers, ...rows]
        .map((row) => row.map(escapeCsv).join(','))
        .join('\r\n');
      return {
        buffer: Buffer.from('\uFEFF' + csv, 'utf-8'),
        contentType: 'text/csv; charset=utf-8',
        filename: 'quiz-questions-template.csv',
      };
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Quiz Questions Template', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    sheet.columns = headers.map((header, index) => ({
      header,
      key: header,
      width: index === 0 ? 50 : index === 8 ? 85 : 22,
    }));
    rows.forEach((row) => sheet.addRow(row));
    sheet.getCell('B1').note =
      'MCQ = multiple choice / اختيار متعدد. TF = true or false / صح أو خطأ.';
    sheet.getCell('G1').note =
      'MCQ: A/B/C/D (B = option_b). TF: T=True=option_a; F=False=option_b.';
    const help = workbook.addWorksheet('Instructions');
    help.columns = [
      { header: 'Topic / الموضوع', width: 25 },
      { header: 'English instructions', width: 85 },
      { header: 'التعليمات بالعربية', width: 85 },
    ];
    instructions.forEach((row) => {
      const added = help.addRow(row);
      added.height = 75;
      added.alignment = { wrapText: true, vertical: 'middle' };
    });
    for (const tab of [sheet, help]) {
      const header = tab.getRow(1);
      header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      header.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0D9488' },
      };
      header.alignment = { vertical: 'middle', horizontal: 'center' };
      header.height = 28;
    }
    const buffer = await workbook.xlsx.writeBuffer();
    return {
      buffer: Buffer.from(buffer),
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
    const sheet =
      workbook.getWorksheet('Quiz Questions Template') ||
      workbook.worksheets.find((tab) => tab.name !== 'Instructions');
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

  private async parseCsv(buffer: Buffer): Promise<Record<string, unknown>[]> {
    const text = buffer.toString('utf-8').replace(/^\uFEFF/, '');
    const header = text.split(/\r?\n/, 1)[0];
    const delimiter = header.includes('\t')
      ? '\t'
      : header.includes(';')
        ? ';'
        : ',';
    const workbook = new ExcelJS.Workbook();
    let sheet: ExcelJS.Worksheet;
    try {
      sheet = await workbook.csv.read(Readable.from([text]), {
        map: (value: string) => value,
        parserOptions: { delimiter, ignoreEmpty: true, trim: true },
      });
    } catch {
      throw new BadRequestException(
        'Invalid CSV quoting or columns / تنسيق CSV غير صالح',
      );
    }
    const headers = (sheet.getRow(1).values as ExcelJS.CellValue[])
      .slice(1)
      .map((value) => this.cleanString(value).toLowerCase());
    const rows: Record<string, unknown>[] = [];
    sheet.eachRow((row, index) => {
      if (index === 1) return;
      const record: Record<string, unknown> = {};
      headers.forEach((key, column) => {
        if (key) record[key] = row.getCell(column + 1).value ?? '';
      });
      rows.push(record);
    });
    return rows;
  }

  async generateQuizAnalysisExcel(
    quiz: {
      title: string;
      titleAr?: string;
      courseCode: string;
      courseName?: string;
      courseNameAr?: string;
      totalMarks: number;
      passingMarks: number;
      durationMinutes?: number;
      creatorName?: string;
    },
    submissions: Array<{
      studentCode: string;
      studentName: string;
      studentNameAr?: string;
      studentNameEn?: string;
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

    const list = Array.isArray(submissions) ? submissions : [];
    const totalStudents = list.length;
    const passedCount = list.filter((s) => Boolean(s.isPassed)).length;
    const failedCount = totalStudents - passedCount;
    const passRate =
      totalStudents > 0 ? Math.round((passedCount / totalStudents) * 100) : 0;
    const scores = list.map((s) => (typeof s.score === 'number' ? s.score : 0));
    const avgScore =
      totalStudents > 0
        ? (scores.reduce((a, b) => a + b, 0) / totalStudents).toFixed(1)
        : '0';
    const maxScore =
      totalStudents > 0 && scores.length > 0 ? Math.max(...scores) : 0;

    // Distribution
    const excellentCount = list.filter((s) => (s.percentage ?? 0) >= 85).length;
    const veryGoodCount = list.filter(
      (s) => (s.percentage ?? 0) >= 75 && (s.percentage ?? 0) < 85,
    ).length;
    const goodCount = list.filter(
      (s) => (s.percentage ?? 0) >= 65 && (s.percentage ?? 0) < 75,
    ).length;
    const passCount = list.filter(
      (s) => (s.percentage ?? 0) >= 50 && (s.percentage ?? 0) < 65,
    ).length;
    const failBracketCount = list.filter(
      (s) => (s.percentage ?? 0) < 50,
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
      quiz.titleAr || quiz.title,
      'المقرر الدراسي:',
      `${quiz.courseCode} - ${quiz.courseNameAr || quiz.courseName || ''}`,
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
      { header: 'اسم الطالب (بالعربية)', key: 'studentNameAr', width: 34 },
      { header: 'اسم الطالب (بالإنجليزية)', key: 'studentNameEn', width: 34 },
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

    list.forEach((sub, i) => {
      const studentNameAr = sub.studentNameAr || sub.studentName || '—';
      const studentNameEn = sub.studentNameEn || sub.studentName || '—';
      const row = rosterSheet.addRow({
        seq: i + 1,
        studentCode: sub.studentCode,
        studentNameAr,
        studentNameEn,
        score: sub.score,
        totalMarks: sub.totalMarks,
        percentage: `${sub.percentage}%`,
        result: sub.isPassed ? 'ناجح' : 'راسب',
        submittedAt: sub.submittedAt
          ? new Date(sub.submittedAt).toLocaleString('ar-EG', {
              dateStyle: 'short',
              timeStyle: 'short',
              timeZone: 'Africa/Cairo',
            })
          : '—',
      });
      row.height = 22;
      row.alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell('studentNameAr').alignment = {
        vertical: 'middle',
        horizontal: 'right',
      };
      row.getCell('studentNameEn').alignment = {
        vertical: 'middle',
        horizontal: 'left',
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
    const safeTitle = (quiz.title || 'quiz').replace(/[/\\?%*:|"<>]/g, '_');
    return {
      buffer,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `quiz-analysis-${safeTitle}.xlsx`,
    };
  }
}
