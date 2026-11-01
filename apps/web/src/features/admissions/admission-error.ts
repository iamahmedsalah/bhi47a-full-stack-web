import { getApiErrorDetails } from "@/lib/api";

const codes: Record<string, string> = {
  ADMISSION_ACCESS_UNAVAILABLE: "accessUnavailable",
  ADMISSION_GUARDIAN_PHONE_MATCH: "guardianPhone",
  ADMISSION_REASON_REQUIRED: "reasonRequired",
  ADMISSION_NATIONAL_ID: "nationalId",
  ADMISSION_TRANSFER_INSTITUTION: "transferInstitution",
  ADMISSION_CAPTCHA: "captcha",
  ADMISSIONS_CAPTCHA_CONFIGURATION: "verificationUnavailable",
  ADMISSIONS_SECURITY_CONFIGURATION: "verificationUnavailable",
  ADMISSION_PIN_EXISTS: "pinExists",
  ADMISSION_PERIOD_EXPIRY_MISMATCH: "invitationExpiry",
  ADMISSION_CONFLICT: "changed",
  ADMISSION_DUPLICATE_REVIEW: "identityReview",
  ADMISSION_GROUP_FULL: "groupFull",
  ADMISSION_GROUP_IN_USE: "groupInUse",
  ADMISSION_PERIOD_CHANGED: "changed",
  ADMISSION_PERIOD_NOT_FOUND: "periodMissing",
  PERIOD_HAS_REQUESTS: "periodInUse",
  ADMISSION_PERIOD_IN_USE: "periodInUse",
  CODE_YEAR_NOT_READY: "mappingRequired",
  CODE_YEAR_PREFIX_MISMATCH: "mappingMismatch",
  CODE_WRITE_CONFLICT: "changed",
  ADMISSION_TRANSACTIONS_REQUIRED: "transactionsRequired",
};
const messages: Record<string, string> = {
  "Admission access is unavailable or has expired": "accessUnavailable",
  "Admission session expired or invalid": "sessionExpired",
  "Request reference or secret is invalid": "trackingInvalid",
  "Admission verification is temporarily unavailable":
    "verificationUnavailable",
  "Please complete a fresh verification challenge": "captcha",
  "Access denied": "permissionDenied",
  "Insufficient admission permissions": "permissionDenied",
  "Insufficient permissions": "permissionDenied",
  "Invalid CSRF token": "sessionExpired",
};
export function getAdmissionErrorMessage(
  error: unknown,
  translate: (key: string) => string,
): string {
  const details = getApiErrorDetails(error);
  const key =
    (details.code ? codes[details.code] : undefined) ??
    messages[details.message.replace(/\.$/, "")];
  if (key) return translate(`errors.${key}`);
  if (details.statusCode === 429) return translate("errors.rateLimited");
  if (details.statusCode === 403) return translate("errors.permissionDenied");
  if (details.statusCode === 401) return translate("errors.sessionExpired");
  if (details.statusCode === 409) return translate("errors.changed");
  if (details.statusCode === 400) return translate("errors.invalid");
  return translate("failed");
}
