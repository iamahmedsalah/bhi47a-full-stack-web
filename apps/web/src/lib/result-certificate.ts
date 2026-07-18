import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export interface ResultCertificateCourse {
  code: string;
  name: string;
  midterm: string;
  final: string;
  total: string;
  status: string;
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
  passedCourses: number;
  courses: ResultCertificateCourse[];
  issuedAt: string;
}

function escapeHtml(value: unknown) {
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
        institute: "المعهد العالي للعلوم الإدارية المتقدمة والحاسبات",
        title: "شهادة بيان نتائج",
        subtitle: "بيان رسمي بنتائج الفصل الدراسي",
        official: "وثيقة أكاديمية",
        studentName: "اسم الطالب",
        studentCode: "الكود الأكاديمي",
        academicYear: "العام الأكاديمي",
        semester: "الفصل الدراسي",
        course: "المقرر الدراسي",
        midterm: "أعمال السنة",
        final: "الامتحان النهائي",
        total: "المجموع",
        status: "النتيجة",
        percentage: "النسبة العامة",
        gpa: "المعدل التراكمي (4.00)",
        marks: "إجمالي الدرجات",
        passed: "المقررات الناجحة",
        affairs: "شؤون الطلاب",
        registrar: "مسجل المعهد",
        footer: "هذه الشهادة صادرة إلكترونيًا وتصبح معتمدة بعد ختم المعهد وتوقيع المختص.",
        print: "طباعة الشهادة",
        download: "تنزيل PDF",
      }
    : {
        institute: "Higher Institute for Advanced Administrative Sciences & Computer",
        title: "Statement of Results",
        subtitle: "Official semester academic results certificate",
        official: "Academic Document",
        studentName: "Student name",
        studentCode: "Student code",
        academicYear: "Academic year",
        semester: "Semester",
        course: "Course",
        midterm: "Coursework",
        final: "Final exam",
        total: "Total",
        status: "Result",
        percentage: "Overall percentage",
        gpa: "Cumulative GPA (4.00)",
        marks: "Total marks",
        passed: "Passed courses",
        affairs: "Student Affairs",
        registrar: "Institute Registrar",
        footer: "This electronically issued certificate is valid after the institute seal and authorized signature.",
        print: "Print certificate",
        download: "Download PDF",
      };
}

function certificateMarkup(data: ResultCertificateData, logoUrl: string) {
  const copy = labels(data.locale);
  const rows = data.courses
    .map(
      (course, index) => `<tr>
        <td class="index">${index + 1}</td>
        <td class="course"><strong>${escapeHtml(course.name)}</strong><span>${escapeHtml(course.code)}</span></td>
        <td>${escapeHtml(course.midterm)}</td>
        <td>${escapeHtml(course.final)}</td>
        <td><strong>${escapeHtml(course.total)}</strong></td>
        <td><span class="result">${escapeHtml(course.status)}</span></td>
      </tr>`,
    )
    .join("");

  return `<main class="certificate">
    <div class="top-accent"></div>
    <header>
      <img src="${escapeHtml(logoUrl)}" alt="Institute logo" />
      <div class="heading">
        <p>${escapeHtml(copy.institute)}</p>
        <h1>${escapeHtml(copy.title)}</h1>
        <p>${escapeHtml(copy.subtitle)}</p>
      </div>
      <div class="document-label">${escapeHtml(copy.official)}<small>RESULTS</small></div>
    </header>

    <section class="student-details">
      <div><span>${escapeHtml(copy.studentName)}</span><strong>${escapeHtml(data.studentName)}</strong></div>
      <div><span>${escapeHtml(copy.studentCode)}</span><strong>${escapeHtml(data.studentCode)}</strong></div>
      <div><span>${escapeHtml(copy.academicYear)}</span><strong>${escapeHtml(data.academicYear)}</strong></div>
      <div><span>${escapeHtml(copy.semester)}</span><strong>${escapeHtml(data.semester)}</strong></div>
    </section>

    <section class="summary">
      <div><span>${escapeHtml(copy.gpa)}</span><strong>${data.gpa.toFixed(2)} / 4.00</strong></div>
      <div><span>${escapeHtml(copy.percentage)}</span><strong>${data.percentage}%</strong></div>
      <div><span>${escapeHtml(copy.marks)}</span><strong>${data.totalAcquired} / ${data.totalMax}</strong></div>
      <div><span>${escapeHtml(copy.passed)}</span><strong>${data.passedCourses} / ${data.courses.length}</strong></div>
    </section>

    <table>
      <thead><tr>
        <th>#</th><th>${escapeHtml(copy.course)}</th><th>${escapeHtml(copy.midterm)}</th>
        <th>${escapeHtml(copy.final)}</th><th>${escapeHtml(copy.total)}</th><th>${escapeHtml(copy.status)}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <section class="signatures">
      <div>${escapeHtml(copy.affairs)}</div>
      <div class="seal">${data.locale === "ar" ? "ختم المعهد" : "Institute Seal"}</div>
      <div>${escapeHtml(copy.registrar)}</div>
    </section>

    <footer>${escapeHtml(copy.footer)}<br/><span>${escapeHtml(data.issuedAt)}</span></footer>
  </main>`;
}

const certificateStyles = `
  @page{size:A4 portrait;margin:9mm}*{box-sizing:border-box}
  body{margin:0;background:#dce5e8;color:#12313b;font-family:Arial,"Segoe UI",Tahoma,sans-serif}
  .certificate{position:relative;width:210mm;min-height:297mm;margin:16px auto;padding:14mm;background:#fff;box-shadow:0 12px 34px #071f2930;overflow:hidden}
  .top-accent{position:absolute;inset:0 0 auto;height:7px;background:linear-gradient(90deg,#0b6170,#19aee5,#0b6170)}
  header{display:grid;grid-template-columns:78px 1fr 90px;align-items:center;gap:14px;padding:4px 0 14px;border-bottom:3px double #0b6170;text-align:center}
  header img{width:72px;height:72px;object-fit:contain}
  .heading p{margin:3px;color:#37636d;font-size:11px;font-weight:700}.heading h1{margin:5px;color:#073b4c;font-size:23px}
  .document-label{color:#55717a;font-size:10px;font-weight:800;text-transform:uppercase}.document-label small{display:block;margin-top:5px;color:#0b6170;letter-spacing:1.5px}
  .student-details{display:grid;grid-template-columns:1fr 1fr;margin:18px 0;border:1px solid #b9cdd2;border-radius:9px;overflow:hidden;background:#f7fafb}
  .student-details div{min-height:52px;padding:9px 12px;border-bottom:1px solid #d9e3e6;border-inline-end:1px solid #d9e3e6}.student-details div:nth-child(2n){border-inline-end:0}.student-details div:nth-last-child(-n+2){border-bottom:0}
  .student-details span,.summary span{display:block;margin-bottom:4px;color:#607b83;font-size:9px;font-weight:800;text-transform:uppercase}.student-details strong{font-size:12px}
  .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:17px}.summary div{padding:10px;text-align:center;border:1px solid #b8d8dc;border-radius:8px;background:#edf7f7}.summary strong{font-size:15px;color:#075e6d}
  table{width:100%;border-collapse:collapse;font-size:10px}th{padding:9px 6px;background:#0b6170;color:#fff;border:1px solid #0a5561;text-align:center}td{padding:8px 6px;border:1px solid #cedadd;text-align:center}tbody tr:nth-child(even){background:#f4f8f8}
  td.course{text-align:start}.course strong{display:block;font-size:10px}.course span{display:block;margin-top:2px;color:#6a8188;font:9px Consolas,monospace}.index{width:30px}.result{display:inline-block;padding:3px 7px;border-radius:10px;background:#e7f7f1;color:#087a55;font-weight:800}
  .signatures{display:grid;grid-template-columns:1fr 110px 1fr;align-items:end;gap:35px;margin-top:48px;text-align:center;font-size:10px;font-weight:700}.signatures>div:not(.seal){padding-top:7px;border-top:1px solid #334d55}.seal{display:flex;height:78px;align-items:center;justify-content:center;border:2px dashed #9eb5ba;border-radius:50%;color:#8aa1a7;font-size:9px}
  footer{position:absolute;inset-inline:14mm;bottom:11mm;padding-top:8px;border-top:1px solid #d6e0e2;text-align:center;color:#6b8289;font-size:8px;line-height:1.6}footer span{font-family:Consolas,monospace}
  @media print{body{background:#fff}.toolbar{display:none!important}.certificate{width:auto;min-height:auto;margin:0;padding:8mm;box-shadow:none}footer{inset-inline:8mm}}
`;

export function openResultCertificate(data: ResultCertificateData) {
  const printWindow = window.open("about:blank", "_blank") as
    | (Window & { downloadCertificate?: () => void })
    | null;
  if (!printWindow) return false;
  printWindow.downloadCertificate = () => {
    void downloadResultCertificatePdf(data);
  };
  const copy = labels(data.locale);
  const logoUrl = `${window.location.origin}/logo.webp`;
  printWindow.document.write(`<!doctype html><html lang="${data.locale}" dir="${data.locale === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(copy.title)}</title><style>${certificateStyles}.toolbar{position:sticky;top:0;z-index:5;display:flex;justify-content:center;gap:10px;padding:11px;background:#092f39}.toolbar button{border:0;border-radius:8px;padding:10px 18px;background:#16abe0;color:#fff;font-weight:800;cursor:pointer}.toolbar .secondary{background:#087a55}</style></head><body><div class="toolbar"><button onclick="window.print()">${escapeHtml(copy.print)}</button><button class="secondary" onclick="window.downloadCertificate()">${escapeHtml(copy.download)}</button></div>${certificateMarkup(data, logoUrl)}</body></html>`);
  printWindow.document.close();
  printWindow.focus();
  return true;
}

export async function downloadResultCertificatePdf(data: ResultCertificateData) {
  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.direction = data.locale === "ar" ? "rtl" : "ltr";
  container.innerHTML = `<style>${certificateStyles}</style>${certificateMarkup(data, `${window.location.origin}/logo.webp`)}`;
  document.body.appendChild(container);
  try {
    await document.fonts.ready;
    await new Promise((resolve) => setTimeout(resolve, 350));
    const sheet = container.querySelector<HTMLElement>(".certificate");
    if (!sheet) return false;
    const canvas = await html2canvas(sheet, { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false });
    const pdf = new jsPDF("p", "mm", "a4");
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
    pdf.save(`results_${data.studentCode || "student"}_${data.academicYear}.pdf`);
    return true;
  } finally {
    document.body.removeChild(container);
  }
}
