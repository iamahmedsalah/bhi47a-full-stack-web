import api from '@/lib/api';
import type { PreFlightIssue, UploadCatalogConfig, UploadCatalogType } from './types';

export const UPLOAD_CATALOGS: Record<UploadCatalogType, UploadCatalogConfig> = {
  students: {
    id: 'students',
    titleAr: 'بيانات الطلاب الأساسية',
    titleEn: 'Students Master Data',
    descAr: 'استيراد وتحديث كود الطالب، الاسم، الرقم القومي، المستوى، القسم، ولجان الامتحان.',
    descEn: 'Import & update student codes, full names, national IDs, levels, departments, and exam seats.',
    fields: [
      {
        key: 'studentCode',
        labelAr: 'كود الطالب',
        labelEn: 'Student Code',
        required: true,
        type: 'string',
        note: '6 أرقام أو الكود المعتمد',
        aliases: ['studentcode', 'كود الطالب', 'الكود الأكاديمي', 'الكود', 'كود'],
      },
      {
        key: 'fullName',
        labelAr: 'الاسم بالكامل',
        labelEn: 'Full Name',
        required: true,
        type: 'string',
        note: 'ثلاثي أو رباعي',
        aliases: ['fullname', 'الاسم', 'الاسم بالكامل', 'اسم الطالب', 'name'],
      },
      {
        key: 'nationalId',
        labelAr: 'الرقم القومي',
        labelEn: 'National ID',
        required: true,
        type: 'string',
        note: '14 رقم قومي مصري',
        aliases: ['nationalid', 'الرقم القومي', 'القومي', 'بطاقة الرقم القومي'],
      },
      {
        key: 'level',
        labelAr: 'المستوى الدراسي',
        labelEn: 'Academic Level',
        required: true,
        type: 'string',
        note: '1 أو 2 أو 3 أو 4',
        aliases: ['level', 'المستوى', 'المستوى الدراسي', 'الفرقة'],
      },
      {
        key: 'department',
        labelAr: 'القسم العلمي',
        labelEn: 'Department',
        type: 'string',
        aliases: ['department', 'القسم', 'القسم العلمي', 'التخصص'],
      },
      {
        key: 'seatNumber',
        labelAr: 'رقم الجلوس',
        labelEn: 'Seat Number',
        type: 'string',
        aliases: ['seatnumber', 'رقم الجلوس', 'جلوس'],
      },
      {
        key: 'group',
        labelAr: 'المجموعة',
        labelEn: 'Group',
        type: 'string',
        aliases: ['group', 'المجموعة', 'الدفعة'],
      },
      {
        key: 'section',
        labelAr: 'السكشن',
        labelEn: 'Section',
        type: 'string',
        aliases: ['section', 'السكشن', 'الشعبة'],
      },
      {
        key: 'academicYear',
        labelAr: 'السنة الدراسية',
        labelEn: 'Academic Year',
        type: 'string',
        note: 'مثال: 2026-2027',
        aliases: ['academicyear', 'السنة الدراسية', 'العام الأكاديمي', 'العام الدراسي'],
      },
      {
        key: 'semester',
        labelAr: 'الفصل الدراسي',
        labelEn: 'Semester',
        type: 'enum',
        note: 'first / second / summer',
        aliases: ['semester', 'الفصل الدراسي', 'الترم'],
      },
      {
        key: 'mustChangePassword',
        labelAr: 'إلزام تغيير كلمة المرور',
        labelEn: 'Force Password Change',
        type: 'boolean',
        note: 'true أو false',
        aliases: ['mustchangepassword', 'forcepasswordchange', 'تغيير كلمة المرور عند الدخول'],
      },
    ],
    sampleDataAr: [
      {
        studentCode: '202601',
        fullName: 'أحمد محمد علي حسن',
        nationalId: '30205151234567',
        level: '1',
        department: 'نظم معلومات الأعمال',
        seatNumber: '101',
        group: 'أ',
        section: '1',
        academicYear: '2026-2027',
        semester: 'first',
        mustChangePassword: 'true',
      },
      {
        studentCode: '202602',
        fullName: 'سارة محمود إبراهيم',
        nationalId: '30308221234568',
        level: '1',
        department: 'نظم معلومات الأعمال',
        seatNumber: '102',
        group: 'أ',
        section: '1',
        academicYear: '2026-2027',
        semester: 'first',
        mustChangePassword: 'true',
      },
    ],
    sampleDataEn: [
      {
        studentCode: '202601',
        fullName: 'Ahmed Mohamed Ali',
        nationalId: '30205151234567',
        level: '1',
        department: 'Business Information Systems',
        seatNumber: '101',
        group: 'A',
        section: '1',
        academicYear: '2026-2027',
        semester: 'first',
        mustChangePassword: 'true',
      },
    ],
  },

  courses: {
    id: 'courses',
    titleAr: 'المقررات والمواد الدراسية',
    titleEn: 'Courses Catalog',
    descAr: 'استيراد المقررات الدراسية، الساعات المعتمدة، المتطلبات السابقة، وتصنيف المواد.',
    descEn: 'Import courses catalog, credit hours, prerequisites, and course categories.',
    fields: [
      {
        key: 'courseCode',
        labelAr: 'كود المقرر',
        labelEn: 'Course Code',
        required: true,
        type: 'string',
        aliases: ['coursecode', 'كود المادة', 'كود المقرر', 'رمز المادة', 'رمز المقرر', 'code'],
      },
      {
        key: 'courseName',
        labelAr: 'اسم المقرر',
        labelEn: 'Course Name',
        required: true,
        type: 'string',
        aliases: ['coursename', 'اسم المادة', 'المادة', 'اسم المقرر', 'المقرر', 'name'],
      },
      {
        key: 'level',
        labelAr: 'المستوى الدراسي',
        labelEn: 'Academic Level',
        required: true,
        type: 'string',
        aliases: ['level', 'المستوى', 'المستوى الدراسي', 'الفرقة'],
      },
      {
        key: 'semester',
        labelAr: 'الفصل الدراسي',
        labelEn: 'Semester',
        required: true,
        type: 'enum',
        aliases: ['semester', 'الفصل الدراسي', 'الترم'],
      },
      {
        key: 'creditHours',
        labelAr: 'الساعات المعتمدة',
        labelEn: 'Credit Hours',
        required: true,
        type: 'number',
        note: 'عادة 2 أو 3 ساعات',
        aliases: ['credithours', 'الساعات', 'الساعات المعتمدة', 'ساعات'],
      },
      {
        key: 'department',
        labelAr: 'القسم العلمي',
        labelEn: 'Department',
        type: 'string',
        aliases: ['department', 'القسم', 'القسم العلمي'],
      },
      {
        key: 'type',
        labelAr: 'نوع المقرر',
        labelEn: 'Course Type',
        type: 'string',
        note: 'required / elective',
        aliases: ['type', 'coursetype', 'نوع المقرر', 'نوع المادة'],
      },
      {
        key: 'prerequisites',
        labelAr: 'المتطلبات السابقة',
        labelEn: 'Prerequisites',
        type: 'string',
        note: 'أكواد مفصولة بفواصل مثل CS101, CS102',
        aliases: ['prerequisites', 'المتطلبات السابقة', 'المتطلب السابق'],
      },
    ],
    sampleDataAr: [
      {
        courseCode: 'CS101',
        courseName: 'مقدمة في نظم المعلومات',
        level: '1',
        semester: 'first',
        creditHours: 3,
        department: 'نظم معلومات الأعمال',
        type: 'required',
        prerequisites: '',
      },
    ],
    sampleDataEn: [
      {
        courseCode: 'CS101',
        courseName: 'Intro to Information Systems',
        level: '1',
        semester: 'first',
        creditHours: 3,
        department: 'Business Information Systems',
        type: 'required',
        prerequisites: '',
      },
    ],
  },

  grades: {
    id: 'grades',
    titleAr: 'نتائج ورصد الدرجات',
    titleEn: 'Student Grades',
    descAr: 'رصد درجات امتحانات الميدترم، النهائي، العملي، وحالات الحضور والغياب.',
    descEn: 'Upload midterm, final exam, and coursework grades along with attendance status.',
    fields: [
      {
        key: 'studentCode',
        labelAr: 'كود الطالب',
        labelEn: 'Student Code',
        required: true,
        type: 'string',
        aliases: ['studentcode', 'كود الطالب', 'الكود الأكاديمي', 'الكود'],
      },
      {
        key: 'courseCode',
        labelAr: 'كود المقرر',
        labelEn: 'Course Code',
        required: true,
        type: 'string',
        aliases: ['coursecode', 'كود المادة', 'كود المقرر', 'رمز المادة', 'code'],
      },
      {
        key: 'examType',
        labelAr: 'نوع الامتحان',
        labelEn: 'Exam Type',
        required: true,
        type: 'enum',
        note: 'midterm / final / practical',
        aliases: ['examtype', 'نوع الامتحان', 'نوع الاختبار'],
      },
      {
        key: 'grade',
        labelAr: 'الدرجة المحققة',
        labelEn: 'Score',
        required: true,
        type: 'number',
        aliases: ['grade', 'الدرجة', 'درجة'],
      },
      {
        key: 'maxGrade',
        labelAr: 'الدرجة العظمى',
        labelEn: 'Max Score',
        required: true,
        type: 'number',
        aliases: ['maxgrade', 'maxscore', 'max score', 'الدرجة العظمى', 'العظمى', 'أقصى درجة'],
      },
      {
        key: 'status',
        labelAr: 'حالة الحضور',
        labelEn: 'Attendance Status',
        type: 'enum',
        note: 'present / absent',
        aliases: ['status', 'حالة الحضور', 'الحالة'],
      },
      {
        key: 'academicYear',
        labelAr: 'السنة الدراسية',
        labelEn: 'Academic Year',
        required: true,
        type: 'string',
        aliases: ['academicyear', 'السنة الدراسية', 'العام الدراسي'],
      },
      {
        key: 'semester',
        labelAr: 'الفصل الدراسي',
        labelEn: 'Semester',
        required: true,
        type: 'enum',
        aliases: ['semester', 'الفصل الدراسي', 'الترم'],
      },
    ],
    sampleDataAr: [
      {
        studentCode: '202601',
        courseCode: 'CS101',
        examType: 'midterm',
        grade: 18.5,
        maxGrade: 20,
        status: 'present',
        academicYear: '2026-2027',
        semester: 'first',
      },
    ],
    sampleDataEn: [
      {
        studentCode: '202601',
        courseCode: 'CS101',
        examType: 'midterm',
        grade: 18.5,
        maxGrade: 20,
        status: 'present',
        academicYear: '2026-2027',
        semester: 'first',
      },
    ],
  },

  quizzes: {
    id: 'quizzes',
    titleAr: 'الكويزات والاختبارات الدورية',
    titleEn: 'Course Quizzes',
    descAr: 'استيراد درجات الكويزات الأسبوعية والتطبيقات العملية لكل مادة.',
    descEn: 'Upload weekly quiz scores, evaluations, and coursework.',
    fields: [
      {
        key: 'studentCode',
        labelAr: 'كود الطالب',
        labelEn: 'Student Code',
        required: true,
        type: 'string',
        aliases: ['studentcode', 'كود الطالب', 'الكود'],
      },
      {
        key: 'courseCode',
        labelAr: 'كود المقرر',
        labelEn: 'Course Code',
        required: true,
        type: 'string',
        aliases: ['coursecode', 'كود المادة', 'كود المقرر'],
      },
      {
        key: 'quizNumber',
        labelAr: 'رقم الكويز',
        labelEn: 'Quiz Number',
        required: true,
        type: 'number',
        aliases: ['quiznumber', 'رقم الكويز', 'الكويز'],
      },
      {
        key: 'title',
        labelAr: 'عنوان الكويز',
        labelEn: 'Quiz Title',
        type: 'string',
        aliases: ['title', 'عنوان الكويز', 'اسم الكويز'],
      },
      {
        key: 'grade',
        labelAr: 'الدرجة',
        labelEn: 'Score',
        required: true,
        type: 'number',
        aliases: ['grade', 'الدرجة'],
      },
      {
        key: 'maxGrade',
        labelAr: 'الدرجة العظمى',
        labelEn: 'Max Score',
        required: true,
        type: 'number',
        aliases: ['maxgrade', 'maxscore', 'max score', 'الدرجة العظمى'],
      },
      {
        key: 'academicYear',
        labelAr: 'السنة الدراسية',
        labelEn: 'Academic Year',
        required: true,
        type: 'string',
        aliases: ['academicyear', 'السنة الدراسية'],
      },
      {
        key: 'semester',
        labelAr: 'الفصل الدراسي',
        labelEn: 'Semester',
        required: true,
        type: 'enum',
        aliases: ['semester', 'الفصل الدراسي'],
      },
    ],
    sampleDataAr: [
      {
        studentCode: '202601',
        courseCode: 'CS101',
        quizNumber: 1,
        title: 'كويز الأسبوع الثالث',
        grade: 9.5,
        maxGrade: 10,
        academicYear: '2026-2027',
        semester: 'first',
      },
    ],
    sampleDataEn: [
      {
        studentCode: '202601',
        courseCode: 'CS101',
        quizNumber: 1,
        title: 'Week 3 Quiz',
        grade: 9.5,
        maxGrade: 10,
        academicYear: '2026-2027',
        semester: 'first',
      },
    ],
  },

  attendance: {
    id: 'attendance',
    titleAr: 'سجلات الحضور والغياب',
    titleEn: 'Attendance Logs',
    descAr: 'استيراد إحصائيات حضور المحاضرات والغياب للفصول الدراسية.',
    descEn: 'Upload lecture attendance and absence counts for academic terms.',
    fields: [
      {
        key: 'studentCode',
        labelAr: 'كود الطالب',
        labelEn: 'Student Code',
        required: true,
        type: 'string',
        aliases: ['studentcode', 'كود الطالب', 'الكود'],
      },
      {
        key: 'totalLectures',
        labelAr: 'المحاضرات الكلية',
        labelEn: 'Total Lectures',
        required: true,
        type: 'number',
        aliases: ['totallectures', 'المحاضرات الكلية', 'عدد المحاضرات', 'إجمالي المحاضرات'],
      },
      {
        key: 'attendedLectures',
        labelAr: 'المحاضرات الحاضرة',
        labelEn: 'Attended Lectures',
        required: true,
        type: 'number',
        aliases: ['attendedlectures', 'المحاضرات الحاضرة', 'حضور', 'مرات الحضور'],
      },
      {
        key: 'absenceLectures',
        labelAr: 'المحاضرات الغائبة',
        labelEn: 'Absence Lectures',
        required: false,
        type: 'number',
        aliases: ['absencelectures', 'المحاضرات الغائبة', 'غياب', 'مرات الغياب'],
      },
      {
        key: 'academicYear',
        labelAr: 'السنة الدراسية',
        labelEn: 'Academic Year',
        type: 'string',
        aliases: ['academicyear', 'السنة الدراسية'],
      },
      {
        key: 'semester',
        labelAr: 'الفصل الدراسي',
        labelEn: 'Semester',
        type: 'enum',
        aliases: ['semester', 'الفصل الدراسي'],
      },
    ],
    sampleDataAr: [
      {
        studentCode: '202601',
        totalLectures: 14,
        attendedLectures: 13,
        absenceLectures: 1,
        academicYear: '2026-2027',
        semester: 'first',
      },
    ],
    sampleDataEn: [
      {
        studentCode: '202601',
        totalLectures: 14,
        attendedLectures: 13,
        absenceLectures: 1,
        academicYear: '2026-2027',
        semester: 'first',
      },
    ],
  },

  'academic-emails': {
    id: 'academic-emails',
    titleAr: 'البريد الأكاديمي الجامعي',
    titleEn: 'Academic Emails',
    descAr: 'ربط أكواد الطلاب بالبريد الإلكتروني الجامعي الرسمي وتفعيل الحسابات.',
    descEn: 'Link student codes with institutional email accounts and activation states.',
    fields: [
      {
        key: 'studentCode',
        labelAr: 'كود الطالب',
        labelEn: 'Student Code',
        required: true,
        type: 'string',
        aliases: ['studentcode', 'كود الطالب', 'الكود'],
      },
      {
        key: 'studentName',
        labelAr: 'اسم الطالب',
        labelEn: 'Student Name',
        type: 'string',
        aliases: ['studentname', 'الاسم', 'اسم الطالب', 'fullname'],
      },
      {
        key: 'academicEmail',
        labelAr: 'البريد الأكاديمي',
        labelEn: 'Academic Email',
        required: true,
        type: 'string',
        note: 'ينتهي عادة بـ @bhi.edu.eg',
        aliases: ['academicemail', 'البريد الأكاديمي', 'البريد', 'الإيميل الأكاديمي', 'email'],
      },
      {
        key: 'status',
        labelAr: 'الحالة',
        labelEn: 'Status',
        type: 'enum',
        note: 'active / inactive',
        aliases: ['status', 'الحالة', 'حالة الحساب'],
      },
    ],
    sampleDataAr: [
      {
        studentCode: '202601',
        studentName: 'أحمد محمد علي',
        academicEmail: 's202601@bhi.edu.eg',
        status: 'active',
      },
    ],
    sampleDataEn: [
      {
        studentCode: '202601',
        studentName: 'Ahmed Mohamed Ali',
        academicEmail: 's202601@bhi.edu.eg',
        status: 'active',
      },
    ],
  },
};

export const TEMPLATE_FILENAMES: Record<UploadCatalogType, { ar: string; en: string }> = {
  students: {
    ar: 'قالب_بيانات_الطلاب.xlsx',
    en: 'Students_Master_Data_Template.xlsx',
  },
  courses: {
    ar: 'قالب_المقررات_الدراسية.xlsx',
    en: 'Courses_Catalog_Template.xlsx',
  },
  grades: {
    ar: 'قالب_رصد_الدرجات.xlsx',
    en: 'Student_Grades_Template.xlsx',
  },
  quizzes: {
    ar: 'قالب_درجات_الكويزات.xlsx',
    en: 'Course_Quizzes_Template.xlsx',
  },
  attendance: {
    ar: 'قالب_سجلات_الحضور.xlsx',
    en: 'Attendance_Logs_Template.xlsx',
  },
  'academic-emails': {
    ar: 'قالب_البريد_الأكاديمي.xlsx',
    en: 'Academic_Emails_Template.xlsx',
  },
};

export const CSV_TEMPLATE_FILENAMES: Record<UploadCatalogType, { ar: string; en: string }> = {
  students: {
    ar: 'نموذج_بيانات_الطلاب.csv',
    en: 'Students_Master_Data_Template.csv',
  },
  courses: {
    ar: 'نموذج_المقررات_الدراسية.csv',
    en: 'Courses_Catalog_Template.csv',
  },
  grades: {
    ar: 'نموذج_رصد_الدرجات.csv',
    en: 'Student_Grades_Template.csv',
  },
  quizzes: {
    ar: 'نموذج_درجات_الكويزات.csv',
    en: 'Course_Quizzes_Template.csv',
  },
  attendance: {
    ar: 'نموذج_سجلات_الحضور.csv',
    en: 'Attendance_Logs_Template.csv',
  },
  'academic-emails': {
    ar: 'نموذج_البريد_الأكاديمي.csv',
    en: 'Academic_Emails_Template.csv',
  },
};

/**
 * Downloads official .xlsx template generated by backend ExcelJS engine
 */
export async function downloadOfficialTemplate(
  type: UploadCatalogType,
  lang: 'ar' | 'en' = 'ar',
): Promise<void> {
  const res = (await api.get(`/admin/uploads/templates/${type}`, {
    params: { lang },
    responseType: 'blob',
  })) as Blob | { data?: BlobPart } | BlobPart;

  // api interceptor returns response.data directly. If responseType is 'blob', res is already the Blob.
  const blob =
    res instanceof Blob
      ? res
      : new Blob(
          [
            typeof res === 'object' && res && 'data' in res && res.data
              ? res.data
              : (res as BlobPart),
          ],
          {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
        );

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;

  const defaultFilename =
    lang === 'ar' ? `قالب_${type}.xlsx` : `${type}_template.xlsx`;
  const filename = TEMPLATE_FILENAMES[type]?.[lang] || defaultFilename;

  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/**
 * Downloads official .csv template generated client-side with UTF-8 BOM
 * so Excel on Windows opens Arabic CSV characters cleanly without garbling.
 */
export function downloadCsvTemplate(
  type: UploadCatalogType,
  lang: 'ar' | 'en' = 'ar',
): void {
  const catalog = UPLOAD_CATALOGS[type];
  if (!catalog) return;

  const isAr = lang === 'ar';
  const headers = catalog.fields.map((f) => (isAr ? f.labelAr : f.labelEn));
  const sampleData = isAr ? catalog.sampleDataAr : catalog.sampleDataEn;

  const escapeCsv = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const str = String(val).trim();
    if (
      str.includes(',') ||
      str.includes('"') ||
      str.includes('\n') ||
      str.includes('\r')
    ) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerLine = headers.map(escapeCsv).join(',');
  const rowLines = sampleData.map((row) =>
    catalog.fields.map((f) => escapeCsv(row[f.key] ?? '')).join(','),
  );

  // UTF-8 BOM (\uFEFF) ensures Excel on Windows correctly detects UTF-8 Arabic text
  const csvContent = '\uFEFF' + [headerLine, ...rowLines].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;

  const filename =
    CSV_TEMPLATE_FILENAMES[type]?.[lang] ||
    (isAr ? `نموذج_${type}.csv` : `${type}_template.csv`);

  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/**
 * Downloads zip bundle containing all 6 official Excel templates
 */
export async function downloadAllTemplatesBundle(
  lang: 'ar' | 'en' = 'ar',
): Promise<void> {
  const res = (await api.get('/admin/uploads/templates/bundle', {
    params: { lang },
    responseType: 'blob',
  })) as Blob | { data?: BlobPart } | BlobPart;

  const blob =
    res instanceof Blob
      ? res
      : new Blob(
          [
            typeof res === 'object' && res && 'data' in res && res.data
              ? res.data
              : (res as BlobPart),
          ],
          { type: 'application/zip' },
        );

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;

  const filename =
    lang === 'ar'
      ? 'حزمة_نماذج_إكسيل_بوابة_الطلاب.zip'
      : 'Student_Portal_Excel_Templates_Bundle.zip';

  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/**
 * Validates a single row against catalog rules
 */
export function validateCatalogRow(
  type: UploadCatalogType,
  rowNumber: number,
  data: Record<string, unknown>,
  isAr: boolean = true,
): PreFlightIssue[] {
  const catalog = UPLOAD_CATALOGS[type];
  if (!catalog) return [];

  const issues: PreFlightIssue[] = [];

  for (const field of catalog.fields) {
    const rawVal = data[field.key];
    const strVal = rawVal !== null && rawVal !== undefined ? String(rawVal).trim() : '';

    // Required check
    if (field.required && !strVal) {
      issues.push({
        rowNumber,
        field: field.key,
        fieldLabel: isAr ? field.labelAr : field.labelEn,
        code: 'REQUIRED',
        message: isAr
          ? `حقل "${field.labelAr}" مطلوب ولا يمكن أن يكون فارغاً`
          : `Field "${field.labelEn}" is required and cannot be empty`,
        severity: 'error',
        rawValue: rawVal,
      });
      continue;
    }

    if (!strVal) continue;

    // Field-specific validation
    if (field.key === 'nationalId') {
      const cleanDigits = strVal.replace(/\D/g, '');
      if (cleanDigits.length !== 14) {
        issues.push({
          rowNumber,
          field: field.key,
          fieldLabel: isAr ? field.labelAr : field.labelEn,
          code: 'INVALID_NATIONAL_ID',
          message: isAr
            ? `الرقم القومي يجب أن يتكون من 14 رقماً بالضبط (المكتوب: ${strVal.length})`
            : `National ID must be exactly 14 digits (given: ${strVal.length})`,
          severity: 'error',
          rawValue: rawVal,
        });
      }
    } else if (field.key === 'level') {
      const clean = strVal.toLowerCase();
      if (!['1', '2', '3', '4', 'first', 'second', 'third', 'fourth'].includes(clean)) {
        issues.push({
          rowNumber,
          field: field.key,
          fieldLabel: isAr ? field.labelAr : field.labelEn,
          code: 'INVALID_LEVEL',
          message: isAr
            ? `المستوى الدراسي يجب أن يكون بين 1 و 4 (القيمة: ${strVal})`
            : `Level must be between 1 and 4 (given: ${strVal})`,
          severity: 'warning',
          rawValue: rawVal,
        });
      }
    } else if (field.key === 'creditHours') {
      const num = Number(strVal);
      if (Number.isNaN(num) || num <= 0 || num > 12) {
        issues.push({
          rowNumber,
          field: field.key,
          fieldLabel: isAr ? field.labelAr : field.labelEn,
          code: 'INVALID_HOURS',
          message: isAr
            ? `عدد الساعات المعتمدة يجب أن يكون رقماً موجباً منطقياً (القيمة: ${strVal})`
            : `Credit hours must be a valid positive number (given: ${strVal})`,
          severity: 'error',
          rawValue: rawVal,
        });
      }
    } else if (field.key === 'grade') {
      const gradeNum = Number(strVal);
      const maxGrade = Number(data.maxGrade ?? 100);
      if (Number.isNaN(gradeNum) || gradeNum < 0) {
        issues.push({
          rowNumber,
          field: field.key,
          fieldLabel: isAr ? field.labelAr : field.labelEn,
          code: 'INVALID_GRADE',
          message: isAr
            ? `الدرجة يجب أن تكون رقماً موجباً (القيمة: ${strVal})`
            : `Grade must be a positive number (given: ${strVal})`,
          severity: 'error',
          rawValue: rawVal,
        });
      } else if (!Number.isNaN(maxGrade) && gradeNum > maxGrade) {
        issues.push({
          rowNumber,
          field: field.key,
          fieldLabel: isAr ? field.labelAr : field.labelEn,
          code: 'GRADE_EXCEEDS_MAX',
          message: isAr
            ? `الدرجة المحققة (${gradeNum}) تتجاوز الدرجة العظمى (${maxGrade})`
            : `Score (${gradeNum}) exceeds max score (${maxGrade})`,
          severity: 'error',
          rawValue: rawVal,
        });
      }
    } else if (field.key === 'academicEmail') {
      if (!strVal.includes('@') || !strVal.includes('.')) {
        issues.push({
          rowNumber,
          field: field.key,
          fieldLabel: isAr ? field.labelAr : field.labelEn,
          code: 'INVALID_EMAIL',
          message: isAr
            ? `صيغة البريد الأكاديمي غير صحيحة (القيمة: ${strVal})`
            : `Invalid academic email format (given: ${strVal})`,
          severity: 'error',
          rawValue: rawVal,
        });
      }
    }
  }

  return issues;
}
