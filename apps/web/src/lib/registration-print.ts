import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export interface PrintableRegistrationForm {
  instituteName: string;
  title: string;
  studentInformation: Record<string, string | number | undefined>;
  registeredCourses: Array<{
    code: string;
    courseName: string;
    courseNameEn?: string;
    courseNameAr?: string;
    creditHours: number;
    type: string;
    status: string;
  }>;
  totalCreditHours: number;
  registrationStatus: string;
  advisorNotes?: string;
  date: string;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export const fieldLabels: Record<string, string> = {
  studentName: "اسم الطالب / Student name",
  studentCode: "كود الطالب / Student code",
  nationalId: "الرقم القومي / National ID",
  academicLevel: "المستوى الدراسي / Level",
  semester: "الفصل الدراسي / Semester",
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
  approved: "معتمد",
  rejected: "مرفوض",
  first: "الأول",
  second: "الثاني",
  summer: "الصيفي",
};

export function bilingualValue(value: unknown): string {
  const text = String(value ?? "");
  return arabicValues[text] ?? text;
}

export function openRegistrationPrintView(
  form: PrintableRegistrationForm,
  action: "print" | "download" = "print",
) {
  const printWindow = window.open("about:blank", "_blank");
  if (!printWindow) return false;

  (printWindow as any).formData = form;
  (printWindow as any).downloadPdf = () => {
    downloadRegistrationPdf(form);
  };

  const rows = form.registeredCourses
    .map(
      (course, index) => `<tr>
    <td style="text-align: center;">${index + 1}</td>
    <td class="code">${escapeHtml(course.code)}</td>
    <td>${escapeHtml(course.courseNameAr ?? course.courseName)} ${course.courseNameEn ? `<div class="english">${escapeHtml(course.courseNameEn)}</div>` : ""}</td>
    <td style="text-align: center;">${escapeHtml(course.creditHours)}</td>
    <td>${escapeHtml(bilingualValue(course.type))}</td>
    <td><span class="status">${escapeHtml(bilingualValue(course.status))}</span></td>
  </tr>`,
    )
    .join("");

  const details = Object.entries(form.studentInformation)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(
      ([key, value]) => `<div class="detail">
        <span>${escapeHtml(fieldLabels[key] ?? key)}</span>
        <strong>${escapeHtml(key === "semester" ? bilingualValue(value) : value)}</strong>
      </div>`,
    )
    .join("");

  const logoUrl = `${window.location.origin}/logo.webp`;
  const autoPrintScript =
    action === "print"
      ? `<script>window.onload=()=>setTimeout(()=>window.print(),300);</script>`
      : "";

  printWindow.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escapeHtml(form.title)}</title>
  <style>
    @page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}
    body{margin:0;background:#e5e7eb;color:#132b35;font-family:Arial,"Segoe UI",Tahoma,sans-serif;direction:rtl}
    .toolbar{position:sticky;top:0;display:flex;justify-content:center;gap:12px;padding:12px;background:#0b313b;z-index:2}
    .toolbar button{border:0;border-radius:8px;padding:10px 18px;background:#15aee5;color:#fff;font-weight:700;cursor:pointer}
    .toolbar .secondary{background:#087a55}
    .sheet{width:210mm;min-height:297mm;margin:18px auto;padding:14mm;background:#fff;box-shadow:0 8px 28px #0002}
    header{display:grid;grid-template-columns:80px 1fr 80px;align-items:center;border-bottom:3px solid #0c6570;padding-bottom:12px;text-align:center}
    header img{width:70px;height:70px;object-fit:contain}
    header h1{margin:3px 0;color:#073b4c;font-size:20px}
    header p{margin:3px 0;color:#0f6570;font-size:13px;font-weight:700}
    .document-number{font-size:10px;color:#64748b;font-weight:700;text-align:center}
    .details{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #b6c6ca;border-radius:8px;overflow:hidden;margin:18px 0;background:#f9fafb}
    .detail{min-height:48px;padding:8px 12px;border-bottom:1px solid #d8e0e2;border-left:1px solid #d8e0e2}
    .detail:nth-child(2n){border-left:0}
    .detail span{display:block;color:#55717a;font-size:10px;font-weight:700;margin-bottom:3px}
    .detail strong{font-size:12px;color:#132b35}
    table{width:100%;border-collapse:collapse;font-size:11px;margin-top:14px}
    th{background:#0c6570;color:#fff;padding:9px 8px;text-align:right}
    td{border:1px solid #cbd5d8;padding:8px;vertical-align:middle;text-align:right}
    tr:nth-child(even) td{background:#f4f8f8}
    .code{font-family:Consolas,monospace;font-weight:700}
    .english{font-size:9px;color:#64748b;margin-top:2px}
    .status{color:#087a55;font-weight:700;background:#ecfdf5;padding:2px 6px;border-radius:4px;display:inline-block}
    .summary{display:flex;justify-content:space-between;gap:20px;margin-top:14px;padding:11px;background:#edf7f7;border:1px solid #b9d8d8;border-radius:7px;font-weight:700;font-size:12px}
    .notes{min-height:52px;margin-top:14px;padding:10px;border:1px solid #cbd5d8;border-radius:7px;font-size:11px}
    .signatures{display:grid;grid-template-columns:1fr 1fr;gap:55px;margin-top:42px;text-align:center;font-size:11px}
    .signature-line{border-top:1px solid #334155;padding-top:7px}
    footer{margin-top:35px;border-top:1px solid #d8e0e2;padding-top:8px;text-align:center;color:#64748b;font-size:10px;font-weight:600}
    @media print{body{background:#fff}.toolbar{display:none}.sheet{width:auto;min-height:auto;margin:0;padding:0;box-shadow:none}}
  </style>${autoPrintScript}</head><body>
  <div class="toolbar"><button onclick="window.print()">طباعة الاستمارة</button><button class="secondary" onclick="window.downloadPdf ? window.downloadPdf() : window.print()">حفظ PDF</button></div>
  <main class="sheet">
    <header>
      <img src="${escapeHtml(logoUrl)}" alt="لوجو المعهد" />
      <div>
        <p>${escapeHtml(form.instituteName)}</p>
        <h1>${escapeHtml(form.title)}</h1>
        <p>استمارة تسجيل المقررات الدراسية</p>
      </div>
      <div class="document-number">استمارة رسمية<br/>REGISTRATION</div>
    </header>
    <section class="details">${details}</section>
    <table>
      <thead>
        <tr>
          <th style="width: 35px; text-align: center;">#</th>
          <th style="width: 90px;">الكود</th>
          <th>المقرر الدراسي</th>
          <th style="width: 60px; text-align: center;">الساعات</th>
          <th style="width: 85px;">النوع</th>
          <th style="width: 110px;">الحالة</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="summary">
      <span>إجمالي الساعات المعتمدة: ${escapeHtml(form.totalCreditHours)}</span>
      <span>حالة التسجيل: ${escapeHtml(bilingualValue(form.registrationStatus))}</span>
    </div>
    <div class="notes">
      <strong>ملاحظات المرشد الأكاديمي:</strong><br/>
      ${escapeHtml(form.advisorNotes || "—")}
    </div>
    <div class="signatures">
      <div class="signature-line">توقيع الطالب</div>
      <div class="signature-line">توقيع المرشد الأكاديمي</div>
    </div>
    <footer>تم الإنشاء في ${escapeHtml(form.date)} · تعتبر هذه الاستمارة صالحة فقط بوجود ختم المعهد الرسمي.</footer>
  </main></body></html>`);
  printWindow.document.close();
  printWindow.focus();
  return true;
}

export async function downloadRegistrationPdf(form: PrintableRegistrationForm) {
  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "-9999px";
  container.style.width = "210mm";
  container.style.background = "#fff";
  container.style.direction = "rtl";

  const rows = form.registeredCourses
    .map(
      (course, index) => `
    <tr style="background: ${index % 2 === 1 ? "#f4f8f8" : "#fff"};">
      <td style="border: 1px solid #cbd5d8; padding: 8px 6px; text-align: center;">${index + 1}</td>
      <td style="border: 1px solid #cbd5d8; padding: 8px 6px; font-family: Consolas, monospace; font-weight: 700; text-align: right;">${escapeHtml(course.code)}</td>
      <td style="border: 1px solid #cbd5d8; padding: 8px 6px; text-align: right;">
        ${escapeHtml(course.courseNameAr ?? course.courseName)}
        ${course.courseNameEn ? `<div style="font-size: 9px; color: #64748b; margin-top: 2px;">${escapeHtml(course.courseNameEn)}</div>` : ""}
      </td>
      <td style="border: 1px solid #cbd5d8; padding: 8px 6px; text-align: center;">${escapeHtml(course.creditHours)}</td>
      <td style="border: 1px solid #cbd5d8; padding: 8px 6px; text-align: right;">${escapeHtml(bilingualValue(course.type))}</td>
      <td style="border: 1px solid #cbd5d8; padding: 8px 6px; text-align: right;"><span style="color: #087a55; font-weight: 700; background: #ecfdf5; padding: 2px 6px; border-radius: 4px; display: inline-block;">${escapeHtml(bilingualValue(course.status))}</span></td>
    </tr>
  `,
    )
    .join("");

  const details = Object.entries(form.studentInformation)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(
      ([key, value]) => `
      <div style="min-height: 48px; padding: 8px 12px; border-bottom: 1px solid #d8e0e2; border-left: 1px solid #d8e0e2; box-sizing: border-box;">
        <span style="display: block; color: #55717a; font-size: 10px; font-weight: 700; margin-bottom: 3px;">${escapeHtml(fieldLabels[key] ?? key)}</span>
        <strong style="font-size: 12px; color: #132b35;">${escapeHtml(key === "semester" ? bilingualValue(value) : value)}</strong>
      </div>
    `,
    )
    .join("");

  const logoUrl = `${window.location.origin}/logo.webp`;

  container.innerHTML = `
    <div style="width: 210mm; min-height: 297mm; padding: 14mm; background: #fff; font-family: Arial, sans-serif; box-sizing: border-box; color: #132b35; direction: rtl;">
      <header style="display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #0c6570; padding-bottom: 12px; text-align: center; margin-bottom: 18px;">
        <img src="${escapeHtml(logoUrl)}" alt="Institute logo" style="width: 70px; height: 70px; object-fit: contain;" />
        <div style="flex: 1; padding: 0 20px;">
          <p style="margin: 3px 0; color: #0f6570; font-size: 13px; font-weight: 700;">${escapeHtml(form.instituteName)}</p>
          <h1 style="margin: 3px 0; color: #073b4c; font-size: 20px;">${escapeHtml(form.title)}</h1>
          <p style="margin: 3px 0; color: #0f6570; font-size: 13px; font-weight: 700;">استمارة تسجيل المقررات الدراسية</p>
        </div>
        <div style="font-size: 10px; color: #64748b; font-weight: 700; text-align: center;">استمارة رسمية<br/>REGISTRATION</div>
      </header>
      <section style="display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #b6c6ca; border-radius: 8px; overflow: hidden; margin: 18px 0; background: #f9fafb;">
        ${details}
      </section>
      <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 18px;">
        <thead>
          <tr style="background: #0c6570; color: #fff;">
            <th style="padding: 9px 6px; border: 1px solid #cbd5d8; width: 35px; text-align: center;">#</th>
            <th style="padding: 9px 6px; border: 1px solid #cbd5d8; width: 90px; text-align: right;">الكود</th>
            <th style="padding: 9px 6px; border: 1px solid #cbd5d8; text-align: right;">المقرر الدراسي</th>
            <th style="padding: 9px 6px; border: 1px solid #cbd5d8; width: 60px; text-align: center;">الساعات</th>
            <th style="padding: 9px 6px; border: 1px solid #cbd5d8; width: 85px; text-align: right;">النوع</th>
            <th style="padding: 9px 6px; border: 1px solid #cbd5d8; width: 110px; text-align: right;">الحالة</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <div style="display: flex; justify-content: space-between; gap: 20px; margin-top: 14px; padding: 11px; background: #edf7f7; border: 1px solid #b9d8d8; border-radius: 7px; font-weight: 700; font-size: 12px; box-sizing: border-box;">
        <span>إجمالي الساعات المعتمدة: ${escapeHtml(form.totalCreditHours)}</span>
        <span>حالة التسجيل: ${escapeHtml(bilingualValue(form.registrationStatus))}</span>
      </div>
      <div style="min-height: 52px; margin-top: 14px; padding: 10px; border: 1px solid #cbd5d8; border-radius: 7px; font-size: 11px; box-sizing: border-box;">
        <strong>ملاحظات المرشد الأكاديمي:</strong><br/>
        ${escapeHtml(form.advisorNotes || "—")}
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 55px; margin-top: 42px; text-align: center; font-size: 11px;">
        <div style="border-top: 1px solid #334155; padding-top: 7px;">توقيع الطالب</div>
        <div style="border-top: 1px solid #334155; padding-top: 7px;">توقيع المرشد الأكاديمي</div>
      </div>
      <footer style="margin-top: 35px; border-top: 1px solid #d8e0e2; padding-top: 8px; text-align: center; color: #64748b; font-size: 10px; font-weight: 600;">
        تم الإنشاء في ${escapeHtml(form.date)} · تعتبر هذه الاستمارة صالحة فقط بوجود ختم المعهد الرسمي.
      </footer>
    </div>
  `;

  document.body.appendChild(container);

  try {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);

    const studentCode = form.studentInformation.studentCode || "registration";
    pdf.save(`registration_${studentCode}.pdf`);
    return true;
  } catch (error) {
    console.error("PDF generation failed", error);
    return false;
  } finally {
    document.body.removeChild(container);
  }
}
