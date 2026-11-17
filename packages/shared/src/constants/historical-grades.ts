import { GRADE_STATUS_VALUES, type GradeStatus } from "./grade-statuses";
import { CONTROL_MIDTERM_STATES } from "./control";

/** Both upload formats normalize to the same independently stored exam marks. */
export function validateHistoricalGradeRow(
  row: Record<string, unknown>,
  now = new Date(),
) {
  const has = (key: string) =>
    row[key] !== undefined && row[key] !== null && row[key] !== "";
  const components = ["coursework", "midterm", "final"] as const;
  const breakdown = components.some(has);
  const fail = (message: string) => ({ ok: false as const, message });
  if (!breakdown) {
    if (components.some((c) => has(`${c}Status`) || has(`${c}MaxGrade`)))
      return fail(
        "Component status/maximum requires its component score / حالة المكون وعظماه تتطلبان درجته",
      );
    const result = validateHistoricalGrade(row, now);
    return result.ok ? { ok: true as const, values: [result.value] } : result;
  }
  if (
    ["examType", "grade", "maxGrade", "status", "practical", "total"].some(has)
  )
    return fail(
      "Use either component columns or grade/examType, without totals or a shared status / استخدم أعمدة المكونات أو الدرجة ونوع الامتحان، دون مجموع أو حالة مشتركة",
    );
  const values: HistoricalMark[] = [];
  for (const component of components) {
    if (!has(component)) {
      if (has(`${component}Status`) || has(`${component}MaxGrade`))
        return fail(
          `${component}: enter a score (zero for absence) with its status/maximum / أدخل درجة المكون (صفر للغياب) مع حالته وحده الأقصى`,
        );
      continue; // Blank means omitted; an explicit zero remains a real mark.
    }
    const result = validateHistoricalGrade(
      {
        studentCode: row.studentCode,
        courseCode: row.courseCode,
        academicYear: row.academicYear,
        semester: row.semester,
        examType: component,
        grade: row[component],
        maxGrade: row[`${component}MaxGrade`],
        status: row[`${component}Status`],
      },
      now,
    );
    if (!result.ok) return fail(`${component}: ${result.message}`);
    values.push(result.value);
  }
  return { ok: true as const, values };
}

export type HistoricalMark = Extract<
  ReturnType<typeof validateHistoricalGrade>,
  { ok: true }
>["value"];

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
    (examType === "midterm" &&
      !(CONTROL_MIDTERM_STATES as readonly string[]).includes(status))
  )
    return fail(
      "Invalid exam status; midterm accepts present/absent/banned only / حالة غير صحيحة؛ الميدترم حاضر أو غائب أو محروم فقط",
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
