# Deterministic Validation Architecture & Standards

This document establishes standards for input validation, data normalization, Egyptian domain rules, timezone-safe date handling, and error response contracts across the Student Portal monorepo.

---

## 1. Single Source of Truth & Validation Boundary

1. **Shared Contract Boundary (`packages/shared`):**
   - Core validation regexes, schemas, limits, and domain constraints live in `@student-portal/shared`.
   - Both the Next.js frontend (via `react-hook-form` + `@hookform/resolvers/zod`) and NestJS backend (via `class-validator` / Zod pipes) must validate against the exact same rules.
2. **Never Trust the Client:**
   - Client-side validation improves user experience; backend validation enforces system security and data integrity.
   - Every incoming HTTP request boundary must be rigorously validated. TypeScript interfaces alone do **not** validate runtime HTTP payloads.

---

## 2. Egyptian Domain-Specific Validation Rules

### A. Egyptian Mobile Numbers
Mobile numbers in Egypt follow specific operator prefixes:
- Telecom Egypt (`015`)
- Orange (`012`)
- Vodafone (`010`)
- e& / Etisalat (`011`)

**Validation Pattern:**
```typescript
// Shared Regex Pattern
export const EGYPT_PHONE_REGEX = /^(?:(?:\+|00)20|0)?1[0125]\d{8}$/;

// Normalization Helper
export function normalizeEgyptPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('20') && digits.length === 12) {
    return '0' + digits.slice(2);
  }
  if (digits.length === 10 && digits.startsWith('1')) {
    return '0' + digits;
  }
  return digits;
}
```

### B. Egyptian National ID (الرقم القومي)
The Egyptian National ID consists of 14 digits encoding birth century, birthdate, and governorate:
- **Century Digit (1st digit):** `2` for births in 1900-1999, `3` for births in 2000-2099.
- **Birth Date (digits 2-7):** `YYMMDD` representing a valid calendar date.
- **Governorate Code (digits 8-9):** Valid Egyptian governorate codes (e.g., Cairo `01`, Alexandria `02`, Giza `21`, Dakahlia `12`, etc., range `01` to `88`).
- **Gender & Sequence (digits 10-13):** Odd for male, even for female.
- **Check Digit (digit 14):** Verification checksum.

**Validation Rules:**
- Exactly 14 digits: `/^[23]\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{7}$/`.
- Date portion must represent a valid past date and match the student's declared `dateOfBirth`.
- Century digit must align with the year of birth.

---

## 3. Timezone-Safe Date Handling (`Africa/Cairo`)

### The Date-Shift Bug
In web applications, submitting a birthdate or attendance date via `new Date("2004-05-15")` in a browser operating at `UTC+0` or `UTC-4` causes the date to serialize as `2004-05-14T20:00:00.000Z`, resulting in birthdays or attendance days being stored **1 day off**.

### Mandatory Date Handling Rules:
1. **Date-Only Requests:**
   - For calendar-only dates (`dateOfBirth`, `enrollmentDate`, `attendanceDate`, `examDate`), the HTTP boundary must exchange pure ISO-8601 date strings formatted as `YYYY-MM-DD`.
   - Never serialize pure calendar dates through browser-local timestamps.
2. **UTC Conversion via `dateOnlyToUtc`:**
   - In backend services, convert `YYYY-MM-DD` strings to UTC midnight or noon with a dedicated helper:
     ```typescript
     export function dateOnlyToUtc(dateStr: string): Date {
       const [year, month, day] = dateStr.split('-').map(Number);
       return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)); // Noon UTC prevents boundary rollover
     }
     ```
3. **No Future Dates for Historical Facts:**
   - `dateOfBirth` cannot be today or in the future.
   - Enforce an institutional minimum age (e.g. 15 years old for higher education admission).

---

## 4. Input Normalization & Sanitization

Before validation executes:
1. **String Normalization:**
   - Trim leading and trailing whitespace on all string inputs.
   - Collapse consecutive internal spaces.
2. **Email Normalization:**
   - Lowercase all email addresses (`trim().toLowerCase()`).
3. **Empty String to Null/Undefined:**
   - For optional fields, empty strings (`""`) must normalize to `undefined` or `null` so PATCH requests can clear existing values or leave omitted fields untouched.
4. **Strict Payload Rejection:**
   - Use `whitelist: true` and `forbidNonWhitelisted: true` in NestJS `ValidationPipe` to reject unknown or malicious properties (e.g. `isAdmin`, `role`, `_id`, `passwordHash`) injected into public endpoints.

---

## 5. Standardized Error Response Envelope

When request validation fails, the API must return a structured error envelope enabling the frontend to highlight specific form fields with localized error messages:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "errors": {
    "studentCode": "validation.studentCode.invalidLength",
    "nationalId": "validation.nationalId.invalidChecksum",
    "phone": "validation.phone.invalidEgyptMobile",
    "_form": "validation.form.duplicateRecord"
  }
}
```

- Field-specific errors are indexed by their exact dot-separated path (e.g. `guardian.phone`).
- Form-level or cross-field errors use the special `_form` key.
- Error codes are stable translation keys consumed by `next-intl` on the frontend, ensuring bilingual support for validation messages.

---

## 6. Academic Timing, Scheduling & Date-Time Picker Validation Architecture

### A. Quiz Availability Window & Duration Rules
1. **No Past Open Dates:**
   - When creating a quiz or updating its schedule, `startsAt` cannot be set before the current date and time (`startsAt >= now - 5min` tolerance window).
2. **No Past Deadlines:**
   - `endsAt` cannot be in the past (`endsAt >= now`).
3. **Strict Chronological Ordering:**
   - If both `startsAt` and `endsAt` are provided, `endsAt` must be strictly after `startsAt` (`new Date(endsAt) > new Date(startsAt)`).
4. **Availability Window Must Cover Quiz Duration:**
   - The time window between `startsAt` and `endsAt` must be greater than or equal to the quiz duration (`(endsAt - startsAt) >= durationMinutes`).
   - If `startsAt` is omitted (immediate open upon publishing), the remaining time until `endsAt` must cover `durationMinutes`.
5. **Dual-Layer Enforcement:**
   - **Frontend:** Instant inline error alert with `AlertTriangle` in the modal dialog, disabling the Submit button when `Boolean(scheduleValidationError)` is true.
   - **Backend:** `QuizzesService.create` and `QuizzesService.update` reject invalid windows with `BadRequestException`.

### B. Lecture & Timetable Scheduling Validation
1. **Time Parsing & Chronological Ordering:**
   - Times must be parsed to normalized minutes from midnight (`parseTimeToMinutes`).
   - `endMinutes` must be strictly greater than `startMinutes` (`endMinutes > startMinutes`).
   - Slot duration must be between 30 minutes and 6 hours.
2. **RTL Form Isolation for Time Pickers:**
   - Time input fields must explicitly specify `dir="ltr"` and `text-left font-mono` to prevent inverted time rendering (e.g. `AM 09:00` instead of `09:00 AM`).
   - Provide dual inputs: a native `<input type="time">` picker + 12-hour formatted display + quick presets pills (`09:00 - 11:00 AM`, `11:00 AM - 01:00 PM`).
3. **Multi-Dimensional Conflict Detection:**
   - **Hall Collision:** The same room/auditorium cannot be booked for multiple sessions at overlapping times on the same day.
   - **Staff Collision:** An instructor/teaching assistant cannot be scheduled in multiple places at the same time.
   - **Batch Collision:** The same cohort (level + department + group) cannot have simultaneous overlapping sessions.

