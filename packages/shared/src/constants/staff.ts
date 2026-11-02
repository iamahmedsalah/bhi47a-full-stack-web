export const STAFF_TYPES = {
  DOCTOR: 'doctor',
  ASSISTANT_LECTURER: 'assistant_lecturer',
  TEACHING_ASSISTANT: 'teaching_assistant',
  ACCOUNTANT: 'accountant',
  ADMINISTRATIVE: 'administrative',
} as const;

export type StaffType = (typeof STAFF_TYPES)[keyof typeof STAFF_TYPES];

export const STAFF_TYPE_VALUES: StaffType[] = Object.values(STAFF_TYPES);

export const DOCTOR_PREFIXES = {
  DR: 'dr',
  PROF: 'prof',
  ASSOC_PROF: 'assoc_prof',
} as const;

export type DoctorPrefix =
  (typeof DOCTOR_PREFIXES)[keyof typeof DOCTOR_PREFIXES];

export const DOCTOR_PREFIX_VALUES: DoctorPrefix[] =
  Object.values(DOCTOR_PREFIXES);

export interface StaffDisplayLike {
  name?: string | null;
  nameAr?: string | null;
  staffType?: string | null;
  titlePrefix?: string | null;
  role?: string | null;
}

const LEADING_STAFF_TITLE_REGEX =
  /^(?:أ\.\s*د\.?\s*|أ\.\s*م\.?\s*د\.?\s*|أ\.\s*م\.?\s*|م\.\s*م\.?\s*|م\s+م\.?\s+|د\.\s*|د\s+|م\.\s*|م\s+|أ\.\s*|أ\s+|(?:أستاذ\s+دكتور|أستاذ\s+مساعد|أستاذ|الدكتور|دكتور|المعيد|معيد|مدرس\s+مساعد|مهندس|باشمهندس)\s+|(?:assoc\.?\s*prof\.?\s*dr\.|assoc\.?\s*prof\.|asst\.?\s*lect\.|prof\.?\s*dr\.|prof\.|dr\.|eng\.|mr\.|mrs\.|ms\.|ta\.|a\.?\s*l\.)\s*|(?:prof|dr|eng|mr|mrs|ms|ta)\s+)/i;

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
 * Detects whether a raw name contains an explicit academic doctor rank
 * (e.g. "أ.د." -> 'prof', "أ.م." -> 'assoc_prof', "د." -> 'dr').
 */
export function inferDoctorPrefix(
  rawName?: string | null,
): DoctorPrefix | undefined {
  if (!rawName) return undefined;
  const trimmed = rawName.trim();
  if (
    /^(?:أ\.\s*د|أستاذ\s+دكتور|prof(?:\.|\s|$)|full\s+prof)/i.test(trimmed)
  ) {
    return 'prof';
  }
  if (
    /^(?:أ\.\s*م|أستاذ\s+مساعد|أستاذ\s+مشارك|assoc(?:\.|\s|$))/i.test(trimmed)
  ) {
    return 'assoc_prof';
  }
  if (/^(?:د\.|د\s|الدكتور|دكتور|dr(?:\.|\s|$))/i.test(trimmed)) {
    return 'dr';
  }
  return undefined;
}

/**
 * Returns the canonical academic prefix for a staff member based on staffType/titlePrefix and locale:
 * - doctor:
 *    - prof: 'أ.د.' (ar) | 'Prof. Dr.' (en)
 *    - assoc_prof: 'أ.م.' (ar) | 'Assoc. Prof.' (en)
 *    - dr (default): 'د.' (ar) | 'Dr.' (en)
 * - assistant_lecturer: 'م. م' (ar) | 'A.L.' (en)
 * - teaching_assistant: 'م.' (ar) | 'TA.' (en)
 * - others: ''
 */
export function getStaffPrefix(
  staffOrType?: StaffDisplayLike | string | null,
  locale: string = 'ar',
  explicitDoctorPrefix?: string | null,
): string {
  const isAr = locale === 'ar' || locale.startsWith('ar');
  if (!staffOrType) return '';

  let staffType: string | null = null;
  let titlePrefix: string | null = explicitDoctorPrefix ?? null;

  if (typeof staffOrType === 'object') {
    staffType = staffOrType.staffType ?? null;
    titlePrefix = explicitDoctorPrefix ?? staffOrType.titlePrefix ?? null;
    if (!titlePrefix && staffType === 'doctor') {
      titlePrefix =
        inferDoctorPrefix(staffOrType.nameAr) ||
        inferDoctorPrefix(staffOrType.name) ||
        null;
    }
  } else {
    staffType = staffOrType;
  }

  // Handle direct prefix values if someone passed 'prof' or 'assoc_prof' or 'dr' as the string
  if (staffType === 'prof') {
    return isAr ? 'أ.د.' : 'Prof. Dr.';
  }
  if (staffType === 'assoc_prof') {
    return isAr ? 'أ.م.' : 'Assoc. Prof.';
  }

  switch (staffType) {
    case 'doctor':
    case 'dr': {
      if (titlePrefix === 'prof' || titlePrefix === 'prof_dr') {
        return isAr ? 'أ.د.' : 'Prof. Dr.';
      }
      if (titlePrefix === 'assoc_prof') {
        return isAr ? 'أ.م.' : 'Assoc. Prof.';
      }
      return isAr ? 'د.' : 'Dr.';
    }
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
 * - Doctor (Prof): "أ.د. هاني حسين" (ar) / "Prof. Dr. Hany Hussien" (en)
 * - Doctor (Assoc Prof): "أ.م. هاني حسين" (ar) / "Assoc. Prof. Hany Hussien" (en)
 * - Doctor (Dr): "د. هاني حسين" (ar) / "Dr. Hany Hussien" (en)
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
  const prefix = getStaffPrefix(staff, locale);
  return prefix ? `${prefix} ${cleanName}` : cleanName;
}

/**
 * Returns the localized role/staffType label for display.
 */
export function getStaffRoleLabel(
  staffType?: string | null,
  role?: string | null,
  locale: string = 'ar',
  titlePrefix?: string | null,
): string {
  const isAr = locale === 'ar' || locale.startsWith('ar');
  if (role === 'admin') {
    return isAr ? 'مدير النظام' : 'System Admin';
  }
  switch (staffType) {
    case 'doctor':
      if (titlePrefix === 'prof') {
        return isAr ? 'أستاذ دكتور' : 'Professor (Doctor)';
      }
      if (titlePrefix === 'assoc_prof') {
        return isAr ? 'أستاذ مساعد' : 'Associate Professor';
      }
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
