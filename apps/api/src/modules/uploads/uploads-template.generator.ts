import * as ExcelJS from 'exceljs';
import * as JSZipLib from 'jszip';

const JSZip = (JSZipLib as any).default || JSZipLib;

export interface TemplateDefinition {
  type: string;
  filenameAr: string;
  filenameEn: string;
  sheetNameAr: string;
  sheetNameEn: string;
  headersAr: string[];
  headersEn: string[];
  widths: number[];
  textColumns: number[]; // 1-indexed columns to format as Text (@)
  numberColumns: number[]; // 1-indexed columns to format as Number
  samplesAr: (string | number | boolean)[][];
  samplesEn: (string | number | boolean)[][];
}

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF0D9488' }, // Dark Teal #0D9488
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
  name: 'Segoe UI',
  size: 11,
  bold: true,
  color: { argb: 'FFFFFFFF' },
};

const SAMPLE_FONT: Partial<ExcelJS.Font> = {
  name: 'Segoe UI',
  size: 10,
  color: { argb: 'FF1F2937' },
};

const BORDER_STYLE: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
  left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
  bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
  right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
};

export const TEMPLATE_DEFINITIONS: Record<string, TemplateDefinition> = {
  students: {
    type: 'students',
    filenameAr: 'قالب_بيانات_الطلاب.xlsx',
    filenameEn: 'Students_Master_Data_Template.xlsx',
    sheetNameAr: 'بيانات الطلاب',
    sheetNameEn: 'Students Data',
    headersAr: [
      'كود الطالب',
      'الاسم بالكامل',
      'الاسم بالعربية',
      'الاسم بالإنجليزية',
      'الرقم القومي',
      'المستوى',
      'القسم',
      'البريد الأكاديمي',
      'السنة الدراسية',
      'الفصل الدراسي',
      'المجموعة',
      'السكشن',
      'رقم الجلوس',
      'لجنة الامتحان',
      'الدور',
      'المبنى',
      'تغيير كلمة المرور عند الدخول',
    ],
    headersEn: [
      'studentCode',
      'fullName',
      'fullNameAr',
      'fullNameEn',
      'nationalId',
      'level',
      'department',
      'academicEmail',
      'academicYear',
      'semester',
      'group',
      'section',
      'seatNumber',
      'examRoom',
      'examFloor',
      'examBuilding',
      'mustChangePassword',
    ],
    widths: [
      16, 28, 26, 26, 20, 12, 22, 28, 16, 14, 12, 12, 14, 16, 12, 14, 26,
    ],
    textColumns: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
    numberColumns: [],
    samplesAr: [
      [
        '202601',
        'أحمد محمد علي حسن',
        'أحمد محمد علي حسن',
        'Ahmed Mohamed Ali Hassan',
        '30205151234567',
        '1',
        'نظم معلومات الأعمال',
        '202601@bhi.edu.eg',
        '2026-2027',
        'first',
        'أ',
        '1',
        '101',
        'مدرج أ',
        '1',
        'المبنى الرئيسي',
        'false',
      ],
      [
        '202602',
        'سارة محمود إبراهيم',
        'سارة محمود إبراهيم',
        'Sara Mahmoud Ibrahim',
        '30308221234568',
        '1',
        'نظم معلومات الأعمال',
        '202602@bhi.edu.eg',
        '2026-2027',
        'first',
        'أ',
        '1',
        '102',
        'مدرج أ',
        '1',
        'المبنى الرئيسي',
        'false',
      ],
      [
        '202603',
        'عمر خالد عبد الرحمن',
        'عمر خالد عبد الرحمن',
        'Omar Khaled Abdelrahman',
        '30111051234569',
        '2',
        'المحاسبة والتمويل',
        '202603@bhi.edu.eg',
        '2026-2027',
        'first',
        'ب',
        '2',
        '205',
        'قاعة 201',
        '2',
        'مبنى الامتحانات',
        'false',
      ],
    ],
    samplesEn: [
      [
        '202601',
        'Ahmed Mohamed Ali Hassan',
        'أحمد محمد علي حسن',
        'Ahmed Mohamed Ali Hassan',
        '30205151234567',
        '1',
        'Business Information Systems',
        '202601@bhi.edu.eg',
        '2026-2027',
        'first',
        'A',
        '1',
        '101',
        'Hall A',
        '1',
        'Main Building',
        'false',
      ],
      [
        '202602',
        'Sara Mahmoud Ibrahim',
        'سارة محمود إبراهيم',
        'Sara Mahmoud Ibrahim',
        '30308221234568',
        '1',
        'Business Information Systems',
        '202602@bhi.edu.eg',
        '2026-2027',
        'first',
        'A',
        '1',
        '102',
        'Hall A',
        '1',
        'Main Building',
        'false',
      ],
      [
        '202603',
        'Omar Khaled Abdelrahman',
        'عمر خالد عبد الرحمن',
        'Omar Khaled Abdelrahman',
        '30111051234569',
        '2',
        'Accounting & Finance',
        '202603@bhi.edu.eg',
        '2026-2027',
        'first',
        'B',
        '2',
        '205',
        'Room 201',
        '2',
        'Exam Center',
        'false',
      ],
    ],
  },

  courses: {
    type: 'courses',
    filenameAr: 'قالب_المقررات_الدراسية.xlsx',
    filenameEn: 'Courses_Catalog_Template.xlsx',
    sheetNameAr: 'المقررات الدراسية',
    sheetNameEn: 'Courses Catalog',
    headersAr: [
      'كود المقرر',
      'اسم المقرر',
      'اسم المقرر بالعربية',
      'اسم المقرر بالإنجليزية',
      'المستوى',
      'الفصل الدراسي',
      'القسم',
      'الساعات المعتمدة',
      'نوع المقرر',
      'المتطلبات السابقة',
      'المتطلبات المتزامنة',
      'المقررات المعادلة',
      'فصول الطرح',
      'الفصل الموصى به',
      'الحد الأدنى للمعدل',
      'أولوية التسجيل',
      'وصف المقرر',
      'توزيع الخطة حسب القسم',
    ],
    headersEn: [
      'courseCode',
      'courseName',
      'courseNameAr',
      'courseNameEn',
      'level',
      'semester',
      'department',
      'creditHours',
      'type',
      'prerequisites',
      'coRequisites',
      'equivalentCourses',
      'offeredTerms',
      'recommendedSemester',
      'minimumGpa',
      'registrationPriority',
      'description',
      'programCurricula',
    ],
    widths: [
      16, 30, 28, 28, 12, 16, 24, 16, 18, 22, 20, 20, 20, 18, 18, 16, 34, 52,
    ],
    textColumns: [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 17, 18],
    numberColumns: [8, 14, 15, 16],
    samplesAr: [
      [
        'CS101',
        'مقدمة في نظم المعلومات',
        'مقدمة في نظم المعلومات',
        'Intro to Information Systems',
        '1',
        'first',
        'نظم معلومات الأعمال',
        3,
        'required',
        '',
        '',
        '',
        'first, summer',
        1,
        2.0,
        1,
        'مقرر تمهيدي في أساسيات نظم وتقنية المعلومات',
      ],
      [
        'CS102',
        'مقدمة في البرمجة',
        'مقدمة في البرمجة',
        'Introduction to Programming',
        '1',
        'first',
        'علوم الحاسب',
        3,
        'required',
        '',
        '',
        '',
        'first',
        1,
        2.0,
        1,
        'مبادئ البرمجة المنظمة والتفكير الخوارزمي',
      ],
      [
        'CS201',
        'هياكل البيانات والخوارزميات',
        'هياكل البيانات والخوارزميات',
        'Data Structures & Algorithms',
        '2',
        'second',
        'علوم الحاسب',
        3,
        'required',
        'CS102',
        '',
        '',
        'second, summer',
        4,
        2.0,
        2,
        'دراسة القوائم والأشجار وجداول التجزئة والخوارزميات',
      ],
    ],
    samplesEn: [
      [
        'CS101',
        'Intro to Information Systems',
        'مقدمة في نظم المعلومات',
        'Intro to Information Systems',
        '1',
        'first',
        'Business Information Systems',
        3,
        'required',
        '',
        '',
        '',
        'first, summer',
        1,
        2.0,
        1,
        'Introductory concepts in modern information systems',
      ],
      [
        'CS102',
        'Introduction to Programming',
        'مقدمة في البرمجة',
        'Introduction to Programming',
        '1',
        'first',
        'Computer Science',
        3,
        'required',
        '',
        '',
        '',
        'first',
        1,
        2.0,
        1,
        'Fundamental structured programming & algorithm design',
      ],
      [
        'CS201',
        'Data Structures & Algorithms',
        'هياكل البيانات والخوارزميات',
        'Data Structures & Algorithms',
        '2',
        'second',
        'Computer Science',
        3,
        'required',
        'CS102',
        '',
        '',
        'second, summer',
        4,
        2.0,
        2,
        'Advanced abstract data structures, trees, graphs, and sorting',
      ],
    ],
  },

  grades: {
    type: 'grades',
    filenameAr: 'قالب_رصد_الدرجات.xlsx',
    filenameEn: 'Student_Grades_Template.xlsx',
    sheetNameAr: 'نتائج ورصد الدرجات',
    sheetNameEn: 'Student Grades',
    headersAr: [
      'كود الطالب',
      'كود المقرر',
      'نوع الامتحان',
      'الدرجة',
      'الدرجة العظمى',
      'أعمال السنة',
      'الميدترم',
      'العملي / الشفوي',
      'الامتحان النهائي',
      'المجموع الكلي',
      'حالة الحضور',
      'السنة الدراسية',
      'الفصل الدراسي',
    ],
    headersEn: [
      'studentCode',
      'courseCode',
      'examType',
      'grade',
      'maxGrade',
      'coursework',
      'midterm',
      'practical',
      'final',
      'total',
      'status',
      'academicYear',
      'semester',
    ],
    widths: [16, 16, 16, 14, 16, 14, 14, 16, 16, 16, 16, 18, 16],
    textColumns: [1, 2, 3, 11, 12, 13],
    numberColumns: [4, 5, 6, 7, 8, 9, 10],
    samplesAr: [
      [
        '202601',
        'CS101',
        'midterm',
        18.5,
        20,
        18,
        18.5,
        10,
        50,
        86.5,
        'present',
        '2026-2027',
        'first',
      ],
      [
        '202602',
        'CS101',
        'final',
        54,
        60,
        19,
        19,
        10,
        54,
        92,
        'present',
        '2026-2027',
        'first',
      ],
      [
        '202603',
        'CS101',
        'final',
        0,
        60,
        0,
        0,
        0,
        0,
        0,
        'absent',
        '2026-2027',
        'first',
      ],
    ],
    samplesEn: [
      [
        '202601',
        'CS101',
        'midterm',
        18.5,
        20,
        18,
        18.5,
        10,
        50,
        86.5,
        'present',
        '2026-2027',
        'first',
      ],
      [
        '202602',
        'CS101',
        'final',
        54,
        60,
        19,
        19,
        10,
        54,
        92,
        'present',
        '2026-2027',
        'first',
      ],
      [
        '202603',
        'CS101',
        'final',
        0,
        60,
        0,
        0,
        0,
        0,
        0,
        'absent',
        '2026-2027',
        'first',
      ],
    ],
  },

  quizzes: {
    type: 'quizzes',
    filenameAr: 'قالب_الكويزات.xlsx',
    filenameEn: 'Course_Quizzes_Template.xlsx',
    sheetNameAr: 'الكويزات والتكليفات',
    sheetNameEn: 'Course Quizzes',
    headersAr: [
      'كود الطالب',
      'كود المقرر',
      'رقم الكويز',
      'عنوان الكويز',
      'الدرجة',
      'الدرجة العظمى',
      'السنة الدراسية',
      'الفصل الدراسي',
    ],
    headersEn: [
      'studentCode',
      'courseCode',
      'quizNumber',
      'title',
      'grade',
      'maxGrade',
      'academicYear',
      'semester',
    ],
    widths: [16, 16, 14, 26, 14, 16, 18, 16],
    textColumns: [1, 2, 4, 7, 8],
    numberColumns: [3, 5, 6],
    samplesAr: [
      [
        '202601',
        'CS101',
        1,
        'كويز الأسبوع الثالث',
        9.5,
        10,
        '2026-2027',
        'first',
      ],
      [
        '202602',
        'CS101',
        1,
        'كويز الأسبوع الثالث',
        10,
        10,
        '2026-2027',
        'first',
      ],
      [
        '202603',
        'CS101',
        1,
        'كويز الأسبوع الثالث',
        8,
        10,
        '2026-2027',
        'first',
      ],
    ],
    samplesEn: [
      ['202601', 'CS101', 1, 'Week 3 Quiz', 9.5, 10, '2026-2027', 'first'],
      ['202602', 'CS101', 1, 'Week 3 Quiz', 10, 10, '2026-2027', 'first'],
      ['202603', 'CS101', 1, 'Week 3 Quiz', 8, 10, '2026-2027', 'first'],
    ],
  },

  attendance: {
    type: 'attendance',
    filenameAr: 'قالب_سجلات_الحضور.xlsx',
    filenameEn: 'Attendance_Logs_Template.xlsx',
    sheetNameAr: 'سجلات الحضور',
    sheetNameEn: 'Attendance Logs',
    headersAr: [
      'كود الطالب',
      'المحاضرات الكلية',
      'المحاضرات الحاضرة',
      'المحاضرات الغائبة',
      'السنة الدراسية',
      'الفصل الدراسي',
    ],
    headersEn: [
      'studentCode',
      'totalLectures',
      'attendedLectures',
      'absenceLectures',
      'academicYear',
      'semester',
    ],
    widths: [16, 20, 20, 20, 18, 16],
    textColumns: [1, 5, 6],
    numberColumns: [2, 3, 4],
    samplesAr: [
      ['202601', 14, 13, 1, '2026-2027', 'first'],
      ['202602', 14, 14, 0, '2026-2027', 'first'],
      ['202603', 14, 10, 4, '2026-2027', 'first'],
    ],
    samplesEn: [
      ['202601', 14, 13, 1, '2026-2027', 'first'],
      ['202602', 14, 14, 0, '2026-2027', 'first'],
      ['202603', 14, 10, 4, '2026-2027', 'first'],
    ],
  },

  'academic-emails': {
    type: 'academic-emails',
    filenameAr: 'قالب_البريد_الأكاديمي.xlsx',
    filenameEn: 'Academic_Emails_Template.xlsx',
    sheetNameAr: 'البريد الأكاديمي',
    sheetNameEn: 'Academic Emails',
    headersAr: ['كود الطالب', 'اسم الطالب', 'البريد الأكاديمي', 'الحالة'],
    headersEn: ['studentCode', 'studentName', 'academicEmail', 'status'],
    widths: [16, 30, 32, 16],
    textColumns: [1, 2, 3, 4],
    numberColumns: [],
    samplesAr: [
      ['202601', 'أحمد محمد علي', 's202601@bhi.edu.eg', 'active'],
      ['202602', 'سارة محمود إبراهيم', 's202602@bhi.edu.eg', 'active'],
      ['202603', 'عمر خالد عبد الرحمن', 's202603@bhi.edu.eg', 'active'],
    ],
    samplesEn: [
      ['202601', 'Ahmed Mohamed Ali', 's202601@bhi.edu.eg', 'active'],
      ['202602', 'Sara Mahmoud Ibrahim', 's202602@bhi.edu.eg', 'active'],
      ['202603', 'Omar Khaled Abdelrahman', 's202603@bhi.edu.eg', 'active'],
    ],
  },
};

export class UploadsTemplateGenerator {
  public static async generate(
    type: string,
    lang: 'ar' | 'en' = 'ar',
  ): Promise<{ buffer: Buffer; filename: string }> {
    const isArabic = lang === 'ar';
    const def = TEMPLATE_DEFINITIONS[type];
    if (!def) {
      throw new Error(`Unknown template type: ${type}`);
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BHI Student Portal';
    workbook.created = new Date();

    const sheetName = isArabic ? def.sheetNameAr : def.sheetNameEn;
    const sheet = workbook.addWorksheet(sheetName, {
      views: [{ rightToLeft: isArabic }],
    });

    const headers = isArabic ? def.headersAr : def.headersEn;
    const headerRow = sheet.addRow(headers);
    headerRow.height = 28;

    headerRow.eachCell((cell) => {
      cell.fill = HEADER_FILL;
      cell.font = HEADER_FONT;
      cell.alignment = {
        vertical: 'middle',
        horizontal: isArabic ? 'right' : 'left',
      };
      cell.border = BORDER_STYLE;
    });

    const samples = isArabic ? def.samplesAr : def.samplesEn;
    samples.forEach((rowValues) => {
      const row = sheet.addRow(rowValues);
      row.height = 22;
      row.eachCell((cell, colNumber) => {
        cell.font = SAMPLE_FONT;
        cell.border = BORDER_STYLE;
        cell.alignment = {
          vertical: 'middle',
          horizontal: isArabic ? 'right' : 'left',
        };

        if (def.textColumns.includes(colNumber)) {
          cell.numFmt = '@'; // Force text format to preserve leading zeroes
        } else if (def.numberColumns.includes(colNumber)) {
          cell.numFmt = '#,##0.00';
        }
      });
    });

    sheet.columns = def.widths.map((w) => ({ width: w }));

    const raw = await workbook.xlsx.writeBuffer();
    const filename = isArabic ? def.filenameAr : def.filenameEn;

    return {
      buffer: Buffer.from(raw),
      filename,
    };
  }

  public static async generateZipBundle(
    lang: 'ar' | 'en' = 'ar',
  ): Promise<{ buffer: Buffer; filename: string }> {
    const isArabic = lang === 'ar';
    const zip = new JSZip();

    const types = Object.keys(TEMPLATE_DEFINITIONS);
    for (let i = 0; i < types.length; i++) {
      const type = types[i];
      const { buffer, filename } = await this.generate(type, lang);
      const prefix = String(i + 1).padStart(2, '0');
      zip.file(`${prefix}_${filename}`, buffer);
    }

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });

    const filename = isArabic
      ? 'حزمة_نماذج_إكسيل_بوابة_الطلاب.zip'
      : 'Student_Portal_Excel_Templates_Bundle.zip';

    return {
      buffer: zipBuffer,
      filename,
    };
  }
}
