/** Derive the canonical name from the two visible fields, never the hidden old name. */
export function getStudentFullName(names: {
  fullNameAr?: string;
  fullNameEn?: string;
}): string {
  return names.fullNameAr?.trim() || names.fullNameEn?.trim() || '';
}

export function getStudentDisplayNames(
  locale: string,
  profile?: { fullName?: string; fullNameAr?: string; fullNameEn?: string } | null,
  user?: { name?: string; nameAr?: string; nameEn?: string } | null,
) {
  const isAr = locale === 'ar';
  const primary = isAr
    ? profile?.fullNameAr || user?.nameAr || profile?.fullName || user?.name || ''
    : profile?.fullNameEn || user?.nameEn || profile?.fullName || user?.name || '';
  const alternate = isAr
    ? profile?.fullNameEn || user?.nameEn
    : profile?.fullNameAr || user?.nameAr;
  return { primary, secondary: alternate === primary ? undefined : alternate };
}
