import { z } from 'zod';
import { STAFF_TYPE_VALUES } from '@student-portal/shared';

export const staffValidationKeys = ['nameLength', 'nameArLength', 'emailInvalid', 'usernameFormat', 'phoneLength', 'passwordLength', 'passwordMax', 'staffTypeInvalid', 'roleInvalid', 'identityTaken', 'emailTaken', 'usernameTaken', 'checkFields', 'saveFailed', 'forbidden', 'sessionExpired', 'rateLimited', 'formOutOfDate'] as const;
export type StaffValidationKey = (typeof staffValidationKeys)[number];

export const createStaffFormSchema = (message: (key: StaffValidationKey) => string) => z
  .object({
    name: z.string().trim().min(2, message('nameLength')).max(160, message('nameLength')),
    nameAr: z.string().trim().max(160, message('nameArLength')).refine((value) => !value || value.length >= 2, message('nameArLength')).optional(),
    email: z.string().trim().email(message('emailInvalid')).max(254, message('emailInvalid')),
    username: z
      .string()
      .trim()
      .max(32, message('usernameFormat'))
      .refine((value) => !value || (value.length >= 3 && /^[a-zA-Z0-9._-]+$/.test(value)), message('usernameFormat')),
    phone: z.string().trim().max(30, message('phoneLength')),
    password: z.string().max(100, message('passwordMax')),
    role: z.enum(['admin', 'staff'], { message: message('roleInvalid') }),
    staffType: z.enum(STAFF_TYPE_VALUES, { message: message('staffTypeInvalid') }),
    isCreate: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.isCreate && value.password.length < 12) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['password'], message: message('passwordLength') });
    }
  });

export const staffFormSchema = createStaffFormSchema((key) => key);
export type StaffFormValues = z.infer<typeof staffFormSchema>;

export const resetStaffPasswordSchema = z
  .object({
    newPassword: z.string().min(12).max(100),
    confirmPassword: z.string().min(12).max(100),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'passwordMismatch',
  });

export type ResetStaffPasswordValues = z.infer<typeof resetStaffPasswordSchema>;
