import type { AnalyticsLocale } from '@student-portal/shared';

export interface ReportLabels {
  sheets: {
    info: string;
    kpis: string;
    departments: string;
    cohorts: string;
    gpa: string;
    enrollment: string;
    quizzes: string;
    staffQuizzes: string;
    courses: string;
    students: string;
    submissions: string;
    complaints: string;
  };
  common: {
    seq: string;
    value: string;
    percentage: string;
    status: string;
    metric: string;
    notes: string;
    date: string;
    total: string;
    active: string;
    yes: string;
    no: string;
    passed: string;
    failed: string;
  };
  info: {
    title: string;
    subtitle: string;
    generatedAt: string;
    generatedBy: string;
    role: string;
    academicYear: string;
    semester: string;
    department: string;
    level: string;
    all: string;
    methodologyTitle: string;
    kpiDef: string;
    quizDef: string;
    courseDef: string;
  };
  statuses: Record<string, string>;
  staffRoles: Record<string, string>;
  complaintPriorities: Record<string, string>;
  complaintCategories: Record<string, string>;
}

export const LABELS_AR: ReportLabels = {
  sheets: {
    info: 'معلومات التقرير',
    kpis: 'المؤشرات العامة',
    departments: 'الأقسام والشعب',
    cohorts: 'استبقاء الدفعات',
    gpa: 'توزيع المعدلات التراكمية',
    enrollment: 'حالات القيد',
    quizzes: 'تحليل الكويزات',
    staffQuizzes: 'أداء هيئة التدريس في الكويزات',
    courses: 'تحليل المقررات الأكاديمية',
    students: 'بيانات الطلاب الأكاديمية',
    submissions: 'نتائج الكويزات التفصيلية',
    complaints: 'تحليل تذاكر الشكاوى',
  },
  common: {
    seq: 'م',
    value: 'القيمة الإحصائية',
    percentage: 'النسبة المئوية',
    status: 'الحالة',
    metric: 'المؤشر الأكاديمي',
    notes: 'ملاحظات وتوضيحات',
    date: 'التاريخ',
    total: 'الإجمالي',
    active: 'منتظم',
    yes: 'نعم',
    no: 'لا',
    passed: 'ناجح',
    failed: 'راسب',
  },
  info: {
    title:
      ' المعهد العالي للعلوم الإدارية المتقدمة والحاسبات - التقرير التحليلي الأكاديمي الشامل',
    subtitle:
      'بيانات تشغيلية وإحصائية دقيقة مستخرجة مباشرة من قاعدة بيانات النظام الأكاديمي',
    generatedAt: 'تاريخ ووقت استخراج التقرير',
    generatedBy: 'المستخدم المستخرج للتقرير',
    role: 'صفة المستخدم',
    academicYear: 'العام الأكاديمي المحدد',
    semester: 'الفصل الدراسي المحدد',
    department: 'القسم / المسار المحدد',
    level: 'المستوى الدراسي المحددة',
    all: 'الكل (جميع البيانات)',
    methodologyTitle: 'منهجية القياس وتعريف المؤشرات',
    kpiDef:
      'المؤشرات العامة تعكس الإحصاء الفعلي الشامل لجميع القيود والمقررات وهيئة التدريس والشكاوى.',
    quizDef:
      'نسبة الدخول للكويز = (المسلمون ÷ الطلاب المسجلون المستحقون في المادة). نسبة النجاح = (الناجحون ÷ المسلمون).',
    courseDef:
      'نسبة النجاح في المادة تحسب بناء على درجات الاختبارات المرصودة (الدرجة النهائية أو المجموع >= 50%). الغائب والمحروم يعتبران غير مجتازين.',
  },
  statuses: {
    active: 'منتظم وقيد نشط',
    suspended: 'موقوف القيد',
    withdrawn: 'منسحب ومحول',
    graduated: 'خريج',
    pending: 'قيد المراجعة',
    approved: 'معتمد ومسجل',
    rejected: 'مرفوض',
    open: 'مفتوحة وقيد الفحص',
    in_progress: 'جاري المعالجة',
    resolved: 'تم الحل بنجاح',
    closed: 'مغلقة نهائياً',
    published: 'منشور ومتاح للطلاب',
    draft: 'مسودة غير منشورة',
    present: 'حاضر',
    absent: 'غائب',
    banned: 'محروم أكاديمياً',
  },
  staffRoles: {
    doctor: 'أستاذ مقرر (دكتور)',
    assistant_lecturer: 'مدرس مساعد (هيئة معاونة)',
    teaching_assistant: 'معيد (هيئة معاونة)',
    dean: 'عميد المعهد',
    control: 'مسؤول الكنترول',
    accountant: 'شؤون مالية (محاسب)',
    administrative: 'شؤون طلاب (إداري)',
    admin: 'مدير النظام',
  },
  complaintPriorities: {
    low: 'منخفضة',
    medium: 'متوسطة',
    high: 'مرتفعة',
    urgent: 'عاجلة وفورية',
  },
  complaintCategories: {
    academic: 'أكاديمية ودراسية',
    technical: 'تقنية ونظام إلكتروني',
    financial: 'مالية ومصروفات',
    administrative: 'إدارية وشؤون طلاب',
    other: 'أخرى',
  },
};

export const LABELS_EN: ReportLabels = {
  sheets: {
    info: 'Report Info',
    kpis: 'Summary KPIs',
    departments: 'Departments & Tracks',
    cohorts: 'Cohort Retention',
    gpa: 'GPA Distribution',
    enrollment: 'Enrollment Status',
    quizzes: 'Quiz Analysis',
    staffQuizzes: 'Staff Quiz Performance',
    courses: 'Course Analysis',
    students: 'Students Academic Data',
    submissions: 'Quiz Submissions Detail',
    complaints: 'Complaints Analysis',
  },
  common: {
    seq: '#',
    value: 'Statistical Value',
    percentage: 'Percentage',
    status: 'Status',
    metric: 'Academic Metric',
    notes: 'Notes & Explanations',
    date: 'Date',
    total: 'Total',
    active: 'Active',
    yes: 'Yes',
    no: 'No',
    passed: 'Passed',
    failed: 'Failed',
  },
  info: {
    title:
      'Higher Institute of Administrative Sciences & Technology - Comprehensive Analytics Report',
    subtitle:
      'Accurate operational and academic analytics extracted directly from institutional records',
    generatedAt: 'Report Generation Timestamp',
    generatedBy: 'Generated By',
    role: 'User Role',
    academicYear: 'Academic Year Filter',
    semester: 'Semester Filter',
    department: 'Department / Track Filter',
    level: 'Academic Level Filter',
    all: 'All Records',
    methodologyTitle: 'Methodology & Metric Definitions',
    kpiDef:
      'General KPIs represent live aggregated counts across institutional records, staff, and tickets.',
    quizDef:
      'Quiz participation rate = (Submissions ÷ Eligible enrolled students in course). Quiz pass rate = (Passed ÷ Submissions).',
    courseDef:
      'Course pass rate is evaluated from recorded exam grades (final or aggregate score >= 50%). Absent or banned statuses are deemed unpassed.',
  },
  statuses: {
    active: 'Active',
    suspended: 'Suspended',
    withdrawn: 'Withdrawn',
    graduated: 'Graduated',
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
    open: 'Open',
    in_progress: 'In Progress',
    resolved: 'Resolved',
    closed: 'Closed',
    published: 'Published',
    draft: 'Draft',
    present: 'Present',
    absent: 'Absent',
    banned: 'Banned',
  },
  staffRoles: {
    doctor: 'Course Doctor (Lecturer)',
    assistant_lecturer: 'Assistant Lecturer',
    teaching_assistant: 'Teaching Assistant',
    dean: 'Institute Dean',
    control: 'Control Officer',
    accountant: 'Accountant (Finance)',
    administrative: 'Administrative Staff',
    admin: 'System Administrator',
  },
  complaintPriorities: {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    urgent: 'Urgent',
  },
  complaintCategories: {
    academic: 'Academic',
    technical: 'Technical',
    financial: 'Financial',
    administrative: 'Administrative',
    other: 'Other',
  },
};

export function getReportLabels(locale: AnalyticsLocale = 'ar'): ReportLabels {
  return locale === 'en' ? LABELS_EN : LABELS_AR;
}
