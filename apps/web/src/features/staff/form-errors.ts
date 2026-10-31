import type { StaffValidationKey } from './schema';

const fieldMessages = {
  name: 'nameLength', nameAr: 'nameArLength', email: 'emailInvalid',
  username: 'usernameFormat', phone: 'phoneLength', password: 'passwordLength',
  staffType: 'staffTypeInvalid', role: 'roleInvalid',
} as const;
export type StaffFormField = keyof typeof fieldMessages;

export function staffFormError(details: { statusCode?: number; message: string; code?: string; errors?: unknown }) {
  const fields: Partial<Record<StaffFormField, StaffValidationKey>> = {};
  let message: StaffValidationKey = 'saveFailed';
  if (details.statusCode === 401) message = 'sessionExpired';
  else if (details.statusCode === 403) message = 'forbidden';
  else if (details.statusCode === 429) message = 'rateLimited';
  else if (details.statusCode === 409) message = 'identityTaken';
  else if (details.statusCode === 400) {
    message = /property .+ should not exist/.test(details.message) ? 'formOutOfDate' : 'checkFields';
    for (const field of Object.keys(fieldMessages) as StaffFormField[]) {
      if (new RegExp(`(^|, )${field} (must|should|is)`).test(details.message)) fields[field] = fieldMessages[field];
    }
  }
  if (details.errors && typeof details.errors === 'object') {
    for (const field of Object.keys(fieldMessages) as StaffFormField[]) {
      if (!(field in details.errors)) continue;
      const value = (details.errors as Record<string, unknown>)[field];
      fields[field] = value === 'emailTaken' || value === 'usernameTaken' ? value : fieldMessages[field];
    }
  }
  if (details.code === 'STAFF_EMAIL_TAKEN') { message = 'emailTaken'; fields.email = 'emailTaken'; }
  if (details.code === 'STAFF_USERNAME_TAKEN') { message = 'usernameTaken'; fields.username = 'usernameTaken'; }
  return { message, fields };
}
