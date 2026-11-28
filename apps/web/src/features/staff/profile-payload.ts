import type { StaffProfileInput } from "./types";

/** Profile updates whitelist editable fields; sensitive fields remain admin-guarded by the API. */
export function staffProfilePayload(
  input: StaffProfileInput,
): StaffProfileInput {
  return {
    name: input.name,
    nameAr: input.nameAr,
    email: input.email,
    username: input.username,
    phone: input.phone,
    staffType: input.staffType,
    ...(input.titlePrefix !== undefined
      ? { titlePrefix: input.titlePrefix }
      : {}),
    ...(input.courseIds !== undefined ? { courseIds: input.courseIds } : {}),
    ...(input.gradeEntryCourseIds !== undefined
      ? { gradeEntryCourseIds: input.gradeEntryCourseIds }
      : {}),
    ...(input.permissions !== undefined
      ? { permissions: input.permissions }
      : {}),
  };
}
