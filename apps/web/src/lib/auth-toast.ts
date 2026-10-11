/**
 * Auth Toast & Lockout Formatting Utilities
 * Provides bilingual, RTL-safe formatting for authentication toasts,
 * cooldown countdowns, and rate limiting error normalization.
 */

/**
 * Formats a duration in seconds into human-readable text for Arabic and English.
 * e.g. "4 دقائق و 12 ثانية" / "4m 12s" or "45 ثانية" / "45s"
 */
export function formatLockoutDuration(seconds: number, locale: string): string {
  const safeSecs = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safeSecs / 60);
  const s = safeSecs % 60;

  if (locale === 'ar') {
    if (m > 0 && s > 0) return `${m} دقيقة و ${s} ثانية`;
    if (m > 0) return `${m} دقيقة`;
    return `${s} ثانية`;
  }

  if (m > 0 && s > 0) return `${m}m ${s}s`;
  if (m > 0) return `${m} minute${m === 1 ? '' : 's'}`;
  return `${s} second${s === 1 ? '' : 's'}`;
}

/**
 * Normalizes backend error messages so they never leak raw Arabic into
 * English locale or vice versa, and removes awkward concatenations.
 */
export function normalizeAuthErrorMessage(
  rawMessage: string | undefined,
  locale: string,
): string {
  if (!rawMessage || typeof rawMessage !== 'string') {
    return locale === 'ar' ? 'بيانات الدخول غير صحيحة' : 'Invalid credentials';
  }

  const trimmed = rawMessage.trim();

  // Invalid credentials
  if (
    trimmed.includes('بيانات الدخول غير صحيحة') ||
    trimmed.toLowerCase().includes('invalid credentials') ||
    trimmed.toLowerCase().includes('unauthorized')
  ) {
    return locale === 'ar' ? 'بيانات الدخول غير صحيحة' : 'Invalid credentials';
  }

  // Deactivated / inactive account
  if (
    trimmed.includes('الحساب غير مفعّل') ||
    trimmed.includes('الحساب غير مفعل') ||
    trimmed.toLowerCase().includes('inactive') ||
    trimmed.toLowerCase().includes('deactivated')
  ) {
    return locale === 'ar'
      ? 'الحساب غير مفعّل، يرجى مراجعة إدارة شؤون الطلاب'
      : 'Account is deactivated, please contact student affairs';
  }

  // Unauthorized access / role restriction
  if (
    trimmed.includes('غير مصرح بالدخول') ||
    trimmed.toLowerCase().includes('forbidden')
  ) {
    return locale === 'ar' ? 'غير مصرح بالدخول' : 'Access forbidden';
  }

  // Account locked
  if (
    trimmed.includes('تم قفل الحساب') ||
    trimmed.toLowerCase().includes('locked')
  ) {
    return locale === 'ar'
      ? 'تم قفل الحساب مؤقتاً لأسباب أمنية'
      : 'Account is temporarily locked for security';
  }

  return trimmed;
}
