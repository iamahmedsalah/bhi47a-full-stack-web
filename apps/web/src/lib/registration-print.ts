import { toCanvas } from "html-to-image";
import { curriculumDepartmentLabel } from "@student-portal/shared";
import { jsPDF } from "jspdf";

export interface PrintableRegistrationCourse {
  code: string;
  courseName: string;
  courseNameEn?: string;
  courseNameAr?: string;
  creditHours: number;
  type: string;
  status: string;
}

export interface PrintableRegistrationForm {
  instituteName?: string;
  instituteNameAr?: string;
  instituteNameEn?: string;
  title?: string;
  titleAr?: string;
  titleEn?: string;
  academicYear?: string;
  department?: string;
  studentInformation: Record<string, string | number | undefined>;
  registeredCourses: PrintableRegistrationCourse[];
  totalCreditHours: number;
  registrationStatus: string;
  advisorNotes?: string;
  studentSignature?: string;
  advisorSignature?: string;
  date: string;
}

export type RegistrationLocale = "ar" | "en";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export const fieldLabels: Record<string, string> = {
  studentName: "اسم الطالب / Student Name",
  studentCode: "كود الطالب / Student ID",
  nationalId: "الرقم القومي / National ID",
  academicLevel: "المستوى الدراسي / Level",
  semester: "الفصل الدراسي / Semester",
  academicYear: "العام الأكاديمي / Academic Year",
  department: "الشعبة / Department",
  gpa: "المعدل التراكمي / GPA",
  advisorName: "المرشد الأكاديمي / Advisor",
  approvedBy: "اعتماد بواسطة / Approved by",
  approvedAt: "تاريخ الاعتماد / Approval date",
};

export const arabicValues: Record<string, string> = {
  required: "إجباري",
  elective: "اختياري",
  registered: "مسجل",
  "advisor-approved": "معتمد من المرشد",
  pending: "قيد المراجعة",
  approved: "معتمد رسميًا",
  rejected: "مرفوض",
  first: "الفصل الدراسي الأول",
  second: "الفصل الدراسي الثاني",
  summer: "الفصل الصيفي",
};

export function bilingualValue(value: unknown): string {
  const text = String(value ?? "");
  return arabicValues[text] ?? text;
}

export function localizeSemester(semester: unknown, locale: RegistrationLocale): string {
  const s = String(semester ?? "").toLowerCase().trim();
  if (locale === "ar") {
    if (s.includes("first") || s === "1") return "الفصل الدراسي الأول (خريف)";
    if (s.includes("second") || s === "2") return "الفصل الدراسي الثاني (ربيع)";
    if (s.includes("summer") || s.includes("صيف")) return "الفصل الصيفي (مكثف)";
    return arabicValues[s] ?? String(semester ?? "—");
  } else {
    if (s.includes("first") || s === "1") return "First Semester (Fall)";
    if (s.includes("second") || s === "2") return "Second Semester (Spring)";
    if (s.includes("summer") || s.includes("صيف")) return "Summer Term (Intensive)";
    return String(semester ?? "—");
  }
}

export function localizeAcademicLevel(level: unknown, locale: RegistrationLocale): string {
  const l = String(level ?? "").toLowerCase().trim();
  if (locale === "ar") {
    if (l === "1" || l.includes("أولى") || l.includes("first")) return "المستوى الأول (الفرقة الأولى)";
    if (l === "2" || l.includes("ثانية") || l.includes("second")) return "المستوى الثاني (الفرقة الثانية)";
    if (l === "3" || l.includes("ثالثة") || l.includes("third")) return "المستوى الثالث (الفرقة الثالثة)";
    if (l === "4" || l.includes("رابعة") || l.includes("fourth")) return "المستوى الرابع (الفرقة الرابعة)";
    return `المستوى ${level ?? "—"}`;
  } else {
    if (l === "1" || l.includes("أولى") || l.includes("first")) return "Level 1 (Freshman)";
    if (l === "2" || l.includes("ثانية") || l.includes("second")) return "Level 2 (Sophomore)";
    if (l === "3" || l.includes("ثالثة") || l.includes("third")) return "Level 3 (Junior)";
    if (l === "4" || l.includes("رابعة") || l.includes("fourth")) return "Level 4 (Senior)";
    return `Level ${level ?? "—"}`;
  }
}

export function localizeCourseType(type: unknown, locale: RegistrationLocale): string {
  const t = String(type ?? "").toLowerCase().trim();
  const requirementLabels: Record<string, string> = locale === "ar"
    ? { university_req: "متطلب جامعة", institute_req: "متطلب معهد", specialization_req: "متطلب تخصص" }
    : { university_req: "University requirement", institute_req: "Institute requirement", specialization_req: "Specialization requirement" };
  if (requirementLabels[t]) return requirementLabels[t];
  if (locale === "ar") {
    if (t === "required" || t.includes("إجبار")) return "إجباري";
    if (t === "elective" || t.includes("اختيار")) return "اختياري";
    return arabicValues[t] ?? String(type ?? "—");
  } else {
    if (t === "required" || t.includes("إجبار")) return "Core / Required";
    if (t === "elective" || t.includes("اختيار")) return "Elective";
    return String(type ?? "—");
  }
}

export function localizeRegistrationStatus(status: unknown, locale: RegistrationLocale): string {
  const s = String(status ?? "").toLowerCase().trim();
  if (locale === "ar") {
    if (s === "approved" || s === "advisor-approved") return "معتمد رسميًا";
    if (s === "registered") return "مسجل نهائيًا";
    if (s === "pending") return "قيد المراجعة الأكاديمية";
    if (s === "rejected") return "مرفوض";
    return arabicValues[s] ?? String(status ?? "—");
  } else {
    if (s === "approved" || s === "advisor-approved") return "Officially Approved";
    if (s === "registered") return "Registered";
    if (s === "pending") return "Pending Review";
    if (s === "rejected") return "Rejected";
    return String(status ?? "—");
  }
}

export function getRegistrationCopy(locale: RegistrationLocale) {
  const isAr = locale === "ar";
  return {
    isAr,
    dir: isAr ? "rtl" : "ltr",
    instituteName: isAr
      ? "المعهد العالي للعلوم الإدارية المتقدمة والحاسبات (BHI47A)"
      : "Higher Institute for Advanced Administrative Sciences & Computer (BHI47A)",
    ministry: isAr
      ? "وزارة التعليم العالي والبحث العلمي · إدارة شؤون الطلاب والتسجيل"
      : "Ministry of Higher Education · Student Affairs & Registration",
    title: isAr
      ? "استمارة تسجيل المقررات الدراسية الرسمية"
      : "Official Course Registration Slip",
    subtitle: isAr
      ? "نظام الساعات المعتمدة · الفصل الدراسي الأكاديمي"
      : "Credit Hour Academic System · Semester Registration Record",
    badgeOfficial: isAr ? "استمارة قيد رسمية" : "OFFICIAL REGISTRATION",
    badgeSerial: isAr ? "وثيقة معتمدة" : "OFFICIAL RECORD",

    fields: {
      studentName: isAr ? "اسم الطالب الرباعي" : "Student Full Name",
      studentNameSub: isAr ? "Student Full Name" : "اسم الطالب",
      studentCode: isAr ? "كود الطالب الأكاديمي" : "Academic Student ID",
      studentCodeSub: isAr ? "Student ID" : "كود الطالب",
      nationalId: isAr ? "الرقم القومي" : "National ID",
      nationalIdSub: isAr ? "National ID" : "الرقم القومي",
      academicLevel: isAr ? "المستوى الدراسي" : "Academic Level",
      academicLevelSub: isAr ? "Academic Level" : "المستوى الدراسي",
      semester: isAr ? "الفصل الدراسي" : "Academic Semester",
      semesterSub: isAr ? "Semester" : "الفصل الدراسي",
      academicYear: isAr ? "العام الأكاديمي" : "Academic Year",
      academicYearSub: isAr ? "Academic Year" : "العام الجامعي",
      department: isAr ? "الشعبة / التخصص" : "Department / Program",
      departmentSub: isAr ? "Program" : "الشعبة والتخصص",
      gpa: isAr ? "المعدل التراكمي (CGPA)" : "Cumulative GPA (CGPA)",
      gpaSub: isAr ? "Cumulative GPA" : "المعدل التراكمي",
      advisorName: isAr ? "المرشد الأكاديمي" : "Academic Advisor",
      advisorNameSub: isAr ? "Advisor" : "المرشد الأكاديمي",
      approvedAt: isAr ? "تاريخ الاعتماد الأكاديمي" : "Approval Date",
      approvedAtSub: isAr ? "Approval Date" : "تاريخ الاعتماد",
    },

    table: {
      index: "#",
      code: isAr ? "كود المقرر" : "Course Code",
      codeSub: isAr ? "Code" : "الكود",
      course: isAr ? "المقرر الدراسي" : "Course Title",
      courseSub: isAr ? "Course Title" : "اسم المقرر",
      credits: isAr ? "الساعات" : "Credits",
      creditsSub: isAr ? "Cr.Hrs" : "الساعات",
      type: isAr ? "النوع" : "Type",
      typeSub: isAr ? "Type" : "النوع",
      status: isAr ? "الحالة" : "Status",
      statusSub: isAr ? "Status" : "الحالة",
    },

    summary: {
      totalCourses: isAr ? "المقررات المسجلة" : "Registered Courses",
      totalCredits: isAr ? "إجمالي الساعات المعتمدة" : "Total Credit Hours",
      registrationStatus: isAr ? "حالة التسجيل الأكاديمي" : "Registration Status",
      creditsUnit: isAr ? "ساعة معتمدة" : "Credit Hours",
      coursesUnit: isAr ? "مقررات" : "Courses",
    },

    advisorNotesHeading: isAr
      ? "توصيات وملاحظات المرشد الأكاديمي:"
      : "Academic Advisor Notes & Endorsement:",
    advisorNotesDefault: isAr
      ? "تمت مراجعة المقررات واعتماد الخطة الدراسية بما يتوافق مع القواعد واللوائح المنظمة لنظام الساعات المعتمدة."
      : "Courses reviewed and endorsed in compliance with credit-hour regulations and study plan requirements.",

    signatures: {
      studentTitle: isAr ? "توقيع الطالب" : "Student Signature",
      studentSub: isAr ? "أقر بصحة المقررات المسجلة أعلاه" : "I acknowledge the registered courses above",
      advisorTitle: isAr ? "توقيع المرشد الأكاديمي" : "Academic Advisor Signature",
      advisorSub: isAr ? "تم التدقيق والمطابقة مع اللائحة" : "Verified per academic regulations",
      deanTitle: isAr ? "إدارة شؤون الطلاب والمسجل" : "Student Affairs & Registrar",
      deanSub: isAr ? "يعتمد رسمياً بعد المراجعة وتدقيق الرسوم" : "Officially approved upon record verification",
      officialSeal: isAr ? "ختم المعهد الرسمي\nOfficial Stamp" : "Official Institute Seal\nختم المعهد",
    },

    footerNotice: isAr
      ? "تعتبر هذه الاستمارة وثيقة قيد رسمية صادرة من المنظومة الإلكترونية للطلاب. لا يعتد بها بعد انتهاء فترة الحذف والإضافة دون ختم شؤون الطلاب الرسمي."
      : "This document is an official registration record issued by the SIS Portal. It is void without the official Student Affairs stamp after the add/drop deadline.",
    generatedOn: isAr ? "تاريخ الإصدار:" : "Issued on:",
    officialSystem: isAr ? "بوابة إدارة شؤون الطلاب والتعليم الإلكتروني" : "Student Affairs & Academic Portal",
    printBtn: isAr ? "طباعة الاستمارة" : "Print Form",
    downloadBtn: isAr ? "تحميل PDF" : "Download PDF",
    generatingPdf: isAr ? "جاري تجهيز PDF..." : "Generating PDF...",
    switchLangBtn: isAr ? "View in English" : "عرض باللغة العربية",
  };
}

export const registrationDocumentStyles = `
  @font-face { font-family: Cairo; src: url('/fonts/ar/Cairo-VariableFont_slnt,wght.ttf') format('truetype'); font-weight: 100 900; font-display: swap; }
  @font-face { font-family: Inter; src: url('/fonts/en/DMSans-VariableFont_opsz,wght.ttf') format('truetype'); font-weight: 100 900; font-display: swap; }

  @page {
    size: A4 portrait;
    margin: 0;
  }
  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  body {
    margin: 0;
    background: #e2e8f0;
    color: #0f172a;
    -webkit-font-smoothing: antialiased;
  }
  .toolbar {
    position: sticky;
    top: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: #092c35;
    box-shadow: 0 4px 14px rgba(0,0,0,0.25);
    z-index: 100;
  }
  .toolbar button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    border-radius: 8px;
    padding: 9px 18px;
    font-family: inherit;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s ease;
    background: #0d9488;
    color: #ffffff;
  }
  .toolbar button:hover {
    background: #0f766e;
  }
  .toolbar .secondary {
    background: #0284c7;
  }
  .toolbar .secondary:hover {
    background: #0369a1;
  }
  .toolbar .outline-btn {
    background: transparent;
    border: 1px solid #38bdf8;
    color: #38bdf8;
  }
  .toolbar .outline-btn:hover {
    background: rgba(56, 189, 248, 0.15);
  }
  .sheet {
    position: relative;
    width: 210mm;
    height: auto;
    min-height: 297mm;
    max-height: none;
    margin: 12px auto;
    padding: 11mm 13mm 10mm;
    background: #ffffff;
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.15);
    color: #0f172a;
    box-sizing: border-box;
    overflow: visible;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .sheet[dir="rtl"] {
    direction: rtl;
    text-align: right;
    font-family: "Cairo", -apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, sans-serif;
  }
  .sheet[dir="ltr"] {
    direction: ltr;
    text-align: left;
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .watermark-container {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 320px;
    height: 320px;
    opacity: 0.038;
    pointer-events: none;
    z-index: 0;
  }
  .watermark-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: grayscale(100%);
  }
  .accent-stripe {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 6px;
    background: linear-gradient(90deg, #092c35 0%, #0d9488 50%, #0284c7 100%);
  }
  header {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: 78px 1fr 115px;
    align-items: center;
    gap: 12px;
    padding-bottom: 11px;
    border-bottom: 2.5px solid #092c35;
  }
  header img {
    width: 72px;
    height: 72px;
    object-fit: contain;
    border-radius: 6px;
  }
  .header-content {
    text-align: center;
  }
  .header-content .ministry {
    margin: 0 0 2px;
    color: #0d5d67;
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 0.3px;
    text-transform: uppercase;
  }
  .header-content h1 {
    margin: 1px 0 2px;
    color: #0f172a;
    font-size: 20px;
    font-weight: 800;
    line-height: 1.25;
  }
  .header-content .subtitle {
    margin: 0;
    color: #475569;
    font-size: 11px;
    font-weight: 700;
  }
  .badge-card {
    border: 1.5px solid #0d9488;
    border-radius: 8px;
    padding: 6px 8px;
    background: #f0fdfa;
    text-align: center;
  }
  .badge-card .tag-main {
    display: block;
    color: #0d5d67;
    font-size: 9.5px;
    font-weight: 800;
    text-transform: uppercase;
    line-height: 1.2;
  }
  .badge-card .tag-sub {
    display: block;
    margin-top: 2px;
    color: #059669;
    font-size: 8.5px;
    font-weight: 800;
    font-family: Consolas, "Courier New", monospace;
    letter-spacing: 0.5px;
  }

  .details-grid {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
    margin: 10px 0;
  }
  .detail-card {
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    padding: 6px 10px;
    background: #f8fafc;
    min-height: 44px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .detail-header {
    display: flex;
    flex-shrink: 0;
    justify-content: space-between;
    align-items: baseline;
    gap: 6px;
    margin-bottom: 2px;
  }
  .detail-header .label {
    white-space: nowrap;
    flex-shrink: 0;
    font-size: 9px;
    font-weight: 800;
    color: #0d5d67;
    text-transform: uppercase;
    letter-spacing: 0.2px;
  }
  .detail-header .sub-label {
    white-space: nowrap;
    flex-shrink: 0;
    font-size: 8px;
    font-weight: 600;
    color: #64748b;
  }
  .detail-card strong {
    font-size: 11.5px;
    font-weight: 800;
    color: #0f172a;
    line-height: 1.2;
  }
  .code-text {
    font-family: Consolas, "Courier New", monospace !important;
    direction: ltr !important;
    display: inline-block;
  }

  table {
    position: relative;
    z-index: 1;
    width: 100%;
    border-collapse: collapse;
    font-size: 10.5px;
    margin-top: 8px;
    border: 1px solid #cbd5e1;
  }
  thead th {
    background: #092c35;
    color: #ffffff;
    padding: 7px 8px;
    font-weight: 800;
    font-size: 10px;
    border: 1px solid #05262c;
    text-align: center;
    letter-spacing: 0.2px;
  }
  .sheet[dir="rtl"] th.text-start-col {
    text-align: right;
  }
  .sheet[dir="ltr"] th.text-start-col {
    text-align: left;
  }
  td {
    border: 1px solid #cbd5e1;
    padding: 6px 8px;
    vertical-align: middle;
    text-align: center;
    color: #0f172a;
  }
  .sheet[dir="rtl"] td.text-start-col {
    text-align: right;
  }
  .sheet[dir="ltr"] td.text-start-col {
    text-align: left;
  }
  tbody tr:nth-child(even) td {
    background: #f8fafc;
  }
  .course-title-primary {
    font-weight: 800;
    font-size: 11px;
    color: #0f172a;
  }
  .course-title-sub {
    font-size: 8.5px;
    font-weight: 600;
    color: #64748b;
    margin-top: 1px;
  }
  .type-badge {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 9px;
    font-weight: 700;
    background: #f1f5f9;
    color: #334155;
    border: 1px solid #cbd5e1;
  }
  .status-badge {
    display: inline-block;
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 9px;
    font-weight: 800;
    background: #ecfdf5;
    color: #065f46;
    border: 1px solid #a7f3d0;
  }

  .metrics-grid {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-top: 9px;
  }
  .metric-card {
    background: #f0fdfa;
    border: 1px solid #99f6e4;
    border-radius: 6px;
    padding: 6px 8px;
    text-align: center;
  }
  .metric-card .metric-label {
    display: block;
    font-size: 9px;
    font-weight: 800;
    color: #0d5d67;
    text-transform: uppercase;
    margin-bottom: 2px;
  }
  .metric-card .metric-value {
    font-size: 13.5px;
    font-weight: 800;
    color: #0f172a;
  }

  .notes-box {
    position: relative;
    z-index: 1;
    margin-top: 8px;
    padding: 7px 10px;
    border: 1px dashed #cbd5e1;
    border-radius: 6px;
    background: #fafafa;
    font-size: 10px;
    line-height: 1.35;
  }
  .notes-box strong {
    color: #0d5d67;
    font-size: 10.5px;
    display: block;
    margin-bottom: 1px;
  }
  .notes-box p {
    margin: 0;
    color: #334155;
  }

  .signatures-grid {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: 1fr 1fr 115px;
    gap: 16px;
    align-items: end;
    margin-top: 18px;
    text-align: center;
    font-size: 10px;
  }
  .signature-box {
    padding-top: 5px;
    border-top: 1.5px solid #334155;
  }
  .signature-box .sig-title {
    font-weight: 800;
    color: #0f172a;
    font-size: 10.5px;
  }
  .signature-box .sig-sub {
    font-size: 8px;
    color: #64748b;
    margin-top: 2px;
  }
  .seal-circle {
    width: 76px;
    height: 76px;
    margin: 0 auto;
    border: 2px double #0d4e56;
    border-radius: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-size: 8px;
    font-weight: 800;
    color: #0d4e56;
    text-align: center;
    line-height: 1.2;
    background: #f0fdfa;
    white-space: pre-line;
    box-sizing: border-box;
    padding: 4px;
  }

  footer {
    position: relative;
    z-index: 1;
    margin-top: 14px;
    padding-top: 7px;
    border-top: 1px solid #cbd5e1;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 8.5px;
    color: #64748b;
    line-height: 1.35;
  }
  footer .footer-left {
    flex: 1;
    padding-inline-end: 14px;
  }
  footer .footer-serial {
    font-family: Consolas, monospace;
    font-weight: 800;
    color: #0d4e56;
    font-size: 9px;
    background: #f1f5f9;
    padding: 3px 6px;
    border-radius: 4px;
    border: 1px solid #cbd5e1;
  }

  tr, .metrics-grid, .notes-box, .signatures-grid, footer { break-inside: avoid; }
  thead { display: table-header-group; }
  @media print {
    html, body {
      width: 210mm !important;
      height: auto !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      overflow: visible !important;
    }
    .toolbar {
      display: none !important;
    }
    .sheet {
      width: 210mm !important;
      height: auto !important;
      min-height: 297mm !important;
      max-height: none !important;
      margin: 0 !important;
      padding: 11mm 13mm 10mm !important;
      box-shadow: none !important;
      page-break-after: avoid !important;
      page-break-inside: auto !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: space-between !important;
      box-sizing: border-box !important;
    }
  }
`;

export function generateRegistrationDocumentHtml(
  form: PrintableRegistrationForm,
  locale: RegistrationLocale,
  logoUrl: string,
): string {
  const copy = getRegistrationCopy(locale);
  const isAr = locale === "ar";
  const info = form.studentInformation ?? {};

  const studentName = isAr
    ? String(info.studentNameAr || info.studentName || "—")
    : String(info.studentNameEn || info.studentName || "—");

  const studentNameSub = isAr
    ? String(info.studentNameEn || "")
    : String(info.studentNameAr || "");

  const studentCode = String(info.studentCode || "—");
  const nationalId = String(info.nationalId || info.nationalIdMasked || "—");
  const academicLevel = localizeAcademicLevel(info.academicLevel, locale);
  const semester = localizeSemester(info.semester, locale);
  const academicYear = String(form.academicYear || info.academicYear || "—");
  const department = curriculumDepartmentLabel(String(form.department || info.department || ""), locale);
  const gpa = typeof info.gpa === "number" ? info.gpa.toFixed(2) : String(info.gpa ?? "—");
  const advisorName = String(info.advisorName || info.approvedBy || (isAr ? "د. المرشد الأكاديمي" : "Academic Advisor"));
  const approvedAt = String(info.approvedAt || form.date || new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));

  const displayDate = /^\d{4}-\d{2}-\d{2}$/.test(approvedAt) ? new Intl.DateTimeFormat(isAr ? "ar-EG" : "en-GB", { timeZone: "Africa/Cairo" }).format(new Date(`${approvedAt}T12:00:00Z`)) : approvedAt;
  const rows = form.registeredCourses
    .map((course, index) => {
      const primaryName = isAr
        ? course.courseNameAr || course.courseName
        : course.courseNameEn || course.courseName;
      const secondaryName = isAr ? course.courseNameEn : course.courseNameAr;

      return `<tr>
        <td style="width: 32px; font-weight: 700; color: #64748b;">${index + 1}</td>
        <td style="width: 82px;" class="code-text font-bold">${escapeHtml(course.code)}</td>
        <td class="text-start-col">
          <div class="course-title-primary">${escapeHtml(primaryName)}</div>
          ${secondaryName && secondaryName !== primaryName ? `<div class="course-title-sub">${escapeHtml(secondaryName)}</div>` : ""}
        </td>
        <td style="width: 58px; font-weight: 800; font-family: Consolas, monospace;">${escapeHtml(course.creditHours)}</td>
        <td style="width: 82px;"><span class="type-badge">${escapeHtml(localizeCourseType(course.type, locale))}</span></td>
        <td style="width: 105px;"><span class="status-badge">${escapeHtml(localizeRegistrationStatus(course.status, locale))}</span></td>
      </tr>`;
    })
    .join("");

  const detailsCards = [
    {
      label: copy.fields.studentName,
      sub: copy.fields.studentNameSub,
      value: studentName,
      extraSub: studentNameSub,
      isMono: false,
    },
    {
      label: copy.fields.studentCode,
      sub: copy.fields.studentCodeSub,
      value: studentCode,
      isMono: true,
    },
    {
      label: copy.fields.nationalId,
      sub: copy.fields.nationalIdSub,
      value: nationalId,
      isMono: true,
    },
    {
      label: copy.fields.academicLevel,
      sub: copy.fields.academicLevelSub,
      value: academicLevel,
      isMono: false,
    },
    {
      label: copy.fields.semester,
      sub: copy.fields.semesterSub,
      value: `${semester} (${academicYear})`,
      isMono: false,
    },
    {
      label: copy.fields.department,
      sub: copy.fields.departmentSub,
      value: department,
      isMono: false,
    },
    {
      label: copy.fields.gpa,
      sub: copy.fields.gpaSub,
      value: `${gpa} / 4.00`,
      isMono: true,
    },
    {
      label: copy.fields.advisorName,
      sub: copy.fields.advisorNameSub,
      value: advisorName,
      isMono: false,
    },
  ];

  const detailsHtml = detailsCards
    .map(
      (item) => `<div class="detail-card">
      <div class="detail-header">
        <span class="label">${escapeHtml(item.label)}</span>
        <span class="sub-label">${escapeHtml(item.sub)}</span>
      </div>
      <strong class="${item.isMono ? "code-text" : ""}">${item.isMono ? `<bdi class="code-text">${escapeHtml(item.value)}</bdi>` : escapeHtml(item.value).replace(escapeHtml(academicYear), `<bdi dir="ltr">${escapeHtml(academicYear)}</bdi>`)}</strong>
      ${item.extraSub ? `<span style="font-size: 8px; color: #64748b; margin-top: 1px;">${escapeHtml(item.extraSub)}</span>` : ""}
    </div>`,
    )
    .join("");

  const serialCode = `REG-${studentCode !== "—" ? studentCode : "STD"}-${approvedAt.replaceAll("-", "")}`;

  return `
    <main class="sheet" dir="${copy.dir}">
      <div class="accent-stripe"></div>
      <div class="watermark-container">
        <img src="${escapeHtml(logoUrl)}" alt="" class="watermark-img" />
      </div>
      
      <header>
        <img src="${escapeHtml(logoUrl)}" alt="Institute Logo" />
        <div class="header-content">
          <p class="ministry">${escapeHtml(copy.ministry)}</p>
          <h1>${escapeHtml(form.titleAr && isAr ? form.titleAr : form.titleEn && !isAr ? form.titleEn : copy.title)}</h1>
          <p class="subtitle">${escapeHtml(copy.subtitle)} · <bdi dir="ltr">${escapeHtml(academicYear)}</bdi></p>
        </div>
        <div class="badge-card">
          <span class="tag-main">${escapeHtml(copy.badgeOfficial)}</span>
          <span class="tag-sub">${escapeHtml(serialCode)}</span>
        </div>
      </header>

      <section class="details-grid">
        ${detailsHtml}
      </section>

      <table>
        <thead>
          <tr>
            <th style="width: 32px;">${escapeHtml(copy.table.index)}</th>
            <th style="width: 82px;">
              <div>${escapeHtml(copy.table.code)}</div>
              <div style="font-size: 7.5px; opacity: 0.85; font-weight: normal; margin-top: 1px;">${escapeHtml(copy.table.codeSub)}</div>
            </th>
            <th class="text-start-col">
              <div>${escapeHtml(copy.table.course)}</div>
              <div style="font-size: 7.5px; opacity: 0.85; font-weight: normal; margin-top: 1px;">${escapeHtml(copy.table.courseSub)}</div>
            </th>
            <th style="width: 58px;">
              <div>${escapeHtml(copy.table.credits)}</div>
              <div style="font-size: 7.5px; opacity: 0.85; font-weight: normal; margin-top: 1px;">${escapeHtml(copy.table.creditsSub)}</div>
            </th>
            <th style="width: 80px;">
              <div>${escapeHtml(copy.table.type)}</div>
              <div style="font-size: 7.5px; opacity: 0.85; font-weight: normal; margin-top: 1px;">${escapeHtml(copy.table.typeSub)}</div>
            </th>
            <th style="width: 100px;">
              <div>${escapeHtml(copy.table.status)}</div>
              <div style="font-size: 7.5px; opacity: 0.85; font-weight: normal; margin-top: 1px;">${escapeHtml(copy.table.statusSub)}</div>
            </th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>

      <section class="metrics-grid">
        <div class="metric-card">
          <span class="metric-label">${escapeHtml(copy.summary.totalCourses)}</span>
          <span class="metric-value font-mono">${form.registeredCourses.length} ${escapeHtml(copy.summary.coursesUnit)}</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">${escapeHtml(copy.summary.totalCredits)}</span>
          <span class="metric-value font-mono">${form.totalCreditHours} ${escapeHtml(copy.summary.creditsUnit)}</span>
        </div>
        <div class="metric-card" style="background: #ecfdf5; border-color: #a7f3d0;">
          <span class="metric-label" style="color: #047857;">${escapeHtml(copy.summary.registrationStatus)}</span>
          <span class="metric-value" style="color: #047857; font-size: 12.5px;">${escapeHtml(localizeRegistrationStatus(form.registrationStatus, locale))}</span>
        </div>
      </section>

      <section class="notes-box">
        <strong>${escapeHtml(copy.advisorNotesHeading)}</strong>
        <p>${escapeHtml(form.advisorNotes || copy.advisorNotesDefault)}</p>
      </section>

      <section class="signatures-grid">
        <div class="signature-box">
          <div class="sig-title">${escapeHtml(copy.signatures.studentTitle)}</div>
          <div class="sig-sub">${escapeHtml(copy.signatures.studentSub)}</div>
        </div>
        <div class="signature-box">
          <div class="sig-title">${escapeHtml(copy.signatures.advisorTitle)}</div>
          <div class="sig-sub">${escapeHtml(copy.signatures.advisorSub)}</div>
        </div>
        <div>
          <div class="seal-circle">
            <span style="font-weight: 800; color: #0d4e56;">${isAr ? "ختم المعهد الرسمي" : "OFFICIAL SEAL"}</span>
            <span style="font-size: 7px; color: #0f766e; margin-top: 1px;">${isAr ? "شؤون الطلاب والتسجيل" : "STUDENT AFFAIRS"}</span>
          </div>
        </div>
      </section>

      <footer>
        <div class="footer-left">
          ${escapeHtml(copy.footerNotice)}<br />
          <span>${escapeHtml(copy.generatedOn)} ${escapeHtml(displayDate)} · ${escapeHtml(copy.officialSystem)}</span>
        </div>
        <div class="footer-serial">
          ${escapeHtml(serialCode)}
        </div>
      </footer>
    </main>
  `;
}

/** Shared document used by the screen preview, print window and PDF renderer. */
export function registrationDocumentPage(form: PrintableRegistrationForm, locale: RegistrationLocale): string {
  return `<!doctype html><html lang="${locale}" dir="${locale === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(getRegistrationCopy(locale).title)}</title><style>${registrationDocumentStyles}</style></head><body>${generateRegistrationDocumentHtml(form, locale, "/logo.webp")}</body></html>`;
}

export async function waitForRegistrationAssets(doc: Document): Promise<void> {
  await Promise.all([doc.fonts.load('400 12px Cairo'), doc.fonts.load('700 12px Inter')]);
  await doc.fonts.ready;
  await Promise.all(Array.from(doc.images, (img) => img.complete ? Promise.resolve() : new Promise<void>((resolve) => {
    img.addEventListener("load", () => resolve(), { once: true });
    img.addEventListener("error", () => resolve(), { once: true });
  })));
}

export function openRegistrationPrintView(
  form: PrintableRegistrationForm,
  action: "print" | "download" = "print",
  initialLocale: RegistrationLocale = "ar",
  existingWindow?: Window | null,
) {
  const printWindow = existingWindow ?? window.open("about:blank", "_blank");
  if (!printWindow || printWindow.closed) return false;
  let currentLocale = initialLocale;
  const render = async (autoPrint: boolean) => {
    const doc = printWindow.document;
    doc.open();
    doc.write(registrationDocumentPage(form, currentLocale));
    doc.close();
    const copy = getRegistrationCopy(currentLocale);
    const toolbar = doc.createElement("nav");
    toolbar.className = "toolbar";
    const status = doc.createElement("span");
    status.setAttribute("role", "alert");
    status.style.color = "white";
    const button = (label: string, handler: () => void | Promise<void>) => {
      const element = doc.createElement("button");
      element.textContent = label;
      element.type = "button";
      element.addEventListener("click", () => { void handler(); });
      toolbar.appendChild(element);
    };
    button(copy.printBtn, async () => { await waitForRegistrationAssets(doc); printWindow.focus(); printWindow.print(); });
    button(copy.downloadBtn, async () => {
      status.textContent = copy.generatingPdf;
      try { await downloadRegistrationPdf(form, currentLocale); status.textContent = ""; }
      catch { status.textContent = currentLocale === "ar" ? "فشل إنشاء PDF. أعد المحاولة." : "PDF generation failed. Please retry."; }
    });
    button(copy.switchLangBtn, () => { currentLocale = currentLocale === "ar" ? "en" : "ar"; void render(false); });
    toolbar.appendChild(status);
    doc.body.prepend(toolbar);
    await waitForRegistrationAssets(doc);
    if (autoPrint && !printWindow.closed) { printWindow.focus(); printWindow.print(); }
  };
  void render(action === "print");
  return true;
}

export async function downloadRegistrationPdf(form: PrintableRegistrationForm, locale: RegistrationLocale = "ar"): Promise<boolean> {
  // A separate visible document avoids inherited opacity, theme styles and CSS leakage.
  const frame = document.createElement("iframe");
  frame.title = getRegistrationCopy(locale).title;
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;background:white;";
  const loaded = new Promise<void>((resolve) => frame.addEventListener("load", () => resolve(), { once: true }));
  frame.srcdoc = registrationDocumentPage(form, locale);
  document.body.appendChild(frame);
  try {
    await loaded;
    const doc = frame.contentDocument;
    if (!doc) throw new Error("Print document could not be opened");
    await waitForRegistrationAssets(doc);
    const sheet = doc.querySelector<HTMLElement>(".sheet");
    if (!sheet) throw new Error("Registration sheet is missing");
    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4", compress: true });
    // Paginate whole rows and sections, keeping the title and course header on every page.
    const originalRows = Array.from(sheet.querySelectorAll("tbody tr"));
    const tableBody = sheet.querySelector("tbody");
    const trailing = Array.from(sheet.children).filter((element) => ["metrics-grid", "notes-box", "signatures-grid"].some((name) => element.classList.contains(name)) || element.tagName === "FOOTER");
    const maxHeight = 297 * 96 / 25.4;
    sheet.style.minHeight = "0";
    sheet.style.justifyContent = "flex-start";
    sheet.style.margin = "0";
    // Remove decorative overflow from measurement; all content is measured before capture.
    sheet.querySelector(".watermark-container")?.remove();
    originalRows.forEach((row) => row.remove());
    trailing.forEach((element) => element.remove());
    let pageCount = 0;
    const capture = async () => {
      if (pageCount++) pdf.addPage();
      sheet.style.minHeight = "297mm";
      const canvas = await toCanvas(sheet, { pixelRatio: 2, backgroundColor: "#ffffff", width: sheet.offsetWidth, height: sheet.scrollHeight, preferredFontFormat: "truetype" });
      const imageHeight = canvas.height * 210 / canvas.width;
      if (imageHeight > 298) throw new Error("A registration section exceeds the printable page height");
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 210, Math.min(297, imageHeight), undefined, "FAST");
      sheet.style.minHeight = "0";
    };
    for (const row of originalRows) {
      tableBody?.appendChild(row);
      if (sheet.scrollHeight > maxHeight && tableBody && tableBody.children.length > 1) {
        row.remove(); await capture(); tableBody.replaceChildren(row);
      }
    }
    for (const section of trailing) {
      sheet.appendChild(section);
      if (sheet.scrollHeight > maxHeight) {
        section.remove(); await capture(); tableBody?.replaceChildren();
        trailing.filter((element) => element.parentElement === sheet).forEach((element) => element.remove());
        sheet.appendChild(section);
      }
    }
    await capture();
    const code = String(form.studentInformation.studentCode || "registration").replace(/[^a-zA-Z0-9_-]/g, "_");
    pdf.save(`registration_${code}_${locale}.pdf`);
    return true;
  } finally { frame.remove(); }
}
