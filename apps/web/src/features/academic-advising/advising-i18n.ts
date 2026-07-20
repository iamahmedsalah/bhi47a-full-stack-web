import type {
  AdvisingStatus,
  CourseRecommendation,
} from "./types/advising.types";

export type AdvisingLocale = "ar" | "en";

const advisingStatuses: Record<
  AdvisingStatus,
  Record<AdvisingLocale, string>
> = {
  NOT_STARTED: { ar: "لم يبدأ", en: "Not started" },
  AUTO_RECOMMENDED: { ar: "موصى به آلياً", en: "Auto-recommended" },
  ASSIGNED: { ar: "تم تعيين مرشد", en: "Advisor assigned" },
  UNDER_REVIEW: { ar: "قيد المراجعة", en: "Under review" },
  DRAFT: { ar: "مسودة", en: "Draft" },
  WAITING_FOR_STUDENT: { ar: "في انتظار الطالب", en: "Waiting for student" },
  REVISION_REQUESTED: { ar: "طُلب تعديل", en: "Revision requested" },
  APPROVED: { ar: "معتمد", en: "Approved" },
  REGISTERED: { ar: "تم التسجيل", en: "Registered" },
  CLOSED: { ar: "مغلق", en: "Closed" },
};

const semesters: Record<string, Record<AdvisingLocale, string>> = {
  first: { ar: "الفصل الأول", en: "First semester" },
  second: { ar: "الفصل الثاني", en: "Second semester" },
  summer: { ar: "الفصل الصيفي", en: "Summer semester" },
};

const auditActions: Record<string, Record<AdvisingLocale, string>> = {
  RECOMMENDATIONS_GENERATED: {
    ar: "إنشاء التوصيات",
    en: "Recommendations generated",
  },
  CASE_CREATED: { ar: "فتح حالة إرشاد", en: "Advising case opened" },
  CASE_STATUS_CHANGED: {
    ar: "تغيير حالة الإرشاد",
    en: "Advising status changed",
  },
  PLAN_CREATED: { ar: "حفظ مسودة الخطة", en: "Plan draft saved" },
  PLAN_APPROVED: { ar: "اعتماد الخطة", en: "Plan approved" },
  RECOMMENDATION_DECIDED: {
    ar: "تحديث قرار توصية",
    en: "Recommendation decision updated",
  },
  NOTE_CREATED: { ar: "إضافة ملاحظة", en: "Note added" },
};

const entityTypes: Record<string, Record<AdvisingLocale, string>> = {
  AdvisingCase: { ar: "حالة إرشاد", en: "Advising case" },
  AdvisingPlan: { ar: "خطة إرشاد", en: "Advising plan" },
  CourseRecommendation: { ar: "توصية مقرر", en: "Course recommendation" },
  AdvisingNote: { ar: "ملاحظة إرشاد", en: "Advising note" },
};

export function advisingStatusLabel(status: string, locale: AdvisingLocale) {
  return advisingStatuses[status as AdvisingStatus]?.[locale] ?? status;
}

export function semesterLabel(semester: string, locale: AdvisingLocale) {
  return semesters[semester]?.[locale] ?? semester;
}

export function noteVisibilityLabel(
  visibility: string,
  locale: AdvisingLocale,
) {
  if (visibility === "INTERNAL") return locale === "ar" ? "داخلي" : "Internal";
  if (visibility === "STUDENT_VISIBLE") {
    return locale === "ar" ? "ظاهر للطالب" : "Student visible";
  }
  return visibility;
}

export function auditActionLabel(action: string, locale: AdvisingLocale) {
  return (
    auditActions[action]?.[locale] ?? action.replaceAll("_", " ").toLowerCase()
  );
}

export function entityTypeLabel(entityType: string, locale: AdvisingLocale) {
  return entityTypes[entityType]?.[locale] ?? entityType;
}

export function registrationSourceLabel(
  source: string,
  locale: AdvisingLocale,
) {
  if (source === "advisor") return locale === "ar" ? "المرشد" : "Advisor";
  if (source === "student") return locale === "ar" ? "الطالب" : "Student";
  return source;
}

export function recommendationExplanation(
  item: CourseRecommendation,
  locale: AdvisingLocale,
) {
  const name = locale === "ar" ? item.courseId.nameAr : item.courseId.nameEn;
  if (item.reasonCodes?.includes("FAILED_PREVIOUSLY")) {
    return locale === "ar"
      ? `أولوية أولى: سبق الرسوب في ${name} ويجب إعادة تسجيله أولاً.`
      : `Top priority: ${name} was previously failed and should be retaken first.`;
  }
  if (item.category === "ELECTIVE") {
    return locale === "ar"
      ? `${name} مقرر اختياري مناسب لخطة الطالب.`
      : `${name} is an elective course that fits the student's plan.`;
  }
  return locale === "ar"
    ? `${name} مقرر مطلوب في الخطة الدراسية للطالب.`
    : `${name} is a required course in the student's academic plan.`;
}

export function recommendationBlockedReasons(
  item: CourseRecommendation,
  locale: AdvisingLocale,
) {
  const name = locale === "ar" ? item.courseId.nameAr : item.courseId.nameEn;
  const codes = item.reasonCodes ?? [];
  const reasons: string[] = [];
  if (codes.includes("NOT_OFFERED_THIS_SEMESTER")) {
    reasons.push(
      locale === "ar"
        ? `${name} غير متاح في هذا الفصل الدراسي.`
        : `${name} is not offered this semester.`,
    );
  }
  if (codes.includes("ALREADY_PASSED")) {
    reasons.push(
      locale === "ar"
        ? `سبق نجاح الطالب في ${name}.`
        : `${name} has already been passed.`,
    );
  }
  if (codes.includes("ALREADY_IN_PROGRESS")) {
    reasons.push(
      locale === "ar"
        ? `${name} قيد الدراسة حالياً.`
        : `${name} is currently in progress.`,
    );
  }
  if (codes.includes("MISSING_PREREQUISITE")) {
    const prerequisites = item.courseId.prerequisites?.join(", ");
    reasons.push(
      locale === "ar"
        ? `لم تكتمل المتطلبات السابقة${prerequisites ? `: ${prerequisites}` : "."}`
        : `Prerequisites are incomplete${prerequisites ? `: ${prerequisites}` : "."}`,
    );
  }
  return reasons.length ? reasons : item.blockedReasons;
}
