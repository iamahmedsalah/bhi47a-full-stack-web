import { ConflictException } from '@nestjs/common';

export const IC_CARRIED_LOCKED_MESSAGE =
  'IC contributions are read-only; enter the summer final only / درجات الميدترم وأعمال السنة المنقولة من IC للقراءة فقط؛ أدخل النهائي الصيفي فقط';

const messages: Record<string, string> = {
  ATTEMPT_SCOPE_TOO_LARGE:
    'Attempt history is too large; contact an administrator / سجل المحاولات كبير؛ راجع مسؤول النظام',
  ATTEMPT_REVIEW_CHANGED:
    'Comparison changed; refresh and review again / تغيرت المقارنة؛ حدّث المعاينة وراجعها من جديد',
  HISTORICAL_ATTEMPT_INCOMPLETE:
    'Complete or classify previous exam components before comparing / استكمل أو صنّف مكونات النتيجة القديمة قبل المقارنة؛ لا نعتبر درجة النهائي وحدها مجموع المقرر',
  IC_SUMMER_ONLY:
    'IC continuation is available in the summer term / استكمال نهائي IC متاح في الفصل الصيفي فقط',
  IC_SOURCE_CHANGED:
    'IC source is missing or changed; refresh the comparison / مصدر IC غير متاح أو تغير؛ حدّث المقارنة',
  IC_TARGET_ALREADY_ENTERED:
    'Existing or approved marks cannot be replaced by carry-forward / لا يستبدل الترحيل درجات ميدترم أو أعمال سنة موجودة، أو نهائيًا تم اعتماده؛ راجع الكشف أولًا',
  IC_SCHEME_MISMATCH:
    'Match original grading maximums before carrying; no rescaling / يجب تطابق توزيع الدرجات مع الأصل قبل الترحيل؛ لا نحول الدرجات تلقائيًا',
  SHEET_LOCKED:
    'Reopen the component sheets before carrying IC marks / أعد فتح كشوف المكونات قبل ترحيل درجات IC',
};
export const attemptConflict = (code: string) =>
  new ConflictException({ code, message: messages[code] ?? code });
