export const STAFF_TYPES = {
  DOCTOR: 'doctor',
  ASSISTANT_LECTURER: 'assistant_lecturer',
  TEACHING_ASSISTANT: 'teaching_assistant',
  ACCOUNTANT: 'accountant',
  ADMINISTRATIVE: 'administrative',
} as const;

export type StaffType = (typeof STAFF_TYPES)[keyof typeof STAFF_TYPES];

export const STAFF_TYPE_VALUES: StaffType[] = Object.values(STAFF_TYPES);

export interface StaffDisplayLike {
  name?: string | null;
  nameAr?: string | null;
  staffType?: string | null;
  role?: string | null;
}

const LEADING_STAFF_TITLE_REGEX =
  /^(?:أ\.\s*د\.?\s*|م\.\s*م\.?\s*|م\s+م\.?\s+|د\.\s*|د\s+|م\.\s*|م\s+|أ\.\s*|أ\s+|(?:الدكتور|دكتور|المعيد|معيد|مدرس\s+مساعد|مهندس|باشمهندس)\s+|(?:assoc\.?\s*prof\.|asst\.?\s*lect\.|prof\.|dr\.|eng\.|mr\.|mrs\.|ms\.|ta\.|a\.?\s*l\.)\s*|(?:prof|dr|eng|mr|mrs|ms|ta)\s+)/i;

/**
 * Strips any existing leading academic/honorific prefix from a raw staff name
 * so we never render duplicate titles such as "د. Dr. Hany" or "م. Mr. Ibrahim".
 */
export function stripStaffTitlePrefix(rawName?: string | null): string {
  if (!rawName) return '';
  let cleaned = rawName.trim();
  for (let i = 0; i < 3; i++) {
    const next = cleaned.replace(LEADING_STAFF_TITLE_REGEX, '').trim();
    if (next === cleaned || !next) break;
    cleaned = next;
  }
  return cleaned || rawName.trim();
}

/**
 * Returns the canonical academic prefix for a staff member based on staffType and locale:
 * - doctor: 'د.' (ar) | 'Dr.' (en)
 * - assistant_lecturer: 'م. م' (ar) | 'A.L.' (en)
 * - teaching_assistant: 'م.' (ar) | 'TA.' (en)
 * - others: ''
 */
export function getStaffPrefix(
  staffType?: string | null,
  locale: string = 'ar',
): string {
  const isAr = locale === 'ar' || locale.startsWith('ar');
  switch (staffType) {
    case 'doctor':
      return isAr ? 'د.' : 'Dr.';
    case 'assistant_lecturer':
      return isAr ? 'م. م' : 'A.L.';
    case 'teaching_assistant':
    case 'assistant':
    case 'ta':
      return isAr ? 'م.' : 'TA.';
    default:
      return '';
  }
}

/**
 * Picks the localized raw name (Arabic in 'ar', English in 'en') with fallback.
 */
export function getLocalizedStaffRawName(
  staff?: StaffDisplayLike | null,
  locale: string = 'ar',
): string {
  if (!staff) return '';
  const isAr = locale === 'ar' || locale.startsWith('ar');
  const ar = staff.nameAr?.trim();
  const en = staff.name?.trim();
  return (isAr ? ar || en : en || ar) || '';
}

/**
 * Returns the localized staff name with any duplicate leading title stripped.
 */
export function getCleanStaffName(
  staff?: StaffDisplayLike | null,
  locale: string = 'ar',
): string {
  return stripStaffTitlePrefix(getLocalizedStaffRawName(staff, locale));
}

/**
 * Formats the full staff display name with the localized academic prefix:
 * - Doctor: "د. هاني حسين" (ar) / "Dr. Hany Hussien" (en)
 * - TA (معيد): "م. إبراهيم حسين" (ar) / "TA. Ibrahim Hussien" (en)
 * - Assistant Lecturer (مدرس مساعد): "م. م أحمد سليمان" (ar) / "A.L. Ahmed Soliman" (en)
 * - Administrative / Accountant / Admin: localized name without academic prefix
 */
export function formatStaffDisplayName(
  staff?: StaffDisplayLike | null,
  locale: string = 'ar',
): string {
  if (!staff) return '';
  const cleanName = getCleanStaffName(staff, locale);
  if (!cleanName) return '';
  if (staff.role === 'admin') return cleanName;
  const prefix = getStaffPrefix(staff.staffType, locale);
  return prefix ? `${prefix} ${cleanName}` : cleanName;
}

/**
 * Returns the localized role/staffType label for display.
 */
export function getStaffRoleLabel(
  staffType?: string | null,
  role?: string | null,
  locale: string = 'ar',
): string {
  const isAr = locale === 'ar' || locale.startsWith('ar');
  if (role === 'admin') {
    return isAr ? 'مدير النظام' : 'System Admin';
  }
  switch (staffType) {
    case 'doctor':
      return isAr ? 'أستاذ مقرر (دكتور)' : 'Course Doctor / Lecturer';
    case 'assistant_lecturer':
      return isAr ? 'مدرس مساعد (هيئة تدريس)' : 'Assistant Lecturer';
    case 'teaching_assistant':
    case 'assistant':
    case 'ta':
      return isAr ? 'معيد (هيئة تدريس)' : 'Teaching Assistant';
    case 'accountant':
      return isAr ? 'محاسب (شؤون مالية)' : 'Accountant (Finance)';
    default:
      return isAr ? 'إداري (شؤون طلاب)' : 'Administrative Staff';
  }
}
