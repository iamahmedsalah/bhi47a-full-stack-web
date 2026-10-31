import type { StaffProfileInput } from './types';

/** Profile updates cannot change account roles or permissions. */
export function staffProfilePayload(input: StaffProfileInput): StaffProfileInput {
  return {
    name: input.name,
    nameAr: input.nameAr,
    email: input.email,
    username: input.username,
    phone: input.phone,
    staffType: input.staffType,
  };
}
