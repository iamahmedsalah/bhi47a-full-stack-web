import { GRADE_STATUS_VALUES, type GradeStatus } from "./grade-statuses";

export function validateHistoricalGrade(
  row: Record<string, unknown>,
  now = new Date(),
) {
  const fail = (message: string) => ({ ok: false as const, message });
  const text = (value: unknown) =>
    typeof value === "string" || typeof value === "number"
      ? String(value).trim()
      : "";
  const studentCode = text(row.studentCode);
  const courseCode = text(row.courseCode).toUpperCase();
  const academicYear = text(row.academicYear);
  const years = /^(\d{4})-(\d{4})$/.exec(academicYear);
  // Academic years start in September; use Cairo rather than server timezone.
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const currentStart = year - (month < 9 ? 1 : 0);
  if (!studentCode || !courseCode)
    return fail(
      "Student and course codes required / كود الطالب والمقرر مطلوبان",
    );
  if (
    !years ||
    Number(years[2]) !== Number(years[1]) + 1 ||
    Number(years[1]) < 1900 ||
    Number(years[1]) >= currentStart
  )
    return fail(
      "A previous academic year is required (YYYY-YYYY) / أدخل سنة دراسية سابقة بوضوح",
    );
  const semesterInput = text(row.semester).toLowerCase();
  const semester =
    (
      {
        الأول: "first",
        الاول: "first",
        الثاني: "second",
        الصيفي: "summer",
        "1": "first",
        "2": "second",
        "3": "summer",
      } as Record<string, string>
    )[semesterInput] ?? semesterInput;
  if (!["first", "second", "summer"].includes(semester))
    return fail("Specify first, second or summer / حدد الفصل الدراسي صراحة");
  const examInput = text(row.examType).toLowerCase();
  const examType =
    (
      {
        ميدترم: "midterm",
        الميدترم: "midterm",
        ميدتيرم: "midterm",
        نهائي: "final",
        النهائي: "final",
        "أعمال السنة": "coursework",
        "اعمال السنة": "coursework",
      } as Record<string, string>
    )[examInput] ?? examInput;
  if (!["coursework", "midterm", "final"].includes(examType))
    return fail(
      "One row per component: coursework, midterm or final / صف مستقل لكل مكوّن",
    );
  // Mixed formats could silently discard the breakdown. Require one unambiguous format.
  if (
    ["midterm", "final", "coursework", "practical", "total"].some(
      (key) => row[key] !== undefined && row[key] !== null && row[key] !== "",
    )
  )
    return fail(
      "Use grade and examType only; remove breakdown values / استخدم الدرجة ونوع الامتحان فقط واحذف قيم أعمدة التفصيل",
    );
  const statusInput = text(row.status).toLowerCase() || "present";
  const status =
    (
      {
        حاضر: "present",
        غائب: "absent",
        محروم: "banned",
        بعذر: "excused",
        محجوب: "withheld",
        محجوبة: "withheld",
        "غير مكتمل": "incomplete",
      } as Record<string, string>
    )[statusInput] ?? statusInput;
  if (
    !(GRADE_STATUS_VALUES as readonly string[]).includes(status) ||
    (examType === "midterm" && !["present", "absent"].includes(status))
  )
    return fail(
      "Invalid exam status; midterm accepts present/absent only / حالة غير صحيحة؛ الميدترم حاضر أو غائب فقط",
    );
  const defaults: Record<string, number> = {
    coursework: 20,
    midterm: 30,
    final: 50,
  };
  const maxGrade =
    row.maxGrade === undefined || row.maxGrade === null || row.maxGrade === ""
      ? defaults[examType]
      : Number(text(row.maxGrade));
  const grade = Number(text(row.grade));
  const scoreless = ["absent", "banned", "excused", "incomplete"].includes(
    status,
  );
  if (
    !Number.isFinite(maxGrade) ||
    maxGrade <= 0 ||
    maxGrade > 1000 ||
    !Number.isFinite(grade) ||
    grade < 0 ||
    grade > maxGrade ||
    Math.abs(grade * 100 - Math.round(grade * 100)) > 0.00001 ||
    (!scoreless && !text(row.grade)) ||
    (scoreless && grade !== 0)
  )
    return fail(
      "Invalid score/maximum; absent or banned must be blank or zero / درجة أو حد أقصى غير صحيح؛ الغائب والمحروم فارغ أو صفر",
    );
  return {
    ok: true as const,
    value: {
      studentCode,
      courseCode,
      academicYear,
      semester,
      examType,
      status: status as GradeStatus,
      grade,
      maxGrade,
    },
  };
}
