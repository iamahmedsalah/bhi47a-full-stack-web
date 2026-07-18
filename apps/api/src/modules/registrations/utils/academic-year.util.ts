export function isConsecutiveAcademicYear(value: string): boolean {
  const match = /^(\d{4})-(\d{4})$/.exec(value.trim());
  return Boolean(match && Number(match[2]) === Number(match[1]) + 1);
}
