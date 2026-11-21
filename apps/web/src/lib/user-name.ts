import { formatStaffDisplayName, type StaffDisplayLike } from '@student-portal/shared';

/** Resolve the account name in the active language, preserving academic titles. */
export function getUserDisplayName(
  user: (StaffDisplayLike & { nameEn?: string | null }) | null | undefined,
  locale: string,
): string {
  if (!user) return '';
  if (user.role === 'staff' || user.role === 'admin') {
    return formatStaffDisplayName(user, locale);
  }
  return (locale.startsWith('ar')
    ? user.nameAr?.trim() || user.name?.trim() || user.nameEn?.trim()
    : user.nameEn?.trim() || user.name?.trim() || user.nameAr?.trim()) || '';
}
