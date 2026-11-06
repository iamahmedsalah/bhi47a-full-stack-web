import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export interface ResultCertificateCourse {
  code: string;
  name: string;
  midterm: string;
  final: string;
  coursework?: string;
  total: string;
  status: string;
  creditHours?: number;
  letterGrade?: string;
}

export interface ResultCertificateData {
  locale: "ar" | "en";
  studentName: string;
  studentCode: string;
  academicYear: string;
  semester: string;
  totalAcquired: number;
  totalMax: number;
  percentage: number;
  gpa: number;
  overallGradeLetter?: string;
  overallGradeName?: string;
  passedCourses: number;
  courses: ResultCertificateCourse[];
  issuedAt: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function labels(locale: "ar" | "en") {
  return locale === "ar"
    ? {
        ministry:
          "وزارة التعليم العالي والبحث العلمي · إدارة شؤون الطلاب والامتحانات",
        institute: "المعهد العالي للعلوم الإدارية المتقدمة والحاسبات (BHI47A)",
        title: "شهادة بيان درجات ونتائج فصلية رسمية",
        subtitle:
          "بيان معتمد بتقديرات ودرجات المقررات الدراسية لنظام الساعات المعتمدة",
        officialBadge: "وثيقة أكاديمية رسمية معتمدة",
        docCode: "TRANSCRIPT / RESULT CERTIFICATE",
        studentName: "اسم الطالب الرباعي",
        studentCode: "الكود الأكاديمي للطالب",
        academicYear: "العام الجامعي",
        semester: "الفصل الدراسي",
        courseCode: "كود المقرر",
        courseTitle: "اسم المقرر الدراسي",
        midterm: "الميدتيرم",
        final: "الامتحان النهائي",
        total: "المجموع",
        status: "الحالة / التقدير",
        percentage: "النسبة المئوية العامة",
        gpa: "المعدل التراكمي (GPA)",
        marks: "إجمالي الدرجات المكتسبة",
        passed: "المقررات المنجزة بنجاح",
        overallGrade: "التقدير العام التراكمي",
        affairs: "إدارة شؤون الطلاب والامتحانات",
        affairsSub: "مراجعة وتدقيق الدرجات",
        registrar: "عميد المعهد / مسجل عام المعهد",
        registrarSub: "يعتمد رسمياً خاتم شعار الجمهورية والمعهد",
        sealText: "ختم المعهد الرسمي\nOfficial Stamp",
        footerNotice:
          "هذه الشهادة وثيقة رسمية صادرة إلكترونياً من منصة المعهد الأكاديمية، ولا تصبح نافذة ومعتمدة أمام الجهات الخارجية إلا بعد استيفاء الأختام الرسمية والتوقيعات الحية.",
        systemText: "بوابة شؤون الطلاب والتعليم الإلكتروني الرسمية",
        issuedOn: "تاريخ الإصدار والطباعة:",
        print: "طباعة الشهادة الرسمية",
        download: "تحميل PDF المعتمد",
        generatingPdf: "جاري تجهيز PDF...",
      }
    : {
        ministry:
          "Ministry of Higher Education · Student Affairs & Examination Board",
        institute:
          "Higher Institute for Advanced Administrative Sciences & Computer (BHI47A)",
        title: "Official Academic Transcript & Results Certificate",
        subtitle:
          "Official certified semester results statement under the Credit Hour System",
        officialBadge: "OFFICIAL ACADEMIC TRANSCRIPT",
        docCode: "TRANSCRIPT / RESULT CERTIFICATE",
        studentName: "Student Full Name",
        studentCode: "Academic Student ID",
        academicYear: "Academic Year",
        semester: "Academic Semester",
        courseCode: "Course Code",
        courseTitle: "Course Title",
        midterm: "Coursework / Midterm",
        final: "Final Examination",
        total: "Total Score",
        status: "Result / Grade",
        percentage: "Overall Percentage",
        gpa: "Cumulative GPA",
        marks: "Total Acquired Marks",
        passed: "Passed Courses",
        overallGrade: "Cumulative Overall Rating",
        affairs: "Student Affairs & Examinations",
        affairsSub: "Verified & Audited",
        registrar: "Institute Dean / Registrar",
        registrarSub: "Officially Approved with Official Seal",
        sealText: "Official Institute Seal\nختم المعهد",
        footerNotice:
          "This certificate is an official electronic academic record issued by the SIS Portal. It is legally valid upon authorization with the institute physical seal and signatures.",
        systemText: "Student Affairs & SIS Portal",
        issuedOn: "Date of Issuance:",
        print: "Print Certificate",
        download: "Download Certified PDF",
        generatingPdf: "Generating PDF...",
      };
}

export const certificateStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Inter:wght@400;600;700;800;900&display=swap');

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
  .sheet {
    position: relative;
    width: 210mm;
    height: 297mm;
    min-height: 297mm;
    max-height: 297mm;
    margin: 12px auto;
    padding: 11mm 13mm 10mm;
    background: #ffffff;
    box-shadow: 0 10px 30px rgba(0,0,0,0.15);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    overflow: hidden;
  }
  .top-accent {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 6px;
    background: linear-gradient(90deg, #0d9488, #0284c7, #0d9488);
  }
  .watermark {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-25deg);
    font-size: 80px;
    font-weight: 900;
    color: rgba(13, 148, 136, 0.035);
    pointer-events: none;
    letter-spacing: 12px;
    white-space: nowrap;
    text-transform: uppercase;
    z-index: 0;
  }
  .content-body {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    flex: 1;
  }
  header.cert-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 10px;
    border-bottom: 2px solid #0d9488;
    margin-bottom: 11px;
    gap: 12px;
  }
  .logo-box {
    width: 66px;
    height: 66px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    padding: 4px;
  }
  .logo-box img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  .header-titles {
    text-align: center;
    flex: 1;
  }
  .header-ministry {
    font-size: 9.5px;
    font-weight: 700;
    color: #0d9488;
    margin-bottom: 1px;
    letter-spacing: 0.2px;
  }
  .header-inst {
    font-size: 13px;
    font-weight: 800;
    color: #0f172a;
    margin-bottom: 3px;
  }
  .header-main-title {
    font-size: 17px;
    font-weight: 900;
    color: #092c35;
    letter-spacing: -0.3px;
    margin: 0;
  }
  .header-subtitle {
    font-size: 9px;
    color: #64748b;
    margin-top: 2px;
  }
  .cert-badge-box {
    text-align: end;
    flex-shrink: 0;
  }
  .cert-badge {
    display: inline-block;
    padding: 4px 9px;
    background: rgba(13, 148, 136, 0.1);
    border: 1px solid rgba(13, 148, 136, 0.3);
    border-radius: 6px;
    color: #0d9488;
    font-size: 9.5px;
    font-weight: 800;
    text-align: center;
  }
  .cert-badge small {
    display: block;
    font-size: 7.5px;
    color: #64748b;
    margin-top: 1px;
    font-family: monospace;
    letter-spacing: 1px;
  }
  .student-card {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 10px;
  }
  .card-field {
    padding: 7px 11px;
    border-bottom: 1px solid #e2e8f0;
    border-inline-end: 1px solid #e2e8f0;
  }
  .card-field:nth-child(2n) {
    border-inline-end: 0;
  }
  .card-field:nth-last-child(-n+2) {
    border-bottom: 0;
  }
  .field-lbl {
    font-size: 8px;
    font-weight: 800;
    color: #64748b;
    text-transform: uppercase;
    margin-bottom: 2px;
  }
  .field-val {
    font-size: 11.5px;
    font-weight: 800;
    color: #0f172a;
  }
  .summary-band {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 7px;
    margin-bottom: 11px;
  }
  .summary-tile {
    padding: 7px 6px;
    text-align: center;
    border-radius: 7px;
    border: 1px solid #99f6e4;
    background: #f0fdfa;
  }
  .summary-tile.primary-tile {
    border-color: #38bdf8;
    background: #f0f9ff;
  }
  .summary-tile.accent-tile {
    border-color: #c4b5fd;
    background: #faf5ff;
  }
  .sum-label {
    display: block;
    font-size: 8px;
    font-weight: 800;
    color: #475569;
    margin-bottom: 2px;
    text-transform: uppercase;
  }
  .sum-val {
    display: block;
    font-size: 13px;
    font-weight: 900;
    color: #0f766e;
    font-family: inherit;
  }
  .summary-tile.primary-tile .sum-val {
    color: #0369a1;
  }
  .summary-tile.accent-tile .sum-val {
    color: #6d28d9;
  }
  table.results-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9.5px;
    margin-bottom: 10px;
  }
  table.results-table th {
    background: #092c35;
    color: #ffffff;
    padding: 7px 6px;
    font-weight: 800;
    border: 1px solid #061e24;
    text-align: center;
  }
  table.results-table td {
    padding: 6.5px 6px;
    border: 1px solid #cbd5e1;
    text-align: center;
  }
  table.results-table tbody tr:nth-child(even) {
    background: #f8fafc;
  }
  td.course-cell {
    text-align: start;
    padding-inline-start: 10px;
  }
  .c-name {
    display: block;
    font-weight: 800;
    color: #0f172a;
  }
  .c-code {
    display: block;
    font-size: 8.5px;
    font-family: monospace;
    color: #64748b;
    margin-top: 1px;
  }
  .status-badge {
    display: inline-block;
    padding: 2px 7px;
    border-radius: 9999px;
    font-size: 8.5px;
    font-weight: 800;
  }
  .status-pass {
    background: #dcfce7;
    color: #15803d;
    border: 1px solid #bbf7d0;
  }
  .status-fail {
    background: #fee2e2;
    color: #b91c1c;
    border: 1px solid #fecaca;
  }
  .signatures-bar {
    display: grid;
    grid-template-columns: 1fr 100px 1fr;
    gap: 20px;
    align-items: center;
    margin-top: auto;
    padding-top: 10px;
    border-top: 1px dashed #cbd5e1;
    text-align: center;
  }
  .sig-block {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    min-height: 72px;
  }
  .sig-role {
    font-size: 9.5px;
    font-weight: 800;
    color: #0f172a;
  }
  .sig-sub {
    font-size: 7.5px;
    color: #64748b;
    margin-top: 1px;
  }
  .sig-line {
    margin-top: 30px;
    border-bottom: 1px dotted #94a3b8;
  }
  .stamp-box {
    width: 84px;
    height: 84px;
    margin: 0 auto;
    border: 2px dashed #0d9488;
    border-radius: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #0d9488;
    font-size: 7.5px;
    font-weight: 800;
    text-align: center;
    line-height: 1.25;
    background: rgba(13, 148, 136, 0.03);
  }
  footer.cert-footer {
    padding-top: 8px;
    margin-top: 8px;
    border-top: 1px solid #e2e8f0;
    text-align: center;
    color: #64748b;
    font-size: 7.5px;
    line-height: 1.5;
  }
  .footer-sub {
    font-family: monospace;
    font-size: 7px;
    color: #94a3b8;
    margin-top: 2px;
  }
  @media print {
    body { background: #ffffff !important; }
    .toolbar { display: none !important; }
    .sheet {
      width: 100% !important;
      height: 100% !important;
      margin: 0 !important;
      padding: 10mm 12mm !important;
      box-shadow: none !important;
    }
  }
`;

function certificateMarkup(data: ResultCertificateData, logoUrl: string) {
  const isAr = data.locale === "ar";
  const copy = labels(data.locale);

  const rows = data.courses
    .map((course, index) => {
      const isPass =
        course.status.includes("ناجح") ||
        course.status.toLowerCase().includes("pass");
      return `<tr>
        <td style="font-weight: 700; color: #64748b;">${index + 1}</td>
        <td class="course-cell">
          <span class="c-name">${escapeHtml(course.name)}</span>
          <span class="c-code">${escapeHtml(course.code)}${course.creditHours ? ` · ${course.creditHours} ${isAr ? "ساعات" : "Hrs"}` : ""}</span>
        </td>
        <td style="font-family: monospace; font-weight: 700;">${escapeHtml(course.midterm)}</td>
        <td style="font-family: monospace; font-weight: 700;">${escapeHtml(course.final)}</td>
        <td style="font-family: monospace; font-weight: 700;">${escapeHtml(course.coursework ?? "-")}</td>
        <td style="font-family: monospace; font-weight: 900; color: #092c35;">${escapeHtml(course.total)}</td>
        <td>
          <span class="status-badge ${isPass ? "status-pass" : "status-fail"}">
            ${escapeHtml(course.status)}${course.letterGrade ? ` (${escapeHtml(course.letterGrade)})` : ""}
          </span>
        </td>
      </tr>`;
    })
    .join("");

  return `
    <main class="sheet" style="font-family: ${isAr ? "'Cairo', Tahoma, sans-serif" : "'Inter', Arial, sans-serif"}; direction: ${isAr ? "rtl" : "ltr"};">
      <div class="top-accent"></div>
      <div class="watermark">${escapeHtml(copy.institute)}</div>

      <div class="content-body">
        <header class="cert-header">
          <div class="logo-box">
            <img src="${escapeHtml(logoUrl)}" alt="Institute Logo" />
          </div>
          <div class="header-titles">
            <div class="header-ministry">${escapeHtml(copy.ministry)}</div>
            <div class="header-inst">${escapeHtml(copy.institute)}</div>
            <h1 class="header-main-title">${escapeHtml(copy.title)}</h1>
            <div class="header-subtitle">${escapeHtml(copy.subtitle)}</div>
          </div>
          <div class="cert-badge-box">
            <div class="cert-badge">
              ${escapeHtml(copy.officialBadge)}
              <small>${escapeHtml(copy.docCode)}</small>
            </div>
          </div>
        </header>

        <section class="student-card">
          <div class="card-field">
            <div class="field-lbl">${escapeHtml(copy.studentName)}</div>
            <div class="field-val">${escapeHtml(data.studentName)}</div>
          </div>
          <div class="card-field">
            <div class="field-lbl">${escapeHtml(copy.studentCode)}</div>
            <div class="field-val" style="font-family: monospace;">${escapeHtml(data.studentCode)}</div>
          </div>
          <div class="card-field">
            <div class="field-lbl">${escapeHtml(copy.academicYear)}</div>
            <div class="field-val">${escapeHtml(data.academicYear)}</div>
          </div>
          <div class="card-field">
            <div class="field-lbl">${escapeHtml(copy.semester)}</div>
            <div class="field-val">${escapeHtml(data.semester)}</div>
          </div>
        </section>

        <section class="summary-band">
          <div class="summary-tile primary-tile">
            <span class="sum-label">${escapeHtml(copy.gpa)}</span>
            <span class="sum-val" style="font-family: monospace;">${data.gpa.toFixed(2)} / 4.00</span>
          </div>
          <div class="summary-tile primary-tile">
            <span class="sum-label">${escapeHtml(copy.percentage)}</span>
            <span class="sum-val" style="font-family: monospace;">${data.percentage}%</span>
          </div>
          <div class="summary-tile accent-tile">
            <span class="sum-label">${escapeHtml(copy.overallGrade)}</span>
            <span class="sum-val">${escapeHtml(data.overallGradeLetter || "—")} <small style="font-size: 10px; font-weight: 700;">${escapeHtml(data.overallGradeName ? `(${data.overallGradeName})` : "")}</small></span>
          </div>
          <div class="summary-tile">
            <span class="sum-label">${escapeHtml(copy.marks)}</span>
            <span class="sum-val" style="font-family: monospace; font-size: 11px;">${data.totalAcquired} / ${data.totalMax}</span>
          </div>
          <div class="summary-tile">
            <span class="sum-label">${escapeHtml(copy.passed)}</span>
            <span class="sum-val" style="font-family: monospace;">${data.passedCourses} / ${data.courses.length}</span>
          </div>
        </section>

        <table class="results-table">
          <thead>
            <tr>
              <th style="width: 30px;">#</th>
              <th>${escapeHtml(copy.courseTitle)}</th>
              <th style="width: 80px;">${escapeHtml(copy.midterm)}</th>
              <th style="width: 85px;">${escapeHtml(copy.final)}</th>
              <th style="width: 70px;">${data.locale === "ar" ? "\u0623\u0639\u0645\u0627\u0644 \u0627\u0644\u0633\u0646\u0629" : "Coursework"}</th>
              <th style="width: 75px;">${escapeHtml(copy.total)}</th>
              <th style="width: 95px;">${escapeHtml(copy.status)}</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>

        <section class="signatures-bar">
          <div class="sig-block">
            <div class="sig-role">${escapeHtml(copy.affairs)}</div>
            <div class="sig-sub">${escapeHtml(copy.affairsSub)}</div>
            <div class="sig-line"></div>
          </div>
          <div class="stamp-box">
            <span>${copy.sealText.replace("\n", "<br/>")}</span>
          </div>
          <div class="sig-block">
            <div class="sig-role">${escapeHtml(copy.registrar)}</div>
            <div class="sig-sub">${escapeHtml(copy.registrarSub)}</div>
            <div class="sig-line"></div>
          </div>
        </section>

        <footer class="cert-footer">
          <div>${escapeHtml(copy.footerNotice)}</div>
          <div class="footer-sub">
            ${escapeHtml(copy.systemText)} · ${escapeHtml(copy.issuedOn)} ${escapeHtml(data.issuedAt)} · Document Ref: RES-${escapeHtml(data.studentCode)}-${Date.now().toString(36).toUpperCase()}
          </div>
        </footer>
      </div>
    </main>
  `;
}

export function openResultCertificate(data: ResultCertificateData): boolean {
  const printWindow = window.open("about:blank", "_blank") as
    (Window & { downloadCertificate?: () => void }) | null;
  if (!printWindow) return false;

  printWindow.downloadCertificate = () => {
    void downloadResultCertificatePdf(data);
  };

  const copy = labels(data.locale);
  const logoUrl = `${window.location.origin}/logo.webp`;

  printWindow.document.write(`
    <!doctype html>
    <html lang="${data.locale}" dir="${data.locale === "ar" ? "rtl" : "ltr"}">
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <title>${escapeHtml(copy.title)} - ${escapeHtml(data.studentName)}</title>
        <style>
          ${certificateStyles}
        </style>
      </head>
      <body>
        <div class="toolbar">
          <button onclick="window.print()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
            ${escapeHtml(copy.print)}
          </button>
          <button class="secondary" onclick="window.downloadCertificate()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            ${escapeHtml(copy.download)}
          </button>
        </div>
        ${certificateMarkup(data, logoUrl)}
      </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();
  return true;
}

export async function downloadResultCertificatePdf(
  data: ResultCertificateData,
): Promise<boolean> {
  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.direction = data.locale === "ar" ? "rtl" : "ltr";
  container.innerHTML = `<style>${certificateStyles}</style>${certificateMarkup(
    data,
    `${window.location.origin}/logo.webp`,
  )}`;
  document.body.appendChild(container);

  try {
    await document.fonts.ready;
    await new Promise((resolve) => setTimeout(resolve, 350));
    const sheet = container.querySelector<HTMLElement>(".sheet");
    if (!sheet) return false;

    const canvas = await html2canvas(sheet, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });

    const pdf = new jsPDF("p", "mm", "a4");
    pdf.addImage(
      canvas.toDataURL("image/png"),
      "PNG",
      0,
      0,
      pdf.internal.pageSize.getWidth(),
      pdf.internal.pageSize.getHeight(),
    );
    pdf.save(
      `results_${data.studentCode || "student"}_${data.academicYear || "semester"}.pdf`,
    );
    return true;
  } finally {
    document.body.removeChild(container);
  }
}
