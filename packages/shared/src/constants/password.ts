export const STUDENT_LOGIN_PASSWORD_MIN_LENGTH = 6;
export const STUDENT_PASSWORD_MIN_LENGTH = 8;
export const STUDENT_PASSWORD_MAX_LENGTH = 100;

/**
 * Permanent and administrator-issued custom student passwords must contain
 * at least one Latin letter and one number, with no whitespace.
 *
 * Login intentionally remains more permissive so legacy passwords and the
 * 14-digit National ID bootstrap credential continue to work.
 */
export const STUDENT_PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d)\S{8,100}$/;

export function isValidStudentPassword(value: string): boolean {
  return STUDENT_PASSWORD_PATTERN.test(value);
}
